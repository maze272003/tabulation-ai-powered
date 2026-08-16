import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireReason, requireSuperadminSession } from "../lib/superadmin";
import { getUsage } from "../lib/usage";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

const PREFIX_BOUND = "\uffff";

async function requireOrg(ctx: QueryCtx, orgId: Id<"organizations">) {
  const org = await ctx.db.get(orgId);
  if (!org || org.status === "deleted") {
    throw appError(ErrorCode.NOT_FOUND, "Organization not found");
  }
  return org;
}

export const list = query({
  args: {
    token: v.string(),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("suspended"))),
  },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);

    const search = args.search?.trim().toLowerCase() ?? "";
    const base = search
      ? ctx.db
          .query("organizations")
          .withIndex("by_slug", (q) => q.gte("slug", search).lt("slug", search + PREFIX_BOUND))
      : ctx.db.query("organizations").order("desc");
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
          usage: {
            members: await getUsage(ctx, org._id, "members"),
            events: await getUsage(ctx, org._id, "events"),
            judges: await getUsage(ctx, org._id, "judges"),
            contestants: await getUsage(ctx, org._id, "contestants"),
          },
        };
      }),
    );
    return { ...result, page };
  },
});

export const options = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    // Bounded reference list for CRM lead-conversion dropdowns.
    const orgs = await ctx.db.query("organizations").order("desc").take(200);
    return orgs
      .filter((org) => org.status !== "deleted")
      .map((org) => ({ _id: org._id, name: org.name, slug: org.slug }));
  },
});

export const detail = query({
  args: { token: v.string(), orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    const org = await requireOrg(ctx, args.orgId);

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
      .unique();
    const [owner, plan] = await Promise.all([
      ctx.db.get(org.ownerId),
      subscription ? ctx.db.get(subscription.planId) : null,
    ]);

    // Drill-down tallies. The per-event index scans are bounded by the plan's
    // event limit; this is a one-at-a-time admin screen, not a hot path.
    const events = await ctx.db
      .query("events")
      .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
      .collect();
    let contestants = 0;
    let sheetsSubmitted = 0;
    let scoresEntered = 0;
    for (const event of events) {
      contestants += (await ctx.db
        .query("contestants")
        .withIndex("by_event_id", (q) => q.eq("eventId", event._id))
        .collect()).length;
      sheetsSubmitted += (await ctx.db
        .query("scoreSheets")
        .withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", event._id))
        .filter((q) => q.eq(q.field("status"), "submitted"))
        .collect()).length;
      scoresEntered += (await ctx.db
        .query("scores")
        .withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", event._id))
        .collect()).length;
    }

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
      .collect();
    const membersWithProfiles = await Promise.all(
      members.map(async (membership) => {
        const [profile, role] = await Promise.all([
          ctx.db.get(membership.userId),
          ctx.db.get(membership.roleId),
        ]);
        return {
          membership,
          profile: profile ?? null,
          roleName: role?.name ?? null,
        };
      }),
    );

    const auditRows = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_id_and_creation_time", (q) => q.eq("orgId", org._id))
      .order("desc")
      .take(8);
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

    return {
      org,
      owner,
      subscription,
      plan,
      events,
      counts: { contestants, sheetsSubmitted, scoresEntered },
      usage: {
        members: await getUsage(ctx, org._id, "members"),
        events: await getUsage(ctx, org._id, "events"),
        judges: await getUsage(ctx, org._id, "judges"),
        contestants: await getUsage(ctx, org._id, "contestants"),
      },
      members: membersWithProfiles,
      recentAudit,
    };
  },
});

export const setStatus = mutation({
  args: {
    token: v.string(),
    orgId: v.id("organizations"),
    status: v.union(v.literal("active"), v.literal("suspended")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const reason = requireReason(args.reason);
    const org = await requireOrg(ctx, args.orgId);
    if (org.status === args.status) {
      throw appError(ErrorCode.CONFLICT, `Organization is already ${args.status}`);
    }

    await ctx.db.patch(org._id, { status: args.status });
    await writeAudit(ctx, {
      orgId: org._id,
      actorId: null,
      action: args.status === "suspended" ? "platform.org.suspended" : "platform.org.resumed",
      resourceType: "organization",
      resourceId: org._id,
      before: { status: org.status },
      after: { status: args.status },
      reason: `superadmin:${session.label} — ${reason}`,
    });
  },
});