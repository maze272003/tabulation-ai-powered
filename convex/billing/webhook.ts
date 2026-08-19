import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { writeAudit } from "../lib/audit";
import { computeRenewalWindow } from "../lib/billing";
import { expectedLivemode, verifyPaymongoSignature } from "../lib/paymongo";

const PAID_EVENTS = new Set([
  "checkout_session.payment.paid",
  "payment.paid",
]);
const EVENT_FAILED = "checkout_session.payment.failed";
const EXPIRY_EVENTS = new Set([
  "checkout_session.payment.expired",
  "checkout_session.payment.canceled",
  "checkout_session.payment.cancelled",
]);

type ProcessedEvent = {
  eventId: string;
  eventType: string;
  checkoutSessionId: string | null;
  referenceNumber: string | null;
  paymentId: string | null;
  paidAmount: number | null;
};

type WebhookOutcome = "duplicate" | "applied" | "flagged" | "ignored";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extracts the fields the processor needs from a PayMongo event envelope:
 * `{ data: { id, attributes: { type, livemode, data: <resource> } } }`.
 * Returns null for anything that does not match the documented shape.
 */
function extractEvent(rawBody: string): { event: ProcessedEvent; livemode: boolean } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.data)) return null;
  const { id: eventId, attributes } = parsed.data;
  if (typeof eventId !== "string" || !isRecord(attributes)) return null;
  const { type: eventType, livemode, data: resource } = attributes;
  if (typeof eventType !== "string" || typeof livemode !== "boolean") return null;
  const resourceAttributes =
    isRecord(resource) && isRecord(resource.attributes) ? resource.attributes : {};
  const sessionId = isRecord(resource) ? resource.id : undefined;

  const metadata = isRecord(resourceAttributes.metadata) ? resourceAttributes.metadata : {};
  const paymentId = typeof metadata.paymentId === "string" ? metadata.paymentId : null;

  const checkoutSessionId =
    typeof sessionId === "string" && sessionId.startsWith("cs_")
      ? sessionId
      : typeof resourceAttributes.checkout_session_id === "string"
        ? resourceAttributes.checkout_session_id
        : typeof metadata.checkoutSessionId === "string"
          ? metadata.checkoutSessionId
          : typeof sessionId === "string"
            ? sessionId
            : null;

  const referenceNumber =
    typeof resourceAttributes.reference_number === "string"
      ? resourceAttributes.reference_number
      : typeof resourceAttributes.external_reference_number === "string"
        ? resourceAttributes.external_reference_number
        : typeof metadata.referenceNumber === "string"
          ? metadata.referenceNumber
          : null;

  let paidAmount: number | null = null;
  if (typeof resourceAttributes.amount === "number") {
    paidAmount = resourceAttributes.amount;
  } else if (Array.isArray(resourceAttributes.payments) && resourceAttributes.payments.length > 0) {
    const first = resourceAttributes.payments[0];
    if (
      isRecord(first) &&
      isRecord(first.attributes) &&
      typeof first.attributes.amount === "number"
    ) {
      paidAmount = first.attributes.amount;
    }
  }

  return {
    event: { eventId, eventType, checkoutSessionId, referenceNumber, paymentId, paidAmount },
    livemode,
  };
}

async function findPendingPayment(
  ctx: MutationCtx,
  event: ProcessedEvent,
): Promise<Doc<"billingPayments"> | null> {
  let payment: Doc<"billingPayments"> | null = null;
  if (event.checkoutSessionId !== null) {
    payment = await ctx.db
      .query("billingPayments")
      .withIndex("by_checkout_session_id", (q) =>
        q.eq("checkoutSessionId", event.checkoutSessionId),
      )
      .unique();
  }
  if (!payment && event.referenceNumber !== null) {
    const referenceNumber = event.referenceNumber;
    payment = await ctx.db
      .query("billingPayments")
      .withIndex("by_reference_number", (q) => q.eq("referenceNumber", referenceNumber))
      .unique();
  }
  if (!payment && event.paymentId !== null) {
    try {
      const normalizedId = ctx.db.normalizeId("billingPayments", event.paymentId);
      if (normalizedId) {
        payment = await ctx.db.get(normalizedId);
      }
    } catch {
      // ignore invalid id format
    }
  }
  if (!payment || payment.status !== "pending") return null;
  return payment;
}

async function flagPayment(
  ctx: MutationCtx,
  payment: Doc<"billingPayments">,
  reason: string,
): Promise<WebhookOutcome> {
  await ctx.db.patch(payment._id, { status: "flagged", failureReason: reason });
  await writeAudit(ctx, {
    orgId: payment.orgId,
    actorId: null,
    action: "billing.payment.flagged",
    resourceType: "billingPayment",
    resourceId: payment._id,
    after: { reason },
  });
  return "flagged";
}

