import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { getPlan, requireLimit } from "./lib/entitlements";
import { getUsage, incrementUsage } from "./lib/usage";

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

export const MAX_BULK_IMPORT_ROWS = 500;

export const bulkAdd = mutation({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    rows: v.array(
      v.object({
        number: v.number(),
        name: v.string(),
        category: v.string(),
        group: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ added: number }> => {
    const eactx = await requireDraftEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "contestant.manage",
    });
    if (args.rows.length === 0) {
      throw appError(ErrorCode.VALIDATION_ERROR, "No rows to import");
    }
    if (args.rows.length > MAX_BULK_IMPORT_ROWS) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Imports are limited to ${MAX_BULK_IMPORT_ROWS} rows per file`);
    }

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    if (categories.length === 0) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Event has no categories");
    }
    // First category (by order) wins on duplicate names, matching contestants.add fallback.
    const categoryIdsByName = new Map<string, Id<"categories">>();
    for (const category of [...categories].sort((a, b) => a.order - b.order)) {
      const key = category.name.trim().toLowerCase();
      if (!categoryIdsByName.has(key)) categoryIdsByName.set(key, category._id);
    }

    const existing = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const usedNumbers = new Set(existing.map((contestant) => contestant.number));
    const firstUseInFile = new Map<number, number>();

    // Validate everything before the first insert so the transaction rolls back whole-file.
    const resolvedCategoryIds: Id<"categories">[] = [];
    for (const [i, row] of args.rows.entries()) {
      const rowIndex = i + 1;
      if (!row.name.trim()) {
        throw appError(ErrorCode.VALIDATION_ERROR, `Row ${rowIndex}: name must not be empty`, { rowIndex });
      }
      if (!Number.isInteger(row.number) || row.number < 1) {
        throw appError(ErrorCode.VALIDATION_ERROR, `Row ${rowIndex}: number must be a positive integer`, { rowIndex });
      }
      const categoryId = categoryIdsByName.get(row.category.trim().toLowerCase());
      if (categoryId === undefined) {
        throw appError(ErrorCode.VALIDATION_ERROR, `Row ${rowIndex}: unknown category "${row.category}"`, { rowIndex });
      }
      const firstUse = firstUseInFile.get(row.number);
      if (firstUse !== undefined) {
        throw appError(ErrorCode.CONFLICT, `Row ${rowIndex}: number ${row.number} duplicates row ${firstUse}`, { rowIndex });
      }
      if (usedNumbers.has(row.number)) {
        throw appError(ErrorCode.CONFLICT, `Row ${rowIndex}: number ${row.number} is already used in this event`, { rowIndex });
      }
      firstUseInFile.set(row.number, rowIndex);
      resolvedCategoryIds.push(categoryId);
    }

    const plan = await getPlan(ctx, eactx.subscription);
    const currentCount = await getUsage(ctx, eactx.org._id, "contestants");
    const maxContestants = plan.limits.maxContestants;
    if (typeof maxContestants === "number" && currentCount + args.rows.length > maxContestants) {
      throw appError(ErrorCode.LIMIT_EXCEEDED, `Import would exceed the plan limit of ${maxContestants} contestants`, {
        current: currentCount,
        max: maxContestants,
      });
    }

    for (const [i, row] of args.rows.entries()) {
      await ctx.db.insert("contestants", {
        eventId: eactx.event._id,
        categoryId: resolvedCategoryIds[i],
        number: row.number,
        name: row.name.trim(),
        group: row.group?.trim() ? row.group.trim() : undefined,
        status: "active",
      });
    }
    await incrementUsage(ctx, eactx.org._id, "contestants", args.rows.length);
    await writeAudit(ctx, {
      orgId: eactx.org._id,
      actorId: eactx.user._id,
      action: "contestant.bulk_added",
      resourceType: "contestant",
      resourceId: eactx.event._id,
      after: { count: args.rows.length },
    });
    return { added: args.rows.length };
  },
});
