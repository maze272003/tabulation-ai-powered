import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireOrgMember, requirePermission } from "./lib/authz";
import { requireDraftEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

export const list = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    const system = await ctx.db
      .query("eventTemplates")
      .filter((q) => q.eq(q.field("isSystem"), true))
      .collect();
    const orgTemplates = await ctx.db
      .query("eventTemplates")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .collect();
    return [...system, ...orgTemplates];
  },
});

export const createFromEvent = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.create" });
    const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const categories = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const roundsWithCriteria = await Promise.all(
      rounds.map(async (r) => ({
        name: r.name,
        order: r.order,
        qualifiesToNextRound: r.qualifiesToNextRound,
        scoringRules: r.scoringRules,
        criteria: await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", r._id)).collect(),
      })),
    );
    const id = await ctx.db.insert("eventTemplates", {
      orgId: eactx.org._id,
      name: args.name.trim(),
      description: args.description ?? "",
      configSnapshot: {
        decimalPrecision: eactx.event.decimalPrecision,
        resultVisibility: eactx.event.resultVisibility,
        categories: categories.map((c) => ({ name: c.name, order: c.order })),
        rounds: roundsWithCriteria.map((r) => ({
          name: r.name, order: r.order, qualifiesToNextRound: r.qualifiesToNextRound,
          scoringRules: r.scoringRules,
          criteria: r.criteria.map((c) => ({
            name: c.name, order: c.order, weight: c.weight,
            minScore: c.minScore, maxScore: c.maxScore, decimalPrecision: c.decimalPrecision,
          })),
        })),
      },
      isSystem: false,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "template.created",
      resourceType: "eventTemplate", resourceId: id, after: { name: args.name },
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), templateId: v.id("eventTemplates") },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "event.create" });
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl) throw appError(ErrorCode.NOT_FOUND, "Template not found");
    if (tpl.isSystem || tpl.orgId === null) {
      throw appError(ErrorCode.FORBIDDEN, "System templates cannot be deleted");
    }
    if (tpl.orgId !== actx.org._id) throw appError(ErrorCode.NOT_FOUND, "Template not found");
    await ctx.db.delete(args.templateId);
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "template.removed",
      resourceType: "eventTemplate", resourceId: args.templateId, before: { name: tpl.name },
    });
  },
});
