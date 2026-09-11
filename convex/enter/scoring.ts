import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "../lib/errors";
import { requireEventSession, touchSession } from "../lib/eventSession";
import { checkValue } from "../lib/sheetValidation";
import { maybeAutoCloseRound } from "../lib/roundAutomation";
import { writeAudit } from "../lib/audit";

async function loadOwnSheet(
  ctx: QueryCtx,
  args: { sessionToken: string; sheetId: Id<"scoreSheets"> },
) {
  const sctx = await requireEventSession(ctx, {
    sessionToken: args.sessionToken, kind: "judge", requireReadyEvent: true,
  });
  const sheet = await ctx.db.get(args.sheetId);
  if (!sheet || sheet.eventId !== sctx.event._id || sheet.judgeId !== sctx.account._id) {
    throw appError(ErrorCode.NOT_FOUND, "Score sheet not found");
  }
  const round = await ctx.db.get(sheet.roundId);
  if (!round || round.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
  if (round.status !== "open") throw appError(ErrorCode.CONFLICT, "Round is not open for scoring");
  return { sctx, sheet, round };
}

export const myAssignments = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "judge",
    });
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const out: {
      roundId: Id<"rounds">;
      name: string;
      order: number;
      status: Doc<"rounds">["status"];
      sheets: { sheetId: Id<"scoreSheets">; contestantId: Id<"contestants">; contestantName: string; contestantNumber: number; status: Doc<"scoreSheets">["status"] }[];
    }[] = [];
    for (const round of [...rounds].sort((a, b) => a.order - b.order)) {
      const sheets = await ctx.db
        .query("scoreSheets")
        .withIndex("by_judge_id_and_round_id", (q) => q.eq("judgeId", sctx.account._id).eq("roundId", round._id))
        .collect();
      out.push({
        roundId: round._id,
        name: round.name,
        order: round.order,
        status: round.status,
        sheets: sheets.map((s) => {
          const contestant = contestants.find((k) => k._id === s.contestantId);
          return {
            sheetId: s._id,
            contestantId: s.contestantId,
            contestantName: contestant?.name ?? "",
            contestantNumber: contestant?.number ?? 0,
            status: s.status,
          };
        }),
      });
    }
    return { judgeId: sctx.account._id, rounds: out };
  },
});

export const sheetDetail = query({
  args: {
    sessionToken: v.string(),
    sheetId: v.optional(v.id("scoreSheets")),
    roundId: v.optional(v.id("rounds")),
    contestantId: v.optional(v.id("contestants")),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
      kind: "judge",
    });

    let roundId: Id<"rounds">;
    let contestantId: Id<"contestants">;
    let sheet: Doc<"scoreSheets"> | null = null;

    if (args.sheetId) {
      const s = await ctx.db.get(args.sheetId);
      if (!s || s.eventId !== sctx.event._id || s.judgeId !== sctx.account._id) {
        throw appError(ErrorCode.NOT_FOUND, "Score sheet not found");
      }
      sheet = s;
      roundId = s.roundId;
      contestantId = s.contestantId;
    } else if (args.roundId && args.contestantId) {
      roundId = args.roundId;
      contestantId = args.contestantId;
      const sheets = await ctx.db
        .query("scoreSheets")
        .withIndex("by_event_id_and_round_id_and_contestant_id", (q) =>
          q.eq("eventId", sctx.event._id).eq("roundId", roundId).eq("contestantId", contestantId),
        )
        .collect();
      sheet = sheets.find((s) => s.judgeId === sctx.account._id) ?? null;
    } else {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        "Either sheetId or both roundId and contestantId must be provided",
      );
    }

    const round = await ctx.db.get(roundId);
    if (!round || round.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const contestant = await ctx.db.get(contestantId);
    if (!contestant || contestant.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    }
    const category = contestant.categoryId ? await ctx.db.get(contestant.categoryId) : null;
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();

    const isImmutable =
      sheet?.status === "submitted" ||
      sheet?.status === "locked" ||
      round.status === "closed" ||
      round.status === "published" ||
      sctx.event.status === "finalized" ||
      sctx.event.status === "archived";

    const scores = sheet && (sheet.status === "submitted" || sheet.status === "locked")
      ? await ctx.db
          .query("scores")
          .withIndex("by_sheet_id", (q) => q.eq("sheetId", sheet._id))
          .collect()
      : undefined;

    const effectiveCriteria = criteria.map((c) => ({
      ...c,
      decimalPrecision: Math.max(c.decimalPrecision ?? 0, sctx.event.decimalPrecision ?? 0),
    }));

    return {
      sheet,
      round,
      contestant,
      category,
      criteria: [...effectiveCriteria].sort((a, b) => a.order - b.order),
      scores,
      isImmutable,
    };
  },
});

