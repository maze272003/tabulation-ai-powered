import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { loadRound, type EventAuthCtx } from "./eventAuthz";
import {
  applyAdvancement, computeRoundStandings,
  type AdvancementConfig, type AdvancementOverrideRow, type CoreContestant, type CoreCriterion,
  type CoreScoreRow, type RoundComputeInput, type StandingRow, type UnresolvedTie,
} from "./tabulation";

export type RoundComputeResult = {
  round: Doc<"rounds">;
  standings: StandingRow[];
  unresolvedTies: UnresolvedTie[];
  advancement: Map<Id<"contestants">, boolean | null>;
  advancementConfig: AdvancementConfig;
  judgeParticipation: { judgeId: Id<"eventAccounts">; sheetsSubmitted: number; sheetsTotal: number }[];
  tieBreaks: Doc<"tieBreaks">[];
  overrides: Doc<"advancementOverrides">[];
  overrideDecisions: {
    contestantId: Id<"contestants">;
    action: "force_advance" | "force_cut";
    createdById: Id<"userProfiles">;
    source: "persisted" | "correction";
  }[];
};

export async function loadRoundCompute(
  ctx: QueryCtx,
  eactx: EventAuthCtx,
  roundId: Id<"rounds">,
  extraOverrides: AdvancementOverrideRow[] = [],
): Promise<RoundComputeResult> {
  const round = await loadRound(ctx, eactx, roundId);
  const criteriaDocs = await ctx.db
    .query("criteria")
    .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
    .collect();
  const contestants = await ctx.db
    .query("contestants")
    .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
    .collect();
  const sheets = await ctx.db
    .query("scoreSheets")
    .withIndex("by_event_id_and_round_id", (q) =>
      q.eq("eventId", eactx.event._id).eq("roundId", round._id))
    .collect();
  const scoreDocs = await ctx.db
    .query("scores")
    .withIndex("by_event_id_and_round_id", (q) =>
      q.eq("eventId", eactx.event._id).eq("roundId", round._id))
    .collect();
  const judges = await ctx.db
    .query("eventAccounts")
    .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eactx.event._id).eq("kind", "judge"))
    .collect();
  const tieBreaks = await ctx.db
    .query("tieBreaks")
    .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
    .collect();
  const overrideDocs = await ctx.db
    .query("advancementOverrides")
    .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
    .collect();

  const criteria: CoreCriterion[] = criteriaDocs.map((c) => ({
    id: c._id, weight: c.weight, minScore: c.minScore, maxScore: c.maxScore,
  }));
  const coreContestants: CoreContestant[] = contestants.map((k) => ({
    id: k._id, categoryId: k.categoryId, status: k.status,
  }));
  const scores: CoreScoreRow[] = scoreDocs.map((s) => ({
    judgeId: s.judgeId, contestantId: s.contestantId, criterionId: s.criterionId, value: s.value,
  }));
  const input: RoundComputeInput = {
    winner: round.scoringRules?.winner ?? "highest",
    dropHighLow: eactx.event.scoringRules.dropHighLow,
    decimalPrecision: eactx.event.decimalPrecision,
    criteria,
    contestants: coreContestants,
    scores,
    manualTieBreaks: tieBreaks.map((b) => ({
      tiedContestantIds: b.tiedContestantIds, orderedIds: b.orderedIds,
    })),
  };
  const { standings, unresolvedTies } = computeRoundStandings(input);
  const advancementConfig: AdvancementConfig = {
    enabled:
      eactx.event.eliminationEnabled &&
      round.qualifiesToNextRound &&
      round.advancement.mode !== "none",
    mode: round.advancement.mode,
    count: round.advancement.count ?? null,
    percent: round.advancement.percent ?? null,
    allowOverride: round.advancement.allowOverride,
  };
  const overrideDecisions: RoundComputeResult["overrideDecisions"] = [
    ...overrideDocs.map((o) => ({
      contestantId: o.contestantId, action: o.action, createdById: o.createdById,
      source: "persisted" as const,
    })),
    ...extraOverrides.map((o) => ({
      contestantId: o.contestantId, action: o.action, createdById: eactx.user._id,
      source: "correction" as const,
    })),
  ];
  const overrides: AdvancementOverrideRow[] = overrideDecisions.map((o) => ({
    contestantId: o.contestantId, action: o.action,
  }));
  const advancement = applyAdvancement(standings, advancementConfig, overrides);
  const judgeParticipation = judges.map((j) => {
    const own = sheets.filter((s) => s.judgeId === j._id);
    return {
      judgeId: j._id,
      sheetsSubmitted: own.filter((s) => s.status === "submitted" || s.status === "locked").length,
      sheetsTotal: own.length,
    };
  });
  return {
    round, standings, unresolvedTies, advancement, advancementConfig,
    judgeParticipation, tieBreaks, overrides: overrideDocs, overrideDecisions,
  };
}

export function buildSnapshot(result: RoundComputeResult, now: number, decimalPrecision: number) {
  const categoryIds = [...new Set(result.standings.map((s) => s.categoryId))].sort();
  return {
    computedAt: now,
    decimalPrecision,
    categories: categoryIds.map((categoryId) => ({
      categoryId,
      standings: result.standings
        .filter((s) => s.categoryId === categoryId)
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.contestantId < b.contestantId ? -1 : 1))
        .map((s) => ({
          contestantId: s.contestantId,
          status: s.status,
          rank: s.rank,
          roundScore: s.roundScore,
          criterionScores: s.criterionScores.map((cs) => ({
            criterionId: cs.criterionId, avgRaw: cs.avgRaw, contribution: cs.contribution, dropped: cs.dropped,
          })),
          tieResolvedBy: s.tieResolvedBy,
          advanced: result.advancement.get(s.contestantId) ?? null,
        })),
    })),
    judgeParticipation: result.judgeParticipation,
    decisions: {
      tieBreaks: result.tieBreaks.map((b) => ({
        tiedContestantIds: b.tiedContestantIds, orderedIds: b.orderedIds, createdById: b.createdById,
      })),
      advancementOverrides: result.overrideDecisions.map((o) => ({
        contestantId: o.contestantId, action: o.action, createdById: o.createdById, source: o.source,
      })),
    },
  };
}
