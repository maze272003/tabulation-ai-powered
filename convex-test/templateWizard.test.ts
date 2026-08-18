import { describe, expect, it } from "vitest";
import { buildTemplateDraft, validateTemplateDraft } from "../convex/lib/templateWizard";

const VALID = {
  name: "City Pageant",
  description: "Three-round city pageant",
  configSnapshot: {
    decimalPrecision: 2,
    resultVisibility: "private",
    rounds: [
      {
        name: "Preliminary",
        qualifiesToNextRound: true,
        criteria: [
          { name: "Beauty", weight: 30, minScore: 0, maxScore: 100, decimalPrecision: 2 },
          { name: "Q&A", weight: 70, minScore: 0, maxScore: 100, decimalPrecision: 2 },
        ],
      },
    ],
  },
};

describe("validateTemplateDraft", () => {
  it("accepts and normalizes a valid draft (orders rewritten to 0-based)", () => {
    const result = validateTemplateDraft({
      ...VALID,
      configSnapshot: {
        ...VALID.configSnapshot,
        rounds: [{ ...VALID.configSnapshot.rounds[0], order: 7 }],
      },
    });
    expect("error" in result).toBe(false);
    if ("draft" in result) {
      expect(result.draft.configSnapshot.rounds[0].order).toBe(0);
      expect(result.draft.configSnapshot.rounds[0].criteria[0].order).toBe(0);
    }
  });

  it("identifies explicitly rejected responses", () => {
    const result = validateTemplateDraft({
      rejected: true,
      reason: "Not related to competitions",
    });
    expect(result).toEqual({
      rejected: true,
      reason: "Not related to competitions",
    });
  });

  it("rejects out-of-range weights with a specific error", () => {
    const bad = structuredClone(VALID);
    (bad.configSnapshot.rounds[0].criteria[0] as { weight: number }).weight = 0;
    const result = validateTemplateDraft(bad);
    expect("error" in result).toBe(true);
  });

  it("rejects missing rounds and bad visibility", () => {
    expect("error" in validateTemplateDraft({ ...VALID, configSnapshot: { ...VALID.configSnapshot, rounds: [] } })).toBe(true);
    const bad = structuredClone(VALID);
    (bad.configSnapshot as { resultVisibility: string }).resultVisibility = "everyone";
    expect("error" in validateTemplateDraft(bad)).toBe(true);
  });

  it("rejects non-objects and min > max", () => {
    expect("error" in validateTemplateDraft("nope")).toBe(true);
    const bad = structuredClone(VALID);
    (bad.configSnapshot.rounds[0].criteria[0] as { minScore: number }).minScore = 101;
    expect("error" in validateTemplateDraft(bad)).toBe(true);
  });

  it("handles empty categories, string numbers, long description truncation, and missing allowOverride", () => {
    const raw = {
      name: "A".repeat(100),
      description: "B".repeat(400),
      configSnapshot: {
        decimalPrecision: "2",
        resultVisibility: "organization",
        categories: [],
        rounds: [
          {
            name: "Round 1",
            qualifiesToNextRound: true,
            weight: "100",
            advancement: { mode: "top_count", count: "5" },
            criteria: [
              { name: "Criterion 1", weight: "100", minScore: "0", maxScore: "100", decimalPrecision: "2" },
            ],
          },
        ],
      },
    };
    const result = validateTemplateDraft(raw);
    expect("error" in result).toBe(false);
    if ("draft" in result) {
      expect(result.draft.name.length).toBe(80);
      expect(result.draft.description.length).toBe(300);
      expect(result.draft.configSnapshot.categories).toBeUndefined();
      expect(result.draft.configSnapshot.decimalPrecision).toBe(2);
      expect(result.draft.configSnapshot.rounds[0].weight).toBe(100);
      expect(result.draft.configSnapshot.rounds[0].advancement?.allowOverride).toBe(true);
      expect(result.draft.configSnapshot.rounds[0].criteria[0].weight).toBe(100);
    }
  });
});

describe("buildTemplateDraft", () => {
  it("returns the first valid draft without retrying", async () => {
    let calls = 0;
    const draft = await buildTemplateDraft("a pageant", async () => {
      calls++;
      return VALID;
    });
    expect(calls).toBe(1);
    expect(draft && "draft" in draft ? draft.draft.name : null).toBe("City Pageant");
  });

  it("retries once with the validation error, then succeeds", async () => {
    const prompts: string[] = [];
    let attempt = 0;
    const draft = await buildTemplateDraft("a pageant", async (prompt) => {
      prompts.push(prompt);
      attempt++;
      return attempt === 1 ? { nonsense: true } : VALID;
    });
    expect(draft && "draft" in draft ? draft.draft.name : null).toBe("City Pageant");
    expect(prompts.length).toBe(2);
    expect(prompts[1]).toContain("invalid");
  });

  it("returns rejected response immediately without retrying off-topic prompts", async () => {
    let calls = 0;
    const result = await buildTemplateDraft("tell me a joke", async () => {
      calls++;
      return {
        rejected: true,
        reason: "This request is not related to a judged live event or competition format.",
      };
    });
    expect(calls).toBe(1);
    expect(result).toEqual({
      rejected: true,
      reason: "This request is not related to a judged live event or competition format.",
    });
  });

  it("gives up after two invalid attempts", async () => {
    let calls = 0;
    const draft = await buildTemplateDraft("a pageant", async () => {
      calls++;
      return { still: "wrong" };
    });
    expect(calls).toBe(2);
    expect(draft).toBeNull();
  });
});

