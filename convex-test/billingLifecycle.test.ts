import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, createOrgWithPendingCheckout, setupTest } from "./setup";

const DAY = 24 * 60 * 60 * 1000;

describe("billing lifecycle", () => {
  it("expires stale pending checkouts after 24h", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    const createdAt = Date.now();
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, {});
    // Within 24h the checkout is still pending.
    let active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: ctx.orgSlug });
    expect(active).not.toBeNull();

    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: createdAt + 25 * DAY });
    active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: ctx.orgSlug });
    expect(active).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("expired");
  });

  it("moves active → past_due at period end, then expired + Free after grace", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_life_1",
      eventType: "checkout_session.payment.paid",
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paidAmount: ctx.amountCents,
    });
    const initialSub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    const periodEnd = initialSub?.subscription.currentPeriodEndAt ?? 0;
    expect(periodEnd).toBeGreaterThan(0);

    // Just after period end (30 days): past_due.
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: periodEnd + 1 * DAY });
    let sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("past_due");

    // Within grace (5 days into 7-day grace): still past_due.
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: periodEnd + 5 * DAY });
    sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("past_due");

    // After 7-day grace (8 days past period end): expired and downgraded to Free.
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: periodEnd + 8 * DAY });
    sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("expired");
    expect(sub?.plan?.name).toBe("Free");
  });

  it("never touches active subscriptions with no period (Free orgs)", async () => {
    const t = setupTest();
    await createOrgWithPendingCheckout(t);
    // The org above has a pending payment, not an applied one — create a pure Free org.
    // Use a second org via the public API.
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, {
      name: "Free Org",
      slug: "free-org",
    });
    const before = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: "free-org" });
    expect(before?.subscription.status).toBe("active");
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: Date.now() + 365 * DAY });
    const after = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: "free-org" });
    expect(after?.subscription.status).toBe("active");
    expect(after?.plan?.name).toBe("Free");
  });
});
