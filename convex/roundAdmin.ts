import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { loadRound, requireReadyEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

export const roundMonitor = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    const judges = await ctx.db
      .query("judges")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id", (q) =>
        q.eq("eventId", eactx.event._id).eq("roundId", round._id))
      .collect();
    const judgesOut: { judgeId: Id<"judges">; name: string }[] = [];
    for (const j of judges) {
      const user = await ctx.db.get(j.userId);
      judgesOut.push({ judgeId: j._id, name: user?.name ?? "" });
    }
    return {
      roundStatus: round.status,
      judges: judgesOut,
      contestants: contestants.map((k) => ({ contestantId: k._id, name: k.name, number: k.number })),
      sheets: sheets.map((s) => ({ judgeId: s.judgeId, contestantId: s.contestantId, status: s.status })),
    };
  },
});

export const closeRound = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "open") {
      throw appError(ErrorCode.CONFLICT, "Only open rounds can be closed");
    }
    await ctx.db.patch(round._id, { status: "closed" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.closed",
      resourceType: "round", resourceId: round._id,
      before: { status: "open" }, after: { status: "closed" },
    });
  },
});

export const reopenRound = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Only closed rounds can be reopened");
    }
    await ctx.db.patch(round._id, { status: "open" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.reopened",
      resourceType: "round", resourceId: round._id,
      before: { status: "closed" }, after: { status: "open" },
    });
  },
});
