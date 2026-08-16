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

export type RoundComputeInput = {
  winner: "highest" | "lowest";
  dropHighLow: boolean;
  decimalPrecision: number;
  criteria: CoreCriterion[];
  contestants: CoreContestant[];
  scores: CoreScoreRow[];
  manualTieBreaks: { tiedContestantIds: Id<"contestants">[]; orderedIds: Id<"contestants">[] }[];
};

export type StandingRow = {
  contestantId: Id<"contestants">;
  categoryId: Id<"categories">;
  status: CoreContestant["status"];
  roundScore: number | null;
  criterionScores: CriterionResult[];
  rank: number | null;
  tieResolvedBy: "none" | "criteria_cascade" | "judge_firsts" | "manual";
};

export type UnresolvedTie = { categoryId: Id<"categories">; contestantIds: Id<"contestants">[] };

type WorkRow = StandingRow & { firsts: number; manualRank: number };

function judgeFirsts(
  tied: Id<"contestants">[],
  scores: CoreScoreRow[],
  winner: "highest" | "lowest",
): Map<Id<"contestants">, number> {
  const totals = new Map<string, number>();
  const judges = new Set<Id<"judges">>();
  for (const s of scores) {
    if (!tied.includes(s.contestantId)) continue;
    judges.add(s.judgeId);
    const key = `${s.judgeId}|${s.contestantId}`;
    totals.set(key, (totals.get(key) ?? 0) + s.value);
  }
  const firsts = new Map<Id<"contestants">, number>();
  for (const judge of [...judges].sort()) {
    const judgeTotals = [...tied].sort().map((contestant) => ({
      contestant,
      total: totals.get(`${judge}|${contestant}`) ?? 0,
    }));
    const bestTotal = judgeTotals.reduce(
      (best, entry) => (winner === "highest" ? Math.max(best, entry.total) : Math.min(best, entry.total)),
      judgeTotals[0].total,
    );
    const holders = judgeTotals.filter((entry) => entry.total === bestTotal);
    if (holders.length === 1) {
      const best = holders[0].contestant;
      firsts.set(best, (firsts.get(best) ?? 0) + 1);
    }
  }
  return firsts;
}

