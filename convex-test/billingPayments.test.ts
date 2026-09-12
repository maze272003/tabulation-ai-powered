import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, seedAndProvision, setupTest } from "./setup";

describe("billing payments queries", () => {
  it("returns an empty history and no active checkout for a new user", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForUser, {});
    expect(history).toEqual([]);
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, {});
    expect(active).toBeNull();
  });

  it("rejects users without a subscription with FORBIDDEN", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await seedAndProvision(t, bobIdentity);
    await expect(
      t.withIdentity(bobIdentity).query(api.billing.payments.getActiveCheckout, {}),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
