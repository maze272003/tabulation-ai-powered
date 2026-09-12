import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireReason, requireSuperadminSession } from "../lib/superadmin";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

const featureValidator = v.object({
  canCreateEvent: v.boolean(),
  canExportReports: v.boolean(),
  canUseCustomBranding: v.boolean(),
  canUseAuditLogs: v.boolean(),
  canCreateTemplates: v.boolean(),
  canUseAdvancedAnalytics: v.boolean(),
  canUseApi: v.boolean(),
});

const limitValidator = v.object({
  maxMembers: v.number(),
  maxEvents: v.number(),
  maxJudges: v.number(),
  maxContestants: v.number(),
});

async function requireUser(ctx: QueryCtx, userId: Id<"userProfiles">) {
  const user = await ctx.db.get(userId);
  if (!user) {
    throw appError(ErrorCode.NOT_FOUND, "User not found");
  }
  return user;
}

export const listPlans = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    const plans = await ctx.db.query("plans").collect();
    return plans.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const savePlan = mutation({
  args: {
    token: v.string(),
    planId: v.optional(v.id("plans")),
    name: v.string(),
    sortOrder: v.number(),
    features: featureValidator,
    limits: limitValidator,
    priceCents: v.optional(v.number()),
    currency: v.optional(v.string()),
    billingInterval: v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
    isActive: v.optional(v.boolean()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const reason = requireReason(args.reason);
    const name = args.name.trim();
    if (!name) throw appError(ErrorCode.VALIDATION_ERROR, "Plan name is required");
    if (args.priceCents !== undefined && args.priceCents < 0) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Price cannot be negative");
    }

    const price = {
      priceCents: args.priceCents,
      currency: args.currency,
      billingInterval: args.billingInterval,
      isActive: args.isActive ?? true,
    };

    if (args.planId) {
      const plan = await ctx.db.get(args.planId);
      if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
      const duplicate = await ctx.db
        .query("plans")
        .withIndex("by_name", (q) => q.eq("name", name))
        .unique();
      if (duplicate && duplicate._id !== plan._id) {
        throw appError(ErrorCode.CONFLICT, "A plan with this name already exists");
      }
      await ctx.db.patch(plan._id, {
        name,
        sortOrder: args.sortOrder,
        features: args.features,
        limits: args.limits,
        priceCents: args.priceCents,
        currency: args.currency,
        billingInterval: args.billingInterval,
        isActive: args.isActive ?? true,
      });
      await writeAudit(ctx, {
        orgId: null,
        actorId: null,
        action: "platform.plan.updated",
        resourceType: "plan",
        resourceId: plan._id,
        before: { name: plan.name, price: plan.priceCents ?? null, isActive: plan.isActive ?? true },
        after: { name, price, reason },
        reason: `superadmin:${session.label} — ${reason}`,
      });
      return plan._id;
    }

    const duplicate = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (duplicate) {
      throw appError(ErrorCode.CONFLICT, "A plan with this name already exists");
    }
    const planId = await ctx.db.insert("plans", {
      name,
      sortOrder: args.sortOrder,
      features: args.features,
      limits: args.limits,
      isSystem: false,
      ...price,
    });
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "platform.plan.created",
      resourceType: "plan",
      resourceId: planId,
      before: null,
      after: { name, price },
      reason: `superadmin:${session.label} — ${reason}`,
    });
    return planId;
  },
});

export const listSubscriptions = query({
  args: { token: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);

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
          ownerName: owner?.name ?? null,
          ownerEmail: owner?.email ?? null,
          coveredOrgCount: coveredOrgs.length,
          planName: plan?.name ?? null,
          planPriceCents: plan?.priceCents ?? null,
          planCurrency: plan?.currency ?? null,
          planInterval: plan?.billingInterval ?? null,
        };
      }),
    );
    return { ...result, page };
  },
});

export const setPlan = mutation({
  args: { token: v.string(), userId: v.id("userProfiles"), planId: v.id("plans"), reason: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const reason = requireReason(args.reason);
    await requireUser(ctx, args.userId);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();
    if (!subscription) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");
    if (subscription.planId === plan._id) {
      throw appError(ErrorCode.CONFLICT, `Account is already on ${plan.name}`);
    }

    const beforePlan = await ctx.db.get(subscription.planId);
    await ctx.db.patch(subscription._id, { planId: plan._id });
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "platform.subscription.plan_overridden",
      resourceType: "subscription",
      resourceId: subscription._id,
      before: { planName: beforePlan?.name ?? null },
      after: { planName: plan.name },
      reason: `superadmin:${session.label} — ${reason}`,
    });
  },
});

export const setStatus = mutation({
  args: {
    token: v.string(),
    userId: v.id("userProfiles"),
    status: v.union(
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("expired"),
      v.literal("paused"),
    ),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const reason = requireReason(args.reason);
    await requireUser(ctx, args.userId);
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();
    if (!subscription) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");
    if (subscription.status === args.status) {
      throw appError(ErrorCode.CONFLICT, `Subscription is already ${args.status}`);
    }

    await ctx.db.patch(subscription._id, { status: args.status });
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "platform.subscription.status_changed",
      resourceType: "subscription",
      resourceId: subscription._id,
      before: { status: subscription.status },
      after: { status: args.status },
      reason: `superadmin:${session.label} — ${reason}`,
    });
  },
});

export const setTrialEnd = mutation({
  args: { token: v.string(), userId: v.id("userProfiles"), trialEndsAt: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const reason = requireReason(args.reason);
    await requireUser(ctx, args.userId);
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();
    if (!subscription) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");

    await ctx.db.patch(subscription._id, { trialEndsAt: args.trialEndsAt });
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "platform.subscription.trial_extended",
      resourceType: "subscription",
      resourceId: subscription._id,
      before: { trialEndsAt: subscription.trialEndsAt },
      after: { trialEndsAt: args.trialEndsAt },
      reason: `superadmin:${session.label} — ${reason}`,
    });
  },
});