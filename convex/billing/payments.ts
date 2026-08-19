import { v } from "convex/values";
import { query } from "../_generated/server";
import { requirePermission } from "../lib/authz";

const HISTORY_LIMIT = 50;

export const listForOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.view",
    });
    const payments = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
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
  },
});

export const getActiveCheckout = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (!pending) return null;
    const plan = await ctx.db.get(pending.planId);
    return {
      paymentId: pending._id,
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