function manualRankFor(contestantId: Id<"contestants">, breaks: RoundComputeInput["manualTieBreaks"]): number {
  for (const b of breaks) {
    const idx = b.orderedIds.indexOf(contestantId);
    if (idx !== -1) return idx;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function computeRoundStandings(input: RoundComputeInput): {
  standings: StandingRow[];
  unresolvedTies: UnresolvedTie[];
} {
  const rows: WorkRow[] = input.contestants
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((k) => {
      const rankable = k.status === "active";
      const criterionScores = rankable
        ? computeContestantCriteria(k.id, input.criteria, input.scores, input.dropHighLow, input.decimalPrecision)
        : [];
      return {
        contestantId: k.id,
        categoryId: k.categoryId,
        status: k.status,
        roundScore: rankable ? computeRoundScore(criterionScores) : null,
        criterionScores,
        rank: null,
        tieResolvedBy: "none" as const,
        firsts: 0,
        manualRank: Number.MAX_SAFE_INTEGER,
      };
    });

  const dir = input.winner === "highest" ? 1 : -1;
  const unresolvedTies: UnresolvedTie[] = [];
  const byCategory = new Map<Id<"categories">, WorkRow[]>();
  for (const row of rows) {
    const list = byCategory.get(row.categoryId) ?? [];
    list.push(row);
    byCategory.set(row.categoryId, list);
  }

  for (const [categoryId, categoryRows] of byCategory) {
    const rankable = categoryRows.filter((r) => r.roundScore !== null);
    for (const r of categoryRows) {
      if (r.roundScore === null) r.rank = null;
    }
    rankable.sort((a, b) => (b.roundScore! - a.roundScore!) * dir || (a.contestantId < b.contestantId ? -1 : 1));

    let index = 0;
    while (index < rankable.length) {
      let end = index;
      while (end + 1 < rankable.length && rankable[end + 1].roundScore === rankable[index].roundScore) end += 1;
      const group = rankable.slice(index, end + 1);
      if (group.length === 1) {
        group[0].rank = index + 1;
        group[0].tieResolvedBy = "none";
      } else {
        const firsts = judgeFirsts(group.map((g) => g.contestantId), input.scores, input.winner);
        for (const g of group) {
          g.firsts = firsts.get(g.contestantId) ?? 0;
          g.manualRank = manualRankFor(g.contestantId, input.manualTieBreaks);
        }
        group.sort((a, b) => {
          for (let i = 0; i < Math.min(a.criterionScores.length, b.criterionScores.length); i += 1) {
            const diff = (b.criterionScores[i].contribution - a.criterionScores[i].contribution) * dir;
            if (diff !== 0) return diff;
          }
          if (a.firsts !== b.firsts) return (b.firsts - a.firsts) * dir;
          if (a.manualRank !== b.manualRank) return a.manualRank - b.manualRank;
          return a.contestantId < b.contestantId ? -1 : 1;
        });
        let separatedBy: WorkRow["tieResolvedBy"] = "manual";
        let anySeparation = group.length > 1;
        for (let i = 1; i < group.length; i += 1) {
          const a = group[i - 1];
          const b = group[i];
          let tier: WorkRow["tieResolvedBy"] | null = null;
          for (let k = 0; k < Math.min(a.criterionScores.length, b.criterionScores.length); k += 1) {
            if (a.criterionScores[k].contribution !== b.criterionScores[k].contribution) {
              tier = "criteria_cascade";
              break;
            }
          }
          if (!tier && a.firsts !== b.firsts) tier = "judge_firsts";
          if (!tier && a.manualRank !== b.manualRank) tier = "manual";
          if (!tier) {
            anySeparation = false;
            break;
          }
          separatedBy = tier;
        }
        if (anySeparation) {
          for (const g of group) {
            g.rank = index + group.indexOf(g) + 1;
            g.tieResolvedBy = separatedBy;
          }
        } else {
          unresolvedTies.push({ categoryId, contestantIds: group.map((g) => g.contestantId).sort() });
          for (const g of group) {
            g.rank = index + 1;
            g.tieResolvedBy = "none";
          }
        }
      }
      index = end + 1;
    }
  }

  return {
    standings: rows.map((r) => ({
      contestantId: r.contestantId,
      categoryId: r.categoryId,
      status: r.status,
      roundScore: r.roundScore,
      criterionScores: r.criterionScores,
      rank: r.rank,
      tieResolvedBy: r.tieResolvedBy,
    })),
    unresolvedTies,
  };
}

export type AdvancementConfig = {
  enabled: boolean;
  mode: "none" | "top_count" | "top_percent" | "manual";
  count: number | null;
  percent: number | null;
  allowOverride: boolean;
};

export type AdvancementOverrideRow = {
  contestantId: Id<"contestants">;
  action: "force_advance" | "force_cut";
};

export function applyAdvancement(
  standings: StandingRow[],
  config: AdvancementConfig,
  overrides: AdvancementOverrideRow[],
): Map<Id<"contestants">, boolean | null> {
  const outcome = new Map<Id<"contestants">, boolean | null>();
  for (const s of standings) outcome.set(s.contestantId, null);
  if (!config.enabled) return outcome;
  const rankable = standings
    .filter((s) => s.rank !== null && s.status === "active")
    .sort((a, b) => a.rank! - b.rank!);
  let advancing = new Set<Id<"contestants">>();
  if (config.mode === "top_count") {
    advancing = new Set(rankable.slice(0, config.count ?? 0).map((s) => s.contestantId));
  } else if (config.mode === "top_percent") {
    const n = Math.ceil(((config.percent ?? 0) / 100) * rankable.length);
    advancing = new Set(rankable.slice(0, n).map((s) => s.contestantId));
  }
  for (const s of rankable) outcome.set(s.contestantId, advancing.has(s.contestantId));
  for (const o of overrides) {
    outcome.set(o.contestantId, o.action === "force_advance");
  }
  return outcome;
}

export type RoundStandingSummary = {
  roundId: Id<"rounds">;
  order: number;
  weight: number;
  standings: StandingRow[];
  advancement: Record<string, boolean | null>;
};

export type FinalStandingRow = {
  contestantId: Id<"contestants">;
  categoryId: Id<"categories">;
  totalScore: number;
  eliminatedInRoundOrder: number | null;
  rank: number;
};

export function computeEventFinal(rounds: RoundStandingSummary[], decimalPrecision: number): FinalStandingRow[] {
  type Work = { contestantId: Id<"contestants">; category: Id<"categories">; total: number; eliminated: number | null; rank: number };
  const byContestant = new Map<Id<"contestants">, { total: number; category: Id<"categories">; eliminated: number | null }>();
  for (const round of rounds) {
    for (const s of round.standings) {
      if (s.roundScore === null) continue;
      const entry = byContestant.get(s.contestantId) ?? { total: 0, category: s.categoryId, eliminated: null };
      entry.total += (s.roundScore * round.weight) / 100;
      if (round.advancement[s.contestantId] === false && (entry.eliminated === null || round.order > entry.eliminated)) {
        entry.eliminated = round.order;
      }
      byContestant.set(s.contestantId, entry);
    }
  }
  const rows: Work[] = [...byContestant.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([contestantId, e]) => ({
      contestantId,
      category: e.category,
      total: roundToPrecision(e.total, decimalPrecision),
      eliminated: e.eliminated,
      rank: 0,
    }));
  const byCategory = new Map<Id<"categories">, Work[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort(
      (a, b) =>
        (a.eliminated === null ? 0 : 1) - (b.eliminated === null ? 0 : 1) ||
        (b.eliminated ?? 0) - (a.eliminated ?? 0) ||
        b.total - a.total,
    );
    list.forEach((row, i) => {
      row.rank = i + 1;
    });
  }
  return rows.map((r) => ({
    contestantId: r.contestantId,
    categoryId: r.category,
    totalScore: r.total,
    eliminatedInRoundOrder: r.eliminated,
    rank: r.rank,
  }));
}
