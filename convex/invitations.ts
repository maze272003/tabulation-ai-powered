import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requirePermission } from "./lib/authz";
import { requireUserProfile } from "./lib/auth";
import { writeAudit } from "./lib/audit";
import { getSubscription, requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const create = mutation({
  args: { orgSlug: v.string(), email: v.string(), roleName: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.members.manage",
    });
    const sub = await getSubscription(ctx, actx.org._id);
    await requireLimit(ctx, sub, "members");

    const normalizedEmail = args.email.toLowerCase().trim();
    if (!normalizedEmail) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Email is required");
    }

    const role = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.roleName))
      .unique();
    if (!role) throw appError(ErrorCode.NOT_FOUND, "Role not found");

    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_org_id_and_email", (q) =>
        q.eq("orgId", actx.org._id).eq("email", normalizedEmail),
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (existing) {
      throw appError(ErrorCode.CONFLICT, "Invitation already pending", {
        email: normalizedEmail,
      });
    }

    const token = randomToken();
    const expiresAt = Date.now() + INVITATION_TTL_MS;
    const id: Id<"invitations"> = await ctx.db.insert("invitations", {
      orgId: actx.org._id,
      email: normalizedEmail,
      roleId: role._id,
      eventId: null,
      token,
      status: "pending",
      expiresAt,
      createdById: actx.user._id,
      acceptedById: null,
      acceptedAt: null,
    });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "member.invited",
      resourceType: "invitation",
      resourceId: id,
      after: { email: normalizedEmail, roleName: args.roleName, expiresAt },
    });
    return token;
  },
});

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireUserProfile(ctx);
    return ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", profile.email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

export const listForOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.members.manage",
    });
    return ctx.db
      .query("invitations")
      .withIndex("by_org_id_and_email", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!inv || inv.status !== "pending") return null;
    const org = await ctx.db.get(inv.orgId);
    const role = await ctx.db.get(inv.roleId);
    return {
      orgName: org?.name ?? "",
      roleName: role?.name ?? "",
      email: inv.email,
      expiresAt: inv.expiresAt,
    };
  },
});

export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireUserProfile(ctx);
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!inv || inv.status !== "pending") {
      throw appError(ErrorCode.NOT_FOUND, "Invitation not found");
    }
    if (inv.email !== profile.email.toLowerCase()) {
      throw appError(ErrorCode.FORBIDDEN, "Invitation is not for you");
    }
    if (Date.now() > inv.expiresAt) {
      // Note: we intentionally do not patch the invitation to "expired"
      // here. Convex rolls back all writes when a mutation throws, so the
      // patch would not persist anyway. The invitation remains "pending"
      // with a stale `expiresAt`; subsequent accept attempts re-evaluate
      // the same check and re-throw CONFLICT. A sweep job (Phase 2) can
      // reconcile these to "expired" in batch.
      throw appError(ErrorCode.CONFLICT, "Invitation has expired");
    }
    const existing = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_id_and_user_id", (q) =>
        q.eq("orgId", inv.orgId).eq("userId", profile._id),
      )
      .unique();
    const increasesActiveCount = !existing || existing.status !== "active";
    if (increasesActiveCount) {
      await requireLimit(ctx, await getSubscription(ctx, inv.orgId), "members");
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        roleId: inv.roleId,
        status: "active",
      });
    } else {
      await ctx.db.insert("organizationMembers", {
        userId: profile._id,
        orgId: inv.orgId,
        roleId: inv.roleId,
        status: "active",
        joinedAt: Date.now(),
      });
      await incrementUsage(ctx, inv.orgId, "members", 1);
    }
    await ctx.db.patch(inv._id, {
      status: "accepted",
      acceptedById: profile._id,
      acceptedAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: inv.orgId,
      actorId: profile._id,
      action: "member.invitation.accepted",
      resourceType: "invitation",
      resourceId: inv._id,
      before: { status: "pending" },
      after: { status: "accepted" },
    });
  },
});

export const revoke = mutation({
  args: { orgSlug: v.string(), invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.members.manage",
    });
    const inv = await ctx.db.get(args.invitationId);
    if (!inv || inv.orgId !== actx.org._id) {
      throw appError(ErrorCode.NOT_FOUND, "Invitation not found");
    }
    const before = { status: inv.status };
    await ctx.db.patch(args.invitationId, { status: "revoked" });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "member.invitation.revoked",
      resourceType: "invitation",
      resourceId: args.invitationId,
      before,
      after: { status: "revoked" },
    });
  },
});
