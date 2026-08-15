import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";

export const add = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), userId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage" });
    await requireLimit(ctx, eactx.subscription, "judges");
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_id_and_user_id", (q) => q.eq("orgId", eactx.org._id).eq("userId", args.userId))
      .unique();
    if (!membership || membership.status !== "active") {
      throw appError(ErrorCode.VALIDATION_ERROR, "User is not an active member of this organization");
    }
    const dup = await ctx.db
      .query("judges")
      .withIndex("by_event_id_and_user_id", (q) => q.eq("eventId", eactx.event._id).eq("userId", args.userId))
      .unique();
    if (dup) throw appError(ErrorCode.CONFLICT, "User is already a judge for this event");
    const id = await ctx.db.insert("judges", {
      orgId: eactx.org._id, eventId: eactx.event._id, userId: args.userId, status: "assigned",
    });
    await incrementUsage(ctx, eactx.org._id, "judges", 1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "judge.added",
      resourceType: "judge", resourceId: id, after: { userId: args.userId },
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), judgeId: v.id("judges") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage" });
    const judge = await ctx.db.get(args.judgeId);
    if (!judge || judge.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Judge not found");
    const assignments = await ctx.db.query("judgeAssignments").withIndex("by_judge_id", (q) => q.eq("judgeId", args.judgeId)).collect();
    for (const a of assignments) await ctx.db.delete(a._id);
    await ctx.db.delete(args.judgeId);
    await incrementUsage(ctx, eactx.org._id, "judges", -1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "judge.removed",
      resourceType: "judge", resourceId: args.judgeId,
    });
  },
});

export const listWithAssignments = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    const judges = await ctx.db.query("judges").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    return Promise.all(
      judges.map(async (j) => {
        const user = await ctx.db.get(j.userId);
        const assignments = await ctx.db.query("judgeAssignments").withIndex("by_judge_id", (q) => q.eq("judgeId", j._id)).collect();
        return { ...j, user: { name: user?.name ?? "", email: user?.email ?? "", image: user?.image ?? "" }, assignments };
      }),
    );
  },
});

export const addAssignment = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), judgeId: v.id("judges"),
    roundId: v.optional(v.id("rounds")), categoryId: v.optional(v.id("categories")), criterionId: v.optional(v.id("criteria")),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage" });
    const judge = await ctx.db.get(args.judgeId);
    if (!judge || judge.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Judge not found");
    if (args.roundId) {
      const r = await ctx.db.get(args.roundId);
      if (!r || r.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }
    if (args.categoryId) {
      const c = await ctx.db.get(args.categoryId);
      if (!c || c.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
    }
    if (args.criterionId) {
      const cr = await ctx.db.get(args.criterionId);
      if (!cr) throw appError(ErrorCode.NOT_FOUND, "Criterion not found");
      const r = await ctx.db.get(cr.roundId);
      if (!r || r.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Criterion not found");
    }
    const id = await ctx.db.insert("judgeAssignments", {
      judgeId: args.judgeId, eventId: eactx.event._id,
      roundId: args.roundId, categoryId: args.categoryId, criterionId: args.criterionId,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "judge.assignment.added",
      resourceType: "judgeAssignment", resourceId: id,
      after: { judgeId: args.judgeId, roundId: args.roundId ?? null, categoryId: args.categoryId ?? null },
    });
  },
});

export const removeAssignment = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), assignmentId: v.id("judgeAssignments") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage" });
    const a = await ctx.db.get(args.assignmentId);
    if (!a || a.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Assignment not found");
    await ctx.db.delete(args.assignmentId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "judge.assignment.removed",
      resourceType: "judgeAssignment", resourceId: args.assignmentId,
    });
  },
});
