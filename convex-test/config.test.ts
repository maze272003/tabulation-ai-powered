import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

describe("categories and rounds", () => {
  it("adds and lists categories in order", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.categories.add, { orgSlug: "acme", eventSlug: "gala", name: "Juniors" });
    const cats = await t.withIdentity(aliceIdentity).query(api.categories.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(cats.map((c) => c.name)).toEqual(["Open", "Juniors"]);
  });

  it("adds rounds and lists them with criteria joined", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "Preliminary" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "Final" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(rounds.map((r) => r.name)).toEqual(["Preliminary", "Final"]);
    expect(Array.isArray(rounds[0].criteria)).toBe(true);
  });

  it("unknown event slug yields NOT_FOUND", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.categories.add, { orgSlug: "acme", eventSlug: "nope", name: "X" }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
