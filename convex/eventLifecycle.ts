import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventPermission } from "./lib/eventAuthz";
import { computeReadiness } from "./events";
import { writeAudit } from "./lib/audit";

export const publish = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.publish" });
    if (eactx.event.status !== "draft") {
      throw appError(ErrorCode.CONFLICT, "Only draft events can be published");
    }
    const checks = await computeReadiness(ctx, eactx.event._id);
    const failures = checks.filter((c) => !c.passed);
    if (failures.length > 0) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Event is not ready to publish", { failures });
    }
    const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eactx.event._id).eq("kind", "judge"))
      .collect();
    const contestants = await ctx.db.query("contestants").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const active = contestants.filter((c) => c.status === "active");
    let generated = 0;
    for (const judge of judges) {
      for (const round of rounds) {
        for (const contestant of active) {
          await ctx.db.insert("scoreSheets", {
            eventId: eactx.event._id, roundId: round._id, judgeId: judge._id,
            contestantId: contestant._id, status: "not_started",
          });
          generated++;
        }
      }
    }
    await ctx.db.patch(eactx.event._id, { status: "ready" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.published",
      resourceType: "event", resourceId: eactx.event._id,
      before: { status: "draft" }, after: { status: "ready", scoreSheetsGenerated: generated },
    });
  },
});

export const reopen = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.publish" });
    if (eactx.event.status !== "ready") {
      throw appError(ErrorCode.CONFLICT, "Only ready events can be reopened");
    }
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    if (rounds.some((r) => r.status !== "open")) {
      throw appError(ErrorCode.CONFLICT, "Round scoring has started");
    }
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    if (sheets.some((s) => s.status === "submitted" || s.status === "locked")) {
      throw appError(ErrorCode.CONFLICT, "Scores have been submitted");
    }
    for (const s of sheets) await ctx.db.delete(s._id);
    await ctx.db.patch(eactx.event._id, { status: "draft" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.reopened",
      resourceType: "event", resourceId: eactx.event._id,
      before: { status: "ready" }, after: { status: "draft", scoreSheetsDeleted: sheets.length },
    });
  },
});

export const archive = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.archive" });
    if (eactx.event.status !== "ready" && eactx.event.status !== "finalized") {
      throw appError(ErrorCode.CONFLICT, "Only ready or finalized events can be archived");
    }
    await ctx.db.patch(eactx.event._id, { status: "archived" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.archived",
      resourceType: "event", resourceId: eactx.event._id,
      before: { status: eactx.event.status }, after: { status: "archived" },
    });
  },
});
