import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requirePermission } from "./lib/authz";
import { writeAudit } from "./lib/audit";
import { incrementUsage } from "./lib/usage";

export const list = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.view",
    });
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .collect();
    return Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        const role = await ctx.db.get(m.roleId);
        return {
          membershipId: m._id,
          userId: m.userId,
          name: user?.name ?? "",
          email: user?.email ?? "",
          image: user?.image ?? "",
          roleName: role?.name ?? "",
          status: m.status,
          joinedAt: m.joinedAt,
        };
      }),
    );
  },
});

export const changeRole = mutation({
  args: {
    orgSlug: v.string(),
    membershipId: v.id("organizationMembers"),
    roleName: v.string(),
  },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.members.manage",
    });
    const target = await ctx.db.get(args.membershipId);
    if (!target || target.orgId !== actx.org._id) {
      throw appError(ErrorCode.NOT_FOUND, "Member not found");
    }
    const newRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.roleName))
      .unique();
    if (!newRole) throw appError(ErrorCode.NOT_FOUND, "Role not found");
    if (actx.org.ownerId === target.userId && target.roleId !== newRole._id) {
      throw appError(
        ErrorCode.CONFLICT,
        "Cannot change the owner's role; transfer ownership instead",
      );
    }
    const before = { roleId: target.roleId };
    if (target.roleId !== newRole._id) {
      await ctx.db.patch(args.membershipId, { roleId: newRole._id });
    }
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "member.role.changed",
      resourceType: "organizationMember",
      resourceId: args.membershipId,
      before,
      after: { roleId: newRole._id },
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), membershipId: v.id("organizationMembers") },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.members.manage",
    });
    const target = await ctx.db.get(args.membershipId);
    if (!target || target.orgId !== actx.org._id) {
      throw appError(ErrorCode.NOT_FOUND, "Member not found");
    }
    if (actx.org.ownerId === target.userId) {
      throw appError(ErrorCode.CONFLICT, "Cannot remove the owner");
    }
    const before = { status: target.status };
    await ctx.db.patch(args.membershipId, { status: "inactive" });
    await incrementUsage(ctx, actx.org._id, "members", -1);
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "member.removed",
      resourceType: "organizationMember",
      resourceId: args.membershipId,
      before,
      after: { status: "inactive" },
    });
  },
});
