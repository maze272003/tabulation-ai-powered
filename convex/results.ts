import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventMember, requireEventPermission } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { computeEventFinal, type RoundStandingSummary, type StandingRow } from "./lib/tabulation";

async function requireResultAccess(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string },
) {
  const eactx = await requireEventMember(ctx, args);
  if (!eactx.permissions.has("result.view")) {
    throw appError(ErrorCode.FORBIDDEN, "Missing permission: result.view");
  }
  if (eactx.event.resultVisibility === "private" && !eactx.permissions.has("score.manage")) {
    throw appError(ErrorCode.FORBIDDEN, "Results are private");
  }
  return eactx;
}

async function latestVersion(
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

export const roundResults = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), version: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const versions = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    const chosen = args.version !== undefined
      ? versions.find((v) => v.version === args.version)
      : versions.reduce<Doc<"resultVersions"> | null>((best, v) => (best === null || v.version > best.version ? v : best), null);
    if (!chosen) throw appError(ErrorCode.NOT_FOUND, "Result version not found");
    return {
      version: chosen.version,
      reason: chosen.reason,
      createdAt: chosen.createdAt,
      snapshot: chosen.snapshot,
    };
  },
});

export const listRoundVersions = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const versions = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    return versions
      .sort((a, b) => b.version - a.version)
      .map((v) => ({ version: v.version, createdAt: v.createdAt, reason: v.reason }));
  },
});

export const eventResults = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
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
    const final = computeEventFinal(summaries, eactx.event.decimalPrecision).map((f) => ({
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
          contestantName: contestants.find((k) => k._id === row.contestantId)?.name ?? "",
          rank: row.rank, roundScore: row.roundScore,
        })),
      })),
      final,
    };
  },
});

export const finalizeEvent = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    if (eactx.event.status !== "ready") {
      throw appError(ErrorCode.CONFLICT, "Only ready events can be finalized");
    }
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    if (rounds.length === 0 || rounds.some((r) => r.status !== "published")) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Every round must be published before finalizing");
    }
    await ctx.db.patch(eactx.event._id, { status: "finalized" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.finalized",
      resourceType: "event", resourceId: eactx.event._id,
      before: { status: "ready" }, after: { status: "finalized" },
    });
  },
});
