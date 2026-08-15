import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireOrgMember, requirePermission } from "./lib/authz";
import { requireEventMember, requireDraftEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const create = mutation({
  args: { orgSlug: v.string(), name: v.string(), slug: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "event.create" });
    const slug = slugify(args.slug ?? args.name);
    if (!slug) throw appError(ErrorCode.VALIDATION_ERROR, "Event name must contain letters or digits");
    const existing = await ctx.db
      .query("events")
      .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", actx.org._id).eq("slug", slug))
      .unique();
    if (existing) throw appError(ErrorCode.CONFLICT, "Event slug already taken", { slug });
    await requireLimit(ctx, actx.subscription, "events");
    const eventId = await ctx.db.insert("events", {
      orgId: actx.org._id,
      slug,
      name: args.name.trim(),
      description: "",
      status: "draft",
      decimalPrecision: 2,
      resultVisibility: "private",
      branding: {},
      createdById: actx.user._id,
    });
    await ctx.db.insert("categories", { eventId, name: "Open", order: 0 });
    await incrementUsage(ctx, actx.org._id, "events", 1);
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "event.created",
      resourceType: "event", resourceId: eventId, after: { slug, name: args.name },
    });
    return slug;
  },
});

export const get = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args): Promise<Doc<"events"> | null> => {
    try {
      const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
      return eactx.event;
    } catch {
      return null;
    }
  },
});

export const listByOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    return await ctx.db
      .query("events")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .order("desc")
      .collect();
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    venue: v.optional(v.string()),
    timezone: v.optional(v.string()),
    decimalPrecision: v.optional(v.number()),
    resultVisibility: v.optional(v.union(v.literal("private"), v.literal("organization"), v.literal("public"))),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update",
    });
    const patch: Record<string, string | number> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.startDate !== undefined) patch.startDate = args.startDate;
    if (args.endDate !== undefined) patch.endDate = args.endDate;
    if (args.venue !== undefined) patch.venue = args.venue;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.decimalPrecision !== undefined) {
      if (!Number.isInteger(args.decimalPrecision) || args.decimalPrecision < 0 || args.decimalPrecision > 4) {
        throw appError(ErrorCode.VALIDATION_ERROR, "decimalPrecision must be an integer 0-4");
      }
      patch.decimalPrecision = args.decimalPrecision;
    }
    if (args.resultVisibility !== undefined) patch.resultVisibility = args.resultVisibility;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(eactx.event._id, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.updated",
      resourceType: "event", resourceId: eactx.event._id,
      before: { name: eactx.event.name }, after: { name: patch.name ?? eactx.event.name },
    });
  },
});
