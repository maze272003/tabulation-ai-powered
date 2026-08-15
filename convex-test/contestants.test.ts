import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

describe("contestants", () => {
  it("adds contestants with unique numbers and lists them", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Jo", number: 2 });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Dup", number: 1 }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const list = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(list.length).toBe(2);
  });

  it("enforces maxContestants (Free = 20)", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    for (let i = 1; i <= 20; i++) {
      await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: `C${i}`, number: i });
    }
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Over", number: 21 }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });

  it("updates status and removes with usage decrement round-trip", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
    const list = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
    const id = list[0]._id;
    await t.withIdentity(aliceIdentity).mutation(api.contestants.update, { orgSlug: "acme", eventSlug: "gala", contestantId: id, status: "scratched" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.remove, { orgSlug: "acme", eventSlug: "gala", contestantId: id });
    const after = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(after.length).toBe(0);
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Back", number: 1 });
  });
});
