import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireUserProfile } from "./lib/auth";
import { requireOrgMember, requirePermission } from "./lib/authz";
import { writeAudit } from "./lib/audit";
import { incrementUsage } from "./lib/usage";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function pickSystemRole(
  ctx: MutationCtx,
  name: string,
): Promise<Id<"roles">> {
  const role = await ctx.db
    .query("roles")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!role) throw appError(ErrorCode.NOT_FOUND, `Role missing: ${name}`);
  return role._id;
}

export const create = mutation({
  args: { name: v.string(), slug: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const profile = await requireUserProfile(ctx);

    const slug = slugify(args.slug ?? args.name);
    if (!slug) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Slug is empty after slugify");
    }
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) {
      throw appError(ErrorCode.CONFLICT, "Slug already taken", { slug });
    }

    const ownerRoleId = await pickSystemRole(ctx, "Org Owner");
    const freePlan = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", "Free"))
      .unique();
    if (!freePlan) {
      throw appError(ErrorCode.NOT_FOUND, "Free plan missing — run seed");
    }

    const trimmedName = args.name.trim();
    const orgId: Id<"organizations"> = await ctx.db.insert("organizations", {
      slug,
      name: trimmedName,
      ownerId: profile._id,
      createdById: profile._id,
      status: "active",
      branding: {},
    });
    await ctx.db.insert("organizationMembers", {
      userId: profile._id,
      orgId,
      roleId: ownerRoleId,
      status: "active",
      joinedAt: Date.now(),
    });
    await ctx.db.insert("subscriptions", {
      orgId,
      planId: freePlan._id,
      status: "active",
      trialEndsAt: null,
      currentPeriodEndAt: null,
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    await incrementUsage(ctx, orgId, "members", 1);
    await writeAudit(ctx, {
      orgId,
      actorId: profile._id,
      action: "organization.created",
      resourceType: "organization",
      resourceId: orgId,
      after: { slug, name: trimmedName },
    });
    return slug;
  },
});

export const get = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args): Promise<Doc<"organizations">> => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    return actx.org;
  },
});

export const listMine = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    membership: Doc<"organizationMembers">;
    org: Doc<"organizations">;
    role: Doc<"roles">;
  }[]> => {
    const profile = await requireUserProfile(ctx);
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user_id", (q) => q.eq("userId", profile._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    return Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.orgId);
        const role = await ctx.db.get(m.roleId);
        if (!org || !role) {
          throw appError(ErrorCode.NOT_FOUND, "Org or role missing");
        }
        return { membership: m, org, role };
      }),
    );
  },
});

export const update = mutation({
  args: { orgSlug: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Doc<"organizations">> => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "organization.update",
    });
    if (args.name === undefined) {
      return actx.org;
    }
    const trimmed = args.name.trim();
    const before: Doc<"organizations"> = { ...actx.org };
    await ctx.db.patch(actx.org._id, { name: trimmed });
    const after: Doc<"organizations"> = { ...before, name: trimmed };
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "organization.updated",
      resourceType: "organization",
      resourceId: actx.org._id,
      before,
      after,
    });
    return after;
  },
});
