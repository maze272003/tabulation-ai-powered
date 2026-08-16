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

async function requireOrg(ctx: QueryCtx, orgId: Id<"organizations">) {
  const org = await ctx.db.get(orgId);
  if (!org || org.status === "deleted") {
    throw appError(ErrorCode.NOT_FOUND, "Organization not found");
  }
  return org;
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
        const [org, plan] = await Promise.all([
          ctx.db.get(subscription.orgId),
          ctx.db.get(subscription.planId),
        ]);
        return {
          subscription,
          orgName: org?.name ?? null,
          orgSlug: org?.slug ?? null,
          orgStatus: org?.status ?? null,
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
  args: { token: v.string(), orgId: v.id("organizations"), planId: v.id("plans"), reason: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const reason = requireReason(args.reason);
    const org = await requireOrg(ctx, args.orgId);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
      .unique();
    if (!subscription) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");
    if (subscription.planId === plan._id) {
      throw appError(ErrorCode.CONFLICT, `Organization is already on ${plan.name}`);
    }

    const beforePlan = await ctx.db.get(subscription.planId);
    await ctx.db.patch(subscription._id, { planId: plan._id });
    await writeAudit(ctx, {
      orgId: org._id,
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
    orgId: v.id("organizations"),
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
    const org = await requireOrg(ctx, args.orgId);
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
      .unique();
    if (!subscription) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");
    if (subscription.status === args.status) {
      throw appError(ErrorCode.CONFLICT, `Subscription is already ${args.status}`);
    }

    await ctx.db.patch(subscription._id, { status: args.status });
    await writeAudit(ctx, {
      orgId: org._id,
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
  args: { token: v.string(), orgId: v.id("organizations"), trialEndsAt: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const reason = requireReason(args.reason);
    const org = await requireOrg(ctx, args.orgId);
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
      .unique();
    if (!subscription) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");

    await ctx.db.patch(subscription._id, { trialEndsAt: args.trialEndsAt });
    await writeAudit(ctx, {
      orgId: org._id,
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