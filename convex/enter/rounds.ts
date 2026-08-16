import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "../lib/errors";
import { requireEventSession, touchSession } from "../lib/eventSession";
import { loadRound } from "../lib/eventAuthz";
import { buildSnapshot, loadRoundCompute } from "../lib/roundCompute";
import { writeAudit } from "../lib/audit";
import { latestVersion } from "../lib/eventResults";

export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const criteria = await ctx.db
      .query("criteria")
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    return [...rounds]
      .sort((a, b) => a.order - b.order)
      .map((r) => ({
        _id: r._id,
        name: r.name,
        order: r.order,
        weight: r.weight,
        status: r.status,
        qualifiesToNextRound: r.qualifiesToNextRound,
        advancement: r.advancement,
        criteriaCount: criteria.filter((c) => c.roundId === r._id).length,
        contestantCount: contestants.filter((c) => c.status === "active").length,
      }));
  },
});

export const roundMonitor = query({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const round = await loadRound(ctx, sctx, args.roundId);
    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", sctx.event._id).eq("kind", "judge"))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id", (q) =>
        q.eq("eventId", sctx.event._id).eq("roundId", round._id))
      .collect();
    const judgesOut: { judgeId: Id<"eventAccounts">; name: string }[] = judges.map((j) => ({
      judgeId: j._id,
      name: j.displayName,
    }));
    return {
      roundStatus: round.status,
      judges: judgesOut,
      contestants: contestants.map((k) => ({ contestantId: k._id, name: k.name, number: k.number })),
      sheets: sheets.map((s) => ({ judgeId: s.judgeId, contestantId: s.contestantId, status: s.status })),
    };
  },
});

export const closeRound = mutation({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const round = await loadRound(ctx, sctx, args.roundId);
    if (round.status !== "open") throw appError(ErrorCode.CONFLICT, "Only open rounds can be closed");
    await ctx.db.patch(round._id, { status: "closed" });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.closed",
      resourceType: "round", resourceId: round._id,
      before: { status: "open" }, after: { status: "closed", closedByStaff: sctx.account.displayName },
    });
  },
});

export const reopenRound = mutation({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const round = await loadRound(ctx, sctx, args.roundId);
    if (round.status !== "closed") throw appError(ErrorCode.CONFLICT, "Only closed rounds can be reopened");
    await ctx.db.patch(round._id, { status: "open" });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.reopened",
      resourceType: "round", resourceId: round._id,
      before: { status: "closed" }, after: { status: "open", reopenedByStaff: sctx.account.displayName },
    });
  },
});

export const roundReview = query({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const result = await loadRoundCompute(ctx, sctx, args.roundId);
    // Published rounds stay viewable read-only; every editing mutation
    // (tie break, override, publish) independently requires "closed".
    if (result.round.status !== "closed" && result.round.status !== "published") {
      throw appError(ErrorCode.CONFLICT, "Close the round before review");
    }
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const nameOf = (id: Id<"contestants">) => contestants.find((k) => k._id === id)?.name ?? "";
    return {
      round: {
        name: result.round.name,
        status: result.round.status,
        advancement: result.round.advancement,
        qualifiesToNextRound: result.round.qualifiesToNextRound,
      },
      eliminationEnabled: sctx.event.eliminationEnabled,
      standings: result.standings.map((s) => ({
        contestantId: s.contestantId,
        contestantName: nameOf(s.contestantId),
        categoryId: s.categoryId,
        status: s.status,
        roundScore: s.roundScore,
        criterionScores: s.criterionScores,
        rank: s.rank,
        tieResolvedBy: s.tieResolvedBy,
        advancement: result.advancement.get(s.contestantId) ?? null,
      })),
      unresolvedTies: result.unresolvedTies.map((u) => ({
        categoryId: u.categoryId,
        contestantIds: u.contestantIds,
        names: u.contestantIds.map(nameOf),
      })),
      tieBreaks: result.tieBreaks.map((tb) => ({
        _id: tb._id,
        orderedNames: tb.orderedIds.map(nameOf),
      })),
      overrides: result.overrides,
    };
  },
});

export const addTieBreak = mutation({
  args: {
    sessionToken: v.string(), roundId: v.id("rounds"),
    tiedContestantIds: v.array(v.id("contestants")),
    orderedIds: v.array(v.id("contestants")),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const round = await loadRound(ctx, sctx, args.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Tie breaks are only allowed on closed rounds");
    }
    const tied = [...new Set(args.tiedContestantIds)];
    if (tied.length < 2 || tied.length !== args.orderedIds.length || tied.length !== args.tiedContestantIds.length) {
      throw appError(ErrorCode.VALIDATION_ERROR, "A tie break needs at least 2 distinct contestants and a full ordering");
    }
    const ordered = [...new Set(args.orderedIds)];
    if (ordered.length !== tied.length || tied.some((id) => !ordered.includes(id))) {
      throw appError(ErrorCode.VALIDATION_ERROR, "orderedIds must be a permutation of tiedContestantIds");
    }
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    if (tied.some((id) => !contestants.some((k) => k._id === id))) {
      throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    }
    const existingBreaks = await ctx.db
      .query("tieBreaks")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    if (existingBreaks.some((b) => b.tiedContestantIds.some((id) => tied.includes(id)))) {
      throw appError(ErrorCode.CONFLICT, "Remove the existing tie break covering these contestants first");
    }
    const id = await ctx.db.insert("tieBreaks", {
      eventId: sctx.event._id,
      roundId: round._id,
      tiedContestantIds: tied,
      orderedIds: args.orderedIds,
      createdById: null,
      createdByAccountId: sctx.account._id,
      createdAt: Date.now(),
    });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.tiebreak.added",
      resourceType: "tieBreak", resourceId: id, after: { roundId: round._id, contestants: tied.length, addedByStaff: sctx.account.displayName },
    });
  },
});

