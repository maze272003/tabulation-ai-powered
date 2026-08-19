import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, grantPaidPlan, setupTest } from "./setup";

async function createSuperadminSession(t: ReturnType<typeof setupTest>): Promise<string> {
  const token = "test_superadmin_token_" + Math.random().toString(36).slice(2);
  await t.run(async (ctx) => {
    await ctx.db.insert("superadminSessions", {
      token,
      label: "superadmin",
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      lastSeenAt: Date.now(),
    });
  });
  return token;
}

describe("Customer Support & Refund Ticket System", () => {
  it("validates 10-hour refund eligibility and creates refund ticket with notifications and chat thread", async () => {
    const t = setupTest();
    const { orgSlug } = await grantPaidPlan(t, "Starter");

    // 1. Check eligibility within 10 hours
    const eligibility = await t
      .withIdentity(aliceIdentity)
      .query(api.support.tickets.getRefundEligibility, { orgSlug });

    expect(eligibility.hasPaidSubscription).toBe(true);
    expect(eligibility.planName).toBe("Starter");
    expect(eligibility.isEligible).toBe(true);
    expect(eligibility.remainingMs).toBeGreaterThan(0);
    expect(eligibility.existingTicket).toBeNull();

    // 2. Submit refund ticket
    const refundResult = await t
      .withIdentity(aliceIdentity)
      .mutation(api.support.tickets.createRefundTicket, {
        orgSlug,
        reason: "Accidentally upgraded to Starter tier",
        details: "Need a refund to re-subscribe next month.",
      });

    expect(refundResult.ticketId).toBeDefined();

    // 3. Verify ticket details
    const ticket = await t
      .withIdentity(aliceIdentity)
      .query(api.support.tickets.getTicket, {
        orgSlug,
        ticketId: refundResult.ticketId,
      });

    expect(ticket.ticketType).toBe("refund");
    expect(ticket.status).toBe("pending");
    expect(ticket.refundAmountCents).toBe(49900);
    expect(ticket.creatorEmail).toBe(aliceIdentity.email);

    // 4. Verify initial message in chat thread
    const messages = await t
      .withIdentity(aliceIdentity)
      .query(api.support.tickets.getMessages, {
        orgSlug,
        ticketId: refundResult.ticketId,
      });

    expect(messages.length).toBe(1);
    expect(messages[0].senderRole).toBe("customer");
    expect(messages[0].body).toContain("Accidentally upgraded to Starter tier");

    // 5. Verify in-app notification was generated for customer
    const unreadCount = await t
      .withIdentity(aliceIdentity)
      .query(api.support.notifications.getUnreadCount, {});

    expect(unreadCount).toBeGreaterThanOrEqual(1);

    const notifications = await t
      .withIdentity(aliceIdentity)
      .query(api.support.notifications.listMyNotifications, {});

    expect(notifications.some((n) => n.type === "ticket_created")).toBe(true);

    // 6. Duplicate refund attempt should be blocked
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.support.tickets.createRefundTicket, {
        orgSlug,
        reason: "Duplicate attempt",
      }),
    ).rejects.toThrow("already been submitted");
  });

  it("handles general support ticket creation, live customer chat, and mark-as-read", async () => {
    const t = setupTest();
    const { orgSlug } = await grantPaidPlan(t, "Starter");

    // 1. Create general support ticket
    const ticketResult = await t
      .withIdentity(aliceIdentity)
      .mutation(api.support.tickets.createSupportTicket, {
        orgSlug,
        subject: "How to export results to CSV?",
        description: "I need assistance exporting the tabulated round results.",
        ticketType: "general_support",
        priority: "normal",
      });

    expect(ticketResult.ticketId).toBeDefined();

    // 2. Customer sends a followup chat message
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.support.tickets.sendMessage, {
        orgSlug,
        ticketId: ticketResult.ticketId,
        body: "Also, can judges view exported scorecards?",
      });

    // 3. Verify messages
    const messages = await t
      .withIdentity(aliceIdentity)
      .query(api.support.tickets.getMessages, {
        orgSlug,
        ticketId: ticketResult.ticketId,
      });

    expect(messages.length).toBe(2);
    expect(messages[1].body).toBe("Also, can judges view exported scorecards?");

    // 4. Mark messages as read
    const markRes = await t
      .withIdentity(aliceIdentity)
      .mutation(api.support.tickets.markMessagesRead, {
        orgSlug,
        ticketId: ticketResult.ticketId,
      });

    expect(markRes.success).toBe(true);
  });

  it("superadmin can list tickets, reply in real time, and approve refund with auto-downgrade", async () => {
    const t = setupTest();
    const { orgSlug } = await grantPaidPlan(t, "Starter");

    // 1. Customer creates refund ticket
    const refundRes = await t
      .withIdentity(aliceIdentity)
      .mutation(api.support.tickets.createRefundTicket, {
        orgSlug,
        reason: "Accidental purchase within 10 hours",
      });

    // 2. Superadmin session
    const token = await createSuperadminSession(t);

    // 3. Superadmin lists tickets
    const allTickets = await t.query(api.superadmin.tickets.listAll, {
      token,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(allTickets.page.length).toBeGreaterThanOrEqual(1);
    const targetTicket = allTickets.page.find((tk) => tk._id === refundRes.ticketId);
    expect(targetTicket).toBeDefined();

    // 4. Superadmin replies in real time
    await t.mutation(api.superadmin.tickets.sendAdminMessage, {
      token,
      ticketId: refundRes.ticketId,
      body: "Hello! We have reviewed your 10-hour refund request and approved it.",
    });

    // Customer receives ticket_reply notification
    const customerNotifications = await t
      .withIdentity(aliceIdentity)
      .query(api.support.notifications.listMyNotifications, {});

    expect(customerNotifications.some((n) => n.type === "ticket_reply")).toBe(true);

    // 5. Superadmin approves refund
    const approveRes = await t.mutation(api.superadmin.tickets.updateStatus, {
      token,
      ticketId: refundRes.ticketId,
      status: "approved",
    });

    expect(approveRes.success).toBe(true);

    // 6. Verify subscription was downgraded to Free and payment marked refunded
    const subAfter = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug });

    const plan = await t.run(async (ctx) => {
      return await ctx.db.get(subAfter.subscription.planId);
    });

    expect(plan?.name).toBe("Free");

    // 7. Verify ticket status is approved
    const ticketAfter = await t
      .withIdentity(aliceIdentity)
      .query(api.support.tickets.getTicket, {
        orgSlug,
        ticketId: refundRes.ticketId,
      });

    expect(ticketAfter.status).toBe("approved");
    expect(ticketAfter.paymentStatus).toBe("refunded");
  });

  it("superadmin can reject refund request with custom reason and customer is notified", async () => {
    const t = setupTest();
    const { orgSlug } = await grantPaidPlan(t, "Starter");

    const refundRes = await t
      .withIdentity(aliceIdentity)
      .mutation(api.support.tickets.createRefundTicket, {
        orgSlug,
        reason: "Test refund request",
      });

    const token = await createSuperadminSession(t);

    await t.mutation(api.superadmin.tickets.updateStatus, {
      token,
      ticketId: refundRes.ticketId,
      status: "rejected",
      decisionReason: "Event was already published with 50+ contestants.",
    });

    const ticketAfter = await t
      .withIdentity(aliceIdentity)
      .query(api.support.tickets.getTicket, {
        orgSlug,
        ticketId: refundRes.ticketId,
      });

    expect(ticketAfter.status).toBe("rejected");
    expect(ticketAfter.decisionReason).toBe("Event was already published with 50+ contestants.");

    const notifications = await t
      .withIdentity(aliceIdentity)
      .query(api.support.notifications.listMyNotifications, {});

    expect(notifications.some((n) => n.type === "refund_rejected")).toBe(true);
  });

  it("enforces multi-tenant authorization so non-members cannot read tickets", async () => {
    const t = setupTest();
    const { orgSlug } = await grantPaidPlan(t, "Starter");

    const ticketRes = await t
      .withIdentity(aliceIdentity)
      .mutation(api.support.tickets.createSupportTicket, {
        orgSlug,
        subject: "Private question",
        description: "Confidential inquiry about scoring calculations.",
        ticketType: "general_support",
      });

    // Bob is not a member of Alice's organization
    await expect(
      t.withIdentity(bobIdentity).query(api.support.tickets.getTicket, {
        orgSlug,
        ticketId: ticketRes.ticketId,
      }),
    ).rejects.toThrow();
  });
});
