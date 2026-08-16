"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";

export default function PlatformSubscriptionsPage() {
  const plans = useQuery(api.plans.list, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.platform.subscriptions.list,
    {},
    { initialNumItems: 20 },
  );

  const [overrideOrg, setOverrideOrg] = useState<{
    orgId: Id<"organizations">;
    orgName: string;
    planId: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const setPlan = useMutation(api.platform.subscriptions.setPlan);

  const openOverride = (row: (typeof results)[number]) => {
    setOverrideOrg({
      orgId: row.orgId,
      orgName: row.orgName ?? row.orgSlug ?? "Unknown organization",
      planId: row.subscription.planId,
    });
    setReason("");
  };

  const runSetPlan = async () => {
    if (!overrideOrg) return;
    const trimmed = reason.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await setPlan({
        orgId: overrideOrg.orgId,
        planId: overrideOrg.planId as Id<"plans">,
        reason: trimmed,
      });
      setOverrideOrg(null);
      toast.success("Plan updated");
    } catch (error) {
      toast.error(platformErrorMessage(error, "Could not change the plan."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          Plan assignment for every organization. Stripe-managed billing arrives in Phase 6 —
          overrides here are administrative and audited.
        </p>
      </div>

      {status === "LoadingFirstPage" ? (
        <TableSkeleton rows={6} cols={5} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscriptions yet"
          hint="Subscriptions are created with each new organization."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Org status</TableHead>
                <TableHead className="text-right">Period ends</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => (
                <TableRow key={row.subscription._id}>
                  <TableCell>
                    <Link
                      href={`/platform/organizations/${row.orgId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.orgName ?? "—"}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.orgSlug}</p>
                  </TableCell>
                  <TableCell className="font-medium">{row.planName ?? "—"}</TableCell>
                  <TableCell>
                    <PlatformBadge
                      label={subscriptionStatusLabel[row.subscription.status]}
                      tone={subscriptionStatusTone[row.subscription.status]}
                    />
                  </TableCell>
                  <TableCell>
                    {row.orgStatus ? (
                      <PlatformBadge
                        label={orgStatusLabel[row.orgStatus]}
                        tone={orgStatusTone[row.orgStatus]}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {row.subscription.currentPeriodEndAt
                      ? formatDateTime(row.subscription.currentPeriodEndAt)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openOverride(row)}>
                      Change plan
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(status === "CanLoadMore" || status === "LoadingMore") && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                disabled={status === "LoadingMore"}
                onClick={() => loadMore(20)}
              >
                {status === "LoadingMore" ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={overrideOrg !== null} onOpenChange={(open) => !open && setOverrideOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              Override {overrideOrg?.orgName}&apos;s subscription. Applied immediately and
              recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-select">Plan</Label>
              <Select
                value={overrideOrg?.planId ?? ""}
                onValueChange={(value) =>
                  setOverrideOrg((prev) => (prev ? { ...prev, planId: value ?? "" } : prev))
                }
              >
                <SelectTrigger id="plan-select" className="w-full">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans?.map((plan) => (
                    <SelectItem key={plan._id} value={plan._id}>
                      {plan.name}
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
            <Button variant="outline" disabled={busy} onClick={() => setOverrideOrg(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !overrideOrg?.planId || !reason.trim()}
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
