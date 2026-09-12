import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import {
  addOrgMemberWithoutDocumentsManage,
  aliceIdentity,
  bobIdentity,
  createOrgAndEvent,
  grantPaidPlan,
  seedAndProvision,
  setupTest,
} from "./setup";

describe("billing refund tickets (10-hour policy)", () => {
  it("shows eligible for refund within 10 hours of payment", async () => {
    const t = setupTest();
    const { orgSlug } = await grantPaidPlan(t, "Starter");

    const eligibility = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.refunds.getEligibility, { orgSlug });

    expect(eligibility.hasPaidSubscription).toBe(true);
    expect(eligibility.planName).toBe("Starter");
    expect(eligibility.isEligible).toBe(true);
    expect(eligibility.remainingMs).toBeGreaterThan(0);
    expect(eligibility.existingTicket).toBeNull();
  });

  it("submits a refund ticket to CRM within 10 hours successfully", async () => {
    const t = setupTest();
    const { orgSlug } = await grantPaidPlan(t, "Starter");

    const result = await t
      .withIdentity(aliceIdentity)
      .mutation(api.billing.refunds.submitRefundTicket, {
        orgSlug,
        reason: "Accidentally chose Starter instead of Pro",
        details: "Need a refund to repurchase Pro plan.",
      });

    expect(result.ticketId).toBeDefined();

    const eligibilityAfter = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.refunds.getEligibility, { orgSlug });

    expect(eligibilityAfter.isEligible).toBe(false);
    expect(eligibilityAfter.existingTicket?.status).toBe("pending");
    expect(eligibilityAfter.existingTicket?.reason).toBe("Accidentally chose Starter instead of Pro");
  });

  it("rejects duplicate refund ticket submissions", async () => {
    const t = setupTest();
    const { orgSlug } = await grantPaidPlan(t, "Starter");

    await t
      .withIdentity(aliceIdentity)
      .mutation(api.billing.refunds.submitRefundTicket, {
        orgSlug,
        reason: "First request",
      });

    await expect(
      t.withIdentity(aliceIdentity).mutation(api.billing.refunds.submitRefundTicket, {
        orgSlug,
        reason: "Second duplicate request",
      }),
    ).rejects.toThrow("already been submitted");
  });

  it("lets the owner refund against a payment shared across their orgs", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await grantPaidPlan(t, "Starter");
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: "beta", slug: "beta" });
    const eligibility = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.refunds.getEligibility, { orgSlug: "beta" });
    expect(eligibility.hasPaidSubscription).toBe(true);
    expect(eligibility.isEligible).toBe(true);
    expect(eligibility.planName).toBe("Starter");
  });

  it("rejects refund submission from a non-owner member", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await grantPaidPlan(t, "Starter");
    await seedAndProvision(t, bobIdentity);
    await addOrgMemberWithoutDocumentsManage(t, "acme", bobIdentity);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.billing.refunds.submitRefundTicket, {
        orgSlug: "acme",
        reason: "Changed my mind",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
