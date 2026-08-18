import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, grantPaidPlan, setupTest } from "./setup";

const VALID_DRAFT = {
  name: "AI Pageant",
  description: "Generated design",
  configSnapshot: {
    decimalPrecision: 2,
    resultVisibility: "private",
    rounds: [
      {
        name: "Preliminary",
        order: 0,
        qualifiesToNextRound: false,
        criteria: [
          { name: "Beauty", order: 0, weight: 50, minScore: 0, maxScore: 100, decimalPrecision: 2 },
          { name: "Q&A", order: 1, weight: 50, minScore: 0, maxScore: 100, decimalPrecision: 2 },
        ],
      },
    ],
  },
};

describe("templates.saveGenerated", () => {
  it("persists a re-validated draft as an org template and audits it", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const result = await t.withIdentity(aliceIdentity).mutation(api.templates.saveGenerated, {
      orgSlug: "acme",
      eventName: "Spring Pageant",
      draft: VALID_DRAFT,
    });
    expect(result.templateId).toBeTruthy();
    const templates = await t.withIdentity(aliceIdentity).query(api.templates.list, { orgSlug: "acme" });
    const saved = templates.find((tpl) => tpl._id === result.templateId)!;
    expect(saved.name).toBe("AI Pageant");
    expect(saved.isSystem).toBe(false);
  });

  it("rejects an invalid draft (server-side re-validation)", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const bad = structuredClone(VALID_DRAFT);
    (bad.configSnapshot.rounds[0].criteria[0] as { weight: number }).weight = 500;
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.templates.saveGenerated, {
        orgSlug: "acme", eventName: "Spring Pageant", draft: bad,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("round-trips: saved template creates an event via createFromTemplate", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    // The Free plan allows a single event ("gala" already exists), so the
    // instantiated event needs plan headroom.
    await grantPaidPlan(t, "Pro");
    const { templateId } = await t.withIdentity(aliceIdentity).mutation(api.templates.saveGenerated, {
      orgSlug: "acme", eventName: "Spring Pageant", draft: VALID_DRAFT,
    });
    const slug = await t.withIdentity(aliceIdentity).mutation(api.events.createFromTemplate, {
      orgSlug: "acme", name: "Spring Pageant", templateId,
    });
    expect(slug).toBe("spring-pageant");
  });
});

describe("wizard quota", () => {
  it("blocks after the daily limit via consumeWizardQuota", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    for (let i = 0; i < 20; i++) {
      await t.withIdentity(aliceIdentity).mutation(internal.templates.consumeWizardQuota, { orgSlug: "acme" });
    }
    await expect(
      t.withIdentity(aliceIdentity).mutation(internal.templates.consumeWizardQuota, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });
});
