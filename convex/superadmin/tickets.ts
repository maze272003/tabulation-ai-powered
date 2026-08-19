import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { action, mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { requireSuperadminSession } from "../lib/superadmin";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";
import { createPaymongoRefund, retrieveCheckoutSession } from "../lib/paymongo";
import { createNotification } from "../support/notifications";
import { ticketPriorityValidator, ticketStatusValidator, ticketTypeValidator } from "../support/tickets";

async function requireTicket(ctx: QueryCtx, ticketId: Id<"supportTickets">) {
  const ticket = await ctx.db.get(ticketId);
  if (!ticket) throw appError(ErrorCode.NOT_FOUND, "Ticket not found");
  return ticket;
}

export const listAll = query({
  args: {
    token: v.string(),
    paginationOpts: paginationOptsValidator,
    status: v.optional(ticketStatusValidator),
    ticketType: v.optional(ticketTypeValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);

    const base = ctx.db.query("supportTickets").order("desc");

    const result = await base.paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (ticket) => {
        const org = await ctx.db.get(ticket.orgId);
        const creator = await ctx.db.get(ticket.createdById);
        const plan = ticket.planId ? await ctx.db.get(ticket.planId) : null;
        return {
          ...ticket,
          orgName: org?.name ?? "Unknown Org",
          orgSlug: org?.slug ?? "",
          creatorName: creator?.name ?? creator?.email ?? "Customer",
          creatorEmail: creator?.email ?? "",
          planName: plan?.name ?? null,
        };
      }),
    );

    const filteredPage = page.filter((t) => {
      if (args.status && t.status !== args.status) return false;
      if (args.ticketType && t.ticketType !== args.ticketType) return false;
      if (args.search) {
        const s = args.search.toLowerCase();
        const matchesSubject = t.subject.toLowerCase().includes(s);
        const matchesOrg = t.orgName.toLowerCase().includes(s);
        const matchesEmail = t.creatorEmail.toLowerCase().includes(s);
        if (!matchesSubject && !matchesOrg && !matchesEmail) return false;
      }
      return true;
    });

    return { ...result, page: filteredPage };
  },
});

export const getDetail = query({
  args: {
    token: v.string(),
    ticketId: v.id("supportTickets"),
  },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    const ticket = await requireTicket(ctx, args.ticketId);

    const org = await ctx.db.get(ticket.orgId);
    const creator = await ctx.db.get(ticket.createdById);
    const plan = ticket.planId ? await ctx.db.get(ticket.planId) : null;
    const payment = ticket.paymentId ? await ctx.db.get(ticket.paymentId) : null;
    const subscription = org
      ? await ctx.db
          .query("subscriptions")
          .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
          .unique()
      : null;

    return {
      ...ticket,
      orgName: org?.name ?? "Unknown Org",
      orgSlug: org?.slug ?? "",
      creatorName: creator?.name ?? creator?.email ?? "Customer",
      creatorEmail: creator?.email ?? "",
      creatorImage: creator?.image ?? "",
      planName: plan?.name ?? null,
      payment,
      subscription,
    };
  },
});

export const getMessages = query({
  args: {
    token: v.string(),
    ticketId: v.id("supportTickets"),
  },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    const ticket = await requireTicket(ctx, args.ticketId);

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
              ? "Support Agent (You)"
              : sender?.name || sender?.email || "Customer",
          senderImage: sender?.image || "",
        };
      }),
    );
  },
});

