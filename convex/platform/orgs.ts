import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requirePlatformOwner } from "../lib/auth";
import { getSubscription } from "../lib/entitlements";
import { getUsage } from "../lib/usage";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

/**
 * Slug-prefix upper bound for index range scans. "\uffff" sorts after any
 * real character, so [search, search + "\uffff") covers every slug that
 * starts with the search term.
 */
const PREFIX_BOUND = "\uffff";

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw appError(ErrorCode.VALIDATION_ERROR, "A reason is required for this action");
  }
  return trimmed;
}

async function requireOrg(ctx: QueryCtx, orgId: Id<"organizations">) {
  const org = await ctx.db.get(orgId);
  if (!org || org.status === "deleted") {
    throw appError(ErrorCode.NOT_FOUND, "Organization not found");
  }
  return org;
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("suspended"))),
  },
  handler: async (ctx, args) => {
    await requirePlatformOwner(ctx);

    const search = args.search?.trim().toLowerCase() ?? "";
    const base = search
      ? ctx.db
          .query("organizations")
          .withIndex("by_slug", (q) => q.gte("slug", search).lt("slug", search + PREFIX_BOUND))
      : ctx.db.query("organizations").order("desc");
    // Status filtering happens post-scan: it is an admin-screen refinement,
    // not a scalability boundary, and keeps the index set minimal.
    const scoped = args.status
      ? base.filter((q) => q.eq(q.field("status"), args.status))
      : base;

    const result = await scoped.paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (org) => {
        const subscription = await ctx.db
          .query("subscriptions")
          .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
          .unique();
        const plan = subscription ? await ctx.db.get(subscription.planId) : null;
        return {
          org,
          planName: plan?.name ?? null,
          subscriptionStatus: subscription?.status ?? null,
        };
      }),
    );
    return { ...result, page };
  },
});

export const options = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);
    // Bounded reference list for admin filter dropdowns. Capped at the 200
    // most recent orgs, which covers realistic v1 platform operations.
    const orgs = await ctx.db.query("organizations").order("desc").take(200);
    return orgs
      .filter((org) => org.status !== "deleted")
      .map((org) => ({ _id: org._id, name: org.name, slug: org.slug, status: org.status }));
  },
});

export const get = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requirePlatformOwner(ctx);
    const org = await requireOrg(ctx, args.orgId);

    const subscription = await getSubscription(ctx, org._id);
    const [owner, plan] = await Promise.all([
      ctx.db.get(org.ownerId),
      ctx.db.get(subscription.planId),
    ]);
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");

    const usage = {
      members: await getUsage(ctx, org._id, "members"),
      events: await getUsage(ctx, org._id, "events"),
      judges: await getUsage(ctx, org._id, "judges"),
      contestants: await getUsage(ctx, org._id, "contestants"),
    };

    const auditRows = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_id_and_creation_time", (q) => q.eq("orgId", org._id))
      .order("desc")
      .take(5);
    const recentAudit = await Promise.all(
      auditRows.map(async (entry) => {
        const actor = entry.actorId ? await ctx.db.get(entry.actorId) : null;
        return {
          _id: entry._id,
          _creationTime: entry._creationTime,
          action: entry.action,
          actorName: actor?.name ?? null,
          reason: entry.reason,
        };
      }),
    );

    return { org, owner, subscription, plan, usage, recentAudit };
  },
});

export const setStatus = mutation({
  args: {
    orgId: v.id("organizations"),
    status: v.union(v.literal("active"), v.literal("suspended")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const reason = requireReason(args.reason);
    const org = await requireOrg(ctx, args.orgId);
    if (org.status === args.status) {
      throw appError(ErrorCode.CONFLICT, `Organization is already ${args.status}`);
    }

    await ctx.db.patch(org._id, { status: args.status });
    // Audited on the org's own trail so members can see why access was lost
    // once the org is resumed.
    await writeAudit(ctx, {
      orgId: org._id,
      actorId: actor._id,
      action: args.status === "suspended" ? "platform.org.suspended" : "platform.org.resumed",
      resourceType: "organization",
      resourceId: org._id,
      before: { status: org.status },
      after: { status: args.status },
      reason,
    });
  },
});
