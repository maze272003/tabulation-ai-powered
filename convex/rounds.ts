import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

export const add = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), name: v.string(),
    description: v.optional(v.string()), qualifiesToNextRound: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const existing = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const id = await ctx.db.insert("rounds", {
      eventId: eactx.event._id,
      name: args.name.trim(),
      description: args.description,
      order: existing.length,
      qualifiesToNextRound: args.qualifiesToNextRound ?? false,
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
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.qualifiesToNextRound !== undefined) patch.qualifiesToNextRound = args.qualifiesToNextRound;
    if (args.scoringRules !== undefined) patch.scoringRules = args.scoringRules;
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
