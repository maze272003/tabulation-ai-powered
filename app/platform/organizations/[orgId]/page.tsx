"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Ban, PlayCircle, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
import { ReasonDialog } from "@/components/platform/ReasonDialog";
import { platformErrorMessage } from "@/components/platform/errors";
import { formatDateTime } from "@/components/platform/format";
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

const USAGE_RESOURCES = [
  { key: "members", limitKey: "maxMembers", label: "Members" },
  { key: "events", limitKey: "maxEvents", label: "Events" },
  { key: "judges", limitKey: "maxJudges", label: "Judges" },
  { key: "contestants", limitKey: "maxContestants", label: "Contestants" },
] as const;

export default function PlatformOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const detail = useQuery(api.platform.orgs.get, { orgId: orgId as Id<"organizations"> });
  const plans = useQuery(api.plans.list, {});

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [planReason, setPlanReason] = useState("");
  const [busy, setBusy] = useState(false);

  const setStatus = useMutation(api.platform.orgs.setStatus);
  const setPlan = useMutation(api.platform.subscriptions.setPlan);

  if (detail === undefined) {
    return (
      <div className="space-y-6">
        <BackLink />
        <TableSkeleton rows={4} cols={3} />
      </div>
    );
  }

  const { org, owner, subscription, plan, usage, recentAudit } = detail;
  const suspended = org.status === "suspended";

  const runSetStatus = async (reason: string) => {
    setBusy(true);
    try {
      await setStatus({
        orgId: org._id,
        status: suspended ? "active" : "suspended",
        reason,
      });
      setStatusDialogOpen(false);
      toast.success(suspended ? "Organization resumed" : "Organization suspended");
    } catch (error) {
      toast.error(platformErrorMessage(error, "Could not change the organization status."));
    } finally {
      setBusy(false);
    }
  };

  const runSetPlan = async () => {
    const reason = planReason.trim();
    if (!selectedPlanId || !reason) return;
    setBusy(true);
    try {
      await setPlan({ orgId: org._id, planId: selectedPlanId as Id<"plans">, reason });
      setPlanDialogOpen(false);
      setPlanReason("");
      toast.success("Plan updated");
    } catch (error) {
      toast.error(platformErrorMessage(error, "Could not change the plan."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <PlatformBadge label={orgStatusLabel[org.status]} tone={orgStatusTone[org.status]} />
        <p className="text-sm text-muted-foreground">{org.slug}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              Administrative override — Stripe-managed billing arrives in Phase 6.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium">{plan.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <PlatformBadge
                label={subscriptionStatusLabel[subscription.status]}
                tone={subscriptionStatusTone[subscription.status]}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Period ends</span>
              <span className="font-mono tabular-nums">
                {subscription.currentPeriodEndAt
                  ? formatDateTime(subscription.currentPeriodEndAt)
                  : "—"}
              </span>
            </div>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan usage</CardTitle>
            <CardDescription>Current consumption against {plan.name} limits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {USAGE_RESOURCES.map((resource) => {
              const current = usage[resource.key];
              const max = plan.limits[resource.limitKey];
              return (
                <div key={resource.key} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-muted-foreground">{resource.label}</span>
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${resource.label}: ${current} of ${max}`}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, (current / max) * 100)}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {current} / {max}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Owner</span>
              <span className="font-medium">
                {owner ? `${owner.name} · ${owner.email}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created</span>
              <span className="font-mono tabular-nums">{formatDateTime(org._creationTime)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              {suspended
                ? "Resuming restores member access to this organization."
                : "Suspending immediately blocks every member of this organization."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant={suspended ? "default" : "destructive"}
              size="sm"
              disabled={busy}
              onClick={() => setStatusDialogOpen(true)}
            >
              {suspended ? (
                <PlayCircle aria-hidden />
              ) : (
                <Ban aria-hidden />
              )}
              {suspended ? "Resume organization" : "Suspend organization"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText aria-hidden className="size-4 text-muted-foreground" />
            Recent activity
          </CardTitle>
          <CardDescription>The latest audit entries for this organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
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

      <ReasonDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        title={suspended ? "Resume organization" : "Suspend organization"}
        description={
          suspended
            ? `Members of ${org.name} will regain access immediately.`
            : `Every member of ${org.name} will be blocked until the organization is resumed.`
        }
        confirmLabel={suspended ? "Resume" : "Suspend"}
        busy={busy}
        destructive={!suspended}
        onConfirm={runSetStatus}
      />

      <Dialog
        open={planDialogOpen}
        onOpenChange={(open) => {
          setPlanDialogOpen(open);
          if (!open) setPlanReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              Override {org.name}&apos;s subscription. The change is applied immediately and
              recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-select">Plan</Label>
              <Select value={selectedPlanId} onValueChange={(value) => setSelectedPlanId(value ?? "")}>
                <SelectTrigger id="plan-select" className="w-full">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans?.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-reason">Reason</Label>
              <Input
                id="plan-reason"
                value={planReason}
                onChange={(event) => setPlanReason(event.target.value)}
                placeholder="Reason (recorded in the audit log)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPlanDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !selectedPlanId || !planReason.trim()}
              onClick={runSetPlan}
            >
              {busy ? "Working…" : "Change plan"}
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
      href="/platform/organizations"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      All organizations
    </Link>
  );
}
