import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, seedAndProvision, setupTest } from "./setup";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubCheckoutSuccess(suffix = "1") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: `cs_test_${suffix}`,
            attributes: { checkout_url: `https://checkout.paymongo.com/test/${suffix}` },
          },
        }),
        { status: 200 },
      ),
    ),
  );
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_key");
}

describe("billing checkout", () => {
  it("creates a pending payment with a checkout URL", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    const url = await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { orgSlug: "acme", planName: "Starter" });
    expect(url).toBe("https://checkout.paymongo.com/test/1");
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).not.toBeNull();
    expect(active?.planName).toBe("Starter");
    expect(active?.amountCents).toBe(49900);
    expect(active?.billingInterval).toBe("monthly");
  });

  it("rejects the Free plan and unknown plans", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Free",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Platinum",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("enforces the one-live-checkout rule with CONFLICT", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { orgSlug: "acme", planName: "Starter" });
    stubCheckoutSuccess("2");
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Pro",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("requires subscription.manage permission", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await seedAndProvision(t, bobIdentity);
    stubCheckoutSuccess();
    await expect(
      t.withIdentity(bobIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("marks the payment failed when PayMongo rejects the request", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ errors: [{ detail: "Invalid amount" }] }),
            { status: 422 },
          ),
      ),
    );
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_key");
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "PAYMENT_PROVIDER" } });
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: "acme" });
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("failed");
    expect(history[0].failureReason).toContain("Invalid amount");
  });

  it("cancels an active checkout and CONFLICTs when none is active", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { orgSlug: "acme", planName: "Starter" });
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.billing.checkout.cancelCheckout, { orgSlug: "acme" });
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).toBeNull();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.billing.checkout.cancelCheckout, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
