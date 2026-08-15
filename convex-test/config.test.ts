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

describe("criteria", () => {
  it("adds criteria and validates ranges and weight bounds", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    const roundId = rounds[0]._id;
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId, name: "Beauty", weight: 50, minScore: 0, maxScore: 100, decimalPrecision: 0,
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
        orgSlug: "acme", eventSlug: "gala", roundId, name: "Bad", weight: 50, minScore: 100, maxScore: 0, decimalPrecision: 0,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
        orgSlug: "acme", eventSlug: "gala", roundId, name: "BadWeight", weight: 0, minScore: 0, maxScore: 10, decimalPrecision: 0,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("refuses criteria for a round belonging to a different event (IDOR)", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "one" });
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "Two", slug: "two" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "one", name: "R1" });
    const roundsOne = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "one" });
    const r1 = roundsOne.find((r) => r.name === "R1")!;
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
        orgSlug: "acme", eventSlug: "two", roundId: r1._id, name: "X", weight: 50, minScore: 0, maxScore: 10, decimalPrecision: 0,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
