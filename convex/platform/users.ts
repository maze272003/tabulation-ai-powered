import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requirePlatformOwner } from "../lib/auth";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

const PREFIX_BOUND = "\uffff";

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw appError(ErrorCode.VALIDATION_ERROR, "A reason is required for this action");
  }
  return trimmed;
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("suspended")),
    ),
  },
  handler: async (ctx, args) => {
    await requirePlatformOwner(ctx);

    const search = args.search?.trim().toLowerCase() ?? "";
    const base = search
      ? ctx.db
          .query("userProfiles")
          .withIndex("by_email", (q) => q.gte("email", search).lt("email", search + PREFIX_BOUND))
      : ctx.db.query("userProfiles").order("desc");
    // Status filtering happens post-scan: an admin-screen refinement that
    // keeps the index set minimal.
    const scoped = args.status
      ? base.filter((q) => q.eq(q.field("status"), args.status))
      : base;

    return scoped.paginate(args.paginationOpts);
  },
});

export const setStatus = mutation({
  args: {
    userId: v.id("userProfiles"),
    status: v.union(v.literal("active"), v.literal("suspended")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const reason = requireReason(args.reason);
    const target = await ctx.db.get(args.userId);
    if (!target) throw appError(ErrorCode.NOT_FOUND, "User not found");
    // Guard rails: an admin must not lock themselves out, and platform
    // owners are protected from each other (use demotion first).
    if (target._id === actor._id) {
      throw appError(ErrorCode.VALIDATION_ERROR, "You cannot change your own status");
    }
    if (target.platformRole === "platform_owner") {
      throw appError(ErrorCode.FORBIDDEN, "Platform owners cannot be suspended");
    }
    if (target.status === args.status) {
      throw appError(ErrorCode.CONFLICT, `User is already ${args.status}`);
    }

    await ctx.db.patch(target._id, { status: args.status });
    await writeAudit(ctx, {
      orgId: null,
      actorId: actor._id,
      action: args.status === "suspended" ? "platform.user.suspended" : "platform.user.activated",
      resourceType: "userProfile",
      resourceId: target._id,
      before: { status: target.status },
      after: { status: args.status },
      reason,
    });
  },
});

async function hasOtherPlatformOwner(
  ctx: QueryCtx,
  targetId: Id<"userProfiles">,
): Promise<boolean> {
  // Owners are typically among the earliest profiles, so the scan finds its
  // two matches quickly.
  const owners = await ctx.db
    .query("userProfiles")
    .withIndex("by_platform_role", (q) => q.eq("platformRole", "platform_owner"))
    .take(2);
  return owners.some((owner) => owner._id !== targetId);
}

export const setPlatformRole = mutation({
  args: {
    userId: v.id("userProfiles"),
    platformRole: v.union(v.null(), v.literal("platform_owner")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const reason = requireReason(args.reason);
    const target = await ctx.db.get(args.userId);
    if (!target) throw appError(ErrorCode.NOT_FOUND, "User not found");
    if (target.platformRole === args.platformRole) {
      throw appError(
        ErrorCode.CONFLICT,
        args.platformRole === "platform_owner"
          ? "User is already a platform owner"
          : "User is not a platform owner",
      );
    }
    if (args.platformRole === null && !(await hasOtherPlatformOwner(ctx, target._id))) {
      throw appError(ErrorCode.FORBIDDEN, "Cannot demote the last platform owner");
    }

    await ctx.db.patch(target._id, { platformRole: args.platformRole });
    await writeAudit(ctx, {
      orgId: null,
      actorId: actor._id,
      action:
        args.platformRole === "platform_owner" ? "platform.user.promoted" : "platform.user.demoted",
      resourceType: "userProfile",
      resourceId: target._id,
      before: { platformRole: target.platformRole },
      after: { platformRole: args.platformRole },
      reason,
    });
  },
});
