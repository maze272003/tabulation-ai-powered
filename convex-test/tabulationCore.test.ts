import { describe, expect, it } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import {
  aggregateJudgeValues, computeContestantCriteria, computeRoundScore, roundToPrecision,
} from "../convex/lib/tabulation";
import { computeRoundStandings, type RoundComputeInput } from "../convex/lib/tabulation";

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

const cat = (s: string) => s as Id<"categories">;

function fixture(marks: { k1: [number, number]; k2: [number, number] }): RoundComputeInput {
  return {
    winner: "highest" as const,
    dropHighLow: false,
    decimalPrecision: 2,
    criteria: [
      { id: c("cr1"), weight: 60, minScore: 0, maxScore: 10 },
      { id: c("cr2"), weight: 40, minScore: 0, maxScore: 10 },
    ],
    contestants: [
      { id: p("k1"), categoryId: cat("A"), status: "active" as const },
      { id: p("k2"), categoryId: cat("A"), status: "active" as const },
    ],
    scores: [
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: marks.k1[0] },
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: marks.k1[1] },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr1"), value: marks.k2[0] },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr2"), value: marks.k2[1] },
    ],
    manualTieBreaks: [],
  };
}

function threeWayInput(scores: RoundComputeInput["scores"]): RoundComputeInput {
  return {
    ...fixture({ k1: [0, 0], k2: [0, 0] }),
    contestants: [
      { id: p("k1"), categoryId: cat("A"), status: "active" as const },
      { id: p("k2"), categoryId: cat("A"), status: "active" as const },
      { id: p("k3"), categoryId: cat("A"), status: "active" as const },
    ],
    scores,
  };
}

