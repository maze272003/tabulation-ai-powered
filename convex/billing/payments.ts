import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import { requireUserProfile } from "../lib/auth";
import { requireSubscriptionOwner } from "../lib/billingOwnership";

const HISTORY_LIMIT = 50;

async function fetchUserPayments(ctx: QueryCtx) {
  const user = await requireUserProfile(ctx);
  const payments = await ctx.db
    .query("billingPayments")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .order("desc")
    .take(HISTORY_LIMIT);
  const planNames = new Map(
    await Promise.all(
      [...new Set(payments.map((p) => p.planId))].map(
        async (planId) => {
          const plan = await ctx.db.get(planId);
          return [planId, plan?.name ?? null] as const;
        },
      ),
    ),
  );
  return payments.map((payment) => ({
    ...payment,
    planName: planNames.get(payment.planId) ?? null,
  }));
}

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    return fetchUserPayments(ctx);
  },
});

/**
 * @deprecated Transitional query during per-user billing rollout. Use listForUser.
 */
export const listForOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx) => {
    return fetchUserPayments(ctx);
  },
});

export const getActiveCheckout = query({
  args: { orgSlug: v.optional(v.string()) },
  handler: async (ctx) => {
    const { user } = await requireSubscriptionOwner(ctx);
    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (!pending) return null;
    const plan = await ctx.db.get(pending.planId);
    return {
      paymentId: pending._id,
      userId: pending.userId ?? user._id,
      checkoutSessionId: pending.checkoutSessionId,
      checkoutUrl: pending.checkoutUrl,
      planName: plan?.name ?? null,
      amountCents: pending.amountCents,
      currency: pending.currency,
      billingInterval: pending.billingInterval,
      createdAt: pending._creationTime,
    };
  },
});
