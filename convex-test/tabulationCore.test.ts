import { describe, expect, it } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import {
  aggregateJudgeValues, computeContestantCriteria, computeRoundScore, roundToPrecision,
} from "../convex/lib/tabulation";

const j = (s: string) => s as Id<"judges">;
const c = (s: string) => s as Id<"criteria">;
const p = (s: string) => s as Id<"contestants">;

describe("aggregation", () => {
  it("averages all judges when dropping is on but only 2 judges", () => {
    const r = aggregateJudgeValues([{ judgeId: j("j1"), value: 1 }, { judgeId: j("j2"), value: 3 }], true);
    expect(r.avg).toBe(2);
    expect(r.dropped).toEqual([]);
  });

  it("drops one high and one low at 3 judges", () => {
    const r = aggregateJudgeValues(
      [{ judgeId: j("j1"), value: 5 }, { judgeId: j("j2"), value: 9 }, { judgeId: j("j3"), value: 7 }],
      true,
    );
    expect(r.avg).toBe(7);
    expect(r.dropped.map((d) => d.value).sort()).toEqual([5, 9]);
  });

  it("drops exactly one high and one low beyond 3 judges", () => {
    const r = aggregateJudgeValues(
      [{ judgeId: j("j1"), value: 1 }, { judgeId: j("j2"), value: 2 }, { judgeId: j("j3"), value: 8 }, { judgeId: j("j4"), value: 9 }],
      true,
    );
    expect(r.avg).toBe(5);
    expect(r.dropped.length).toBe(2);
  });

  it("no drop when disabled", () => {
    const r = aggregateJudgeValues(
      [{ judgeId: j("j1"), value: 5 }, { judgeId: j("j2"), value: 9 }, { judgeId: j("j3"), value: 7 }],
      false,
    );
    expect(r.avg).toBeCloseTo(7, 10);
    expect(r.dropped).toEqual([]);
  });
});

describe("weighting", () => {
  it("weights and normalizes across different max scores", () => {
    const criteria = [
      { id: c("cr1"), weight: 60, minScore: 0, maxScore: 10 },
      { id: c("cr2"), weight: 40, minScore: 0, maxScore: 20 },
    ];
    const scores = [
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: 15 },
    ];
    const results = computeContestantCriteria(p("k1"), criteria, scores, false, 2);
    expect(computeRoundScore(results)).toBeCloseTo(48 + 30, 6);
    expect(results[0].avgRaw).toBe(8);
    expect(results[1].avgRaw).toBe(15);
  });

  it("judge participation is per criterion", () => {
    const criteria = [{ id: c("cr1"), weight: 100, minScore: 0, maxScore: 10 }];
    const scores = [
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 4 },
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr1"), value: 8 },
    ];
    const results = computeContestantCriteria(p("k1"), criteria, scores, true, 0);
    expect(results[0].avgRaw).toBe(6);
    expect(results[0].dropped).toEqual([]);
  });

  it("roundToPrecision rounds half up", () => {
    expect(roundToPrecision(7.335, 2)).toBe(7.34);
    expect(roundToPrecision(7.5, 0)).toBe(8);
  });
});
