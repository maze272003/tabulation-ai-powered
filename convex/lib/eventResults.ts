import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { computeEventFinal, type RoundStandingSummary, type StandingRow } from "./tabulation";

export async function latestVersion(
  ctx: QueryCtx,
  roundId: Id<"rounds">,
): Promise<Doc<"resultVersions"> | null> {
  const versions = await ctx.db
    .query("resultVersions")
    .withIndex("by_round_id", (q) => q.eq("roundId", roundId))
    .collect();
  return versions.reduce<Doc<"resultVersions"> | null>(
    (best, v) => (best === null || v.version > best.version ? v : best),
    null,
  );
}

export async function computeEventResults(
  ctx: QueryCtx,
  event: Doc<"events">,
) {
  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_event_id", (q) => q.eq("eventId", event._id))
    .collect();
  const contestants = await ctx.db
    .query("contestants")
    .withIndex("by_event_id", (q) => q.eq("eventId", event._id))
    .collect();
  const summaries: (RoundStandingSummary & { name: string; version: number })[] = [];
  for (const round of [...rounds].sort((a, b) => a.order - b.order)) {
    if (round.status !== "published") continue;
    const version = await latestVersion(ctx, round._id);
    if (!version) continue;
    const standings: StandingRow[] = version.snapshot.categories.flatMap((category) =>
      category.standings.map((s) => ({
        contestantId: s.contestantId,
        categoryId: category.categoryId,
        status: s.status,
        roundScore: s.roundScore,
        criterionScores: s.criterionScores.map((cs) => ({
          criterionId: cs.criterionId, avgRaw: cs.avgRaw, contribution: cs.contribution, dropped: cs.dropped,
        })),
        rank: s.rank,
        tieResolvedBy: s.tieResolvedBy,
      })),
    );
    const advancement = Object.fromEntries(
      version.snapshot.categories.flatMap((c) =>
        c.standings.map((s) => [s.contestantId, s.advanced]),
      ),
    );
    summaries.push({
      roundId: round._id, order: round.order, weight: round.weight,
      standings, advancement, name: round.name, version: version.version,
    });
  }
  const final = computeEventFinal(summaries, event.decimalPrecision).map((f) => ({
    contestantId: f.contestantId,
    contestantName: contestants.find((k) => k._id === f.contestantId)?.name ?? "",
    categoryId: f.categoryId,
    totalScore: f.totalScore,
    eliminatedInRoundOrder: f.eliminatedInRoundOrder,
    rank: f.rank,
  }));
  return {
    rounds: summaries.map(({ name, version, ...s }) => ({
      roundId: s.roundId, name, order: s.order, weight: s.weight, version,
      standings: s.standings.map((row) => ({
        contestantId: row.contestantId,
        categoryId: row.categoryId,
        contestantName: contestants.find((k) => k._id === row.contestantId)?.name ?? "",
        rank: row.rank, roundScore: row.roundScore,
      })),
    })),
    final,
  };
}