export const removeTieBreak = mutation({
  args: { sessionToken: v.string(), tieBreakId: v.id("tieBreaks") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const tieBreak = await ctx.db.get(args.tieBreakId);
    if (!tieBreak || tieBreak.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Tie break not found");
    }
    const round = await loadRound(ctx, sctx, tieBreak.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Tie breaks are only editable on closed rounds");
    }
    await ctx.db.delete(args.tieBreakId);
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.tiebreak.removed",
      resourceType: "tieBreak", resourceId: args.tieBreakId,
    });
  },
});

export const addAdvancementOverride = mutation({
  args: {
    sessionToken: v.string(), roundId: v.id("rounds"),
    contestantId: v.id("contestants"),
    action: v.union(v.literal("force_advance"), v.literal("force_cut")),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const round = await loadRound(ctx, sctx, args.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Overrides are only allowed on closed rounds");
    }
    if (!round.advancement.allowOverride) {
      throw appError(ErrorCode.VALIDATION_ERROR, "This round does not allow advancement overrides");
    }
    if (
      !sctx.event.eliminationEnabled ||
      !round.qualifiesToNextRound ||
      round.advancement.mode === "none"
    ) {
      throw appError(ErrorCode.VALIDATION_ERROR, "This round has no active advancement rule");
    }
    const contestant = await ctx.db.get(args.contestantId);
    if (!contestant || contestant.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    }
    const existing = await ctx.db
      .query("advancementOverrides")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    if (existing.some((o) => o.contestantId === args.contestantId)) {
      throw appError(ErrorCode.CONFLICT, "An override already exists for this contestant");
    }
    const id = await ctx.db.insert("advancementOverrides", {
      eventId: sctx.event._id,
      roundId: round._id,
      contestantId: args.contestantId,
      action: args.action,
      createdById: null,
      createdByAccountId: sctx.account._id,
      createdAt: Date.now(),
    });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.advancement_override.added",
      resourceType: "advancementOverride", resourceId: id,
      after: { roundId: round._id, contestantId: args.contestantId, action: args.action, addedByStaff: sctx.account.displayName },
    });
  },
});

export const removeAdvancementOverride = mutation({
  args: { sessionToken: v.string(), overrideId: v.id("advancementOverrides") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const override = await ctx.db.get(args.overrideId);
    if (!override || override.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Override not found");
    }
    const round = await loadRound(ctx, sctx, override.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Overrides are only editable on closed rounds");
    }
    await ctx.db.delete(args.overrideId);
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.advancement_override.removed",
      resourceType: "advancementOverride", resourceId: args.overrideId,
    });
  },
});

export const publishRound = mutation({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const result = await loadRoundCompute(ctx, sctx, args.roundId);
    if (result.round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Close the round before publishing");
    }
    if (result.unresolvedTies.length > 0) {
      throw appError(ErrorCode.TIES_UNRESOLVED, "Break unresolved ties before publishing", {
        unresolvedTies: result.unresolvedTies,
      });
    }
    const existing = await latestVersion(ctx, result.round._id);
    if (existing) {
      throw appError(ErrorCode.CONFLICT, "Round results already published; use correctResults to amend");
    }
    const now = Date.now();
    const snapshot = buildSnapshot(result, now, sctx.event.decimalPrecision);
    const versionId = await ctx.db.insert("resultVersions", {
      eventId: sctx.event._id,
      roundId: result.round._id,
      version: 1,
      snapshot,
      createdById: null,
      createdByAccountId: sctx.account._id,
      createdAt: now,
    });
    await ctx.db.patch(result.round._id, { status: "published" });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.published",
      resourceType: "resultVersion", resourceId: versionId,
      after: { roundId: result.round._id, version: 1, publishedByStaff: sctx.account.displayName },
    });
  },
});

export const correctResults = mutation({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
    reason: v.string(),
    overrides: v.optional(v.array(v.object({
      contestantId: v.id("contestants"),
      action: v.union(v.literal("force_advance"), v.literal("force_cut")),
    }))),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    if (sctx.event.status === "finalized" || sctx.event.status === "archived") {
      throw appError(ErrorCode.CONFLICT, "Finalized events cannot be amended");
    }
    const reason = args.reason.trim();
    if (!reason) throw appError(ErrorCode.VALIDATION_ERROR, "A non-empty correction reason is required");
    const round = await loadRound(ctx, sctx, args.roundId);
    if (round.status !== "published") {
      throw appError(ErrorCode.CONFLICT, "Only published rounds can have corrections");
    }
    const latest = await latestVersion(ctx, round._id);
    if (!latest) throw appError(ErrorCode.NOT_FOUND, "No published version to correct");
    const result = await loadRoundCompute(ctx, sctx, args.roundId, args.overrides ?? []);
    if (result.unresolvedTies.length > 0) {
      throw appError(ErrorCode.TIES_UNRESOLVED, "Break unresolved ties before publishing correction", {
        unresolvedTies: result.unresolvedTies,
      });
    }
    const nextVersion = latest.version + 1;
    const now = Date.now();
    const snapshot = buildSnapshot(result, now, sctx.event.decimalPrecision);
    const versionId = await ctx.db.insert("resultVersions", {
      eventId: sctx.event._id,
      roundId: round._id,
      version: nextVersion,
      snapshot,
      createdById: null,
      createdByAccountId: sctx.account._id,
      createdAt: now,
      reason,
    });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.results_corrected",
      resourceType: "resultVersion", resourceId: versionId,
      after: { roundId: round._id, version: nextVersion, reason, correctedByStaff: sctx.account.displayName },
    });
  },
});
