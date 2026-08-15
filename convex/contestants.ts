import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";

export const add = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), name: v.string(), number: v.number(),
    categoryId: v.optional(v.id("categories")), photoUrl: v.optional(v.string()),
    group: v.optional(v.string()), customFields: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "contestant.manage" });
    await requireLimit(ctx, eactx.subscription, "contestants");
    if (!args.name.trim()) throw appError(ErrorCode.VALIDATION_ERROR, "name must not be empty");
    if (!Number.isInteger(args.number) || args.number < 1) {
      throw appError(ErrorCode.VALIDATION_ERROR, "number must be a positive integer");
    }
    const dup = await ctx.db
      .query("contestants")
      .withIndex("by_event_id_and_number", (q) => q.eq("eventId", eactx.event._id).eq("number", args.number))
      .unique();
    if (dup) throw appError(ErrorCode.CONFLICT, "Contestant number already used", { number: args.number });
    let categoryId = args.categoryId;
    if (categoryId) {
      const cat = await ctx.db.get(categoryId);
      if (!cat || cat.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
    } else {
      const first = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).first();
      if (!first) throw appError(ErrorCode.VALIDATION_ERROR, "Event has no categories");
      categoryId = first._id;
    }
    const id = await ctx.db.insert("contestants", {
      eventId: eactx.event._id,
      categoryId,
      number: args.number,
      name: args.name.trim(),
      photoUrl: args.photoUrl,
      group: args.group,
      status: "active",
      customFields: args.customFields,
    });
    await incrementUsage(ctx, eactx.org._id, "contestants", 1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "contestant.added",
      resourceType: "contestant", resourceId: id, after: { name: args.name, number: args.number },
    });
  },
});

export const list = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    return await ctx.db.query("contestants").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), contestantId: v.id("contestants"),
    name: v.optional(v.string()), photoUrl: v.optional(v.string()), group: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("scratched"), v.literal("disqualified"))),
    categoryId: v.optional(v.id("categories")), customFields: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "contestant.manage" });
    if (args.name !== undefined && !args.name.trim()) {
      throw appError(ErrorCode.VALIDATION_ERROR, "name must not be empty");
    }
    const c = await ctx.db.get(args.contestantId);
    if (!c || c.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.photoUrl !== undefined) patch.photoUrl = args.photoUrl;
    if (args.group !== undefined) patch.group = args.group;
    if (args.status !== undefined) patch.status = args.status;
    if (args.categoryId !== undefined) {
      const cat = await ctx.db.get(args.categoryId);
      if (!cat || cat.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
      patch.categoryId = args.categoryId;
    }
    if (args.customFields !== undefined) patch.customFields = args.customFields;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.contestantId, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "contestant.updated",
      resourceType: "contestant", resourceId: args.contestantId, before: { status: c.status }, after: patch,
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), contestantId: v.id("contestants") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "contestant.manage" });
    const c = await ctx.db.get(args.contestantId);
    if (!c || c.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    await ctx.db.delete(args.contestantId);
    await incrementUsage(ctx, eactx.org._id, "contestants", -1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "contestant.removed",
      resourceType: "contestant", resourceId: args.contestantId, before: { name: c.name },
    });
  },
});