export const saveDraft = mutation({
  args: {
    sessionToken: v.string(), sheetId: v.id("scoreSheets"),
    draftValues: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const { sctx, sheet, round } = await loadOwnSheet(ctx, args);
    if (sheet.status !== "not_started" && sheet.status !== "in_progress") {
      throw appError(ErrorCode.CONFLICT, "Score sheet is already submitted");
    }
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    for (const [criterionId, value] of Object.entries(args.draftValues)) {
      const criterion = criteria.find((c) => c._id === criterionId);
      if (!criterion) throw appError(ErrorCode.VALIDATION_ERROR, "Unknown criterion in draft");
      const problem = checkValue(criterion, value, sctx.event.decimalPrecision);
      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
    }
    await ctx.db.patch(args.sheetId, { status: "in_progress", draftValues: args.draftValues });
    await touchSession(ctx, sctx.session._id);
  },
});

export const submitSheet = mutation({
  args: {
    sessionToken: v.string(), sheetId: v.id("scoreSheets"),
    values: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const { sctx, sheet, round } = await loadOwnSheet(ctx, args);
    if (sheet.status !== "not_started" && sheet.status !== "in_progress") {
      throw appError(ErrorCode.CONFLICT, "Score sheet is already submitted");
    }
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    const assignments = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_judge_id", (q) => q.eq("judgeId", sctx.account._id))
      .collect();
    const scoped = assignments.filter((a) => a.roundId === undefined || a.roundId === round._id);
    const scopedCriterionIds = scoped
      .filter((a) => a.criterionId !== undefined)
      .map((a) => a.criterionId!);
    const required = scopedCriterionIds.length > 0
      ? criteria.filter((c) => scopedCriterionIds.includes(c._id))
      : criteria;
    for (const criterion of required) {
      const value = args.values[criterion._id];
      if (value === undefined) {
        throw appError(ErrorCode.VALIDATION_ERROR, `${criterion.name} is missing`);
      }
      const problem = checkValue(criterion, value, sctx.event.decimalPrecision);
      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
    }
    const now = Date.now();
    for (const criterion of required) {
      await ctx.db.insert("scores", {
        sheetId: sheet._id,
        eventId: sctx.event._id,
        roundId: round._id,
        judgeId: sctx.account._id,
        contestantId: sheet.contestantId,
        criterionId: criterion._id,
        value: args.values[criterion._id],
        submittedAt: now,
        submittedByAccountId: sctx.account._id,
      });
    }
    await ctx.db.patch(sheet._id, { status: "submitted", draftValues: undefined });

    // Invalidate any existing signature for this judge and round
    const existingSignatures = await ctx.db
      .query("roundSignatures")
      .withIndex("by_round_and_actor", (q) =>
        q.eq("roundId", round._id).eq("actorId", sctx.account._id),
      )
      .collect();
    for (const sig of existingSignatures) {
      if (sig.status === "valid") {
        await ctx.db.patch(sig._id, { status: "stale" });
      }
    }

    await maybeAutoCloseRound(ctx, { roundId: round._id });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "score.submitted",
      resourceType: "scoreSheet", resourceId: sheet._id,
      after: {
        roundId: round._id, contestantId: sheet.contestantId, criteria: required.length,
        accountKind: sctx.account.kind, accountName: sctx.account.displayName,
      },
    });
  },
});

export const roundScoringSheet = query({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
      kind: "judge",
    });

    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }

    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();

    const effectiveCriteria = criteria
      .map((c) => ({
        ...c,
        decimalPrecision: Math.max(c.decimalPrecision ?? 0, sctx.event.decimalPrecision ?? 0),
      }))
      .sort((a, b) => a.order - b.order);

    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_judge_id_and_round_id", (q) =>
        q.eq("judgeId", sctx.account._id).eq("roundId", round._id),
      )
      .collect();

    const isRoundClosed =
      round.status === "closed" ||
      round.status === "published" ||
      sctx.event.status === "finalized" ||
      sctx.event.status === "archived";

    const contestantsList: Array<{
      sheet: Doc<"scoreSheets">;
      contestant: Doc<"contestants">;
      category: Doc<"categories"> | null;
      scores?: Doc<"scores">[];
      isImmutable: boolean;
    }> = [];

    for (const sheet of sheets) {
      const contestant = await ctx.db.get(sheet.contestantId);
      if (!contestant || contestant.eventId !== sctx.event._id) continue;

      const category = contestant.categoryId ? await ctx.db.get(contestant.categoryId) : null;

      const isImmutable =
        sheet.status === "submitted" ||
        sheet.status === "locked" ||
        isRoundClosed;

      const scores =
        sheet.status === "submitted" || sheet.status === "locked"
          ? await ctx.db
              .query("scores")
              .withIndex("by_sheet_id", (q) => q.eq("sheetId", sheet._id))
              .collect()
          : undefined;

      contestantsList.push({
        sheet,
        contestant,
        category,
        scores,
        isImmutable,
      });
    }

    contestantsList.sort((a, b) => a.contestant.number - b.contestant.number);

    return {
      event: {
        _id: sctx.event._id,
        name: sctx.event.name,
        eventCode: sctx.event.eventCode,
        logoUrl: sctx.event.logoUrl,
        venue: sctx.event.venue,
        startDate: sctx.event.startDate,
        decimalPrecision: sctx.event.decimalPrecision ?? 0,
      },
      judge: {
        _id: sctx.account._id,
        displayName: sctx.account.displayName,
        username: sctx.account.username,
        signatureSpecimen: sctx.account.signatureSpecimen,
      },
      round,
      criteria: effectiveCriteria,
      contestants: contestantsList,
      isRoundClosed,
    };
  },
});

