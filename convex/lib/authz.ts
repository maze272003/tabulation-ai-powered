import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";
import { requireUserProfile } from "./auth";

export type AuthCtx = {
  user: Doc<"userProfiles">;
  org: Doc<"organizations">;
  membership: Doc<"organizationMembers">;
  role: Doc<"roles">;
  permissions: Set<string>;
  subscription: Doc<"subscriptions">;
};

export async function resolveOrgBySlug(ctx: QueryCtx, slug: string) {
  const org = await ctx.db
    .query("organizations")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!org || org.status === "deleted") throw appError(ErrorCode.NOT_FOUND, "Organization not found");
  return org;
}

async function loadPermissions(ctx: QueryCtx, roleId: Id<"roles">): Promise<Set<string>> {
  const rolePermissions = await ctx.db
    .query("rolePermissions")
    .withIndex("by_role_id", (q) => q.eq("roleId", roleId))
    .collect();
  const names = await Promise.all(
    rolePermissions.map((rp) => ctx.db.get(rp.permissionId)),
  );
  return new Set(names.filter(Boolean).map((p) => p!.name));
}

export async function requireOrgMember(
  ctx: QueryCtx,
  args: { orgSlug: string },
): Promise<AuthCtx> {
  const user = await requireUserProfile(ctx);
  const org = await resolveOrgBySlug(ctx, args.orgSlug);
  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_id_and_user_id", (q) => q.eq("orgId", org._id).eq("userId", user._id))
    .unique();
  if (!membership || membership.status !== "active") {
    throw appError(ErrorCode.FORBIDDEN, "Not a member of this organization");
  }
  const role = await ctx.db.get(membership.roleId);
  if (!role) throw appError(ErrorCode.FORBIDDEN, "Role not found");
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
    .unique();
  if (!subscription) throw appError(ErrorCode.FORBIDDEN, "No subscription");
  const permissions = await loadPermissions(ctx, role._id);
  return { user, org, membership, role, permissions, subscription };
}

export async function requirePermission(
  ctx: QueryCtx,
  args: { orgSlug: string; permission: string },
): Promise<AuthCtx> {
  const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
  if (!actx.permissions.has(args.permission)) {
    throw appError(ErrorCode.FORBIDDEN, `Missing permission: ${args.permission}`);
  }
  return actx;
}

// NOTE: this gates on the `organization.update` permission, which Org Admins also hold.
// It is NOT a true Owner-only check. Use a direct `actx.org.ownerId === actx.user._id`
// comparison (or a `organization.delete` permission check) when you need actual Owner exclusivity.
// Phase 6 should rename or replace this when ownership-transfer lands.
export const requireOrgOwner = (ctx: QueryCtx, args: { orgSlug: string }) =>
  requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.update" });

export const requireOrgAdmin = (ctx: QueryCtx, args: { orgSlug: string }) =>
  requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.members.manage" });
