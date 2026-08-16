import type { Id } from "../_generated/dataModel";

export type CoreCriterion = { id: Id<"criteria">; weight: number; minScore: number; maxScore: number };

export type CoreContestant = {
  id: Id<"contestants">;
  categoryId: Id<"categories">;
  status: "active" | "scratched" | "disqualified";
};

export type CoreScoreRow = {
  judgeId: Id<"judges">;
  contestantId: Id<"contestants">;
  criterionId: Id<"criteria">;
  value: number;
};

export type CriterionResult = {
  criterionId: Id<"criteria">;
  avgRaw: number;
  contribution: number;
  dropped: { judgeId: Id<"judges">; value: number }[];
};

export function roundToPrecision(value: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function aggregateJudgeValues(
  entries: { judgeId: Id<"judges">; value: number }[],
  dropHighLow: boolean,
): { avg: number; dropped: { judgeId: Id<"judges">; value: number }[] } {
  const sorted = [...entries].sort((a, b) => a.value - b.value || (a.judgeId < b.judgeId ? -1 : 1));
  let used = sorted;
  let dropped: { judgeId: Id<"judges">; value: number }[] = [];
  if (dropHighLow && sorted.length >= 3) {
    dropped = [sorted[0], sorted[sorted.length - 1]];
    used = sorted.slice(1, -1);
  }
  const avg = used.reduce((s, e) => s + e.value, 0) / used.length;
  return { avg, dropped };
}

export function computeContestantCriteria(
  contestantId: Id<"contestants">,
  criteria: CoreCriterion[],
  scores: CoreScoreRow[],
  dropHighLow: boolean,
  decimalPrecision: number,
): CriterionResult[] {
  return [...criteria]
    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))
    .map((c) => {
      const entries = scores
        .filter((s) => s.contestantId === contestantId && s.criterionId === c.id)
        .map((s) => ({ judgeId: s.judgeId, value: s.value }));
      const { avg, dropped } = aggregateJudgeValues(entries, dropHighLow);
      const contribution = c.maxScore === 0 ? 0 : roundToPrecision((avg / c.maxScore) * c.weight, 6);
      return { criterionId: c.id, avgRaw: roundToPrecision(avg, decimalPrecision), contribution, dropped };
    });
}

export function computeRoundScore(results: CriterionResult[]): number {
  return roundToPrecision(results.reduce((s, r) => s + r.contribution, 0), 6);
}
