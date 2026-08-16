import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, seedAndProvision, setupTest } from "./setup";

async function setupOrg(t: ReturnType<typeof setupTest>, orgSlug = "acme") {
  await seedAndProvision(t, aliceIdentity);
  await seedAndProvision(t, bobIdentity);
  await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: orgSlug, slug: orgSlug });
}

describe("events", () => {
  it("creates an event in draft with default settings", async () => {
    const t = setupTest();
    await setupOrg(t);
    const slug = await t.withIdentity(aliceIdentity).mutation(api.events.create, {
      orgSlug: "acme", name: "Miss Acme 2026", slug: "miss-acme",
    });
    expect(slug).toBe("miss-acme");
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "miss-acme" });
    expect(ev?.status).toBe("draft");
    expect(ev?.decimalPrecision).toBe(2);
  });

  it("rejects duplicate slug within the org with CONFLICT", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "A", slug: "dup" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "B", slug: "dup" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("refuses event.create for a Viewer member", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: "bob@example.com", roleName: "Viewer" });
    const pending = await t.withIdentity(bobIdentity).query(api.invitations.listForUser, {});
    await t.withIdentity(bobIdentity).mutation(api.invitations.accept, { token: pending[0].token });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.events.create, { orgSlug: "acme", name: "X", slug: "x" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("get returns null for a non-member (cross-org)", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "E", slug: "e" });
    const res = await t.withIdentity(bobIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "e" });
    expect(res).toBeNull();
  });

  it("enforces maxEvents limit (Free plan = 1)", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "One", slug: "one" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "Two", slug: "two" }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });

  it("updates name while draft", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "E", slug: "e" });
    await t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "e", name: "Renamed" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "e" });
    expect(ev?.name).toBe("Renamed");
  });

  it("rejects an all-whitespace name on update with VALIDATION_ERROR", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "E", slug: "e" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "e", name: "   " }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("eventAuthz: unknown slug NOT_FOUND; non-member get null", async () => {
    const t = setupTest();
    await setupOrg(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "ghost", name: "X" }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
