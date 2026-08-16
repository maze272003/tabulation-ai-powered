import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

describe("phase3 schema defaults", () => {
  it("new events get default scoring rules and elimination", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.scoringRules).toEqual({ dropHighLow: false });
    expect(ev?.eliminationEnabled).toBe(true);
  });

  it("first round defaults weight 100/open, second 0", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R1" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R2" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(rounds.map((r) => [r.name, r.weight, r.status, r.advancement.mode])).toEqual([
      ["R1", 100, "open", "none"],
      ["R2", 0, "open", "none"],
    ]);
  });

  it("round weight and advancement update and validate", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    const roundId = rounds[0]._id;
    await t.withIdentity(aliceIdentity).mutation(api.rounds.update, {
      orgSlug: "acme", eventSlug: "gala", roundId, weight: 60,
      advancement: { mode: "top_count", count: 5, allowOverride: true },
    });
    const after = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(after[0].weight).toBe(60);
    expect(after[0].advancement).toEqual({ mode: "top_count", count: 5, allowOverride: true });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.rounds.update, {
        orgSlug: "acme", eventSlug: "gala", roundId, advancement: { mode: "top_count", allowOverride: true },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.rounds.update, { orgSlug: "acme", eventSlug: "gala", roundId, weight: 101 }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("events.update handles scoring rules and elimination", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.events.update, {
      orgSlug: "acme", eventSlug: "gala", scoringRules: { dropHighLow: true }, eliminationEnabled: false,
    });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.scoringRules).toEqual({ dropHighLow: true });
    expect(ev?.eliminationEnabled).toBe(false);
  });

  it("save-as-template round-trips phase 3 fields", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.events.update, {
      orgSlug: "acme", eventSlug: "gala", scoringRules: { dropHighLow: true }, eliminationEnabled: false,
    });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
      orgSlug: "acme", eventSlug: "gala", name: "R", weight: 100,
      advancement: { mode: "top_percent", percent: 50, allowOverride: false },
    });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId: rounds[0]._id, name: "C", weight: 100, minScore: 0, maxScore: 10, decimalPrecision: 0,
    });
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
    await t.withIdentity(aliceIdentity).mutation(api.templates.createFromEvent, { orgSlug: "acme", eventSlug: "gala", name: "T3" });
    const tpls = await t.withIdentity(aliceIdentity).query(api.templates.list, { orgSlug: "acme" });
    const tpl = tpls.find((x) => x.name === "T3")!;
    expect(tpl.configSnapshot.eliminationEnabled).toBe(false);
    expect(tpl.configSnapshot.scoringRules).toEqual({ dropHighLow: true });
    expect(tpl.configSnapshot.rounds[0].weight).toBe(100);
    await t.withIdentity(aliceIdentity).mutation(api.events.createFromTemplate, { orgSlug: "acme", name: "G2", slug: "g2", templateId: tpl._id });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "g2" });
    expect(ev?.eliminationEnabled).toBe(false);
    expect(ev?.scoringRules).toEqual({ dropHighLow: true });
    const r2 = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "g2" });
    expect(r2[0].weight).toBe(100);
    expect(r2[0].advancement).toEqual({ mode: "top_percent", percent: 50, allowOverride: false });
  });
});
