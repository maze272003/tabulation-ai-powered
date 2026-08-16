import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventMember, requireEventPermission } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { computeEventResults } from "./lib/eventResults";

async function requireResultAccess(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string },
) {
  const eactx = await requireEventMember(ctx, args);
  if (!eactx.permissions.has("result.view")) {
    throw appError(ErrorCode.FORBIDDEN, "Missing permission: result.view");
  }
  if (eactx.event.resultVisibility === "private" && !eactx.permissions.has("score.manage")) {
    throw appError(ErrorCode.FORBIDDEN, "Results are private");
  }
  return eactx;
}

export const roundResults = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), version: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const versions = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    const chosen = args.version !== undefined
      ? versions.find((v) => v.version === args.version)
      : versions.reduce<Doc<"resultVersions"> | null>((best, v) => (best === null || v.version > best.version ? v : best), null);
    if (!chosen) throw appError(ErrorCode.NOT_FOUND, "Result version not found");
    return {
      version: chosen.version,
      reason: chosen.reason,
      createdAt: chosen.createdAt,
      snapshot: chosen.snapshot,
    };
  },
});

export const listRoundVersions = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const versions = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    return versions
      .sort((a, b) => b.version - a.version)
      .map((v) => ({ version: v.version, createdAt: v.createdAt, reason: v.reason }));
  },
});

export const eventResults = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    return await computeEventResults(ctx, eactx.event);
  },
});

export const finalizeEvent = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    if (eactx.event.status !== "ready") {
      throw appError(ErrorCode.CONFLICT, "Only ready events can be finalized");
    }
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    if (rounds.length === 0 || rounds.some((r) => r.status !== "published")) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Every round must be published before finalizing");
    }
    await ctx.db.patch(eactx.event._id, { status: "finalized" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.finalized",
      resourceType: "event", resourceId: eactx.event._id,
      before: { status: "ready" }, after: { status: "finalized" },
    });
  },
});