export const sendAdminMessage = mutation({
  args: {
    token: v.string(),
    ticketId: v.id("supportTickets"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const ticket = await requireTicket(ctx, args.ticketId);

    const body = args.body.trim();
    if (!body) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Message cannot be empty.");
    }

    // Find superadmin user profile if available, or use ticket creator/session
    const superadminUser = await ctx.db
      .query("userProfiles")
      .withIndex("by_platform_role", (q) => q.eq("platformRole", "platform_owner"))
      .first();

    const senderId = superadminUser?._id ?? ticket.createdById;
    const now = Date.now();

    const messageId = await ctx.db.insert("ticketMessages", {
      ticketId: ticket._id,
      orgId: ticket.orgId,
      senderId,
      senderRole: "superadmin",
      body,
      createdAt: now,
    });

    const updatePatch: Record<string, unknown> = {
      lastMessageAt: now,
      unreadCustomerCount: ticket.unreadCustomerCount + 1,
      unreadAdminCount: 0,
    };

    if (ticket.status === "pending") {
      updatePatch.status = "in_review";
    }

    await ctx.db.patch(ticket._id, updatePatch);

    // Notify customer
    const org = await ctx.db.get(ticket.orgId);
    await createNotification(ctx, {
      userId: ticket.createdById,
      orgId: ticket.orgId,
      type: "ticket_reply",
      title: "Support Agent Replied",
      message: `New message on ticket "${ticket.subject}": "${body.slice(0, 80)}${body.length > 80 ? "…" : ""}"`,
      link: `/app/${org?.slug ?? ""}/support/${ticket._id}`,
    });

    return { messageId };
  },
});

export const updateStatus = mutation({
  args: {
    token: v.string(),
    ticketId: v.id("supportTickets"),
    status: ticketStatusValidator,
    decisionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const ticket = await requireTicket(ctx, args.ticketId);
    const org = await ctx.db.get(ticket.orgId);
    const now = Date.now();

    const updatePatch: Record<string, unknown> = {
      status: args.status,
      decisionReason: args.decisionReason?.trim() || ticket.decisionReason,
    };

    if (args.status === "resolved") {
      updatePatch.resolvedAt = now;
    }

    // Handle Refund Specific Status Transitions
    if (ticket.ticketType === "refund") {
      if (args.status === "approved") {
        // 1. Mark payment as refunded if linked
        if (ticket.paymentId) {
          await ctx.db.patch(ticket.paymentId, { status: "refunded" });
        }

        // 2. Downgrade organization subscription to Free
        const freePlan = await ctx.db
          .query("plans")
          .withIndex("by_name", (q) => q.eq("name", "Free"))
          .first();

        if (freePlan && org) {
          const subscription = await ctx.db
            .query("subscriptions")
            .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
            .unique();

          if (subscription) {
            await ctx.db.patch(subscription._id, {
              planId: freePlan._id,
              status: "active",
              cancelAtPeriodEnd: false,
            });
          }
        }

        // 3. Update refundTickets table if present
        if (ticket.paymentId) {
          const refundTicketRecord = await ctx.db
            .query("refundTickets")
            .withIndex("by_payment_id", (q) => q.eq("paymentId", ticket.paymentId!))
            .first();

          if (refundTicketRecord) {
            await ctx.db.patch(refundTicketRecord._id, { status: "approved" });
          }
        }

        // 4. Send notification
        await createNotification(ctx, {
          userId: ticket.createdById,
          orgId: ticket.orgId,
          type: "refund_approved",
          title: "Refund Request Approved",
          message: `Your refund request of ₱${((ticket.refundAmountCents ?? 0) / 100).toFixed(2)} has been approved and processed. Your organization plan is set to Free.`,
          link: `/app/${org?.slug ?? ""}/billing`,
        });

        // 5. System message in thread
        await ctx.db.insert("ticketMessages", {
          ticketId: ticket._id,
          orgId: ticket.orgId,
          senderId: ticket.createdById,
          senderRole: "system",
          body: `**Refund Approved**: The refund request was approved by the administration team. Payment has been marked as refunded and the plan was switched to Free.`,
          createdAt: now,
        });
      } else if (args.status === "rejected") {
        if (ticket.paymentId) {
          const refundTicketRecord = await ctx.db
            .query("refundTickets")
            .withIndex("by_payment_id", (q) => q.eq("paymentId", ticket.paymentId!))
            .first();

          if (refundTicketRecord) {
            await ctx.db.patch(refundTicketRecord._id, { status: "rejected" });
          }
        }

        await createNotification(ctx, {
          userId: ticket.createdById,
          orgId: ticket.orgId,
          type: "refund_rejected",
          title: "Refund Request Rejected",
          message: `Your refund request was reviewed and rejected. Reason: ${args.decisionReason || "Does not meet refund policy criteria."}`,
          link: `/app/${org?.slug ?? ""}/support/${ticket._id}`,
        });

        await ctx.db.insert("ticketMessages", {
          ticketId: ticket._id,
          orgId: ticket.orgId,
          senderId: ticket.createdById,
          senderRole: "system",
          body: `**Refund Rejected**: ${args.decisionReason ? `Reason: ${args.decisionReason}` : "The refund request was declined by support."}`,
          createdAt: now,
        });
      }
    } else if (args.status === "resolved") {
      await createNotification(ctx, {
        userId: ticket.createdById,
        orgId: ticket.orgId,
        type: "ticket_status_change",
        title: "Ticket Resolved",
        message: `Ticket "${ticket.subject}" has been marked as resolved.`,
        link: `/app/${org?.slug ?? ""}/support/${ticket._id}`,
      });
    }

    await ctx.db.patch(ticket._id, updatePatch);

    await writeAudit(ctx, {
      orgId: ticket.orgId,
      actorId: null,
      action: "superadmin.ticket.status_updated",
      resourceType: "supportTicket",
      resourceId: ticket._id,
      after: {
        status: args.status,
        decisionReason: args.decisionReason,
      },
      reason: `Superadmin updated ticket status to ${args.status}`,
    });

    return { success: true };
  },
});

