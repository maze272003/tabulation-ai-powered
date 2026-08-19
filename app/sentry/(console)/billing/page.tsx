"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { CreditCard, Pencil, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { formatMoney } from "@/components/sentry/format";
import { PlanEditorDialog } from "@/components/sentry/PlanEditorDialog";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
import { formatDate } from "@/components/platform/format";
import {
  orgStatusLabel,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from "@/components/platform/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { PageHeader } from "@/components/PageHeader";

export default function SentryBillingPage() {
  const { token } = useSentrySession();
  const plans = useQuery(api.superadmin.billing.listPlans, token ? { token } : "skip");
  const { results, status, loadMore } = usePaginatedQuery(
    api.superadmin.billing.listSubscriptions,
    token ? { token } : "skip",
    { initialNumItems: 20 },
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  if (plans === undefined) {
    return <PageHeader icon={CreditCard} title="Billing" description="Loading billing data…" />;
  }

  const editingPlan =
    plans.find((plan) => plan._id === editingPlanId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          icon={CreditCard}
          title="Billing & Subscription Plans"
          description="Subscription plans, tier limits, and organization billing states."
        />
        <Button
          className="gap-1.5 shadow-sm"
          onClick={() => {
            setEditingPlanId("new");
            setEditorOpen(true);
          }}
        >
          <Plus aria-hidden className="size-4" />
          New Plan
        </Button>
      </div>

      {/* Telemetry Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 bg-card/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Configured Plans</span>
            <CreditCard className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold font-heading text-foreground">{plans.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Active pricing tiers</p>
        </Card>
        <Card className="p-4 bg-card/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Subscriptions Tracked</span>
            <CreditCard className="size-4 text-success" />
          </div>
          <p className="mt-2 text-2xl font-bold font-heading text-success">{results.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Active organization states</p>
        </Card>
        <Card className="p-4 bg-card/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Payment Gateway</span>
            <CreditCard className="size-4 text-info" />
          </div>
          <p className="mt-2 text-lg font-bold font-heading text-foreground">PayMongo Live</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">GCash • Maya • Cards</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <CreditCard aria-hidden className="size-4 text-muted-foreground" />
            Plans
          </CardTitle>
          <CardDescription>
            Pricing, billing interval, and entitlements. MRR on the dashboard derives from here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plans configured yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan._id}>
                    <TableCell>
                      <p className="font-medium">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {plan.isSystem ? "System plan" : "Custom plan"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {plan.priceCents !== undefined ? (
                        <span className="font-mono tabular-nums">
                          {formatMoney(plan.priceCents, plan.currency ?? "USD")}
                          <span className="text-muted-foreground">
                            {" "}
                            / {plan.billingInterval ?? "monthly"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No price</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <PlatformBadge
                        label={plan.isActive === false ? "Inactive" : "Active"}
                        tone={plan.isActive === false ? "muted" : "success"}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {plan.limits.maxEvents} events · {plan.limits.maxMembers} members ·{" "}
                      {plan.limits.maxContestants} contestants
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => {
                          setEditingPlanId(plan._id);
                          setEditorOpen(true);
                        }}
                      >
                        <Pencil aria-hidden className="size-3.5" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard aria-hidden className="size-4 text-muted-foreground" />
            Subscriptions
          </CardTitle>
          <CardDescription>Open an organization to manage its plan and trial.</CardDescription>
        </CardHeader>
        <CardContent>
          {status === "LoadingFirstPage" ? (
            <TableSkeleton rows={6} cols={5} />
          ) : results.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No subscriptions yet"
              hint="Subscriptions are created when organizations sign up."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trial ends</TableHead>
                  <TableHead>Period ends</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map(
                  ({ subscription, orgName, orgSlug, orgStatus, planName, planPriceCents, planCurrency, planInterval }) => (
                    <TableRow key={subscription._id}>
                      <TableCell>
                        <Link
                          href={`/sentry/organizations/${subscription.orgId}`}
                          className="block truncate font-medium underline-offset-4 hover:underline"
                        >
                          {orgName ?? "Unknown org"}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {orgSlug}
                          {orgStatus && orgStatus !== "active" ? ` · ${orgStatusLabel[orgStatus]}` : ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{planName ?? "—"}</span>
                        {planPriceCents !== null && planPriceCents !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            {formatMoney(planPriceCents, planCurrency ?? "USD")} /{" "}
                            {planInterval ?? "monthly"}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <PlatformBadge
                          label={subscriptionStatusLabel[subscription.status]}
                          tone={subscriptionStatusTone[subscription.status]}
                        />
                        {subscription.cancelAtPeriodEnd && (
                          <p className="mt-1 text-xs text-muted-foreground">Cancels at period end</p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {subscription.trialEndsAt ? formatDate(subscription.trialEndsAt) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {subscription.currentPeriodEndAt
                          ? formatDate(subscription.currentPeriodEndAt)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          )}
          {(status === "CanLoadMore" || status === "LoadingMore") && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                disabled={status === "LoadingMore"}
                onClick={() => loadMore(20)}
              >
                {status === "LoadingMore" ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {token && (
        <PlanEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          token={token}
          plan={editingPlan}
        />
      )}
    </div>
  );
}