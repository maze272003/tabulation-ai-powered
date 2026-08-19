import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requirePermission } from "../lib/authz";
import { appError, ErrorCode } from "../lib/errors";
import { writeAudit } from "../lib/audit";
import { createNotification } from "./notifications";

export const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

export const ticketTypeValidator = v.union(
  v.literal("refund"),
  v.literal("general_support"),
  v.literal("billing_issue"),
  v.literal("technical"),
);

export const ticketStatusValidator = v.union(
  v.literal("pending"),
  v.literal("in_review"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("resolved"),
);

export const ticketPriorityValidator = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
  v.literal("urgent"),
);

export const getRefundEligibility = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.view",
    });

    const plan = await ctx.db.get(actx.subscription.planId);
    const isFree = (plan?.priceCents ?? 0) === 0;

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
      .query("supportTickets")
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
            ticketType: existingTicket.ticketType,
            status: existingTicket.status,
            subject: existingTicket.subject,
            createdAt: existingTicket.createdAt,
          }
        : null,
    };
  },
});

export const createRefundTicket = mutation({
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
      .query("supportTickets")
      .withIndex("by_payment_id", (q) => q.eq("paymentId", latestPayment._id))
      .first();

    if (existingTicket) {
      throw appError(
        ErrorCode.CONFLICT,
        "A refund ticket has already been submitted for this subscription payment.",
      );
    }

    // Insert CRM Lead
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

    const formattedAmount = (latestPayment.amountCents / 100).toFixed(2);
    await ctx.db.insert("crmNotes", {
      leadId: crmLeadId,
      orgId: actx.org._id,
      body: `[SUBSCRIPTION REFUND TICKET]\nPlan: ${plan.name}\nAmount: ₱${formattedAmount}\nPayment ID: ${latestPayment._id}\nPaid At: ${new Date(paidAt).toISOString()}\nSubmitted At: ${new Date(now).toISOString()}\nPolicy: Within 10-hour refund window.\nReason: ${trimmedReason}\nDetails: ${args.details?.trim() || "None"}`,
      createdById: actx.user._id,
    });

    // Insert Support Ticket
    const ticketId = await ctx.db.insert("supportTickets", {
      orgId: actx.org._id,
      createdById: actx.user._id,
      ticketType: "refund",
      subject: `Refund Request — ${plan.name} Plan (₱${formattedAmount})`,
      description: trimmedReason,
      status: "pending",
      priority: "high",
      paymentId: latestPayment._id,
      planId: plan._id,
      refundAmountCents: latestPayment.amountCents,
      refundPaidAt: paidAt,
      refundExpiresAt: expiresAt,
      crmLeadId,
      assignedAdminId: null,
      lastMessageAt: now,
      unreadCustomerCount: 0,
      unreadAdminCount: 1,
      createdAt: now,
    });

    // Insert initial ticket message
    const initialBody = args.details?.trim()
      ? `Refund Request Submitted:\n**Reason:** ${trimmedReason}\n\n**Additional Details:**\n${args.details.trim()}`
      : `Refund Request Submitted:\n**Reason:** ${trimmedReason}`;

    await ctx.db.insert("ticketMessages", {
      ticketId,
      orgId: actx.org._id,
      senderId: actx.user._id,
      senderRole: "customer",
      body: initialBody,
      createdAt: now,
    });

    // Also record in refundTickets for consistency
    await ctx.db.insert("refundTickets", {
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

    // Notify user
    await createNotification(ctx, {
      userId: actx.user._id,
      orgId: actx.org._id,
      type: "ticket_created",
      title: "Refund Ticket Submitted",
      message: `Your refund request for ${plan.name} (₱${formattedAmount}) is received and currently pending review.`,
      link: `/app/${actx.org.slug}/support/${ticketId}`,
    });

    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "support.ticket.created",
      resourceType: "supportTicket",
      resourceId: ticketId,
      after: {
        ticketType: "refund",
        amountCents: latestPayment.amountCents,
        reason: trimmedReason,
      },
      reason: "User submitted refund ticket within 10-hour window",
    });

    return {
      ticketId,
      message: "Refund ticket submitted to CRM support team. You can track updates and chat with support in the ticket view.",
    };
  },
});

export const createSupportTicket = mutation({
  args: {
    orgSlug: v.string(),
    subject: v.string(),
    description: v.string(),
    ticketType: ticketTypeValidator,
    priority: v.optional(ticketPriorityValidator),
  },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.view",
    });

    const subject = args.subject.trim();
    const description = args.description.trim();

    if (subject.length < 3) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Subject must be at least 3 characters.");
    }
    if (description.length < 5) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Description must be at least 5 characters.");
    }

    const now = Date.now();
    const ticketId = await ctx.db.insert("supportTickets", {
      orgId: actx.org._id,
      createdById: actx.user._id,
      ticketType: args.ticketType,
      subject,
      description,
      status: "pending",
      priority: args.priority ?? "normal",
      assignedAdminId: null,
      lastMessageAt: now,
      unreadCustomerCount: 0,
      unreadAdminCount: 1,
      createdAt: now,
    });

    await ctx.db.insert("ticketMessages", {
      ticketId,
      orgId: actx.org._id,
      senderId: actx.user._id,
      senderRole: "customer",
      body: description,
      createdAt: now,
    });

    await createNotification(ctx, {
      userId: actx.user._id,
      orgId: actx.org._id,
      type: "ticket_created",
      title: "Support Ticket Opened",
      message: `Ticket #${ticketId.slice(-6)} "${subject}" was successfully created.`,
      link: `/app/${actx.org.slug}/support/${ticketId}`,
    });

    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "support.ticket.created",
      resourceType: "supportTicket",
      resourceId: ticketId,
      after: {
        ticketType: args.ticketType,
        subject,
      },
    });

    return { ticketId };
  },
});

