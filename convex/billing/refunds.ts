import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requirePermission } from "../lib/authz";
import { appError, ErrorCode } from "../lib/errors";
import { writeAudit } from "../lib/audit";

export const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

export const getEligibility = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.view",
    });

    const plan = await ctx.db.get(actx.subscription.planId);
    const isFree = (plan?.priceCents ?? 0) === 0;

    // Fetch the latest completed paid payment for this organization
    const latestPayment = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "paid"))
      .order("desc")
      .first();

    if (!latestPayment || isFree) {
      return {
        hasPaidSubscription: false,
        planName: plan?.name ?? "Free",
        amountCents: 0,
        paidAt: null,
        expiresAt: null,
        remainingMs: 0,
        isEligible: false,
        existingTicket: null,
      };
    }

    const paidAt = latestPayment.paidAt ?? latestPayment._creationTime;
    const expiresAt = paidAt + TEN_HOURS_MS;
    const now = Date.now();
    const remainingMs = Math.max(0, expiresAt - now);
    const isWithinWindow = remainingMs > 0;

    const existingTicket = await ctx.db
      .query("refundTickets")
      .withIndex("by_payment_id", (q) => q.eq("paymentId", latestPayment._id))
      .order("desc")
      .first();

    return {
      hasPaidSubscription: true,
      planName: plan?.name ?? "Paid",
      amountCents: latestPayment.amountCents,
      paidAt,
      expiresAt,
      remainingMs,
      isEligible: isWithinWindow && !existingTicket,
      existingTicket: existingTicket
        ? {
            id: existingTicket._id,
            status: existingTicket.status,
            reason: existingTicket.reason,
            createdAt: existingTicket.createdAt,
          }
        : null,
    };
  },
});

export const submitRefundTicket = mutation({
  args: {
    orgSlug: v.string(),
    reason: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });

    const trimmedReason = args.reason.trim();
    if (trimmedReason.length < 3) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        "Please provide a reason for the refund request (at least 3 characters).",
      );
    }
    if (trimmedReason.length > 500) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        "Reason is too long (maximum 500 characters).",
      );
    }

    const plan = await ctx.db.get(actx.subscription.planId);
    if (!plan || (plan.priceCents ?? 0) === 0) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        "Only paid subscriptions are eligible for refund requests.",
      );
    }

    const latestPayment = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "paid"))
      .order("desc")
      .first();

    if (!latestPayment) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        "No paid payment record found for this organization.",
      );
    }

    const paidAt = latestPayment.paidAt ?? latestPayment._creationTime;
    const expiresAt = paidAt + TEN_HOURS_MS;
    const now = Date.now();

    if (now > expiresAt) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        "Refund request invalid: Refund tickets must be submitted within 10 hours of payment. This window has expired.",
      );
    }

    const existingTicket = await ctx.db
      .query("refundTickets")
      .withIndex("by_payment_id", (q) => q.eq("paymentId", latestPayment._id))
      .first();

    if (existingTicket) {
      throw appError(
        ErrorCode.CONFLICT,
        "A refund ticket has already been submitted for this subscription payment.",
      );
    }

    // Create a CRM Lead ticket for support agents
    const crmLeadId = await ctx.db.insert("crmLeads", {
      companyName: actx.org.name,
      contactName: actx.user.name || "Customer",
      contactEmail: actx.user.email,
      source: "Refund Ticket (10-hr Policy)",
      stage: "customer",
      valueCents: latestPayment.amountCents,
      summary: `[REFUND TICKET] ${trimmedReason} — Org: ${actx.org.name} (${actx.org.slug})`,
      convertedOrgId: actx.org._id,
      createdById: actx.user._id,
      nextFollowUpAt: now + 2 * 60 * 60 * 1000,
      updatedAt: now,
    });

    // Create a CRM Note with details
    const formattedAmount = (latestPayment.amountCents / 100).toFixed(2);
    await ctx.db.insert("crmNotes", {
      leadId: crmLeadId,
      orgId: actx.org._id,
      body: `[SUBSCRIPTION REFUND TICKET]\nPlan: ${plan.name}\nAmount: ₱${formattedAmount}\nPayment ID: ${latestPayment._id}\nPaid At: ${new Date(paidAt).toISOString()}\nSubmitted At: ${new Date(now).toISOString()}\nWindow: Valid (within 10-hour policy window)\n\nReason: ${trimmedReason}\nAdditional Details: ${args.details?.trim() || "None"}`,
      createdById: actx.user._id,
    });

    // Insert refund ticket
    const ticketId = await ctx.db.insert("refundTickets", {
      orgId: actx.org._id,
      paymentId: latestPayment._id,
      requestedById: actx.user._id,
      planId: plan._id,
      amountCents: latestPayment.amountCents,
      reason: trimmedReason,
      details: args.details?.trim(),
      status: "pending",
      paidAt,
      expiresAt,
      crmLeadId,
      createdAt: now,
    });

    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "billing.refund_ticket.created",
      resourceType: "refundTicket",
      resourceId: ticketId,
      after: {
        amountCents: latestPayment.amountCents,
        reason: trimmedReason,
        paidAt,
        expiresAt,
      },
      reason: "User submitted refund ticket within 10-hour window",
    });

    return {
      ticketId,
      message: "Your refund ticket has been submitted to support via CRM. Our team will review it shortly.",
    };
  },
});
