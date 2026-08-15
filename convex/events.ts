import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
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

export type ReadinessCheck = { item: string; passed: boolean; detail: string };

export async function computeReadiness(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<ReadinessCheck[]> {
  const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();
  const categories = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();
  const contestants = await ctx.db.query("contestants").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();
  const judges = await ctx.db.query("judges").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();
  const assignments = await ctx.db.query("judgeAssignments").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();

  const criteriaPerRound = await Promise.all(
    rounds.map((r) => ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", r._id)).collect()),
  );

  const emptyRounds = rounds.filter((_, i) => criteriaPerRound[i].length === 0);
  const badSums = rounds.filter((_, i) => {
    const total = criteriaPerRound[i].reduce((sum, c) => sum + c.weight, 0);
    return total !== 100;
  });
  const badRanges = criteriaPerRound.flat().filter((c) => !(c.minScore < c.maxScore));
  const activeContestants = contestants.filter((c) => c.status === "active");
  const judgesWithAssignments = judges.filter((j) => assignments.some((a) => a.judgeId === j._id));

  return [
    { item: "rounds.exist", passed: rounds.length >= 1, detail: `${rounds.length} round(s)` },
    { item: "rounds.criteria", passed: emptyRounds.length === 0, detail: emptyRounds.length === 0 ? "all rounds have criteria" : `${emptyRounds.length} round(s) without criteria` },
    { item: "rounds.weights", passed: badSums.length === 0, detail: badSums.length === 0 ? "all weights sum to 100" : `${badSums.length} round(s) with weights not summing to 100` },
    { item: "criteria.ranges", passed: badRanges.length === 0, detail: badRanges.length === 0 ? "all ranges valid" : `${badRanges.length} criterion/criteria with invalid ranges` },
    { item: "categories.exist", passed: categories.length >= 1, detail: `${categories.length} categor(y/ies)` },
    { item: "contestants.exist", passed: activeContestants.length >= 1, detail: `${activeContestants.length} active contestant(s)` },
    { item: "judges.exist", passed: judgesWithAssignments.length >= 1, detail: `${judgesWithAssignments.length} judge(s) with assignments` },
  ];
}

export const readiness = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args): Promise<ReadinessCheck[]> => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    return computeReadiness(ctx, eactx.event._id);
  },
});

export const createFromTemplate = mutation({
  args: { orgSlug: v.string(), name: v.string(), slug: v.optional(v.string()), templateId: v.id("eventTemplates") },
  handler: async (ctx, args): Promise<string> => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "event.create" });
    await requireLimit(ctx, actx.subscription, "events");
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl || !(tpl.isSystem || tpl.orgId === actx.org._id)) {
      throw appError(ErrorCode.NOT_FOUND, "Template not found");
    }
    const slug = slugify(args.slug ?? args.name);
    if (!slug) throw appError(ErrorCode.VALIDATION_ERROR, "Event name must contain letters or digits");
    const existing = await ctx.db
      .query("events")
      .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", actx.org._id).eq("slug", slug))
      .unique();
    if (existing) throw appError(ErrorCode.CONFLICT, "Event slug already taken", { slug });
    const snap = tpl.configSnapshot;
    const eventId = await ctx.db.insert("events", {
      orgId: actx.org._id,
      slug,
      name: args.name.trim(),
      description: "",
      status: "draft",
      decimalPrecision: snap.decimalPrecision,
      resultVisibility: snap.resultVisibility,
      branding: {},
      templateId: tpl._id,
      createdById: actx.user._id,
    });
    if (snap.categories && snap.categories.length > 0) {
      for (const c of snap.categories) {
        await ctx.db.insert("categories", { eventId, name: c.name, order: c.order });
      }
    } else {
      await ctx.db.insert("categories", { eventId, name: "Open", order: 0 });
    }
    for (const r of snap.rounds) {
      const roundId = await ctx.db.insert("rounds", {
        eventId,
        name: r.name,
        order: r.order,
        qualifiesToNextRound: r.qualifiesToNextRound,
        scoringRules: r.scoringRules,
      });
      for (const c of r.criteria) {
        await ctx.db.insert("criteria", {
          roundId,
          name: c.name,
          order: c.order,
          weight: c.weight,
          minScore: c.minScore,
          maxScore: c.maxScore,
          decimalPrecision: c.decimalPrecision,
        });
      }
    }
    await incrementUsage(ctx, actx.org._id, "events", 1);
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "event.created",
      resourceType: "event", resourceId: eventId,
      after: { slug, name: args.name, fromTemplate: tpl.name },
    });
    return slug;
  },
});
