import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { loadRound, requireEventPermission, requireJudgeRow, requireReadyEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

function checkValue(criterion: Doc<"criteria">, value: number): string | null {
  if (value < criterion.minScore || value > criterion.maxScore) {
    return `${criterion.name} must be between ${criterion.minScore} and ${criterion.maxScore}`;
  }
  const factor = 10 ** criterion.decimalPrecision;
  if (Math.abs(value * factor - Math.round(value * factor)) > 1e-9) {
    return `${criterion.name} allows ${criterion.decimalPrecision} decimal(s)`;
  }
  return null;
}

async function loadOwnSheet(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string; sheetId: Id<"scoreSheets"> },
) {
  const eactx = await requireReadyEvent(ctx, {
    orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.enter",
  });
  const judge = await requireJudgeRow(ctx, eactx);
  const sheet = await ctx.db.get(args.sheetId);
  if (!sheet || sheet.eventId !== eactx.event._id || sheet.judgeId !== judge._id) {
    throw appError(ErrorCode.NOT_FOUND, "Score sheet not found");
  }
  const round = await loadRound(ctx, eactx, sheet.roundId);
  if (round.status !== "open") {
    throw appError(ErrorCode.CONFLICT, "Round is not open for scoring");
  }
  return { eactx, judge, sheet, round };
}

export const myAssignments = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.enter",
    });
    const judge = await ctx.db
      .query("judges")
      .withIndex("by_event_id_and_user_id", (q) => q.eq("eventId", eactx.event._id).eq("userId", eactx.user._id))
      .unique();
    if (!judge) return { judgeId: null, rounds: [] };
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const out: {
      roundId: Id<"rounds">;
      name: string;
      order: number;
      status: string;
      sheets: { sheetId: Id<"scoreSheets">; contestantId: Id<"contestants">; contestantName: string; contestantNumber: number; status: string }[];
    }[] = [];
    for (const round of [...rounds].sort((a, b) => a.order - b.order)) {
      const sheets = await ctx.db
        .query("scoreSheets")
        .withIndex("by_judge_id_and_round_id", (q) => q.eq("judgeId", judge._id).eq("roundId", round._id))
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
    return { judgeId: judge._id, rounds: out };
  },
});

export const sheetDetail = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), contestantId: v.id("contestants") },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.enter",
    });
    const judge = await requireJudgeRow(ctx, eactx);
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id_and_contestant_id", (q) =>
        q.eq("eventId", eactx.event._id).eq("roundId", args.roundId).eq("contestantId", args.contestantId))
      .collect();
    const sheet = sheets.find((s) => s.judgeId === judge._id) ?? null;
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    const contestant = await ctx.db.get(args.contestantId);
    return { sheet, criteria: [...criteria].sort((a, b) => a.order - b.order), contestant };
  },
});

export const saveDraft = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), sheetId: v.id("scoreSheets"),
    draftValues: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const { sheet, round } = await loadOwnSheet(ctx, args);
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
      const problem = checkValue(criterion, value);
      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
    }
    await ctx.db.patch(args.sheetId, { status: "in_progress", draftValues: args.draftValues });
  },
});

export const submitSheet = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), sheetId: v.id("scoreSheets"),
    values: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const { eactx, judge, sheet, round } = await loadOwnSheet(ctx, args);
    if (sheet.status !== "not_started" && sheet.status !== "in_progress") {
      throw appError(ErrorCode.CONFLICT, "Score sheet is already submitted");
    }
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    const assignments = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_judge_id", (q) => q.eq("judgeId", judge._id))
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
      const problem = checkValue(criterion, value);
      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
    }
    const now = Date.now();
    for (const criterion of required) {
      await ctx.db.insert("scores", {
        sheetId: sheet._id,
        eventId: eactx.event._id,
        roundId: round._id,
        judgeId: judge._id,
        contestantId: sheet.contestantId,
        criterionId: criterion._id,
        value: args.values[criterion._id],
        submittedAt: now,
        submittedById: eactx.user._id,
      });
    }
    await ctx.db.patch(sheet._id, { status: "submitted", draftValues: undefined });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "score.submitted",
      resourceType: "scoreSheet", resourceId: sheet._id,
      after: { roundId: round._id, contestantId: sheet.contestantId, criteria: required.length },
    });
  },
});
