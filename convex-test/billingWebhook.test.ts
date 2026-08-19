import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, createOrgWithPendingCheckout, setupTest } from "./setup";

const PAID_EVENT = "checkout_session.payment.paid";

function paidEvent(payment: { checkoutSessionId: string; amountCents: number }, eventId: string) {
  return {
    eventId,
    eventType: PAID_EVENT,
    checkoutSessionId: payment.checkoutSessionId,
    referenceNumber: null,
    paidAmount: payment.amountCents,
  };
}

describe("paymongo webhook processing", () => {
  it("applies a paid event: payment paid, subscription active with a 30-day period", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      ...paidEvent(ctx, "evt_1"),
    });
    expect(outcome).toBe("applied");
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("active");
    expect(sub?.subscription.planId).not.toBeNull();
    expect(sub?.subscription.currentPeriodEndAt).toBeGreaterThan(Date.now());
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("paid");
    expect(history[0].periodStartAt).not.toBeNull();
    expect(history[0].periodEndAt).not.toBeNull();
  });

  it("is idempotent under duplicate delivery (no double period extension)", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(ctx, "evt_dup"));
    const first = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      ...paidEvent(ctx, "evt_dup"),
    });
    expect(outcome).toBe("duplicate");
    const second = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(second?.subscription.currentPeriodEndAt).toBe(first?.subscription.currentPeriodEndAt);
  });

  it("flags a paid event whose amount does not match the payment row", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_amt",
      eventType: PAID_EVENT,
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paidAmount: ctx.amountCents - 1,
    });
    expect(outcome).toBe("flagged");
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.currentPeriodEndAt).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("flagged");
  });

  it("ignores replays against non-pending payments and unknown sessions", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(ctx, "evt_r1"));
    const replay = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      ...paidEvent(ctx, "evt_r2"),
    });
    expect(replay).toBe("ignored");
    const unknown = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_r3",
      eventType: PAID_EVENT,
      checkoutSessionId: "cs_test_unknown",
      referenceNumber: null,
      paidAmount: 49900,
    });
    expect(unknown).toBe("ignored");
  });

  it("marks payments failed on failure events and records unknown types", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_f1",
      eventType: "checkout_session.payment.failed",
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paidAmount: null,
    });
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("failed");
    const unknown = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_u1",
      eventType: "source.chargeable",
      checkoutSessionId: null,
      referenceNumber: null,
      paidAmount: null,
    });
    expect(unknown).toBe("ignored");
  });

  it("stacks a second paid period on top of the active one", async () => {
    const t = setupTest();
    const first = await createOrgWithPendingCheckout(t, { sessionSuffix: "1" });
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(first, "evt_s1"));
    const sub1 = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: first.orgSlug });
    // Renewal requires the first checkout to be settled (paid), so create another.
    const second = await createOrgWithPendingCheckout(t, {
      planName: "Pro",
      sessionSuffix: "2",
    });
    expect(second.orgSlug).toBe("acme");
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(second, "evt_s2"));
    const sub2 = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: second.orgSlug });
    expect(sub2?.subscription.currentPeriodEndAt).toBeGreaterThan(
      sub1?.subscription.currentPeriodEndAt ?? 0,
    );
  });

  it("handles payment.paid event type successfully", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t, { sessionSuffix: "pay_paid" });
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_payment_paid",
      eventType: "payment.paid",
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paymentId: ctx.paymentId,
      paidAmount: ctx.amountCents,
    });
    expect(outcome).toBe("applied");
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("active");
  });

  it("syncs checkout status and activates subscription when PayMongo confirms paid", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t, { sessionSuffix: "sync_paid" });

    // Mock PayMongo GET /checkout_sessions/:id returning paid
    const suffix = "sync_paid";
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            data: {
              id: ctx.checkoutSessionId,
              attributes: {
                status: "paid",
                reference_number: `ref_${suffix}`,
                payments: [{ attributes: { amount: ctx.amountCents, status: "paid" } }],
                metadata: { paymentId: ctx.paymentId },
              },
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubEnv("PAYMONGO_SECRET_KEY", `sk_test_${suffix}`);

    try {
      const res = await t
        .withIdentity(aliceIdentity)
        .action(api.billing.checkout.syncCheckoutStatus, {
          orgSlug: ctx.orgSlug,
        });
      expect(res.status).toBe("activated");
      expect(res.planName).toBe("Starter");

      const sub = await t
        .withIdentity(aliceIdentity)
        .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
      expect(sub?.subscription.status).toBe("active");
      expect(sub?.subscription.currentPeriodEndAt).toBeGreaterThan(Date.now());
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