export const listForOrg = query({
  args: {
    orgSlug: v.string(),
    status: v.optional(ticketStatusValidator),
    type: v.optional(ticketTypeValidator),
  },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.view",
    });

    let q = ctx.db
      .query("supportTickets")
      .withIndex("by_org_id", (query) => query.eq("orgId", actx.org._id));

    const tickets = await q.order("desc").collect();

    const filtered = tickets.filter((t) => {
      if (args.status && t.status !== args.status) return false;
      if (args.type && t.ticketType !== args.type) return false;
      return true;
    });

    return Promise.all(
      filtered.map(async (ticket) => {
        const creator = await ctx.db.get(ticket.createdById);
        const plan = ticket.planId ? await ctx.db.get(ticket.planId) : null;
        return {
          ...ticket,
          creatorName: creator?.name || creator?.email || "Customer",
          planName: plan?.name || null,
        };
      }),
    );
  },
});

export const getTicket = query({
  args: {
    orgSlug: v.string(),
    ticketId: v.id("supportTickets"),
  },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.view",
    });

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.orgId !== actx.org._id) {
      throw appError(ErrorCode.NOT_FOUND, "Ticket not found");
    }

    const creator = await ctx.db.get(ticket.createdById);
    const plan = ticket.planId ? await ctx.db.get(ticket.planId) : null;
    const payment = ticket.paymentId ? await ctx.db.get(ticket.paymentId) : null;

    return {
      ...ticket,
      creatorName: creator?.name || creator?.email || "Customer",
      creatorEmail: creator?.email || "",
      creatorImage: creator?.image || "",
      planName: plan?.name || null,
      paymentStatus: payment?.status || null,
    };
  },
});

export const getMessages = query({
  args: {
    orgSlug: v.string(),
    ticketId: v.id("supportTickets"),
  },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.view",
    });

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.orgId !== actx.org._id) {
      throw appError(ErrorCode.NOT_FOUND, "Ticket not found");
    }

    const messages = await ctx.db
      .query("ticketMessages")
      .withIndex("by_ticket_id", (q) => q.eq("ticketId", ticket._id))
      .order("asc")
      .collect();

    return Promise.all(
      messages.map(async (msg) => {
        const sender = await ctx.db.get(msg.senderId);
        return {
          ...msg,
          senderName:
            msg.senderRole === "superadmin"
              ? "Support Agent"
              : sender?.name || sender?.email || "User",
          senderImage: sender?.image || "",
        };
      }),
    );
  },
});

export const sendMessage = mutation({
  args: {
    orgSlug: v.string(),
    ticketId: v.id("supportTickets"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.view",
    });

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.orgId !== actx.org._id) {
      throw appError(ErrorCode.NOT_FOUND, "Ticket not found");
    }

    const body = args.body.trim();
    if (body.length === 0) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Message cannot be empty.");
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("ticketMessages", {
      ticketId: ticket._id,
      orgId: actx.org._id,
      senderId: actx.user._id,
      senderRole: "customer",
      body,
      createdAt: now,
    });

    // Update ticket
    const updatePatch: Record<string, unknown> = {
      lastMessageAt: now,
      unreadAdminCount: ticket.unreadAdminCount + 1,
    };

    if (ticket.status === "resolved") {
      updatePatch.status = "in_review";
    }

    await ctx.db.patch(ticket._id, updatePatch);

    return { messageId };
  },
});

export const markMessagesRead = mutation({
  args: {
    orgSlug: v.string(),
    ticketId: v.id("supportTickets"),
  },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.view",
    });

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.orgId !== actx.org._id) {
      return { success: false };
    }

    await ctx.db.patch(ticket._id, { unreadCustomerCount: 0 });

    // Auto mark as read any unread notifications pointing to this ticket
    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_and_read", (q) =>
        q.eq("userId", actx.user._id).eq("isRead", false),
      )
      .collect();

    for (const notif of unreadNotifications) {
      if (notif.link?.includes(args.ticketId)) {
        await ctx.db.patch(notif._id, { isRead: true });
      }
    }

    return { success: true };
  },
});

export const getOrgSupportBadge = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.view",
    });

    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .collect();

    let unreadCount = 0;
    for (const t of tickets) {
      unreadCount += t.unreadCustomerCount || 0;
    }

    return { unreadCount };
  },
});
