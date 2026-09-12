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
import { PageHeader } from "@/components/PageHeader";

export default function PlatformSubscriptionsPage() {
  const plans = useQuery(api.plans.list, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.platform.subscriptions.list,
    {},
    { initialNumItems: 20 },
  );

  const [overrideUser, setOverrideUser] = useState<{
    userId: Id<"userProfiles">;
    ownerLabel: string;
    planId: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const setPlan = useMutation(api.platform.subscriptions.setPlan);

  const openOverride = (row: (typeof results)[number]) => {
    if (!row.userId) return;
    setOverrideUser({
      userId: row.userId,
      ownerLabel: row.ownerEmail ?? row.ownerName ?? "Account",
      planId: row.subscription.planId,
    });
    setReason("");
  };

  const runSetPlan = async () => {
    if (!overrideUser) return;
    const trimmed = reason.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await setPlan({
        userId: overrideUser.userId,
        planId: overrideUser.planId as Id<"plans">,
        reason: trimmed,
      });
      setOverrideUser(null);
      toast.success("Plan updated");
    } catch (error) {
      toast.error(platformErrorMessage(error, "Could not change the plan."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CreditCard}
        title="Subscriptions"
        description="Plan assignment for every account. One subscription covers all organizations its owner creates. Overrides here are administrative and audited."
      />

      {status === "LoadingFirstPage" ? (
        <TableSkeleton rows={6} cols={5} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscriptions yet"
          hint="Subscriptions are created with each user's first organization."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Covered orgs</TableHead>
                <TableHead className="text-right">Period ends</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => (
                <TableRow key={row.subscription._id}>
                  <TableCell>
                    {row.userId ? (
                      <Link
                        href={`/platform/users/${row.userId}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.ownerEmail ?? "—"}
                      </Link>
                    ) : (
                      <span className="font-medium">{row.ownerEmail ?? "—"}</span>
                    )}
                    {row.ownerName ? (
                      <p className="text-xs text-muted-foreground">{row.ownerName}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-medium">{row.planName ?? "—"}</TableCell>
                  <TableCell>
                    <PlatformBadge
                      label={subscriptionStatusLabel[row.subscription.status]}
                      tone={subscriptionStatusTone[row.subscription.status]}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{row.coveredOrgCount}</span>
                    {row.coveredOrgNames.length > 0 ? (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {row.coveredOrgNames.join(", ")}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {row.subscription.currentPeriodEndAt
                      ? formatDateTime(row.subscription.currentPeriodEndAt)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" disabled={!row.userId} onClick={() => openOverride(row)}>
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

      <Dialog open={overrideUser !== null} onOpenChange={(open) => !open && setOverrideUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              Override {overrideUser?.ownerLabel}&apos;s subscription. Applied immediately and
              recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-select">Plan</Label>
              <Select
                value={overrideUser?.planId ?? ""}
                onValueChange={(value) =>
                  setOverrideUser((prev) => (prev ? { ...prev, planId: value ?? "" } : prev))
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
            <Button variant="outline" disabled={busy} onClick={() => setOverrideUser(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !overrideUser?.planId || !reason.trim()}
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