export const saveRoundDraftsBatch = mutation({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
    drafts: v.array(
      v.object({
        sheetId: v.id("scoreSheets"),
        draftValues: v.record(v.string(), v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
      kind: "judge",
      requireReadyEvent: true,
    });

    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }
    if (round.status !== "open") {
      throw appError(ErrorCode.CONFLICT, "Round is not open for scoring");
    }

    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();

    for (const item of args.drafts) {
      const sheet = await ctx.db.get(item.sheetId);
      if (!sheet || sheet.judgeId !== sctx.account._id || sheet.roundId !== round._id) {
        continue;
      }
      if (sheet.status === "submitted" || sheet.status === "locked") {
        continue;
      }

      for (const [criterionId, value] of Object.entries(item.draftValues)) {
        const criterion = criteria.find((c) => c._id === criterionId);
        if (!criterion) continue;
        const problem = checkValue(criterion, value, sctx.event.decimalPrecision);
        if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
      }

      await ctx.db.patch(sheet._id, {
        status: "in_progress",
        draftValues: item.draftValues,
      });
    }

    await touchSession(ctx, sctx.session._id);
  },
});

export const submitRoundSheetsBatch = mutation({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
    submissions: v.array(
      v.object({
        sheetId: v.id("scoreSheets"),
        values: v.record(v.string(), v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
      kind: "judge",
      requireReadyEvent: true,
    });

    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }
    if (round.status !== "open") {
      throw appError(ErrorCode.CONFLICT, "Round is not open for scoring");
    }

    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();

    const assignments = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_judge_id", (q) => q.eq("judgeId", sctx.account._id))
      .collect();

    const scoped = assignments.filter((a) => a.roundId === undefined || a.roundId === round._id);
    const scopedCriterionIds = scoped
      .filter((a) => a.criterionId !== undefined)
      .map((a) => a.criterionId!);
    const required = scopedCriterionIds.length > 0
      ? criteria.filter((c) => scopedCriterionIds.includes(c._id))
      : criteria;

    const now = Date.now();
    let submittedCount = 0;

    for (const sub of args.submissions) {
      const sheet = await ctx.db.get(sub.sheetId);
      if (!sheet || sheet.judgeId !== sctx.account._id || sheet.roundId !== round._id) {
        continue;
      }
      if (sheet.status === "submitted" || sheet.status === "locked") {
        continue;
      }

      for (const criterion of required) {
        const value = sub.values[criterion._id];
        if (value === undefined) {
          throw appError(ErrorCode.VALIDATION_ERROR, `Missing score for ${criterion.name}`);
        }
        const problem = checkValue(criterion, value, sctx.event.decimalPrecision);
        if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
      }

      for (const criterion of required) {
        await ctx.db.insert("scores", {
          sheetId: sheet._id,
          eventId: sctx.event._id,
          roundId: round._id,
          judgeId: sctx.account._id,
          contestantId: sheet.contestantId,
          criterionId: criterion._id,
          value: sub.values[criterion._id],
          submittedAt: now,
          submittedByAccountId: sctx.account._id,
        });
      }

      await ctx.db.patch(sheet._id, { status: "submitted", draftValues: undefined });
      submittedCount++;
    }

    if (submittedCount > 0) {
      // Invalidate any existing signature for this judge and round
      const existingSignatures = await ctx.db
        .query("roundSignatures")
        .withIndex("by_round_and_actor", (q) =>
          q.eq("roundId", round._id).eq("actorId", sctx.account._id),
        )
        .collect();
      for (const sig of existingSignatures) {
        if (sig.status === "valid") {
          await ctx.db.patch(sig._id, { status: "stale" });
        }
      }

      await maybeAutoCloseRound(ctx, { roundId: round._id });
      await touchSession(ctx, sctx.session._id);
      await writeAudit(ctx, {
        orgId: sctx.event.orgId,
        actorId: null,
        action: "score.submitted",
        resourceType: "scoreSheet",
        resourceId: args.roundId,
        after: {
          roundId: round._id,
          sheetsCount: submittedCount,
          accountKind: sctx.account.kind,
          accountName: sctx.account.displayName,
        },
      });
    }

    return { submittedCount };
  },
});

