import type { Id } from "../_generated/dataModel";

/**
 * Pure judge-integrity statistics for a scoring panel: severity/leniency bias
 * (mean z-score vs. per-contestant panel mean), differentiation (score spread
 * vs. panel-average spread), and agreement (Spearman rank correlation with the
 * panel-consensus ranking). Thresholds are deliberately conservative: flags are
 * informational for organizers and never alter tabulated results.
 */
export const MIN_PANEL_SIZE = 3;
export const MIN_SCORES_PER_CONTESTANT = 2;
export const BIAS_Z_WARNING = 0.75;
export const BIAS_Z_CRITICAL = 1.25;
export const DIFFERENTIATION_RATIO_WARNING = 0.5;
export const DIFFERENTIATION_RATIO_CRITICAL = 0.25;
export const AGREEMENT_WARNING = 0.4;

export type IntegrityFlagLevel = "info" | "warning" | "critical";
export type IntegrityMetricName = "severity_bias" | "differentiation" | "agreement" | "completion";

export type IntegrityFlag = {
  metric: IntegrityMetricName;
  level: IntegrityFlagLevel;
  explanation: string;
};

export type JudgeIntegrityReport = {
  judgeId: Id<"eventAccounts">;
  biasZ: number | null;
  differentiationRatio: number | null;
  agreement: number | null;
  completion: number;
  flags: IntegrityFlag[];
};

export type JudgeIntegrityInput = {
  roundStatus: "open" | "closed" | "published";
  criteria: { id: Id<"criteria">; weight: number; minScore: number; maxScore: number }[];
  scores: { judgeId: Id<"eventAccounts">; contestantId: Id<"contestants">; criterionId: Id<"criteria">; value: number }[];
  sheets: { judgeId: Id<"eventAccounts">; submitted: number; total: number }[];
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
}

/**
 * Weighted contestant total for one judge, using the same normalization as the
 * tabulation engine: (value / maxScore) * weight per criterion (tabulation.ts:60).
 */
function judgeContestantTotal(
  input: JudgeIntegrityInput,
  judgeId: Id<"eventAccounts">,
  contestantId: Id<"contestants">,
): number {
  let total = 0;
  for (const score of input.scores) {
    if (score.judgeId !== judgeId || score.contestantId !== contestantId) continue;
    const criterion = input.criteria.find((c) => c.id === score.criterionId);
    if (!criterion) continue;
    total += criterion.maxScore === 0 ? 0 : (score.value / criterion.maxScore) * criterion.weight;
  }
  return total;
}

/** Rank 1 = highest value; ties share the average rank (Spearman-correct). */
function averageRanks(values: number[]): number[] {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j++;
    const averageRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[sorted[k].index] = averageRank;
    i = j + 1;
  }
  return ranks;
}

function spearman(a: number[], b: number[]): number {
  if (a.length < 2) return 0;
  const rankA = averageRanks(a);
  const rankB = averageRanks(b);
  const sdA = stddev(rankA);
  const sdB = stddev(rankB);
  if (sdA === 0 || sdB === 0) return 0;
  const mA = mean(rankA);
  const mB = mean(rankB);
  const covariance = mean(rankA.map((value, index) => (value - mA) * (rankB[index] - mB)));
  return covariance / (sdA * sdB);
}

