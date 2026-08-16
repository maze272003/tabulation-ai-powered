import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requirePlatformOwner } from "../lib/auth";

/**
 * Platform KPIs for the superadmin dashboard.
 *
 * Counts are computed by streaming the three slowest-growing tables
 * (organizations, userProfiles, subscriptions). This trades O(n) reads on an
 * admin-only screen for not maintaining denormalized counters on every write
 * path. If these tables grow large, replace the counters with the
 * @convex-dev/aggregate component (Phase 6 billing work is the natural point).
 */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);

    const orgs = { total: 0, active: 0, suspended: 0 };
    for await (const org of ctx.db.query("organizations")) {
      orgs.total += 1;
      if (org.status !== "deleted") {
        orgs[org.status] += 1;
      }
    }

    const users = { total: 0, active: 0, inactive: 0, suspended: 0, platformOwners: 0 };
    for await (const profile of ctx.db.query("userProfiles")) {
      users.total += 1;
      users[profile.status] += 1;
      if (profile.platformRole === "platform_owner") {
        users.platformOwners += 1;
      }
    }

    const planCountById = new Map<Id<"plans">, number>();
    let subscriptionsTotal = 0;
    let subscriptionsActive = 0;
    for await (const subscription of ctx.db.query("subscriptions")) {
      subscriptionsTotal += 1;
      if (subscription.status === "active") {
        subscriptionsActive += 1;
      }
      planCountById.set(
        subscription.planId,
        (planCountById.get(subscription.planId) ?? 0) + 1,
      );
    }

    const byPlan: { planName: string; count: number }[] = [];
    for (const [planId, count] of planCountById) {
      const plan = await ctx.db.get(planId);
      byPlan.push({ planName: plan?.name ?? "Unknown plan", count });
    }
    byPlan.sort((a, b) => b.count - a.count || a.planName.localeCompare(b.planName));

    const auditRows = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_id_and_creation_time", (q) => q.eq("orgId", null))
      .order("desc")
      .take(8);
    const recentAudit = await Promise.all(
      auditRows.map(async (entry) => {
        const actor: Doc<"userProfiles"> | null = entry.actorId
          ? await ctx.db.get(entry.actorId)
          : null;
        return {
          _id: entry._id,
          _creationTime: entry._creationTime,
          action: entry.action,
          actorName: actor?.name ?? null,
          reason: entry.reason,
        };
      }),
    );

    const signupRows = await ctx.db.query("userProfiles").order("desc").take(5);
    const recentSignups = signupRows.map((profile) => ({
      _id: profile._id,
      name: profile.name,
      email: profile.email,
      status: profile.status,
      createdAt: profile._creationTime,
    }));

    return {
      orgs,
      users,
      subscriptions: { total: subscriptionsTotal, active: subscriptionsActive, byPlan },
      recentAudit,
      recentSignups,
    };
  },
});
