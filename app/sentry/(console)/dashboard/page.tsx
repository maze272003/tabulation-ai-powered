"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Building2,
  CreditCard,
  DollarSign,
  Handshake,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { formatMoney } from "@/components/sentry/format";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
import { StatCard } from "@/components/platform/StatCard";
import { formatDateTime } from "@/components/platform/format";
import { userStatusLabel, userStatusTone } from "@/components/platform/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TableSkeleton } from "@/components/tabulation/StateBlock";
import { PageHeader } from "@/components/PageHeader";

const LEAD_STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  trial: "Trial",
  customer: "Customer",
  churned: "Churned",
};

export default function SentryDashboardPage() {
  const { token } = useSentrySession();
  const stats = useQuery(api.superadmin.dashboard.stats, token ? { token } : "skip");

  if (stats === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader icon={LayoutDashboard} title="Dashboard" description="Platform-wide health at a glance." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TableSkeleton rows={2} cols={1} />
          <TableSkeleton rows={2} cols={1} />
          <TableSkeleton rows={2} cols={1} />
          <TableSkeleton rows={2} cols={1} />
        </div>
      </div>
    );
  }

  const maxPlanCount = Math.max(1, ...stats.byPlan.map((plan) => plan.count));
  const maxActivity = Math.max(
    1,
    ...stats.activity.map((day) => Math.max(day.signups, day.events, day.scores)),
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={LayoutDashboard} title="Dashboard" description="Platform-wide health at a glance" />

      <section aria-label="Key metrics" className="stagger-fade grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Organizations"
          value={stats.orgs.total}
          hint={`${stats.orgs.active} active · ${stats.orgs.suspended} suspended`}
        />
        <StatCard
          icon={Users}
          label="Users"
          value={stats.users.total}
          hint={`${stats.users.active} active · ${stats.users.platformOwners} platform owners`}
        />
        <StatCard
          icon={CreditCard}
          label="Active subscriptions"
          value={stats.subscriptions.active}
          hint={`${stats.subscriptions.trialing} trialing · ${stats.subscriptions.pastDue} past due`}
        />
        <StatCard
          icon={DollarSign}
          label="MRR"
          value={formatMoney(stats.mrrCents)}
          hint="Active + trialing subscriptions"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus aria-hidden className="size-4 text-muted-foreground" />
              14-day activity
            </CardTitle>
            <CardDescription>
              Signups, events created, and scores submitted per day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary" aria-hidden />
                Signups
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary/50" aria-hidden />
                Events
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-warning/70" aria-hidden />
                Scores
              </span>
            </div>
            <div
              className="flex h-36 items-end gap-1.5"
              role="img"
              aria-label="Daily activity over the last 14 days"
            >
              {stats.activity.map((day) => (
                <div
                  key={day.date}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
                  title={`${day.date} — ${day.signups} signups, ${day.events} events, ${day.scores} scores`}
                >
                  <div
                    className="w-full rounded-sm bg-primary/50"
                    style={{ height: `${Math.max(2, (day.events / maxActivity) * 100)}%` }}
                  />
                  <div
                    className="w-full rounded-sm bg-warning/70"
                    style={{ height: `${Math.max(2, (day.scores / maxActivity) * 100)}%` }}
                  />
                  <div
                    className="w-full rounded-sm bg-primary"
                    style={{ height: `${Math.max(2, (day.signups / maxActivity) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>{stats.activity[0]?.date}</span>
              <span>{stats.activity[stats.activity.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard aria-hidden className="size-4 text-muted-foreground" />
              Subscriptions by plan
            </CardTitle>
            <CardDescription>MRR is computed from plan pricing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.byPlan.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
            ) : (
              stats.byPlan.map((plan) => (
                <div key={plan.planName} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate">{plan.planName}</span>
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${plan.planName}: ${plan.count} of ${maxPlanCount}`}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(plan.count / maxPlanCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono tabular-nums">
                    {plan.count}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Handshake aria-hidden className="size-4 text-muted-foreground" />
              CRM pipeline
            </CardTitle>
            <CardDescription>
              {stats.crm.openFollowUps} follow-up{stats.crm.openFollowUps === 1 ? "" : "s"} due
              right now.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(stats.crm.leadStages).map(([stage, count]) => (
              <div key={stage} className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">{LEAD_STAGE_LABELS[stage]}</p>
                <p className="mt-0.5 font-heading text-xl font-semibold tabular-nums">{count}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden className="size-4 text-muted-foreground" />
              Recent signups
            </CardTitle>
            <CardDescription>Newest accounts on the platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentSignups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            ) : (
              stats.recentSignups.map((signup) => (
                <div key={signup._id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{signup.name || signup.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{signup.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <PlatformBadge
                      label={userStatusLabel[signup.status]}
                      tone={userStatusTone[signup.status]}
                    />
                    <span className="font-mono tabular-nums">
                      {formatDateTime(signup.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText aria-hidden className="size-4 text-muted-foreground" />
            Recent platform activity
          </CardTitle>
          <CardDescription>Administrative actions taken in the platform channel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.recentAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No platform activity recorded yet.</p>
          ) : (
            stats.recentAudit.map((entry) => (
              <div key={entry._id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{entry.action}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.actorName ?? "System"}
                    {entry.reason ? ` — ${entry.reason}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(entry._creationTime)}
                </span>
              </div>
            ))
          )}
          <Link
            href="/sentry/audit"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            View full audit log
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}