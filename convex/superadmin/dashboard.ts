import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireSuperadminSession } from "../lib/superadmin";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_WINDOW_DAYS = 14;
const ACTIVITY_SCAN_CAP = 5000;

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function emptyActivitySeries(): { date: string; signups: number; events: number; scores: number }[] {
  const series: { date: string; signups: number; events: number; scores: number }[] = [];
  const now = Date.now();
  for (let i = ACTIVITY_WINDOW_DAYS - 1; i >= 0; i--) {
    series.push({ date: dayKey(now - i * DAY_MS), signups: 0, events: 0, scores: 0 });
  }
  return series;
}

/**
 * Superadmin dashboard KPIs. Counts stream the slower-growing tables and the
 * activity series is a bounded scan of recent rows, which keeps this an
 * O(rows-read-once) admin-only query. If tables outgrow this, move the daily
 * counters into a cron-maintained aggregate table.
 */
export const stats = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);

    const orgs = { total: 0, active: 0, suspended: 0, deleted: 0 };
    for await (const org of ctx.db.query("organizations")) {
      orgs.total += 1;
      orgs[org.status] += 1;
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
    const subscriptions = { total: 0, active: 0, trialing: 0, pastDue: 0, canceled: 0, other: 0 };
    let mrrCents = 0;
    const planPriceById = new Map<Id<"plans">, { cents: number; yearly: boolean }>();
    for await (const subscription of ctx.db.query("subscriptions")) {
      subscriptions.total += 1;
      switch (subscription.status) {
        case "active":
          subscriptions.active += 1;
          break;
        case "trialing":
          subscriptions.trialing += 1;
          break;
        case "past_due":
          subscriptions.pastDue += 1;
          break;
        case "canceled":
          subscriptions.canceled += 1;
          break;
        default:
          subscriptions.other += 1;
      }
      planCountById.set(subscription.planId, (planCountById.get(subscription.planId) ?? 0) + 1);
      if (subscription.status === "active" || subscription.status === "trialing") {
        const plan = await ctx.db.get(subscription.planId);
        if (plan?.priceCents) {
          const yearly = plan.billingInterval === "yearly";
          planPriceById.set(plan._id, { cents: plan.priceCents, yearly });
          mrrCents += yearly ? plan.priceCents / 12 : plan.priceCents;
        }
      }
    }

    const byPlan: { planName: string; count: number; priceCents: number | null }[] = [];
    for (const [planId, count] of planCountById) {
      const plan = await ctx.db.get(planId);
      byPlan.push({
        planName: plan?.name ?? "Unknown plan",
        count,
        priceCents: plan?.priceCents ?? null,
      });
    }
    byPlan.sort((a, b) => b.count - a.count || a.planName.localeCompare(b.planName));

    const activity = emptyActivitySeries();
    const activityIndex = new Map(activity.map((entry, index) => [entry.date, index]));

    for await (const profile of ctx.db.query("userProfiles")) {
      const index = activityIndex.get(dayKey(profile._creationTime));
      if (index !== undefined) activity[index].signups += 1;
    }
    for await (const event of ctx.db.query("events")) {
      const index = activityIndex.get(dayKey(event._creationTime));
      if (index !== undefined) activity[index].events += 1;
    }
    // Bounded scan of the highest-churn table; days beyond the cap read as
    // slightly undercounted rather than unbounded.
    const recentScores = await ctx.db.query("scores").order("desc").take(ACTIVITY_SCAN_CAP);
    for (const score of recentScores) {
      const index = activityIndex.get(dayKey(score.submittedAt));
      if (index !== undefined) activity[index].scores += 1;
    }

    const recentSignups = await ctx.db.query("userProfiles").order("desc").take(5);
    const recentAuditRows = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_id_and_creation_time", (q) => q.eq("orgId", null))
      .order("desc")
      .take(8);
    const recentAudit = await Promise.all(
      recentAuditRows.map(async (entry) => {
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

    const leadStages: Record<string, number> = {
      lead: 0,
      qualified: 0,
      proposal: 0,
      trial: 0,
      customer: 0,
      churned: 0,
    };
    let openFollowUps = 0;
    const now = Date.now();
    for await (const lead of ctx.db.query("crmLeads")) {
      leadStages[lead.stage] += 1;
      if (lead.stage !== "churned" && lead.nextFollowUpAt !== null && lead.nextFollowUpAt <= now) {
        openFollowUps += 1;
      }
    }

    return {
      session: { label: session.label },
      orgs,
      users,
      subscriptions,
      mrrCents,
      byPlan,
      activity,
      recentSignups: recentSignups.map((profile) => ({
        _id: profile._id,
        name: profile.name,
        email: profile.email,
        status: profile.status,
        createdAt: profile._creationTime,
      })),
      recentAudit,
      crm: { leadStages, openFollowUps },
    };
  },
});