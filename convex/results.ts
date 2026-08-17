import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventMember, requireEventPermission } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireFeature } from "./lib/entitlements";
import { computeEventResults, latestVersion } from "./lib/eventResults";

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
    return await computeEventResults(ctx, eactx.event);
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

export const exportData = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    await requireFeature(ctx, eactx.subscription, "canExportReports");

    const results = await computeEventResults(ctx, eactx.event);
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const contestantById = new Map(contestants.map((contestant) => [contestant._id, contestant]));
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const categoryNames = new Map(categories.map((category) => [category._id, category.name]));

    const standings = results.final.map((row) => ({
      category: categoryNames.get(row.categoryId) ?? "",
      rank: row.rank,
      number: contestantById.get(row.contestantId)?.number ?? 0,
      name: row.contestantName,
      roundScores: results.rounds.map((round) => ({
        round: round.name,
        score: round.standings.find((s) => s.contestantId === row.contestantId)?.roundScore ?? null,
      })),
      total: row.totalScore,
      eliminatedInRoundOrder: row.eliminatedInRoundOrder,
    }));

    // Per-judge scorecards from raw scores, with dropped marks cross-referenced
    // from the published snapshots.
    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eactx.event._id).eq("kind", "judge"))
      .collect();
    const judgeNames = new Map(judges.map((judge) => [judge._id, judge.displayName]));

    const rounds = (await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect())
      .filter((round) => round.status === "published")
      .sort((a, b) => a.order - b.order);

    const criteriaNames = new Map<string, string>();
    const droppedJudgeMarks = new Set<string>();
    for (const round of rounds) {
      const roundCriteria = await ctx.db
        .query("criteria")
        .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
        .collect();
      for (const criterion of roundCriteria) criteriaNames.set(criterion._id, criterion.name);

      const version = await latestVersion(ctx, round._id);
      if (!version) continue;
      for (const category of version.snapshot.categories) {
        for (const standing of category.standings) {
          for (const criterionScore of standing.criterionScores) {
            for (const dropped of criterionScore.dropped) {
              droppedJudgeMarks.add(`${standing.contestantId}:${criterionScore.criterionId}:${dropped.judgeId}`);
            }
          }
        }
      }
    }

    const scorecards: {
      round: string; judge: string; number: number; contestant: string;
      criterion: string; value: number; dropped: boolean;
    }[] = [];
    for (const round of rounds) {
      const scores = await ctx.db
        .query("scores")
        .withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", eactx.event._id).eq("roundId", round._id))
        .collect();
      for (const score of scores) {
        const contestant = contestantById.get(score.contestantId);
        scorecards.push({
          round: round.name,
          judge: judgeNames.get(score.judgeId) ?? "",
          number: contestant?.number ?? 0,
          contestant: contestant?.name ?? "",
          criterion: criteriaNames.get(score.criterionId) ?? "",
          value: score.value,
          dropped: droppedJudgeMarks.has(`${score.contestantId}:${score.criterionId}:${score.judgeId}`),
        });
      }
    }

    return {
      event: { name: eactx.event.name, decimalPrecision: eactx.event.decimalPrecision },
      standings,
      scorecards,
    };
  },
});

