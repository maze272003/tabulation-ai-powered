"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CreditCard,
  ScrollText,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
import { StatCard } from "@/components/platform/StatCard";
import { DatabaseResetCard } from "@/components/platform/DatabaseResetCard";
import { formatDateTime } from "@/components/platform/format";
import { userStatusLabel, userStatusTone } from "@/components/platform/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TableSkeleton } from "@/components/tabulation/StateBlock";
import { PageHeader } from "@/components/PageHeader";

export default function PlatformOverviewPage() {
  const stats = useQuery(api.platform.dashboard.stats, {});

  if (stats === undefined) {
    return (
      <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Platform-wide health of accounts, organizations, and subscriptions."
      />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TableSkeleton rows={2} cols={1} />
          <TableSkeleton rows={2} cols={1} />
          <TableSkeleton rows={2} cols={1} />
          <TableSkeleton rows={2} cols={1} />
        </div>
      </div>
    );
  }

  const maxPlanCount = Math.max(1, ...stats.subscriptions.byPlan.map((p) => p.count));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Platform-wide health of accounts, organizations, and subscriptions."
      />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          hint={`${stats.users.active} active · ${stats.users.suspended} suspended`}
        />
        <StatCard
          icon={ShieldCheck}
          label="Platform owners"
          value={stats.users.platformOwners}
          hint="Accounts with superadmin access"
        />
        <StatCard
          icon={CreditCard}
          label="Active subscriptions"
          value={stats.subscriptions.active}
          hint={`of ${stats.subscriptions.total} total`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard aria-hidden className="size-4 text-muted-foreground" />
              Subscriptions by plan
            </CardTitle>
            <CardDescription>
              Stripe-managed billing arrives in Phase 6; overrides are administrative.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.subscriptions.byPlan.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
            ) : (
              stats.subscriptions.byPlan.map((plan) => (
                <div key={plan.planName} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 truncate">{plan.planName}</span>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus aria-hidden className="size-4 text-muted-foreground" />
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
          <CardDescription>
            Administrative actions taken in the platform channel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.recentAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No platform activity recorded yet.</p>
          ) : (
            stats.recentAudit.map((entry) => (
              <div
                key={entry._id}
                className="flex items-center justify-between gap-3 text-sm"
              >
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
            href="/platform/audit"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            View full audit log
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </CardContent>
      </Card>

      <DatabaseResetCard />
    </div>
  );
}
