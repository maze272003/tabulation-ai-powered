import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "../lib/errors";
import { requireEventSession, touchSession } from "../lib/eventSession";
import { computeEventResults } from "../lib/eventResults";
import { writeAudit } from "../lib/audit";

async function requireResultSession(ctx: QueryCtx, sessionToken: string) {
  const sctx = await requireEventSession(ctx, {
    sessionToken,
  });
  if (sctx.account.kind === "judge" && sctx.event.resultVisibility === "private") {
    throw appError(ErrorCode.FORBIDDEN, "Results are private");
  }
  return sctx;
}

export const roundResults = query({
  args: { sessionToken: v.string(), roundId: v.id("rounds"), version: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const sctx = await requireResultSession(ctx, args.sessionToken);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
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
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireResultSession(ctx, args.sessionToken);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
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
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const sctx = await requireResultSession(ctx, args.sessionToken);
    return await computeEventResults(ctx, sctx.event);
  },
});

export const finalizeEvent = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true,
    });
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    if (rounds.length === 0 || rounds.some((r) => r.status !== "published")) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Every round must be published before finalizing");
    }
    await ctx.db.patch(sctx.event._id, { status: "finalized" });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "event.finalized",
      resourceType: "event", resourceId: sctx.event._id,
      before: { status: "ready" }, after: { status: "finalized", finalizedByStaff: sctx.account.displayName },
    });
  },
});