export const approveRefundWithPayMongo = action({
  args: {
    token: v.string(),
    ticketId: v.id("supportTickets"),
  },
  handler: async (ctx, args) => {
    const detail = await ctx.runQuery(api.superadmin.tickets.getDetail, {
      token: args.token,
      ticketId: args.ticketId,
    });

    if (detail.ticketType !== "refund") {
      throw appError(ErrorCode.VALIDATION_ERROR, "Ticket is not a refund request");
    }

    let paymongoRefundId: string | null = null;

    // Call PayMongo API if checkout session exists
    if (detail.payment?.checkoutSessionId) {
      try {
        const checkoutSession = await retrieveCheckoutSession(detail.payment.checkoutSessionId);
        if (checkoutSession.paymongoPaymentId) {
          const refundAmount = detail.refundAmountCents ?? detail.payment.amountCents;
          const refundRes = await createPaymongoRefund({
            amountCents: refundAmount,
            paymongoPaymentId: checkoutSession.paymongoPaymentId,
            reason: "requested_by_customer",
            notes: "10-hour refund policy approved by superadmin",
          });
          paymongoRefundId = refundRes.refundId;
        }
      } catch (error) {
        console.warn(
          "PayMongo refund call encountered an issue (will still approve in database):",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Update status in system database and downgrade subscription
    await ctx.runMutation(api.superadmin.tickets.updateStatus, {
      token: args.token,
      ticketId: args.ticketId,
      status: "approved",
    });

    return {
      success: true,
      paymongoRefundId,
      message: paymongoRefundId
        ? `Refund processed with PayMongo (${paymongoRefundId}) and subscription downgraded to Free.`
        : "Refund approved and subscription downgraded to Free.",
    };
  },
});

export const getSupportMetrics = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);

    const tickets = await ctx.db.query("supportTickets").collect();

    let pendingRefunds = 0;
    let openTickets = 0;
    let inReview = 0;
    let resolvedTotal = 0;
    let unreadChats = 0;

    for (const t of tickets) {
      if (t.ticketType === "refund" && t.status === "pending") pendingRefunds++;
      if (t.status === "pending" || t.status === "in_review") openTickets++;
      if (t.status === "in_review") inReview++;
      if (t.status === "resolved" || t.status === "approved" || t.status === "rejected") {
        resolvedTotal++;
      }
      if (t.unreadAdminCount > 0) unreadChats++;
    }

    return {
      total: tickets.length,
      pendingRefunds,
      openTickets,
      inReview,
      resolvedTotal,
      unreadChats,
    };
  },
});
