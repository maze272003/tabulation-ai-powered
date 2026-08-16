import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requirePlatformOwner } from "../lib/auth";
import { getSubscription } from "../lib/entitlements";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw appError(ErrorCode.VALIDATION_ERROR, "A reason is required for this action");
  }
  return trimmed;
}

async function requireOrg(ctx: QueryCtx, orgId: Id<"organizations">) {
  const org = await ctx.db.get(orgId);
  if (!org || org.status === "deleted") {
    throw appError(ErrorCode.NOT_FOUND, "Organization not found");
  }
  return org;
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requirePlatformOwner(ctx);

    const result = await ctx.db
      .query("subscriptions")
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (subscription) => {
        const [org, plan] = await Promise.all([
          ctx.db.get(subscription.orgId),
          ctx.db.get(subscription.planId),
        ]);
        return {
          subscription,
          orgId: subscription.orgId,
          orgName: org?.name ?? null,
          orgSlug: org?.slug ?? null,
          orgStatus: org?.status ?? null,
          planId: subscription.planId,
          planName: plan?.name ?? null,
        };
      }),
    );
    return { ...result, page };
  },
});

/**
 * Administrative plan override. Stripe-managed changes land in Phase 6; this
 * exists so support can correct plan assignments before then. Every override
 * is audited on the org's trail.
 */
export const setPlan = mutation({
  args: {
    orgId: v.id("organizations"),
    planId: v.id("plans"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const reason = requireReason(args.reason);
    const org = await requireOrg(ctx, args.orgId);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    const subscription = await getSubscription(ctx, org._id);
    if (subscription.planId === plan._id) {
      throw appError(ErrorCode.CONFLICT, `Organization is already on ${plan.name}`);
    }

    const beforePlan = await ctx.db.get(subscription.planId);
    await ctx.db.patch(subscription._id, { planId: plan._id });
    await writeAudit(ctx, {
      orgId: org._id,
      actorId: actor._id,
      action: "platform.subscription.plan_overridden",
      resourceType: "subscription",
      resourceId: subscription._id,
      before: { planName: beforePlan?.name ?? null },
      after: { planName: plan.name },
      reason,
    });
  },
});
