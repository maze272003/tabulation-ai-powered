import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireReason, requireSuperadminSession } from "../lib/superadmin";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

const PREFIX_BOUND = "\uffff";

async function requireUser(ctx: QueryCtx, userId: Id<"userProfiles">) {
  const user = await ctx.db.get(userId);
  if (!user) throw appError(ErrorCode.NOT_FOUND, "User not found");
  return user;
}

async function hasOtherPlatformOwner(
  ctx: QueryCtx,
  targetId: Id<"userProfiles">,
): Promise<boolean> {
  const owners = await ctx.db
    .query("userProfiles")
    .withIndex("by_platform_role", (q) => q.eq("platformRole", "platform_owner"))
    .take(2);
  return owners.some((owner) => owner._id !== targetId);
}

export const list = query({
  args: {
    token: v.string(),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"), v.literal("suspended"))),
  },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);

    const search = args.search?.trim().toLowerCase() ?? "";
    const base = search
      ? ctx.db
          .query("userProfiles")
          .withIndex("by_email", (q) => q.gte("email", search).lt("email", search + PREFIX_BOUND))
      : ctx.db.query("userProfiles").order("desc");
    const scoped = args.status
      ? base.filter((q) => q.eq(q.field("status"), args.status))
      : base;

    const result = await scoped.paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (user) => {
        const memberships = await ctx.db
          .query("organizationMembers")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect();
        return {
          user,
          orgCount: memberships.length,
        };
      }),
    );
    return { ...result, page };
  },
});

export const detail = query({
  args: { token: v.string(), userId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    const user = await requireUser(ctx, args.userId);

    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();
    const orgs = await Promise.all(
      memberships.map(async (membership) => {
        const [org, role] = await Promise.all([
          ctx.db.get(membership.orgId),
          ctx.db.get(membership.roleId),
        ]);
        return {
          membership,
          org: org ?? null,
          roleName: role?.name ?? null,
        };
      }),
    );

    const createdEvents = await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("createdById"), user._id))
      .order("desc")
      .take(50);

    return { user, orgs, createdEvents };
  },
});

export const setStatus = mutation({
  args: {
    token: v.string(),
    userId: v.id("userProfiles"),
    status: v.union(v.literal("active"), v.literal("suspended")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const reason = requireReason(args.reason);
    const target = await requireUser(ctx, args.userId);
    if (target.platformRole === "platform_owner") {
      throw appError(ErrorCode.FORBIDDEN, "Platform owners cannot be suspended");
    }
    if (target.status === args.status) {
      throw appError(ErrorCode.CONFLICT, `User is already ${args.status}`);
    }

    await ctx.db.patch(target._id, { status: args.status });
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: args.status === "suspended" ? "platform.user.suspended" : "platform.user.activated",
      resourceType: "userProfile",
      resourceId: target._id,
      before: { status: target.status },
      after: { status: args.status },
      reason: `superadmin:${session.label} — ${reason}`,
    });
  },
});

export const setPlatformRole = mutation({
  args: {
    token: v.string(),
    userId: v.id("userProfiles"),
    platformRole: v.union(v.null(), v.literal("platform_owner")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const reason = requireReason(args.reason);
    const target = await requireUser(ctx, args.userId);
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
      actorId: null,
      action:
        args.platformRole === "platform_owner" ? "platform.user.promoted" : "platform.user.demoted",
      resourceType: "userProfile",
      resourceId: target._id,
      before: { platformRole: target.platformRole },
      after: { platformRole: args.platformRole },
      reason: `superadmin:${session.label} — ${reason}`,
    });
  },
});