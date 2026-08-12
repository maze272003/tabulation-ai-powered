import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, seedAndProvision, setupTest } from "./setup";

describe("reference reads & platform", () => {
  it("plans.list returns sorted plans", async () => {
    const t = setupTest();
    await t.mutation(api.seed.seedReferenceData, {});
    const plans = await t.query(api.plans.list, {});
    expect(plans.length).toBeGreaterThanOrEqual(3);
    expect(plans[0].sortOrder).toBeLessThan(plans[1].sortOrder);
  });

  it("roles.list returns organization-scope roles", async () => {
    const t = setupTest();
    await t.mutation(api.seed.seedReferenceData, {});
    const roles = await t.query(api.roles.list, {});
    expect(roles.find((r) => r.name === "Org Owner")).toBeTruthy();
    expect(roles.every((r) => r.scope === "organization")).toBe(true);
  });

  it("platform endpoints require platform owner", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await expect(t.withIdentity(aliceIdentity).query(api.platform.listAllOrgs, {}))
      .rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("platform owner can list all orgs after bootstrap", async () => {
    const t = setupTest();
    const aliceId = await seedAndProvision(t, aliceIdentity);
    // Bootstrap: directly promote Alice via internal mutation (simulating the manual Step 2).
    // setPlatformOwner requires an existing platform owner, so we patch the
    // profile directly via the mock mutation ctx.
    await t.run(async (q) => {
      await q.db.patch(aliceId, { platformRole: "platform_owner" });
    });
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: "Acme", slug: "acme" });
    const orgs = await t.withIdentity(aliceIdentity).query(api.platform.listAllOrgs, {});
    expect(orgs.length).toBeGreaterThanOrEqual(1);
  });
});