export const applyPaidPayment = internalMutation({
  args: {
    paymentId: v.id("billingPayments"),
    paidAmount: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ status: "applied" | "already_paid" | "flagged"; planName: string | null }> => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return { status: "flagged", planName: null };
    if (payment.status === "paid") {
      const plan = await ctx.db.get(payment.planId);
      return { status: "already_paid", planName: plan?.name ?? "Paid" };
    }
    if (args.paidAmount !== undefined && args.paidAmount !== payment.amountCents) {
      await flagPayment(
        ctx,
        payment,
        `Amount mismatch: expected ${payment.amountCents}, webhook reported ${args.paidAmount}`,
      );
      return { status: "flagged", planName: null };
    }
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_org_id", (q) => q.eq("orgId", payment.orgId))
      .unique();
    if (!subscription) {
      await flagPayment(ctx, payment, "No subscription found for organization");
      return { status: "flagged", planName: null };
    }
    const now = Date.now();
    const window = computeRenewalWindow(subscription, payment.billingInterval, now);
    await ctx.db.patch(payment._id, {
      status: "paid",
      paidAt: now,
      periodStartAt: window.periodStartAt,
      periodEndAt: window.periodEndAt,
    });
    await ctx.db.patch(subscription._id, {
      planId: payment.planId,
      status: "active",
      currentPeriodEndAt: window.periodEndAt,
      cancelAtPeriodEnd: false,
    });
    const plan = await ctx.db.get(payment.planId);
    await writeAudit(ctx, {
      orgId: payment.orgId,
      actorId: payment.createdById,
      action: "billing.payment.paid",
      resourceType: "billingPayment",
      resourceId: payment._id,
      after: { amountCents: payment.amountCents, periodEndAt: window.periodEndAt, planName: plan?.name },
    });
    return { status: "applied", planName: plan?.name ?? "Paid" };
  },
});

async function applyPaidEvent(ctx: MutationCtx, event: ProcessedEvent): Promise<WebhookOutcome> {
  const payment = await findPendingPayment(ctx, event);
  if (!payment) return "ignored";
  if (event.paidAmount !== null && event.paidAmount !== payment.amountCents) {
    return flagPayment(
      ctx,
      payment,
      `Amount mismatch: expected ${payment.amountCents}, webhook reported ${event.paidAmount}`,
    );
  }
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_org_id", (q) => q.eq("orgId", payment.orgId))
    .unique();
  if (!subscription) {
    return flagPayment(ctx, payment, "No subscription found for organization");
  }
  const now = Date.now();
  const window = computeRenewalWindow(subscription, payment.billingInterval, now);
  await ctx.db.patch(payment._id, {
    status: "paid",
    paidAt: now,
    periodStartAt: window.periodStartAt,
    periodEndAt: window.periodEndAt,
  });
  await ctx.db.patch(subscription._id, {
    planId: payment.planId,
    status: "active",
    currentPeriodEndAt: window.periodEndAt,
    cancelAtPeriodEnd: false,
  });
  const plan = await ctx.db.get(payment.planId);
  await writeAudit(ctx, {
    orgId: payment.orgId,
    actorId: payment.createdById,
    action: "billing.payment.paid",
    resourceType: "billingPayment",
    resourceId: payment._id,
    after: { amountCents: payment.amountCents, periodEndAt: window.periodEndAt, planName: plan?.name },
  });
  return "applied";
}

async function applyTerminalEvent(
  ctx: MutationCtx,
  event: ProcessedEvent,
  status: "failed" | "expired",
  reason: string,
  auditAction: string,
): Promise<WebhookOutcome> {
  const payment = await findPendingPayment(ctx, event);
  if (!payment) return "ignored";
  await ctx.db.patch(payment._id, { status, failureReason: reason });
  await writeAudit(ctx, {
    orgId: payment.orgId,
    actorId: null,
    action: auditAction,
    resourceType: "billingPayment",
    resourceId: payment._id,
  });
  return "applied";
}

export const processWebhookEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    checkoutSessionId: v.union(v.null(), v.string()),
    referenceNumber: v.union(v.null(), v.string()),
    paymentId: v.optional(v.union(v.null(), v.string())),
    paidAmount: v.union(v.null(), v.number()),
  },
  handler: async (ctx, args): Promise<WebhookOutcome> => {
    // Dedupe first: PayMongo retries up to 12 times, so replays are expected.
    const existing = await ctx.db
      .query("processedWebhookEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (existing) return "duplicate";
    await ctx.db.insert("processedWebhookEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      receivedAt: Date.now(),
    });

    const event: ProcessedEvent = {
      eventId: args.eventId,
      eventType: args.eventType,
      checkoutSessionId: args.checkoutSessionId,
      referenceNumber: args.referenceNumber,
      paymentId: args.paymentId ?? null,
      paidAmount: args.paidAmount,
    };
    if (PAID_EVENTS.has(event.eventType)) return applyPaidEvent(ctx, event);
    if (event.eventType === EVENT_FAILED) {
      return applyTerminalEvent(ctx, event, "failed", "Payment failed at PayMongo", "billing.payment.failed");
    }
    if (EXPIRY_EVENTS.has(event.eventType)) {
      return applyTerminalEvent(ctx, event, "expired", "Checkout session expired", "billing.payment.expired");
    }
    // Unknown types are recorded above and acknowledged — never error, that
    // would push the event into PayMongo's retry queue forever.
    return "ignored";
  },
});

export const paymongoWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("PAYMONGO_WEBHOOK_SECRET is not configured");
    return new Response(null, { status: 500 });
  }
  const rawBody = await request.text();
  const signature = request.headers.get("paymongo-signature");
  if (!(await verifyPaymongoSignature(rawBody, signature, secret))) {
    return new Response(null, { status: 401 });
  }
  const extracted = extractEvent(rawBody);
  if (!extracted) {
    console.error("paymongo webhook: unparseable payload after valid signature");
    return new Response(null, { status: 200 });
  }
  if (extracted.livemode !== expectedLivemode()) {
    console.warn("paymongo webhook: livemode mismatch — event dropped");
    return new Response(null, { status: 200 });
  }
  try {
    // Acknowledge immediately, process asynchronously — PayMongo requires a
    // 2xx within 30 seconds. A failed scheduled run is visible in Convex logs.
    await ctx.scheduler.runAfter(0, internal.billing.webhook.processWebhookEvent, extracted.event);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("paymongo webhook: failed to schedule processing", error);
    return new Response(null, { status: 500 });
  }
});
