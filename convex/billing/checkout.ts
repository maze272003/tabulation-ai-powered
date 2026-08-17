import { v } from "convex/values";
import { action, internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { appError, ErrorCode } from "../lib/errors";
import { requirePermission } from "../lib/authz";
import { writeAudit } from "../lib/audit";
import { randomHex } from "../lib/billing";
import { createCheckoutSession, siteUrl } from "../lib/paymongo";

const REFERENCE_SUFFIX_LENGTH = 6;

export const createPendingPayment = internalMutation({
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
    if (plan.isActive === false) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Plan ${plan.name} is not available`);
    }
    const amountCents = plan.priceCents ?? 0;
    if (amountCents <= 0 || !plan.currency || !plan.billingInterval) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        `Plan ${plan.name} cannot be purchased. Only priced plans support checkout.`,
      );
    }

    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (pending) {
      throw appError(
        ErrorCode.CONFLICT,
        "A checkout is already in progress. Complete or cancel it before starting another.",
      );
    }

    const paymentId = await ctx.db.insert("billingPayments", {
      orgId: actx.org._id,
      planId: plan._id,
      createdById: actx.user._id,
      checkoutSessionId: null,
      checkoutUrl: null,
      referenceNumber: "",
      amountCents,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      status: "pending",
      periodStartAt: null,
      periodEndAt: null,
      paidAt: null,
      failureReason: null,
    });
    const referenceNumber = `${paymentId}.${randomHex(REFERENCE_SUFFIX_LENGTH)}`;
    await ctx.db.patch(paymentId, { referenceNumber });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "billing.checkout.created",
      resourceType: "billingPayment",
      resourceId: paymentId,
      after: { planName: plan.name, amountCents, referenceNumber },
    });
    return {
      paymentId,
      orgId: actx.org._id,
      planName: plan.name,
      amountCents,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      referenceNumber,
    };
  },
});

export const attachCheckoutSession = internalMutation({
  args: {
    paymentId: v.id("billingPayments"),
    checkoutSessionId: v.string(),
    checkoutUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw appError(ErrorCode.NOT_FOUND, "Payment not found");
    if (payment.status !== "pending") {
      throw appError(ErrorCode.CONFLICT, "Payment is no longer pending");
    }
    const clash = await ctx.db
      .query("billingPayments")
      .withIndex("by_checkout_session_id", (q) => q.eq("checkoutSessionId", args.checkoutSessionId))
      .first();
    if (clash && clash._id !== payment._id) {
      throw appError(ErrorCode.CONFLICT, "Checkout session is already linked to another payment");
    }
    await ctx.db.patch(payment._id, {
      checkoutSessionId: args.checkoutSessionId,
      checkoutUrl: args.checkoutUrl,
    });
  },
});

export const failPayment = internalMutation({
  args: { paymentId: v.id("billingPayments"), reason: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status !== "pending") return;
    await ctx.db.patch(payment._id, { status: "failed", failureReason: args.reason });
    await writeAudit(ctx, {
      orgId: payment.orgId,
      actorId: null,
      action: "billing.checkout.failed",
      resourceType: "billingPayment",
      resourceId: payment._id,
      after: { reason: args.reason },
    });
  },
});

export const createCheckout = action({
  args: { orgSlug: v.string(), planName: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const pending = await ctx.runMutation(internal.billing.checkout.createPendingPayment, {
      orgSlug: args.orgSlug,
      planName: args.planName,
    });
    try {
      const session = await createCheckoutSession({
        lineItemName: `${pending.planName} plan (${pending.billingInterval})`,
        amountCents: pending.amountCents,
        currency: pending.currency,
        referenceNumber: pending.referenceNumber,
        successUrl: `${siteUrl()}/app/${args.orgSlug}/billing?billing=success`,
        cancelUrl: `${siteUrl()}/app/${args.orgSlug}/billing?billing=cancelled`,
        metadata: { orgId: pending.orgId, paymentId: pending.paymentId },
      });
      await ctx.runMutation(internal.billing.checkout.attachCheckoutSession, {
        paymentId: pending.paymentId,
        checkoutSessionId: session.checkoutSessionId,
        checkoutUrl: session.checkoutUrl,
      });
      return session.checkoutUrl;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown PayMongo error";
      await ctx.runMutation(internal.billing.checkout.failPayment, {
        paymentId: pending.paymentId,
        reason,
      });
      throw error;
    }
  },
});

export const cancelCheckout = mutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (!pending) throw appError(ErrorCode.CONFLICT, "No active checkout to cancel");
    await ctx.db.patch(pending._id, { status: "cancelled" });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "billing.checkout.cancelled",
      resourceType: "billingPayment",
      resourceId: pending._id,
    });
  },
});
