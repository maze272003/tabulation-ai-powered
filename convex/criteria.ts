import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

function validateCriterion(weight: number, minScore: number, maxScore: number, decimalPrecision: number) {
  if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
    throw appError(ErrorCode.VALIDATION_ERROR, "weight must be an integer between 1 and 100");
  }
  if (!(minScore < maxScore)) {
    throw appError(ErrorCode.VALIDATION_ERROR, "minScore must be less than maxScore");
  }
  if (!Number.isInteger(decimalPrecision) || decimalPrecision < 0 || decimalPrecision > 4) {
    throw appError(ErrorCode.VALIDATION_ERROR, "decimalPrecision must be an integer 0-4");
  }
}

async function requireRoundOfEvent(ctx: QueryCtx, roundId: Id<"rounds">, eventId: Id<"events">): Promise<Doc<"rounds">> {
  const round = await ctx.db.get(roundId);
  if (!round || round.eventId !== eventId) throw appError(ErrorCode.NOT_FOUND, "Round not found");
  return round;
}

export const add = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), name: v.string(),
    description: v.optional(v.string()), weight: v.number(), minScore: v.number(),
    maxScore: v.number(), decimalPrecision: v.number(),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    await requireRoundOfEvent(ctx, args.roundId, eactx.event._id);
    validateCriterion(args.weight, args.minScore, args.maxScore, args.decimalPrecision);
    const existing = await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", args.roundId)).collect();
    const id = await ctx.db.insert("criteria", {
      roundId: args.roundId,
      name: args.name.trim(),
      description: args.description,
      order: existing.length,
      weight: args.weight,
      minScore: args.minScore,
      maxScore: args.maxScore,
      decimalPrecision: args.decimalPrecision,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "criterion.added",
      resourceType: "criterion", resourceId: id, after: { name: args.name, weight: args.weight },
    });
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), criterionId: v.id("criteria"), name: v.optional(v.string()),
    description: v.optional(v.string()), weight: v.optional(v.number()), minScore: v.optional(v.number()),
    maxScore: v.optional(v.number()), decimalPrecision: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const criterion = await ctx.db.get(args.criterionId);
    if (!criterion) throw appError(ErrorCode.NOT_FOUND, "Criterion not found");
    await requireRoundOfEvent(ctx, criterion.roundId, eactx.event._id);
    const next = {
      weight: args.weight ?? criterion.weight,
      minScore: args.minScore ?? criterion.minScore,
      maxScore: args.maxScore ?? criterion.maxScore,
      decimalPrecision: args.decimalPrecision ?? criterion.decimalPrecision,
    };
    validateCriterion(next.weight, next.minScore, next.maxScore, next.decimalPrecision);
    const patch: Record<string, string | number> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.weight !== undefined) patch.weight = args.weight;
    if (args.minScore !== undefined) patch.minScore = args.minScore;
    if (args.maxScore !== undefined) patch.maxScore = args.maxScore;
    if (args.decimalPrecision !== undefined) patch.decimalPrecision = args.decimalPrecision;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.criterionId, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "criterion.updated",
      resourceType: "criterion", resourceId: args.criterionId,
      before: { weight: criterion.weight }, after: { weight: next.weight },
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), criterionId: v.id("criteria") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const criterion = await ctx.db.get(args.criterionId);
    if (!criterion) throw appError(ErrorCode.NOT_FOUND, "Criterion not found");
    await requireRoundOfEvent(ctx, criterion.roundId, eactx.event._id);
    await ctx.db.delete(args.criterionId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "criterion.removed",
      resourceType: "criterion", resourceId: args.criterionId, before: { name: criterion.name },
    });
  },
});
