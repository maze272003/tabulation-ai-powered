import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

const advancementArgs = {
  mode: v.union(v.literal("none"), v.literal("top_count"), v.literal("top_percent"), v.literal("manual")),
  count: v.optional(v.number()),
  percent: v.optional(v.number()),
  allowOverride: v.boolean(),
};

function validateAdvancement(a: { mode: string; count?: number; percent?: number }): void {
  if (a.mode === "top_count" && !(Number.isInteger(a.count) && (a.count ?? 0) >= 1)) {
    throw appError(ErrorCode.VALIDATION_ERROR, "top_count advancement requires count >= 1");
  }
  if (a.mode === "top_percent" && !((a.percent ?? 0) >= 1 && (a.percent ?? 0) <= 100)) {
    throw appError(ErrorCode.VALIDATION_ERROR, "top_percent advancement requires percent 1-100");
  }
}

export const add = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), name: v.string(),
    description: v.optional(v.string()), qualifiesToNextRound: v.optional(v.boolean()),
    weight: v.optional(v.number()), advancement: v.optional(v.object(advancementArgs)),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    if (!args.name.trim()) throw appError(ErrorCode.VALIDATION_ERROR, "name must not be empty");
    const existing = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    if (args.advancement) validateAdvancement(args.advancement);
    const id = await ctx.db.insert("rounds", {
      eventId: eactx.event._id,
      name: args.name.trim(),
      description: args.description,
      order: existing.length,
      qualifiesToNextRound: args.qualifiesToNextRound ?? false,
      weight: args.weight ?? (existing.length === 0 ? 100 : 0),
      status: "open",
      advancement: args.advancement ?? { mode: "none", allowOverride: true },
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.added",
      resourceType: "round", resourceId: id, after: { name: args.name },
    });
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"),
    name: v.optional(v.string()), description: v.optional(v.string()),
    qualifiesToNextRound: v.optional(v.boolean()),
    scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
    weight: v.optional(v.number()), advancement: v.optional(v.object(advancementArgs)),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    if (args.name !== undefined && !args.name.trim()) {
      throw appError(ErrorCode.VALIDATION_ERROR, "name must not be empty");
    }
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.qualifiesToNextRound !== undefined) patch.qualifiesToNextRound = args.qualifiesToNextRound;
    if (args.scoringRules !== undefined) patch.scoringRules = args.scoringRules;
    if (args.weight !== undefined) {
      if (!Number.isInteger(args.weight) || args.weight < 0 || args.weight > 100) {
        throw appError(ErrorCode.VALIDATION_ERROR, "weight must be an integer 0-100");
      }
      patch.weight = args.weight;
    }
    if (args.advancement !== undefined) {
      validateAdvancement(args.advancement);
      patch.advancement = args.advancement;
    }
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.roundId, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.updated",
      resourceType: "round", resourceId: args.roundId, before: { name: round.name }, after: patch,
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const criteria = await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", args.roundId)).collect();
    for (const c of criteria) await ctx.db.delete(c._id);
    await ctx.db.delete(args.roundId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.removed",
      resourceType: "round", resourceId: args.roundId, before: { name: round.name, criteriaDeleted: criteria.length },
    });
  },
});

export const list = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    return Promise.all(
      rounds.map(async (r) => ({
        ...r,
        criteria: await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", r._id)).collect(),
      })),
    );
  },
});
