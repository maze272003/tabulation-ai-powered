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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CheckCircle2, CreditCard, LifeBuoy, Loader2, Clock } from "lucide-react";
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
  const refundEligibility = useQuery(api.support.tickets.getRefundEligibility, { orgSlug });
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
    return <div className="h-72 animate-pulse rounded-xl bg-muted" aria-busy />;
  }

  const currentPlan = plans.find((p) => p._id === subscription.subscription.planId);
  const isOwner = subscription.isOwner;
  const status = subscription.subscription.status;
  const periodEndAt = subscription.subscription.currentPeriodEndAt;
  const isPaidPlan = (currentPlan?.priceCents ?? 0) > 0;

  return (
    <div className="space-y-6">
      {status === "past_due" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-muted px-4 py-3 text-sm text-warning">
          <span>
            {isOwner
              ? `Your subscription expired on ${formatDate(periodEndAt)}. Renew within the 7-day grace period to keep your paid features across all your organizations.`
              : "This organization's subscription is past due — ask the owner to renew. Paid features stop working when the grace period ends."}
          </span>
          {isOwner ? (
            <Link href="/app/billing">
              <Button size="sm">Renew now</Button>
            </Link>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Coverage</CardTitle>
          <CardDescription>
            {isOwner
              ? "This organization is covered by your subscription."
              : "This organization is covered by its creator's subscription."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-semibold">{currentPlan?.name ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <Badge variant="outline" className="capitalize">{status}</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Period ends</span>
            <span className="font-mono text-xs">{formatDate(periodEndAt)}</span>
          </div>
          <ul className="space-y-2 pt-2 text-xs">
            {PLAN_FEATURE_LABELS.map(({ key, label }) => {
              const enabled = currentPlan?.features[key as keyof typeof currentPlan.features] === true;
              return (
                <li
                  key={key}
                  className={cn(
                    "flex items-center gap-2",
                    enabled ? "text-foreground font-medium" : "text-muted-foreground/50",
                  )}
                >
                  <CheckCircle2 aria-hidden className="size-3.5 text-success shrink-0" />
                  {enabled ? <span>{label}</span> : <span>{label} — not included</span>}
                </li>
              );
            })}
          </ul>
          {isOwner ? (
            <Link href="/app/billing" className="block pt-2">
              <Button className="w-full font-semibold">Manage subscription</Button>
            </Link>
          ) : (
            <p className="pt-2 text-xs text-muted-foreground">
              Only the subscription owner can change the plan or make payments.
            </p>
          )}
        </CardContent>
      </Card>

      {isOwner && isPaidPlan && refundEligibility ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2 text-base">
              <LifeBuoy className="size-4 text-primary" /> Subscription Refund Policy
            </CardTitle>
            <CardDescription>
              {refundEligibility.isEligible ? (
                <span>
                  Refund requests are valid strictly within <strong>10 hours</strong> of payment.
                  You have <strong>{formatRemainingTime(refundEligibility.remainingMs)}</strong> remaining.
                </span>
              ) : (
                <span>Refund tickets are only accepted within 10 hours of payment. This window has passed.</span>
              )}
            </CardDescription>
          </CardHeader>
          {refundEligibility.isEligible && !refundEligibility.existingTicket ? (
            <CardContent>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRefundDialogOpen(true)}>
                <Clock className="size-4 text-warning" /> Request Refund Ticket
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmitRefund} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LifeBuoy className="size-5 text-primary" /> Request Subscription Refund
              </DialogTitle>
              <DialogDescription>
                Refund tickets are processed by our support team. Submissions are valid strictly
                within <strong>10 hours</strong> from the payment timestamp.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan:</span>
                <span className="font-medium">{refundEligibility?.planName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-medium">{formatPeso(refundEligibility?.amountCents ?? 0)}</span>
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
                Additional Details <span className="text-muted-foreground text-xs">(Optional)</span>
              </Label>
              <textarea
                id="refund-details"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                placeholder="Provide any additional context for our support team..."
                value={refundDetails}
                onChange={(e) => setRefundDetails(e.target.value)}
                disabled={submittingRefund}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRefundDialogOpen(false)} disabled={submittingRefund}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingRefund}>
                {submittingRefund ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Submitting…
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

export default function OrgBillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
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
