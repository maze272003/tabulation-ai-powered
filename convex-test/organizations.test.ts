import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, seedAndProvision, setupTest } from "./setup";

describe("organizations", () => {
  it("creates an org with owner membership and free subscription", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    const slug = await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });
    expect(slug).toBe("acme");
    const mine = await t
      .withIdentity(aliceIdentity)
      .query(api.organizations.listMine, {});
    expect(mine.length).toBe(1);
    expect(mine[0].org.slug).toBe("acme");
    expect(mine[0].role.name).toBe("Org Owner");
  });

  it("rejects duplicate slug with CONFLICT", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });
    await expect(
      t
        .withIdentity(aliceIdentity)
        .mutation(api.organizations.create, { name: "Other", slug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("prevents cross-org access by slug by returning null", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });
    const result = await t
      .withIdentity(bobIdentity)
      .query(api.organizations.get, { orgSlug: "acme" });
    expect(result).toBeNull();
  });

  it("rejects unauthenticated create with UNAUTHENTICATED", async () => {
    const t = setupTest();
    await expect(
      t.mutation(api.organizations.create, { name: "Acme", slug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });
});
