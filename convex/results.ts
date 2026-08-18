import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventMember, requireEventPermission } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireFeature } from "./lib/entitlements";
import { computeEventResults, latestVersion } from "./lib/eventResults";
import { GEMINI_MODEL, geminiGenerateText } from "./lib/gemini";
import { AI_USAGE_RESOURCES, EXPLANATION_DAILY_LIMIT, consumeAiQuota } from "./lib/aiUsage";

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

const EXPLAINER_SYSTEM_INSTRUCTION = [
  "You explain judged-event results to organizers and claimants.",
  "Use ONLY the facts provided. Never speculate about judges or contestants beyond the data.",
  "Explain in 2-4 short sentences: the score, what drove it (criteria weights, dropped high/low marks,",
  "tie-breaks, overrides), and why the rank came out as it did. Plain, neutral, factual tone.",
].join("\n");

export const explainContext = internalQuery({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), contestantId: v.id("contestants") },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const version = await latestVersion(ctx, args.roundId);
    if (!version) throw appError(ErrorCode.NOT_FOUND, "No published results for this round");

    const contestant = await ctx.db.get(args.contestantId);
    if (!contestant || contestant.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Contestant not found");

    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    const criterionNames = Object.fromEntries(criteria.map((c) => [c._id, c.name]));

    const standing = version.snapshot.categories
      .flatMap((category) => category.standings)
      .find((s) => s.contestantId === args.contestantId);
    if (!standing) throw appError(ErrorCode.NOT_FOUND, "Contestant has no standing in this round");

    const tieBreak = version.snapshot.decisions.tieBreaks.find((tb) =>
      tb.tiedContestantIds.includes(args.contestantId),
    );
    const override = version.snapshot.decisions.advancementOverrides.find(
      (o) => o.contestantId === args.contestantId,
    );

    // The facts slice: only what a result.viewer can already see, grounded in the snapshot.
    const facts = {
      round: round.name,
      contestant: { number: contestant.number, name: contestant.name },
      rank: standing.rank,
      roundScore: standing.roundScore,
      status: standing.status,
      advanced: standing.advanced,
      tieResolvedBy: standing.tieResolvedBy,
      criterionScores: standing.criterionScores.map((cs) => ({
        criterion: criterionNames[cs.criterionId] ?? cs.criterionId,
        averageRawScore: cs.avgRaw,
        weightedContribution: cs.contribution,
        droppedHighLow: cs.dropped.map((d) => ({ value: d.value })),
      })),
      manualTieBreak: tieBreak ? { contestantsInvolved: tieBreak.tiedContestantIds.length } : null,
      advancementOverride: override ? { action: override.action } : null,
      judgesParticipating: version.snapshot.judgeParticipation.filter((jp) => jp.sheetsTotal > 0).length,
    };

    // .first() rather than .unique(): concurrent stores on a fresh version can
    // leave duplicate rows; reads must degrade to first-wins, not throw.
    const cached = await ctx.db
      .query("resultExplanations")
      .withIndex("by_result_version_and_contestant", (q) =>
        q.eq("resultVersionId", version._id).eq("contestantId", args.contestantId))
      .first();

    return {
      versionId: version._id as Id<"resultVersions">,
      orgId: eactx.org._id,
      userId: eactx.user._id,
      facts,
      cachedExplanation: cached?.explanation ?? null,
    };
  },
});

export const consumeExplanationQuota = internalMutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    await consumeAiQuota(ctx, eactx.org._id, AI_USAGE_RESOURCES.explanations, EXPLANATION_DAILY_LIMIT);
  },
});

export const storeExplanation = internalMutation({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    roundId: v.id("rounds"),
    contestantId: v.id("contestants"),
    explanation: v.string(),
    model: v.string(),
    versionId: v.optional(v.id("resultVersions")),
  },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    // Key the row to the version the action read (args.versionId) instead of
    // re-reading the latest: a correction landing between context and store
    // would otherwise attach the explanation to a version it was not built
    // from. When omitted, fall back to the round's latest version.
    const version = args.versionId !== undefined
      ? await ctx.db.get(args.versionId)
      : await latestVersion(ctx, args.roundId);
    if (!version || version.roundId !== args.roundId) {
      throw appError(ErrorCode.NOT_FOUND, "No published results for this round");
    }
    // .first() rather than .unique(): two concurrent explains on a fresh
    // version can both miss and insert; duplicates then degrade to
    // first-wins instead of throwing on every later read.
    const existing = await ctx.db
      .query("resultExplanations")
      .withIndex("by_result_version_and_contestant", (q) =>
        q.eq("resultVersionId", version._id).eq("contestantId", args.contestantId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { explanation: args.explanation, model: args.model });
      return { resultExplanationId: existing._id };
    }
    const resultExplanationId = await ctx.db.insert("resultExplanations", {
      resultVersionId: version._id,
      eventId: eactx.event._id,
      contestantId: args.contestantId,
      explanation: args.explanation,
      model: args.model,
      createdById: eactx.user._id,
      createdAt: Date.now(),
    });
    return { resultExplanationId };
  },
});

export const explain = action({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), contestantId: v.id("contestants") },
  handler: async (ctx, args): Promise<{ explanation: string; cached: boolean; facts: unknown }> => {
    const context = await ctx.runQuery(internal.results.explainContext, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, roundId: args.roundId, contestantId: args.contestantId,
    });
    if (context.cachedExplanation !== null) {
      return { explanation: context.cachedExplanation, cached: true, facts: context.facts };
    }
    // Quota is consumed only for cache misses so cached reads stay free.
    await ctx.runMutation(internal.results.consumeExplanationQuota, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug,
    });
    const explanation = await geminiGenerateText({
      systemInstruction: EXPLAINER_SYSTEM_INSTRUCTION,
      prompt: `Explain this contestant's round result using only these facts:\n${JSON.stringify(context.facts, null, 2)}`,
    });
    await ctx.runMutation(internal.results.storeExplanation, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, roundId: args.roundId,
      contestantId: args.contestantId, explanation, model: GEMINI_MODEL,
      versionId: context.versionId,
    });
    return { explanation, cached: false, facts: context.facts };
  },
});

