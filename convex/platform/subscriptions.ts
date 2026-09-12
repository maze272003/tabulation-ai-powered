import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
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
        const subUserId = subscription.userId;
        const [owner, plan] = await Promise.all([
          subUserId ? ctx.db.get(subUserId) : Promise.resolve(null),
          ctx.db.get(subscription.planId),
        ]);
        const coveredOrgs = subUserId
          ? await ctx.db
              .query("organizations")
              .withIndex("by_created_by_id", (q) => q.eq("createdById", subUserId))
              .collect()
          : [];
        return {
          subscription,
          userId: subscription.userId ?? null,
          ownerName: owner?.name ?? null,
          ownerEmail: owner?.email ?? null,
          coveredOrgCount: coveredOrgs.length,
          coveredOrgNames: coveredOrgs.slice(0, 5).map((o) => o.name),
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
 * is audited on the platform trail with orgId null.
 */
export const setPlan = mutation({
  args: {
    userId: v.id("userProfiles"),
    planId: v.id("plans"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const reason = requireReason(args.reason);
    const owner = await ctx.db.get(args.userId);
    if (!owner) throw appError(ErrorCode.NOT_FOUND, "User not found");
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    const subscription = await getSubscription(ctx, args.userId);
    if (subscription.planId === plan._id) {
      throw appError(ErrorCode.CONFLICT, `Account is already on ${plan.name}`);
    }

    const beforePlan = await ctx.db.get(subscription.planId);
    await ctx.db.patch(subscription._id, { planId: plan._id });
    await writeAudit(ctx, {
      orgId: null,
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
