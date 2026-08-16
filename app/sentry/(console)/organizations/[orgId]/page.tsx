"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  CreditCard,
  Gauge,
  PlayCircle,
  ScrollText,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
import { ReasonDialog } from "@/components/platform/ReasonDialog";
import { platformErrorMessage } from "@/components/platform/errors";
import { formatDate, formatDateTime } from "@/components/platform/format";
import {
  orgStatusLabel,
  orgStatusTone,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from "@/components/platform/status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/tabulation/StateBlock";

const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
  "paused",
] as const;

const USAGE_RESOURCES = [
  { key: "members", limitKey: "maxMembers", label: "Members" },
  { key: "events", limitKey: "maxEvents", label: "Events" },
  { key: "judges", limitKey: "maxJudges", label: "Judges" },
  { key: "contestants", limitKey: "maxContestants", label: "Contestants" },
] as const;

export default function SentryOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const { token } = useSentrySession();
  const detail = useQuery(
    api.superadmin.orgs.detail,
    token ? { token, orgId: orgId as Id<"organizations"> } : "skip",
  );
  const plans = useQuery(api.superadmin.billing.listPlans, token ? { token } : "skip");

  const [orgStatusDialogOpen, setOrgStatusDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [subStatusDialogOpen, setSubStatusDialogOpen] = useState(false);
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [nextStatus, setNextStatus] = useState<string>("active");
  const [trialDate, setTrialDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const setOrgStatus = useMutation(api.superadmin.orgs.setStatus);
  const setPlan = useMutation(api.superadmin.billing.setPlan);
  const setSubscriptionStatus = useMutation(api.superadmin.billing.setStatus);
  const setTrialEnd = useMutation(api.superadmin.billing.setTrialEnd);

  if (detail === undefined || plans === undefined) {
    return (
      <div className="space-y-6">
        <BackLink />
        <TableSkeleton rows={4} cols={3} />
      </div>
    );
  }

  const { org, owner, subscription, plan, events, counts, usage, members, recentAudit } = detail;
  const suspended = org.status === "suspended";

  const runSetOrgStatus = async (r: string) => {
    if (!token) return;
    setBusy(true);
    try {
      await setOrgStatus({
        token,
        orgId: org._id,
        status: suspended ? "active" : "suspended",
        reason: r,
      });
      setOrgStatusDialogOpen(false);
      toast.success(suspended ? "Organization resumed" : "Organization suspended");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  const runChangePlan = async (r: string) => {
    if (!token || !selectedPlanId) return;
    setBusy(true);
    try {
      await setPlan({
        token,
        orgId: org._id,
        planId: selectedPlanId as Id<"plans">,
        reason: r,
      });
      setPlanDialogOpen(false);
      setReason("");
      toast.success("Plan updated");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The plan could not be changed."));
    } finally {
      setBusy(false);
    }
  };

  const runChangeSubscriptionStatus = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await setSubscriptionStatus({
        token,
        orgId: org._id,
        status: nextStatus as (typeof SUBSCRIPTION_STATUSES)[number],
        reason,
      });
      setSubStatusDialogOpen(false);
      setReason("");
      toast.success("Subscription status updated");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The status could not be changed."));
    } finally {
      setBusy(false);
    }
  };

  const runExtendTrial = async (r: string) => {
    if (!token || !trialDate) return;
    setBusy(true);
    try {
      const endOfDay = new Date(`${trialDate}T23:59:59`).getTime();
      await setTrialEnd({ token, orgId: org._id, trialEndsAt: endOfDay, reason: r });
      setTrialDialogOpen(false);
      setReason("");
      toast.success("Trial extended");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The trial could not be updated."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-xl font-semibold">{org.name}</h1>
            <PlatformBadge label={orgStatusLabel[org.status]} tone={orgStatusTone[org.status]} />
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {org.slug} · owned by {owner?.name || owner?.email || "unknown"}
          </p>
        </div>
        <Button
          variant={suspended ? "default" : "destructive"}
          size="sm"
          className="gap-1.5"
          onClick={() => setOrgStatusDialogOpen(true)}
        >
          {suspended ? (
            <PlayCircle aria-hidden className="size-4" />
          ) : (
            <Ban aria-hidden className="size-4" />
          )}
          {suspended ? "Resume organization" : "Suspend organization"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard aria-hidden className="size-4 text-muted-foreground" />
              Subscription
            </CardTitle>
            <CardDescription>Plan, status, and billing lifecycle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {subscription && plan ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md bg-muted px-2.5 py-1 font-semibold">{plan.name}</span>
                  <PlatformBadge
                    label={subscriptionStatusLabel[subscription.status]}
                    tone={subscriptionStatusTone[subscription.status]}
                  />
                  {subscription.cancelAtPeriodEnd && (
                    <PlatformBadge label="Cancels at period end" tone="warning" />
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Trial ends</p>
                    <p className="mt-0.5 font-medium">
                      {subscription.trialEndsAt ? formatDate(subscription.trialEndsAt) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Current period ends</p>
                    <p className="mt-0.5 font-medium">
                      {subscription.currentPeriodEndAt
                        ? formatDate(subscription.currentPeriodEndAt)
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedPlanId(subscription.planId);
                      setPlanDialogOpen(true);
                    }}
                  >
                    Change plan
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNextStatus(subscription.status);
                      setSubStatusDialogOpen(true);
                    }}
                  >
                    Set status
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setTrialDialogOpen(true)}
                  >
                    <CalendarClock aria-hidden className="size-3.5" />
                    Extend trial
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                No subscription found for this organization.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge aria-hidden className="size-4 text-muted-foreground" />
              Usage
            </CardTitle>
            <CardDescription>
              {events.length} event{events.length === 1 ? "" : "s"} · {counts.contestants}{" "}
              contestants · {counts.sheetsSubmitted} sheets submitted · {counts.scoresEntered}{" "}
              scores entered
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {USAGE_RESOURCES.map((resource) => {
              const usageValue = usage[resource.key];
              const limit = plan?.limits[resource.limitKey as keyof typeof plan.limits] ?? null;
              const pct =
                limit && limit > 0 ? Math.min(100, Math.round((usageValue / limit) * 100)) : 0;
              return (
                <div key={resource.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{resource.label}</span>
                    <span className="font-mono tabular-nums">
                      {usageValue}
                      {limit !== null && (
                        <span className="text-muted-foreground"> / {limit}</span>
                      )}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${resource.label}: ${pct}% of limit`}
                  >
                    <div
                      className={
                        pct >= 90
                          ? "h-full rounded-full bg-destructive"
                          : "h-full rounded-full bg-primary"
                      }
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users aria-hidden className="size-4 text-muted-foreground" />
              Members ({members.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members.</p>
            ) : (
              members.map(({ membership, profile, roleName }) => (
                <div
                  key={membership._id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {profile?.name || profile?.email || "Unknown user"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {roleName ?? "Unknown role"} · joined {formatDate(membership.joinedAt)}
                    </p>
                  </div>
                  <PlatformBadge label={membership.status} tone="info" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText aria-hidden className="size-4 text-muted-foreground" />
              Recent audit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              recentAudit.map((entry) => (
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
          </CardContent>
        </Card>
      </div>

      <ReasonDialog
        open={orgStatusDialogOpen}
        onOpenChange={(open) => {
          setOrgStatusDialogOpen(open);
          if (!open) setReason("");
        }}
        title={suspended ? "Resume organization" : "Suspend organization"}
        description={
          suspended
            ? `${org.name} will regain full access for its members.`
            : `${org.name} will immediately lose access. Members see the reason once it is resumed.`
        }
        confirmLabel={suspended ? "Resume" : "Suspend"}
        busy={busy}
        destructive={!suspended}
        onConfirm={runSetOrgStatus}
      />

      <Dialog
        open={planDialogOpen}
        onOpenChange={(open) => {
          setPlanDialogOpen(open);
          if (!open) setReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              Pick the target plan for this organization. The change is applied immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="target-plan">Target plan</Label>
              <Select
                value={selectedPlanId}
                onValueChange={(value) => {
                  if (value) setSelectedPlanId(value);
                }}
              >
                <SelectTrigger id="target-plan" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan._id} value={plan._id}>
                      {plan.name}
                      {plan.isActive === false ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-reason">Reason</Label>
              <Input
                id="plan-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (recorded in the audit log)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPlanDialogOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !reason.trim() || !selectedPlanId}
              onClick={() => void runChangePlan(reason.trim())}
            >
              Change plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={trialDialogOpen}
        onOpenChange={(open) => {
          setTrialDialogOpen(open);
          if (!open) setReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend trial</DialogTitle>
            <DialogDescription>
              Set the trial end date. A date in the past ends the trial immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="trial-date">Trial end date</Label>
              <Input
                id="trial-date"
                type="date"
                value={trialDate}
                onChange={(event) => setTrialDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trial-reason">Reason</Label>
              <Input
                id="trial-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (recorded in the audit log)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTrialDialogOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !reason.trim() || !trialDate}
              onClick={() => void runExtendTrial(reason.trim())}
            >
              Set trial end
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={subStatusDialogOpen}
        onOpenChange={(open) => {
          setSubStatusDialogOpen(open);
          if (!open) setReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set subscription status</DialogTitle>
            <DialogDescription>Change the billing lifecycle state.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="next-status">Status</Label>
              <Select
                value={nextStatus}
                onValueChange={(value) => {
                  if (value) setNextStatus(value);
                }}
              >
                <SelectTrigger id="next-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBSCRIPTION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {subscriptionStatusLabel[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-reason">Reason</Label>
              <Input
                id="status-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (recorded in the audit log)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSubStatusDialogOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !reason.trim()}
              onClick={() => void runChangeSubscriptionStatus()}
            >
              Save status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/sentry/organizations"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-3.5" />
      Back to organizations
    </Link>
  );
}