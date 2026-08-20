import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { loadRound, requireReadyEvent } from "./lib/eventAuthz";
import { buildSnapshot, loadRoundCompute } from "./lib/roundCompute";
import { writeAudit } from "./lib/audit";

export const roundMonitor = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eactx.event._id).eq("kind", "judge"))
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
    const judgesOut: { judgeId: Id<"eventAccounts">; name: string }[] = [];
    for (const j of judges) {
      judgesOut.push({ judgeId: j._id, name: j.displayName });
    }
    return {
      roundStatus: round.status,
      judges: judgesOut,
      contestants: contestants.map((k) => ({ contestantId: k._id, name: k.name, number: k.number })),
      sheets: sheets.map((s) => ({ judgeId: s.judgeId, contestantId: s.contestantId, status: s.status })),
    };
  },
});

export const closeRound = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "open") {
      throw appError(ErrorCode.CONFLICT, "Only open rounds can be closed");
    }
    await ctx.db.patch(round._id, { status: "closed" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.closed",
      resourceType: "round", resourceId: round._id,
      before: { status: "open" }, after: { status: "closed" },
    });
  },
});

export const reopenRound = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Only closed rounds can be reopened");
    }
    await ctx.db.patch(round._id, { status: "open" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.reopened",
      resourceType: "round", resourceId: round._id,
      before: { status: "closed" }, after: { status: "open" },
    });
  },
});

export const roundReview = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const result = await loadRoundCompute(ctx, eactx, args.roundId);
    if (result.round.status !== "closed" && result.round.status !== "published") {
      return null;
    }
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const nameOf = (id: Id<"contestants">) => contestants.find((k) => k._id === id)?.name ?? "";
    return {
      round: {
        name: result.round.name,
        status: result.round.status,
        advancement: result.round.advancement,
        qualifiesToNextRound: result.round.qualifiesToNextRound,
      },
      eliminationEnabled: eactx.event.eliminationEnabled,
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
      tieBreaks: result.tieBreaks,
      overrides: result.overrides,
    };
  },
});

export const addTieBreak = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"),
    tiedContestantIds: v.array(v.id("contestants")),
    orderedIds: v.array(v.id("contestants")),
  },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
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
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
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
      eventId: eactx.event._id,
      roundId: round._id,
      tiedContestantIds: tied,
      orderedIds: args.orderedIds,
      createdById: eactx.user._id,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.tiebreak.added",
      resourceType: "tieBreak", resourceId: id, after: { roundId: round._id, contestants: tied.length },
    });
  },
});

export const removeTieBreak = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), tieBreakId: v.id("tieBreaks") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const tieBreak = await ctx.db.get(args.tieBreakId);
    if (!tieBreak || tieBreak.eventId !== eactx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Tie break not found");
    }
    const round = await loadRound(ctx, eactx, tieBreak.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Tie breaks are only editable on closed rounds");
    }
    await ctx.db.delete(args.tieBreakId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.tiebreak.removed",
      resourceType: "tieBreak", resourceId: args.tieBreakId,
    });
  },
});

export const addAdvancementOverride = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"),
    contestantId: v.id("contestants"),
    action: v.union(v.literal("force_advance"), v.literal("force_cut")),
  },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Overrides are only allowed on closed rounds");
    }
    if (!round.advancement.allowOverride) {
      throw appError(ErrorCode.VALIDATION_ERROR, "This round does not allow advancement overrides");
    }
    if (
      !eactx.event.eliminationEnabled ||
      !round.qualifiesToNextRound ||
      round.advancement.mode === "none"
    ) {
      throw appError(ErrorCode.VALIDATION_ERROR, "This round has no active advancement rule");
    }
    const contestant = await ctx.db.get(args.contestantId);
    if (!contestant || contestant.eventId !== eactx.event._id) {
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
      eventId: eactx.event._id,
      roundId: round._id,
      contestantId: args.contestantId,
      action: args.action,
      createdById: eactx.user._id,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.advancement_override.added",
      resourceType: "advancementOverride", resourceId: id,
      after: { roundId: round._id, contestantId: args.contestantId, action: args.action },
    });
  },
});

export const removeAdvancementOverride = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), overrideId: v.id("advancementOverrides") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const override = await ctx.db.get(args.overrideId);
    if (!override || override.eventId !== eactx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Override not found");
    }
    const round = await loadRound(ctx, eactx, override.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Overrides are only editable on closed rounds");
    }
    await ctx.db.delete(args.overrideId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.advancement_override.removed",
      resourceType: "advancementOverride", resourceId: args.overrideId,
    });
  },
});

export const publishRound = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const result = await loadRoundCompute(ctx, eactx, args.roundId);
    if (result.round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Only closed rounds can be published");
    }
    if (result.unresolvedTies.length > 0) {
      throw appError(ErrorCode.TIES_UNRESOLVED, "Resolve all ties before publishing", {
        ties: result.unresolvedTies,
      });
    }
    const existing = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    // OCC serializes this allocation: a concurrent insert into the read by_round_id range forces a retry, so duplicate versions cannot commit.
    const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const now = Date.now();
    await ctx.db.insert("resultVersions", {
      eventId: eactx.event._id,
      roundId: args.roundId,
      version,
      snapshot: buildSnapshot(result, now, eactx.event.decimalPrecision),
      createdById: eactx.user._id,
      createdAt: now,
    });
    await ctx.db.patch(args.roundId, { status: "published" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.published",
      resourceType: "round", resourceId: args.roundId,
      before: { status: "closed" }, after: { status: "published", version },
    });
  },
});

