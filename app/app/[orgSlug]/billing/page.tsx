"use client";

import { Suspense, use } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "@/components/PageHeader";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CreditCard,
  LifeBuoy,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const pesoFormat = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
});

function formatPeso(cents: number): string {
  return pesoFormat.format(cents / 100);
}

function formatDate(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRemainingTime(ms: number): string {
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    if (typeof data.message === "string") return data.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

const PLAN_FEATURE_LABELS: { key: string; label: string }[] = [
  { key: "canExportReports", label: "Report exports" },
  { key: "canUseCustomBranding", label: "Custom branding" },
  { key: "canUseAuditLogs", label: "Audit logs" },
  { key: "canCreateTemplates", label: "Event templates" },
  { key: "canUseAdvancedAnalytics", label: "Advanced analytics" },
];

function OrgBillingContent({ orgSlug }: { orgSlug: string }) {
  const subscription = useQuery(api.subscriptions.getForOrg, { orgSlug });
  const plans = useQuery(api.plans.list, {});
  const refundEligibility = useQuery(
    api.support.tickets.getRefundEligibility,
    { orgSlug },
  );
  const submitRefundTicket = useMutation(api.support.tickets.createRefundTicket);

  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundDetails, setRefundDetails] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (refundReason.trim().length < 3) {
      toast.error("Please provide a reason for the refund request.");
      return;
    }
    setSubmittingRefund(true);
    try {
      const res = await submitRefundTicket({
        orgSlug,
        reason: refundReason.trim(),
        details: refundDetails.trim() || undefined,
      });
      toast.success(res.message);
      setRefundDialogOpen(false);
      setRefundReason("");
      setRefundDetails("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmittingRefund(false);
    }
  };

  if (subscription === undefined || plans === undefined) {
    return (
      <div className="h-72 animate-pulse rounded-xl bg-muted" aria-busy />
    );
  }

  const currentPlan = plans.find(
    (p) => p._id === subscription.subscription.planId,
  );
  const isOwner = subscription.isOwner;
  const status = subscription.subscription.status;
  const periodEndAt = subscription.subscription.currentPeriodEndAt;
  const isPaidPlan = (currentPlan?.priceCents ?? 0) > 0;

  return (
    <div className="space-y-6">
      {status === "past_due" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <span>
            {isOwner
              ? `Your subscription expired on ${formatDate(periodEndAt)}. Renew within the 7-day grace period to keep your paid features across all your organizations.`
              : "This organization's subscription is past due — ask the owner to renew. Paid features stop working when the grace period ends."}
          </span>
          {isOwner ? (
            <Link href={`/app/billing?from=${orgSlug}`}>
              <Button size="sm" variant="outline">
                Renew now
              </Button>
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Coverage Card */}
      <Card className="rounded-xl border-border/70 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <CardTitle className="font-heading text-base font-semibold tracking-tight">
                  Subscription Coverage
                </CardTitle>
                <CardDescription className="text-[13px]">
                  {isOwner
                    ? "This organization is covered by your personal account subscription."
                    : "This organization is covered by its creator's subscription."}
                </CardDescription>
              </div>
            </div>
            {subscription.subscription.cancelAtPeriodEnd ? (
              <Badge
                variant="outline"
                className="shrink-0 gap-1.5 border-amber-500/30 bg-amber-500/10 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
              >
                <span className="size-1.5 rounded-full bg-amber-500" />
                Cancelling
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 gap-1.5 text-[11px] font-semibold capitalize",
                  status === "active" &&
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    status === "active" ? "bg-emerald-500" : "bg-muted-foreground",
                  )}
                />
                {status}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70 sm:grid-cols-3">
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Active Plan
              </p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {currentPlan?.name ?? "—"}
              </p>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {subscription.subscription.cancelAtPeriodEnd
                  ? "Access Ends"
                  : "Current Period Ends"}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {formatDate(periodEndAt)}
              </p>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Pooled Capacity
              </p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {currentPlan?.limits.maxEvents ?? 1} events ·{" "}
                {currentPlan?.limits.maxJudges ?? 5} judges
              </p>
            </div>
          </div>

          {/* Entitlements */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Entitlements Included
            </p>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {PLAN_FEATURE_LABELS.map(({ key, label }) => {
                const enabled =
                  currentPlan?.features[
                    key as keyof typeof currentPlan.features
                  ] === true;
                return (
                  <li
                    key={key}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px]",
                      enabled
                        ? "border-border/70 bg-card text-foreground"
                        : "border-dashed border-border/60 bg-muted/30 text-muted-foreground",
                    )}
                  >
                    {enabled ? (
                      <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <X className="size-3.5 shrink-0 text-muted-foreground/60" />
                    )}
                    <span className={cn(!enabled && "line-through opacity-70")}>
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* CTA — compact, aligned right, not a full-width banner */}
          {isOwner ? (
            <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
              <p className="text-xs text-muted-foreground">
                Change your plan, update payment method, or view invoices.
              </p>
              <Link href={`/app/billing?from=${orgSlug}`}>
                <Button size="sm" className="gap-1.5 font-medium">
                  <CreditCard className="size-3.5" />
                  Manage Subscription
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="border-t border-border/70 pt-4">
              <p className="text-xs text-muted-foreground">
                Only the subscription owner can change the plan or make
                payments.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Refund Card */}
      {isOwner && isPaidPlan && refundEligibility ? (
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                <LifeBuoy className="size-4" />
              </div>
              <div>
                <CardTitle className="font-heading text-base font-semibold tracking-tight">
                  Subscription Refund Policy
                </CardTitle>
                <CardDescription className="text-[13px]">
                  {refundEligibility.isEligible ? (
                    <>
                      Refund requests are valid strictly within{" "}
                      <span className="font-medium text-foreground">
                        10 hours
                      </span>{" "}
                      of payment. You have{" "}
                      <span className="font-medium text-foreground">
                        {formatRemainingTime(refundEligibility.remainingMs)}
                      </span>{" "}
                      remaining.
                    </>
                  ) : (
                    <>
                      Refund tickets are only accepted within 10 hours of
                      payment. This window has passed.
                    </>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          {refundEligibility.isEligible &&
          !refundEligibility.existingTicket ? (
            <CardContent className="pt-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setRefundDialogOpen(true)}
              >
                <CalendarClock className="size-3.5" />
                Request Refund Ticket
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {/* Refund Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmitRefund} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LifeBuoy className="size-5 text-primary" />
                Request Subscription Refund
              </DialogTitle>
              <DialogDescription>
                Refund tickets are processed by our support team. Submissions
                are valid strictly within <strong>10 hours</strong> from the
                payment timestamp.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/40 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">
                  {refundEligibility?.planName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">
                  {formatPeso(refundEligibility?.amountCents ?? 0)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reason">
                Reason for Refund <span className="text-destructive">*</span>
              </Label>
              <Input
                id="refund-reason"
                placeholder="e.g. Upgraded by mistake, wrong tier selected"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                required
                maxLength={500}
                disabled={submittingRefund}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-details">
                Additional Details{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (Optional)
                </span>
              </Label>
              <textarea
                id="refund-details"
                className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Provide any additional context for our support team..."
                value={refundDetails}
                onChange={(e) => setRefundDetails(e.target.value)}
                disabled={submittingRefund}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefundDialogOpen(false)}
                disabled={submittingRefund}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingRefund}>
                {submittingRefund ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit Refund Ticket"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OrgBillingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  return (
    <div className="space-y-6">
      <PageHeader
        icon={CreditCard}
        title="Billing"
        description="Subscription coverage for this organization."
      />
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
        <OrgBillingContent orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}