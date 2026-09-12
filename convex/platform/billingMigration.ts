import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requirePlatformOwner } from "../lib/auth";
import { pickWinningSubscription } from "../lib/billingOwnership";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw appError(ErrorCode.VALIDATION_ERROR, "A reason is required for this action");
  }
  return trimmed;
}

export const migrationStatus = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);
    let orgKeyedSubscriptions = 0;
    let paymentsWithoutUser = 0;
    let usageRowsWithoutUser = 0;
    for await (const sub of ctx.db.query("subscriptions")) {
      if (!sub.userId) orgKeyedSubscriptions += 1;
    }
    for await (const payment of ctx.db.query("billingPayments")) {
      if (!payment.userId) paymentsWithoutUser += 1;
    }
    for await (const row of ctx.db.query("usage")) {
      if (!row.userId) usageRowsWithoutUser += 1;
    }
    return { orgKeyedSubscriptions, paymentsWithoutUser, usageRowsWithoutUser };
  },
});

/**
 * One-shot, idempotent org-to-user billing migration. Safe to re-run:
 * rows that already carry a userId are skipped, and subscription
 * conflicts resolve deterministically via pickWinningSubscription.
 * Run migrationStatus first; when it reports all zeros, Task 13
 * (schema narrow) is safe to deploy.
 */
export const migrateOrgSubscriptionsToUsers = mutation({
  args: { reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const reason = requireReason(args.reason);
    let transferred = 0;
    let merged = 0;
    let paymentsRekeyed = 0;
    let usagePooled = 0;

    for await (const sub of ctx.db.query("subscriptions")) {
      if (sub.userId) continue;
      const org = sub.orgId ? await ctx.db.get(sub.orgId) : null;
      const creatorId = org?.createdById ?? org?.ownerId ?? null;
      if (!creatorId) {
        await ctx.db.delete(sub._id);
        continue;
      }
      const existing = await ctx.db
        .query("subscriptions")
        .withIndex("by_user_id", (q) => q.eq("userId", creatorId))
        .unique();
      const replacement = {
        userId: creatorId,
        planId: sub.planId,
        status: sub.status,
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEndAt: sub.currentPeriodEndAt,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        stripeCustomerId: sub.stripeCustomerId,
        stripeSubscriptionId: sub.stripeSubscriptionId,
      };
      if (!existing) {
        await ctx.db.replace(sub._id, replacement);
        transferred += 1;
      } else {
        const winner = pickWinningSubscription([
          { ...existing, _id: existing._id },
          { ...sub, _id: sub._id },
        ]);
        if (winner._id === existing._id) {
          await ctx.db.delete(sub._id);
        } else {
          await ctx.db.delete(existing._id);
          await ctx.db.replace(sub._id, replacement);
        }
        merged += 1;
      }
      await writeAudit(ctx, {
        orgId: null,
        actorId: actor._id,
        action: "billing.migration.subscription_transferred",
        resourceType: "subscription",
        resourceId: sub._id,
        after: { userId: creatorId, reason },
        reason,
      });
    }

    for await (const payment of ctx.db.query("billingPayments")) {
      if (payment.userId) continue;
      const org = payment.orgId ? await ctx.db.get(payment.orgId) : null;
      const ownerId: Id<"userProfiles"> | null =
        org?.createdById ?? org?.ownerId ?? payment.createdById ?? null;
      if (!ownerId) continue;
      await ctx.db.patch(payment._id, { userId: ownerId });
      paymentsRekeyed += 1;
    }

    const pooled = new Map<string, { userId: Id<"userProfiles">; resource: string; count: number }>();
    for await (const row of ctx.db.query("usage")) {
      if (row.userId) continue;
      if (row.resource === "members") {
        await ctx.db.delete(row._id);
        continue;
      }
      const org = row.orgId ? await ctx.db.get(row.orgId) : null;
      const ownerId = org?.createdById ?? org?.ownerId ?? null;
      if (!ownerId) {
        await ctx.db.delete(row._id);
        continue;
      }
      const key = `${ownerId}:${row.resource}`;
      const slot = pooled.get(key);
      if (slot) {
        slot.count += row.count;
      } else {
        pooled.set(key, { userId: ownerId, resource: row.resource, count: row.count });
      }
      await ctx.db.delete(row._id);
    }
    for (const slot of pooled.values()) {
      const existingRow = await ctx.db
        .query("usage")
        .withIndex("by_user_id_and_resource", (q) =>
          q.eq("userId", slot.userId).eq("resource", slot.resource),
        )
        .unique();
      if (existingRow) {
        await ctx.db.patch(existingRow._id, { count: existingRow.count + slot.count });
      } else {
        await ctx.db.insert("usage", {
          userId: slot.userId,
          resource: slot.resource,
          count: slot.count,
          periodKey: null,
        });
      }
      usagePooled += 1;
    }

    await writeAudit(ctx, {
      orgId: null,
      actorId: actor._id,
      action: "billing.migration.completed",
      resourceType: "subscription",
      resourceId: "all",
      after: { transferred, merged, paymentsRekeyed, usagePooled, reason },
      reason,
    });
    return { transferred, merged, paymentsRekeyed, usagePooled };
  },
});