describe("ranking & ties", () => {
  it("ranks by weighted score, highest first", () => {
    const { standings, unresolvedTies } = computeRoundStandings(fixture({ k1: [9, 9], k2: [5, 5] }));
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(2);
    expect(unresolvedTies).toEqual([]);
    expect(standings.find((s) => s.contestantId === p("k1"))?.tieResolvedBy).toBe("none");
  });

  it("lowest-wins inverts ranking", () => {
    const { standings } = computeRoundStandings({ ...fixture({ k1: [9, 9], k2: [5, 5] }), winner: "lowest" });
    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(1);
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(2);
  });

  it("resolves equal totals via criteria cascade (higher weight first)", () => {
    const { standings, unresolvedTies } = computeRoundStandings(fixture({ k1: [10, 5], k2: [8, 8] }));
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
    expect(standings.find((s) => s.contestantId === p("k1"))?.tieResolvedBy).toBe("criteria_cascade");
    expect(unresolvedTies).toEqual([]);
  });

  it("flags fully tied contestants as unresolved without a manual break", () => {
    const { standings, unresolvedTies } = computeRoundStandings(fixture({ k1: [8, 8], k2: [8, 8] }));
    expect(unresolvedTies.length).toBe(1);
    expect([...unresolvedTies[0].contestantIds].sort()).toEqual([p("k1"), p("k2")].sort());
    expect(standings.every((s) => s.rank === 1)).toBe(true);
  });

  it("judge firsts resolve ties before manual breaks", () => {
    const input = fixture({ k1: [0, 0], k2: [0, 0] });
    input.scores = [
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: 0 },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr1"), value: 5 },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr2"), value: 0 },
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr2"), value: 0 },
      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr1"), value: 5 },
      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr2"), value: 0 },
      { judgeId: j("j3"), contestantId: p("k1"), criterionId: c("cr1"), value: 0 },
      { judgeId: j("j3"), contestantId: p("k1"), criterionId: c("cr2"), value: 0 },
      { judgeId: j("j3"), contestantId: p("k2"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j3"), contestantId: p("k2"), criterionId: c("cr2"), value: 0 },
    ];
    const { standings, unresolvedTies } = computeRoundStandings(input);
    expect(unresolvedTies).toEqual([]);
    const k1 = standings.find((s) => s.contestantId === p("k1"))!;
    expect(k1.rank).toBe(1);
    expect(k1.tieResolvedBy).toBe("judge_firsts");
  });

  it("manual tie breaks resolve identical totals", () => {
    const input = fixture({ k1: [8, 8], k2: [8, 8] });
    input.manualTieBreaks = [{ tiedContestantIds: [p("k1"), p("k2")], orderedIds: [p("k2"), p("k1")] }];
    const { standings, unresolvedTies } = computeRoundStandings(input);
    expect(unresolvedTies).toEqual([]);
    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(1);
    expect(standings.find((s) => s.contestantId === p("k2"))?.tieResolvedBy).toBe("manual");
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(2);
  });

  it("excludes scratched and disqualified from ranking", () => {
    const input = fixture({ k1: [9, 9], k2: [5, 5] });
    input.contestants = [
      { id: p("k1"), categoryId: cat("A"), status: "active" },
      { id: p("k2"), categoryId: cat("A"), status: "disqualified" },
    ];
    const { standings } = computeRoundStandings(input);
    const k2 = standings.find((s) => s.contestantId === p("k2"))!;
    expect(k2.rank).toBeNull();
    expect(k2.roundScore).toBeNull();
    expect(k2.criterionScores).toEqual([]);
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
  });

  it("contestant with no score rows is unrankable without NaN", () => {
    const input = fixture({ k1: [9, 9], k2: [5, 5] });
    input.scores = input.scores.filter((s) => s.contestantId !== p("k2"));
    const { standings, unresolvedTies } = computeRoundStandings(input);
    const k2 = standings.find((s) => s.contestantId === p("k2"))!;
    expect(k2.rank).toBeNull();
    expect(k2.roundScore).toBeNull();
    expect(k2.criterionScores).toEqual([]);
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
    const numericScores = standings.flatMap((s) => [
      ...(s.roundScore === null ? [] : [s.roundScore]),
      ...s.criterionScores.flatMap((cs) => [cs.avgRaw, cs.contribution, ...cs.dropped.map((d) => d.value)]),
    ]);
    expect(numericScores.every((v) => !Number.isNaN(v))).toBe(true);
    expect(unresolvedTies).toEqual([]);
  });

  it("criterion with zero entries contributes nothing", () => {
    const input = fixture({ k1: [9, 9], k2: [5, 5] });
    input.scores = input.scores.filter((s) => s.criterionId !== c("cr2"));
    const { standings, unresolvedTies } = computeRoundStandings(input);
    for (const s of standings) {
      expect(s.criterionScores.map((cs) => cs.criterionId)).toEqual([c("cr1")]);
      expect(s.criterionScores.every((cs) => !Number.isNaN(cs.avgRaw) && !Number.isNaN(cs.contribution))).toBe(true);
    }
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(2);
    expect(unresolvedTies).toEqual([]);
  });

  it("deterministic across repeated runs", () => {
    const input = fixture({ k1: [8, 8], k2: [8, 8] });
    input.manualTieBreaks = [{ tiedContestantIds: [p("k1"), p("k2")], orderedIds: [p("k2"), p("k1")] }];
    const a = computeRoundStandings(input);
    const b = computeRoundStandings(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("labels each row of a resolved tie group by its own separating rule", () => {
    const input = threeWayInput([
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: 5 },
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr2"), value: 5 },
      { judgeId: j("j3"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j3"), contestantId: p("k1"), criterionId: c("cr2"), value: 5 },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr2"), value: 10 },
      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr2"), value: 10 },
      { judgeId: j("j3"), contestantId: p("k2"), criterionId: c("cr1"), value: 4 },
      { judgeId: j("j3"), contestantId: p("k2"), criterionId: c("cr2"), value: 4 },
      { judgeId: j("j1"), contestantId: p("k3"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j1"), contestantId: p("k3"), criterionId: c("cr2"), value: 8 },
      { judgeId: j("j2"), contestantId: p("k3"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j2"), contestantId: p("k3"), criterionId: c("cr2"), value: 8 },
      { judgeId: j("j3"), contestantId: p("k3"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j3"), contestantId: p("k3"), criterionId: c("cr2"), value: 8 },
    ]);
    const { standings, unresolvedTies } = computeRoundStandings(input);
    expect(unresolvedTies).toEqual([]);
    const k1 = standings.find((s) => s.contestantId === p("k1"))!;
    const k2 = standings.find((s) => s.contestantId === p("k2"))!;
    const k3 = standings.find((s) => s.contestantId === p("k3"))!;
    expect(k1.roundScore).toBe(80);
    expect(k2.roundScore).toBe(80);
    expect(k3.roundScore).toBe(80);
    expect(k1.rank).toBe(1);
    expect(k1.tieResolvedBy).toBe("criteria_cascade");
    expect(k2.rank).toBe(2);
    expect(k2.tieResolvedBy).toBe("criteria_cascade");
    expect(k3.rank).toBe(3);
    expect(k3.tieResolvedBy).toBe("judge_firsts");
  });

  it("keeps a whole tie group unresolved when one adjacent pair cannot be separated", () => {
    const input = threeWayInput([
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: 5 },
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr2"), value: 5 },
      { judgeId: j("j3"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
      { judgeId: j("j3"), contestantId: p("k1"), criterionId: c("cr2"), value: 5 },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr2"), value: 8 },
      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr2"), value: 8 },
      { judgeId: j("j3"), contestantId: p("k2"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j3"), contestantId: p("k2"), criterionId: c("cr2"), value: 8 },
      { judgeId: j("j1"), contestantId: p("k3"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j1"), contestantId: p("k3"), criterionId: c("cr2"), value: 8 },
      { judgeId: j("j2"), contestantId: p("k3"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j2"), contestantId: p("k3"), criterionId: c("cr2"), value: 8 },
      { judgeId: j("j3"), contestantId: p("k3"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j3"), contestantId: p("k3"), criterionId: c("cr2"), value: 8 },
    ]);
    const { standings, unresolvedTies } = computeRoundStandings(input);
    expect(unresolvedTies.length).toBe(1);
    expect([...unresolvedTies[0].contestantIds].sort()).toEqual([p("k1"), p("k2"), p("k3")].sort());
    expect(standings.every((s) => s.rank === 1)).toBe(true);
    expect(standings.every((s) => s.tieResolvedBy === "none")).toBe(true);
  });
});

import { applyAdvancement, computeEventFinal, type StandingRow } from "../convex/lib/tabulation";

const rd = (s: string) => s as Id<"rounds">;

function standingRow(id: string, rank: number | null, categoryId = "A"): StandingRow {
  return {
    contestantId: p(id),
    categoryId: cat(categoryId),
    status: "active",
    roundScore: rank === null ? null : 100 - rank,
    criterionScores: [],
    rank,
    tieResolvedBy: "none",
  };
}

describe("advancement", () => {
  const standings = [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 3), standingRow("k4", 4)];

  it("disabled advancement returns all null", () => {
    const m = applyAdvancement(standings, { enabled: false, mode: "top_count", count: 2, percent: null, allowOverride: true }, []);
    expect([...m.values()].every((v) => v === null)).toBe(true);
  });

  it("top_count advances first N ranked", () => {
    const m = applyAdvancement(standings, { enabled: true, mode: "top_count", count: 2, percent: null, allowOverride: true }, []);
    expect(m.get(p("k1"))).toBe(true);
    expect(m.get(p("k2"))).toBe(true);
    expect(m.get(p("k3"))).toBe(false);
    expect(m.get(p("k4"))).toBe(false);
  });

  it("top_percent uses ceiling", () => {
    const m = applyAdvancement(
      [...standings, standingRow("k5", 5), standingRow("k6", 6)],
      { enabled: true, mode: "top_percent", count: null, percent: 50, allowOverride: true },
      [],
    );
    expect(m.get(p("k3"))).toBe(true);
    expect(m.get(p("k4"))).toBe(false);
  });

  it("manual mode advances nobody automatically", () => {
    const m = applyAdvancement(standings, { enabled: true, mode: "manual", count: null, percent: null, allowOverride: true }, []);
    expect(m.get(p("k1"))).toBe(false);
    expect(m.get(p("k4"))).toBe(false);
  });

  it("overrides force through the computed cut", () => {
    const m = applyAdvancement(
      standings,
      { enabled: true, mode: "top_count", count: 2, percent: null, allowOverride: true },
      [{ contestantId: p("k4"), action: "force_advance" }, { contestantId: p("k1"), action: "force_cut" }],
    );
    expect(m.get(p("k4"))).toBe(true);
    expect(m.get(p("k1"))).toBe(false);
  });
});

describe("event final", () => {
  it("combines round scores by weight and ranks survivors first", () => {
    const rounds = [
      {
        roundId: rd("rd1"), order: 0, weight: 40,
        standings: [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 3)],
        advancement: { [p("k1")]: true, [p("k2")]: true, [p("k3")]: false },
      },
      {
        roundId: rd("rd2"), order: 1, weight: 60,
        standings: [standingRow("k1", 2), standingRow("k2", 1)],
        advancement: { [p("k1")]: null, [p("k2")]: null },
      },
    ];
    const final = computeEventFinal(rounds, 2);
    const k1 = final.find((f) => f.contestantId === p("k1"))!;
    const k3 = final.find((f) => f.contestantId === p("k3"))!;
    expect(k1.totalScore).toBeCloseTo((99 * 40 + 98 * 60) / 100, 6);
    expect(k1.eliminatedInRoundOrder).toBeNull();
    expect(k3.eliminatedInRoundOrder).toBe(0);
    expect(k1.rank).toBeLessThan(k3.rank);
  });

  it("eliminated contestants rank by later elimination then score", () => {
    const rounds = [{
      roundId: rd("rd1"), order: 0, weight: 100,
      standings: [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 3)],
      advancement: { [p("k1")]: true, [p("k2")]: false, [p("k3")]: false },
    }];
    const final = computeEventFinal(rounds, 2);
    expect(final.map((f) => f.contestantId)).toEqual([p("k1"), p("k2"), p("k3")]);
  });

  it("non-elimination events rank purely by weighted total", () => {
    const rounds = [{
      roundId: rd("rd1"), order: 0, weight: 100,
      standings: [standingRow("k1", 1), standingRow("k2", 2)],
      advancement: {},
    }];
    const final = computeEventFinal(rounds, 2);
    expect(final[0].rank).toBe(1);
    expect(final[0].contestantId).toBe(p("k1"));
    expect(final.every((f) => f.eliminatedInRoundOrder === null)).toBe(true);
  });

  it("tied survivors share a rank and the next rank skips by the tie size", () => {
    const rounds = [{
      roundId: rd("rd1"), order: 0, weight: 100,
      standings: [standingRow("k1", 1), standingRow("k2", 1), standingRow("k3", 3)],
      advancement: {},
    }];
    const final = computeEventFinal(rounds, 2);
    expect(final.find((f) => f.contestantId === p("k1"))?.rank).toBe(1);
    expect(final.find((f) => f.contestantId === p("k2"))?.rank).toBe(1);
    expect(final.find((f) => f.contestantId === p("k3"))?.rank).toBe(3);
  });

  it("eliminated in the same round with equal totals share a rank", () => {
    const rounds = [{
      roundId: rd("rd1"), order: 0, weight: 100,
      standings: [standingRow("k1", 2), standingRow("k2", 2), standingRow("k3", 4)],
      advancement: { [p("k1")]: false, [p("k2")]: false, [p("k3")]: false },
    }];
    const final = computeEventFinal(rounds, 2);
    expect(final.find((f) => f.contestantId === p("k1"))?.rank).toBe(1);
    expect(final.find((f) => f.contestantId === p("k2"))?.rank).toBe(1);
    expect(final.find((f) => f.contestantId === p("k3"))?.rank).toBe(3);
  });

  it("eliminated in different rounds never share a rank despite equal totals", () => {
    const rounds = [
      {
        roundId: rd("rd1"), order: 0, weight: 100,
        standings: [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 100)],
        advancement: { [p("k1")]: true, [p("k2")]: false, [p("k3")]: true },
      },
      {
        roundId: rd("rd2"), order: 1, weight: 100,
        standings: [standingRow("k1", 1), standingRow("k3", 2)],
        advancement: { [p("k1")]: true, [p("k3")]: false },
      },
    ];
    const final = computeEventFinal(rounds, 2);
    const k2 = final.find((f) => f.contestantId === p("k2"))!;
    const k3 = final.find((f) => f.contestantId === p("k3"))!;
    expect(k2.totalScore).toBe(k3.totalScore);
    expect(k2.eliminatedInRoundOrder).toBe(0);
    expect(k3.eliminatedInRoundOrder).toBe(1);
    expect(k3.rank).toBe(2);
    expect(k2.rank).toBe(3);
  });

  it("final ranking is deterministic across repeated runs", () => {
    const rounds = [{
      roundId: rd("rd1"), order: 0, weight: 100,
      standings: [standingRow("k1", 1), standingRow("k2", 1), standingRow("k3", 3)],
      advancement: {},
    }];
    expect(JSON.stringify(computeEventFinal(rounds, 2))).toBe(JSON.stringify(computeEventFinal(rounds, 2)));
  });
});