export const correctResults = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), reason: v.string(),
    overrides: v.optional(v.array(v.object({
      contestantId: v.id("contestants"),
      action: v.union(v.literal("force_advance"), v.literal("force_cut")),
    }))),
  },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    if (!args.reason.trim()) {
      throw appError(ErrorCode.VALIDATION_ERROR, "A correction reason is required");
    }
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const extra = (args.overrides ?? []).filter((o) => {
      if (!contestants.some((k) => k._id === o.contestantId)) {
        throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
      }
      return true;
    });
    const result = await loadRoundCompute(ctx, eactx, args.roundId, extra);
    if (result.round.status !== "published") {
      throw appError(ErrorCode.CONFLICT, "Only published rounds can be corrected");
    }
    if (result.unresolvedTies.length > 0) {
      throw appError(ErrorCode.TIES_UNRESOLVED, "Resolve all ties before correcting", {
        ties: result.unresolvedTies,
      });
    }
    await ctx.db.patch(args.roundId, {});
    const existing = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    // OCC serializes this allocation: a concurrent insert into the read by_round_id range forces a retry, so duplicate versions cannot commit.
    const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const now = Date.now();
    await ctx.db.insert("resultVersions", {
      eventId: eactx.event._id,
      roundId: args.roundId,
      version,
      snapshot: buildSnapshot(result, now, eactx.event.decimalPrecision),
      createdById: eactx.user._id,
      createdAt: now,
      reason: args.reason.trim(),
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.corrected",
      resourceType: "resultVersion", resourceId: args.roundId,
      after: { version, reason: args.reason.trim() },
    });
  },
});

export const roundTelemetry = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eactx.event._id).eq("kind", "judge"))
      .collect();
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id", (q) =>
        q.eq("eventId", eactx.event._id).eq("roundId", round._id))
      .collect();

    const totalSheets = sheets.length;
    const submittedSheets = sheets.filter((s) => s.status === "submitted" || s.status === "locked").length;
    const inProgressSheets = sheets.filter((s) => s.status === "in_progress").length;
    const notStartedSheets = sheets.filter((s) => s.status === "not_started").length;
    const completionPercent = totalSheets > 0 ? Math.round((submittedSheets / totalSheets) * 100) : 0;
    const isAllSubmitted = totalSheets > 0 && submittedSheets === totalSheets;

    const judgeStats = judges.map((j) => {
      const jSheets = sheets.filter((s) => s.judgeId === j._id);
      const jSubmitted = jSheets.filter((s) => s.status === "submitted" || s.status === "locked").length;
      return {
        judgeId: j._id,
        name: j.displayName,
        total: jSheets.length,
        submitted: jSubmitted,
        isComplete: jSheets.length > 0 && jSubmitted === jSheets.length,
      };
    });

    const laggingJudges = judgeStats.filter((j) => !j.isComplete);

    return {
      roundId: round._id,
      roundName: round.name,
      roundStatus: round.status,
      totalSheets,
      submittedSheets,
      inProgressSheets,
      notStartedSheets,
      completionPercent,
      isAllSubmitted,
      judgeStats,
      laggingJudges,
    };
  },
});

export const autoAdvanceNextRound = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "published") {
      throw appError(ErrorCode.CONFLICT, "Only published rounds can advance contestants");
    }
    const allRounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const sortedRounds = [...allRounds].sort((a, b) => a.order - b.order);
    const nextRound = sortedRounds.find((r) => r.order > round.order);
    if (!nextRound) {
      return { advanced: 0, nextRoundId: null, message: "This was the final round." };
    }

    const result = await loadRoundCompute(ctx, eactx, round._id);
    const advancedContestantIds = new Set<Id<"contestants">>();
    for (const [cid, isAdvancing] of result.advancement.entries()) {
      if (isAdvancing === true || (!result.advancementConfig.enabled && isAdvancing !== false)) {
        advancedContestantIds.add(cid);
      }
    }

    // Get judges
    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eactx.event._id).eq("kind", "judge"))
      .collect();
    const activeJudges = judges.filter((j) => j.status === "active");

    // Clean up or ensure score sheets for next round
    const existingNextSheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id", (q) =>
        q.eq("eventId", eactx.event._id).eq("roundId", nextRound._id))
      .collect();

    // Remove sheets for contestants that did not advance
    let removed = 0;
    for (const sheet of existingNextSheets) {
      if (!advancedContestantIds.has(sheet.contestantId)) {
        await ctx.db.delete(sheet._id);
        removed++;
      }
    }

    // Ensure sheets exist for all advancing contestants and active judges
    let created = 0;
    for (const judge of activeJudges) {
      for (const contestantId of advancedContestantIds) {
        const hasSheet = existingNextSheets.some(
          (s) => s.judgeId === judge._id && s.contestantId === contestantId
        );
        if (!hasSheet) {
          await ctx.db.insert("scoreSheets", {
            eventId: eactx.event._id,
            roundId: nextRound._id,
            judgeId: judge._id,
            contestantId,
            status: "not_started",
          });
          created++;
        }
      }
    }

    // Optionally set next round to open if it was closed
    if (nextRound.status === "closed") {
      await ctx.db.patch(nextRound._id, { status: "open" });
    }

    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.advanced_next",
      resourceType: "round", resourceId: nextRound._id,
      after: {
        fromRoundId: round._id,
        nextRoundId: nextRound._id,
        advancedContestants: advancedContestantIds.size,
        sheetsCreated: created,
        sheetsPruned: removed,
      },
    });

    return {
      advanced: advancedContestantIds.size,
      nextRoundId: nextRound._id,
      nextRoundName: nextRound.name,
      message: `Advanced ${advancedContestantIds.size} contestants to ${nextRound.name}.`,
    };
  },
});
