import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

export const add = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    if (!args.name.trim()) throw appError(ErrorCode.VALIDATION_ERROR, "name must not be empty");
    const existing = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const id = await ctx.db.insert("categories", {
      eventId: eactx.event._id,
      name: args.name.trim(),
      description: args.description,
      order: existing.length,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "category.added",
      resourceType: "category", resourceId: id, after: { name: args.name },
    });
  },
});

export const update = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), categoryId: v.id("categories"), name: v.optional(v.string()), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    if (args.name !== undefined && !args.name.trim()) {
      throw appError(ErrorCode.VALIDATION_ERROR, "name must not be empty");
    }
    const cat = await ctx.db.get(args.categoryId);
    if (!cat || cat.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
    const patch: { name?: string; description?: string } = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.categoryId, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "category.updated",
      resourceType: "category", resourceId: args.categoryId, before: { name: cat.name }, after: patch,
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const cat = await ctx.db.get(args.categoryId);
    if (!cat || cat.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id_and_category_id", (q) => q.eq("eventId", eactx.event._id).eq("categoryId", args.categoryId))
      .first();
    if (contestants) throw appError(ErrorCode.CONFLICT, "Category still has contestants");
    await ctx.db.delete(args.categoryId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "category.removed",
      resourceType: "category", resourceId: args.categoryId, before: { name: cat.name },
    });
  },
});

export const list = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    return await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
  },
});