export function computeJudgeIntegrity(input: JudgeIntegrityInput): JudgeIntegrityReport[] {
  const judgeIds = [...new Set(input.scores.map((score) => score.judgeId))].sort();
  const contestantIds = [...new Set(input.scores.map((score) => score.contestantId))].sort();

  const totals = new Map<string, number>(); // `${judgeId}:${contestantId}` -> total
  for (const judgeId of judgeIds) {
    for (const contestantId of contestantIds) {
      totals.set(`${judgeId}:${contestantId}`, judgeContestantTotal(input, judgeId, contestantId));
    }
  }
  const judgesOfContestant = (contestantId: Id<"contestants">) =>
    judgeIds.filter((judgeId) => input.scores.some((s) => s.judgeId === judgeId && s.contestantId === contestantId));
  const contestantsOfJudge = (judgeId: Id<"eventAccounts">) =>
    contestantIds.filter((contestantId) => input.scores.some((s) => s.judgeId === judgeId && s.contestantId === contestantId));

  const panelEnabled = judgeIds.length >= MIN_PANEL_SIZE;

  // Per-judge spread, the baseline for the differentiation ratio. A spread is
  // only meaningful for judges who scored at least 2 contestants; those judges
  // alone form the panel baseline and are alone eligible for their own ratio.
  const spreadByJudge = new Map<Id<"eventAccounts">, number>();
  const judgesWithValidSpread = new Set<Id<"eventAccounts">>();
  for (const judgeId of judgeIds) {
    const ownTotals = contestantsOfJudge(judgeId).map((contestantId) => totals.get(`${judgeId}:${contestantId}`) ?? 0);
    if (ownTotals.length < 2) continue;
    judgesWithValidSpread.add(judgeId);
    spreadByJudge.set(judgeId, stddev(ownTotals));
  }
  const meanSpread = judgesWithValidSpread.size > 0 ? mean([...spreadByJudge.values()]) : 0;

  const reports: JudgeIntegrityReport[] = [];
  for (const judgeId of judgeIds) {
    const flags: IntegrityFlag[] = [];

    const sheet = input.sheets.find((s) => s.judgeId === judgeId);
    const completion = !sheet || sheet.total === 0 ? 1 : sheet.submitted / sheet.total;
    if (completion < 1 && input.roundStatus !== "open") {
      flags.push({
        metric: "completion",
        level: "info",
        explanation: `${sheet?.submitted ?? 0} of ${sheet?.total ?? 0} score sheets submitted.`,
      });
    }

    let biasZ: number | null = null;
    let differentiationRatio: number | null = null;
    let agreement: number | null = null;

    if (panelEnabled) {
      // Severity/leniency: mean z-score of this judge's totals vs. per-contestant panel mean.
      const zScores: number[] = [];
      for (const contestantId of contestantsOfJudge(judgeId)) {
        const panelTotals = judgesOfContestant(contestantId).map(
          (other) => totals.get(`${other}:${contestantId}`) ?? 0,
        );
        if (panelTotals.length < MIN_PANEL_SIZE) continue;
        const m = mean(panelTotals);
        const sd = stddev(panelTotals);
        zScores.push(((totals.get(`${judgeId}:${contestantId}`) ?? 0) - m) / (sd === 0 ? 1 : sd));
      }
      if (zScores.length > 0) {
        biasZ = mean(zScores);
        if (Math.abs(biasZ) >= BIAS_Z_CRITICAL) {
          flags.push({
            metric: "severity_bias",
            level: "critical",
            explanation: `${biasZ > 0 ? "Scores consistently above" : "Scores consistently below"} the panel average (bias z = ${biasZ.toFixed(2)}).`,
          });
        } else if (Math.abs(biasZ) >= BIAS_Z_WARNING) {
          flags.push({
            metric: "severity_bias",
            level: "warning",
            explanation: `Mild ${biasZ > 0 ? "leniency" : "severity"} vs. the panel (bias z = ${biasZ.toFixed(2)}).`,
          });
        }
      }

      // Differentiation: this judge's spread vs. the panel's average spread.
      const ownSpread = spreadByJudge.get(judgeId);
      if (judgesWithValidSpread.has(judgeId) && ownSpread !== undefined && meanSpread > 0) {
        differentiationRatio = ownSpread / meanSpread;
        if (differentiationRatio <= DIFFERENTIATION_RATIO_CRITICAL) {
          flags.push({
            metric: "differentiation",
            level: "critical",
            explanation: "Scores barely differentiate between contestants (possible straight-lining).",
          });
        } else if (differentiationRatio <= DIFFERENTIATION_RATIO_WARNING) {
          flags.push({
            metric: "differentiation",
            level: "warning",
            explanation: "Low score spread vs. the panel - contestants are not being separated.",
          });
        }
      }

      // Agreement: Spearman rank correlation with the panel-consensus ranking.
      const shared = contestantsOfJudge(judgeId).filter((contestantId) => {
        const panelTotals = judgesOfContestant(contestantId);
        return panelTotals.length >= MIN_SCORES_PER_CONTESTANT;
      });
      if (shared.length >= 2) {
        const ownValues = shared.map((c) => totals.get(`${judgeId}:${c}`) ?? 0);
        const consensusValues = shared.map((c) =>
          mean(judgesOfContestant(c).map((other) => totals.get(`${other}:${c}`) ?? 0)),
        );
        agreement = spearman(ownValues, consensusValues);
        if (agreement < 0) {
          flags.push({
            metric: "agreement",
            level: "critical",
            explanation: `Ranking runs against panel consensus (rho = ${agreement.toFixed(2)}).`,
          });
        } else if (agreement < AGREEMENT_WARNING) {
          flags.push({
            metric: "agreement",
            level: "warning",
            explanation: `Ranking diverges from panel consensus (rho = ${agreement.toFixed(2)}).`,
          });
        }
      }
    }

    reports.push({ judgeId, biasZ, differentiationRatio, agreement, completion, flags });
  }
  return reports;
}
