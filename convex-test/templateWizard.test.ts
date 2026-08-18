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
    if (!("error" in result)) {
      expect(result.draft.configSnapshot.rounds[0].order).toBe(0);
      expect(result.draft.configSnapshot.rounds[0].criteria[0].order).toBe(0);
    }
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
});

describe("buildTemplateDraft", () => {
  it("returns the first valid draft without retrying", async () => {
    let calls = 0;
    const draft = await buildTemplateDraft("a pageant", async () => {
      calls++;
      return VALID;
    });
    expect(calls).toBe(1);
    expect(draft?.name).toBe("City Pageant");
  });

  it("retries once with the validation error, then succeeds", async () => {
    const prompts: string[] = [];
    let attempt = 0;
    const draft = await buildTemplateDraft("a pageant", async (prompt) => {
      prompts.push(prompt);
      attempt++;
      return attempt === 1 ? { nonsense: true } : VALID;
    });
    expect(draft?.name).toBe("City Pageant");
    expect(prompts.length).toBe(2);
    expect(prompts[1]).toContain("invalid");
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
