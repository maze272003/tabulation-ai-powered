import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requirePermission } from "./lib/authz";
import { writeAudit } from "./lib/audit";

export const getForOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.view",
    });
    const plan = await ctx.db.get(actx.subscription.planId);
    return { subscription: actx.subscription, plan };
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
      orgId: actx.org._id,
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
    if (!actx.subscription.cancelAtPeriodEnd) {
      throw appError(ErrorCode.CONFLICT, "No scheduled cancellation to resume");
    }
    await ctx.db.patch(actx.subscription._id, { cancelAtPeriodEnd: false });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "subscription.resumed",
      resourceType: "subscription",
      resourceId: actx.subscription._id,
      before: { cancelAtPeriodEnd: true },
      after: { cancelAtPeriodEnd: false },
    });
  },
});
