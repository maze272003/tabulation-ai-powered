import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, seedAndProvision, setupTest } from "./setup";

async function codeOf(t: ReturnType<typeof setupTest>, eventSlug: string): Promise<string> {
  const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug });
  return ev!.eventCode;
}

describe("event codes", () => {
  it("create assigns a unique 8-char code from the unambiguous alphabet", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    expect(await codeOf(t, "gala")).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("two events get different codes", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: "acme", slug: "acme" });
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "One", slug: "one" });
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "Two", slug: "two" });
    expect(await codeOf(t, "one")).not.toBe(await codeOf(t, "two"));
  });

  it("regenerateCode replaces the code; blocked once finalized", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const before = await codeOf(t, "gala");
    const next = await t.withIdentity(aliceIdentity).mutation(api.events.regenerateCode, { orgSlug: "acme", eventSlug: "gala" });
    expect(next).not.toBe(before);
    await t.run(async (q) => {
      const events = await q.db.query("events").collect();
      await q.db.patch(events[0]._id, { status: "finalized" });
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.regenerateCode, { orgSlug: "acme", eventSlug: "gala" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
