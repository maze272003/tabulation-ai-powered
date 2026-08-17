import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { writeAudit } from "../lib/audit";
import { PAST_DUE_GRACE_MS, STALE_PENDING_MS } from "../lib/billing";

const BATCH_SIZE = 100;

/**
 * Daily maintenance ladder:
 * 1. Pending checkouts older than 24h are marked expired (sessions die at
 *    PayMongo on their own; this keeps the one-live-checkout rule honest).
 * 2. active + lapsed period → past_due (service keeps working during grace).
 * 3. past_due + 7-day grace exhausted → expired + downgrade to Free.
 *
 * `now` is injectable because this is an internal mutation used only by the
 * scheduler and tests; production callers omit it.
 */
export const expireSubscriptions = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<void> => {
    const now = args.now ?? Date.now();

    const stalePending = await ctx.db
      .query("billingPayments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(BATCH_SIZE);
    for (const payment of stalePending) {
      if (payment._creationTime > now - STALE_PENDING_MS) continue;
      await ctx.db.patch(payment._id, { status: "expired" });
      await writeAudit(ctx, {
        orgId: payment.orgId,
        actorId: null,
        action: "billing.payment.expired",
        resourceType: "billingPayment",
        resourceId: payment._id,
        after: { reason: "Checkout not completed within 24h" },
      });
    }

    const lapsed = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_period_end", (q) =>
        q.eq("status", "active").lt("currentPeriodEndAt", now),
      )
      .take(BATCH_SIZE);
    for (const subscription of lapsed) {
      // Free-tier orgs have status "active" with a null period — never expire them.
      if (subscription.currentPeriodEndAt === null) continue;
      await ctx.db.patch(subscription._id, { status: "past_due" });
      await writeAudit(ctx, {
        orgId: subscription.orgId,
        actorId: null,
        action: "subscription.past_due",
        resourceType: "subscription",
        resourceId: subscription._id,
        after: { currentPeriodEndAt: subscription.currentPeriodEndAt },
      });
    }

    const graceDeadline = now - PAST_DUE_GRACE_MS;
    const beyondGrace = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_period_end", (q) =>
        q.eq("status", "past_due").lt("currentPeriodEndAt", graceDeadline),
      )
      .take(BATCH_SIZE);
    if (beyondGrace.length === 0) return;
    const freePlan = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", "Free"))
      .unique();
    if (!freePlan) {
      console.error("billing lifecycle: Free plan missing — run seed; skipping downgrades");
      return;
    }
    for (const subscription of beyondGrace) {
      if (subscription.currentPeriodEndAt === null) continue;
      await ctx.db.patch(subscription._id, {
        status: "expired",
        planId: freePlan._id,
        cancelAtPeriodEnd: false,
      });
      await writeAudit(ctx, {
        orgId: subscription.orgId,
        actorId: null,
        action: "subscription.expired",
        resourceType: "subscription",
        resourceId: subscription._id,
        before: { planId: subscription.planId },
        after: { planId: freePlan._id },
      });
    }
  },
});
