import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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

// Phase 1 stub — real Stripe wiring lands in Phase 6.
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
    if (!plan) throw new Error("Plan not found");
    const before = { planId: actx.subscription.planId };
    await ctx.db.patch(actx.subscription._id, { planId: plan._id });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "subscription.plan_changed",
      resourceType: "subscription",
      resourceId: actx.subscription._id,
      before,
      after: { planId: plan._id },
    });
  },
});
