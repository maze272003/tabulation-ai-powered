import { describe, expect, it } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import {
  AGREEMENT_WARNING,
  BIAS_Z_WARNING,
  computeJudgeIntegrity,
  type JudgeIntegrityInput,
} from "../convex/lib/judgeIntegrity";

const J1 = "j1" as Id<"eventAccounts">;
const J2 = "j2" as Id<"eventAccounts">;
const J3 = "j3" as Id<"eventAccounts">;
const C1 = "c1" as Id<"contestants">;
const C2 = "c2" as Id<"contestants">;
const C3 = "c3" as Id<"contestants">;
const CRIT = "crit" as Id<"criteria">;

function input(
  scores: { judgeId: Id<"eventAccounts">; contestantId: Id<"contestants">; value: number }[],
  opts: { roundStatus?: JudgeIntegrityInput["roundStatus"]; judges?: Id<"eventAccounts">[]; sheets?: { judgeId: Id<"eventAccounts">; submitted: number; total: number }[] } = {},
): JudgeIntegrityInput {
  const judges = opts.judges ?? [J1, J2, J3];
  return {
    roundStatus: opts.roundStatus ?? "closed",
    criteria: [{ id: CRIT, weight: 100, minScore: 0, maxScore: 100 }],
    scores: scores.map((s) => ({ ...s, criterionId: CRIT })),
    sheets: opts.sheets ?? judges.map((judgeId) => ({ judgeId, submitted: 3, total: 3 })),
  };
}

describe("computeJudgeIntegrity", () => {
  it("returns no flags for a consistent panel", () => {
    const reports = computeJudgeIntegrity(input([
      { judgeId: J1, contestantId: C1, value: 5 }, { judgeId: J1, contestantId: C2, value: 6 }, { judgeId: J1, contestantId: C3, value: 7 },
      { judgeId: J2, contestantId: C1, value: 5 }, { judgeId: J2, contestantId: C2, value: 6 }, { judgeId: J2, contestantId: C3, value: 7 },
      { judgeId: J3, contestantId: C1, value: 5 }, { judgeId: J3, contestantId: C2, value: 6 }, { judgeId: J3, contestantId: C3, value: 7 },
    ]));
    expect(reports.length).toBe(3);
    for (const report of reports) {
      expect(report.flags).toEqual([]);
      expect(Math.abs(report.biasZ ?? 0)).toBeLessThan(BIAS_Z_WARNING);
      expect(report.agreement).toBeGreaterThan(AGREEMENT_WARNING);
    }
  });

  it("flags a lenient judge with critical severity bias", () => {
    const lenient = (v: number) => v + 10;
    const reports = computeJudgeIntegrity(input([
      { judgeId: J1, contestantId: C1, value: lenient(5) }, { judgeId: J1, contestantId: C2, value: lenient(6) }, { judgeId: J1, contestantId: C3, value: lenient(7) },
      { judgeId: J2, contestantId: C1, value: 5 }, { judgeId: J2, contestantId: C2, value: 6 }, { judgeId: J2, contestantId: C3, value: 7 },
      { judgeId: J3, contestantId: C1, value: 5 }, { judgeId: J3, contestantId: C2, value: 6 }, { judgeId: J3, contestantId: C3, value: 7 },
    ]));
    const j1 = reports.find((r) => r.judgeId === J1)!;
    // Per contestant the lenient judge sits z = 1.41 above the panel mean.
    expect(j1.biasZ).toBeGreaterThan(1.25);
    expect(j1.flags).toContainEqual(
      expect.objectContaining({ metric: "severity_bias", level: "critical" }),
    );
    // The other two sit at z = -0.71 (below the warning threshold, not flagged).
    const j2 = reports.find((r) => r.judgeId === J2)!;
    expect(j2.flags.find((f) => f.metric === "severity_bias")).toBeUndefined();
  });

  it("flags a straight-lining judge with critical differentiation", () => {
    const reports = computeJudgeIntegrity(input([
      { judgeId: J1, contestantId: C1, value: 6 }, { judgeId: J1, contestantId: C2, value: 6 }, { judgeId: J1, contestantId: C3, value: 6 },
      { judgeId: J2, contestantId: C1, value: 5 }, { judgeId: J2, contestantId: C2, value: 6 }, { judgeId: J2, contestantId: C3, value: 7 },
      { judgeId: J3, contestantId: C1, value: 5 }, { judgeId: J3, contestantId: C2, value: 6 }, { judgeId: J3, contestantId: C3, value: 7 },
    ]));
    const j1 = reports.find((r) => r.judgeId === J1)!;
    expect(j1.differentiationRatio).toBe(0);
    expect(j1.flags).toContainEqual(
      expect.objectContaining({ metric: "differentiation", level: "critical" }),
    );
    const j2 = reports.find((r) => r.judgeId === J2)!;
    expect(j2.flags.find((f) => f.metric === "differentiation")).toBeUndefined();
  });

  it("flags an inverted judge with negative agreement", () => {
    const reports = computeJudgeIntegrity(input([
      { judgeId: J1, contestantId: C1, value: 7 }, { judgeId: J1, contestantId: C2, value: 6 }, { judgeId: J1, contestantId: C3, value: 5 },
      { judgeId: J2, contestantId: C1, value: 5 }, { judgeId: J2, contestantId: C2, value: 6 }, { judgeId: J2, contestantId: C3, value: 7 },
      { judgeId: J3, contestantId: C1, value: 5 }, { judgeId: J3, contestantId: C2, value: 6 }, { judgeId: J3, contestantId: C3, value: 7 },
    ]));
    const j1 = reports.find((r) => r.judgeId === J1)!;
    expect(j1.agreement).toBeCloseTo(-1, 5);
    expect(j1.flags).toContainEqual(
      expect.objectContaining({ metric: "agreement", level: "critical" }),
    );
  });

  it("suppresses panel statistics below MIN_PANEL_SIZE judges", () => {
    const reports = computeJudgeIntegrity(
      input([
        { judgeId: J1, contestantId: C1, value: 9 }, { judgeId: J1, contestantId: C2, value: 3 },
        { judgeId: J2, contestantId: C1, value: 4 }, { judgeId: J2, contestantId: C2, value: 8 },
      ], { judges: [J1, J2], sheets: [
        { judgeId: J1, submitted: 2, total: 2 },
        { judgeId: J2, submitted: 2, total: 2 },
      ] }),
    );
    for (const report of reports) {
      expect(report.biasZ).toBeNull();
      expect(report.differentiationRatio).toBeNull();
      expect(report.agreement).toBeNull();
      expect(report.flags).toEqual([]);
    }
  });

  it("reports incomplete sheets as info once the round is closed, not while open", () => {
    const base = [
      { judgeId: J1, contestantId: C1, value: 5 },
      { judgeId: J2, contestantId: C1, value: 5 },
      { judgeId: J3, contestantId: C1, value: 5 },
    ];
    const sheets = [
      { judgeId: J1, submitted: 0, total: 1 },
      { judgeId: J2, submitted: 1, total: 1 },
      { judgeId: J3, submitted: 1, total: 1 },
    ];
    const closed = computeJudgeIntegrity(input(base, { roundStatus: "closed", sheets }));
    expect(closed.find((r) => r.judgeId === J1)!.flags).toContainEqual(
      expect.objectContaining({ metric: "completion", level: "info" }),
    );
    const open = computeJudgeIntegrity(input(base, { roundStatus: "open", sheets }));
    expect(open.find((r) => r.judgeId === J1)!.flags.find((f) => f.metric === "completion")).toBeUndefined();
  });
});
