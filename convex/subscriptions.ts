import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requirePermission } from "./lib/authz";
import { requireSubscriptionOwner } from "./lib/billingOwnership";
import { writeAudit } from "./lib/audit";

export const getForOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.view",
    });
    const plan = await ctx.db.get(actx.subscription.planId);
    return {
      subscription: actx.subscription,
      plan,
      isOwner: actx.org.createdById === actx.user._id,
    };
  },
});

/**
 * Downgrade path only: choosing Free schedules cancellation at period end.
 * Paid plans must go through PayMongo checkout (`billing.createCheckout`).
 * Immediate plan switches remain a superadmin override.
 */
export const changePlan = mutation({
  args: { orgSlug: v.string(), planName: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    if (actx.org.createdById !== actx.user._id) {
      throw appError(ErrorCode.FORBIDDEN, "Only the subscription owner can manage billing");
    }
    const plan = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", args.planName))
      .unique();
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    if (actx.subscription.planId === plan._id) {
      throw appError(ErrorCode.CONFLICT, `Already on ${plan.name}`);
    }
    if ((plan.priceCents ?? 0) > 0) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        `Plan ${plan.name} requires payment — start a checkout instead`,
      );
    }
    if (actx.subscription.cancelAtPeriodEnd) {
      throw appError(ErrorCode.CONFLICT, "Cancellation is already scheduled");
    }
    await ctx.db.patch(actx.subscription._id, { cancelAtPeriodEnd: true });
    await writeAudit(ctx, {
      orgId: null,
      actorId: actx.user._id,
      action: "subscription.cancel_scheduled",
      resourceType: "subscription",
      resourceId: actx.subscription._id,
      before: { cancelAtPeriodEnd: actx.subscription.cancelAtPeriodEnd },
      after: { cancelAtPeriodEnd: true },
    });
  },
});

export const resume = mutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    if (actx.org.createdById !== actx.user._id) {
      throw appError(ErrorCode.FORBIDDEN, "Only the subscription owner can manage billing");
    }
    if (!actx.subscription.cancelAtPeriodEnd) {
      throw appError(ErrorCode.CONFLICT, "No scheduled cancellation to resume");
    }
    await ctx.db.patch(actx.subscription._id, { cancelAtPeriodEnd: false });
    await writeAudit(ctx, {
      orgId: null,
      actorId: actx.user._id,
      action: "subscription.resumed",
      resourceType: "subscription",
      resourceId: actx.subscription._id,
      before: { cancelAtPeriodEnd: true },
      after: { cancelAtPeriodEnd: false },
    });
  },
});

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const { subscription } = await requireSubscriptionOwner(ctx);
    const plan = await ctx.db.get(subscription.planId);
    return { subscription, plan };
  },
});

export const cancelMine = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, subscription } = await requireSubscriptionOwner(ctx);
    const plan = await ctx.db.get(subscription.planId);
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    if ((plan.priceCents ?? 0) === 0) {
      throw appError(ErrorCode.CONFLICT, "Cannot cancel Free plan");
    }
    if (subscription.cancelAtPeriodEnd) {
      throw appError(ErrorCode.CONFLICT, "Cancellation is already scheduled");
    }
    await ctx.db.patch(subscription._id, { cancelAtPeriodEnd: true });
    await writeAudit(ctx, {
      orgId: null,
      actorId: user._id,
      action: "subscription.cancel_scheduled",
      resourceType: "subscription",
      resourceId: subscription._id,
      before: { cancelAtPeriodEnd: false },
      after: { cancelAtPeriodEnd: true },
    });
    return { success: true };
  },
});

export const resumeMine = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, subscription } = await requireSubscriptionOwner(ctx);
    if (!subscription.cancelAtPeriodEnd) {
      throw appError(ErrorCode.CONFLICT, "No scheduled cancellation to resume");
    }
    await ctx.db.patch(subscription._id, { cancelAtPeriodEnd: false });
    await writeAudit(ctx, {
      orgId: null,
      actorId: user._id,
      action: "subscription.resumed",
      resourceType: "subscription",
      resourceId: subscription._id,
      before: { cancelAtPeriodEnd: true },
      after: { cancelAtPeriodEnd: false },
    });
    return { success: true };
  },
});

