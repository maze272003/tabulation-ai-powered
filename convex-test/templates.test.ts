import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

async function templateIdByName(t: ReturnType<typeof setupTest>, name: string) {
  const list = await t.withIdentity(aliceIdentity).query(api.templates.list, { orgSlug: "acme" });
  const tpl = list.find((x: { name: string }) => x.name === name);
  if (!tpl) throw new Error(`template ${name} not found`);
  return tpl._id;
}

describe("templates", () => {
  it("instantiates the Pageant preset with its rounds and criteria", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "holder" });
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
    const tplId = await templateIdByName(t, "Pageant");
    const slug = await t.withIdentity(aliceIdentity).mutation(api.events.createFromTemplate, {
      orgSlug: "acme", name: "Miss Acme", templateId: tplId,
    });
    expect(slug).toBe("miss-acme");
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "miss-acme" });
    expect(rounds.length).toBe(1);
    expect(rounds[0].name).toBe("Preliminary");
    expect(rounds[0].criteria.map((c) => c.name)).toEqual(["Beauty", "Personality", "Talent", "Q&A"]);
    expect(rounds[0].criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it("save-as-template round-trips a draft event config", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "Solo" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId: rounds[0]._id, name: "Tech", weight: 100, minScore: 0, maxScore: 10, decimalPrecision: 0,
    });
    await t.withIdentity(aliceIdentity).mutation(api.templates.createFromEvent, { orgSlug: "acme", eventSlug: "gala", name: "My Solo Comp" });
    const tplId = await templateIdByName(t, "My Solo Comp");
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
    const slug = await t.withIdentity(aliceIdentity).mutation(api.events.createFromTemplate, {
      orgSlug: "acme", name: "Clone", templateId: tplId,
    });
    const cloneRounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "clone" });
    expect(cloneRounds[0].name).toBe("Solo");
    expect(cloneRounds[0].criteria[0].name).toBe("Tech");
  });

  it("refuses to delete a system template", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const tplId = await templateIdByName(t, "Quiz");
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.templates.remove, { orgSlug: "acme", templateId: tplId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
