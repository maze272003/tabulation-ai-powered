"use client";

import { Suspense, useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
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

function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    if (typeof data.message === "string") return data.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

const PAYMENT_STATUS_TONE: Record<string, string> = {
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  flagged: "bg-destructive/10 text-destructive border-destructive/20",
  failed: "bg-muted text-muted-foreground border-border/60",
  expired: "bg-muted text-muted-foreground border-border/60",
  cancelled: "bg-muted text-muted-foreground border-border/60",
};

const PLAN_FEATURE_LABELS: { key: string; label: string }[] = [
  { key: "canExportReports", label: "Report exports" },
  { key: "canUseCustomBranding", label: "Custom branding" },
  { key: "canUseAuditLogs", label: "Audit logs" },
  { key: "canCreateTemplates", label: "Event templates" },
  { key: "canUseAdvancedAnalytics", label: "Advanced analytics" },
];

const PLAN_DESCRIPTIONS: Record<string, string> = {
  Free: "Essential tools for small gatherings and initial testing.",
  Starter: "Perfect for local pageants, school events, and competitions.",
  Pro: "Maximum scale for multi-day festivals, pageants, and organizations.",
};

function BillingContent() {
  const searchParams = useSearchParams();
  const billingResult = searchParams.get("billing");
  const fromOrg = searchParams.get("from");

  const subscription = useQuery(api.subscriptions.getMine, {});
  const plans = useQuery(api.plans.list, {});
  const payments = useQuery(api.billing.payments.listForUser, {});
  const activeCheckout = useQuery(api.billing.payments.getActiveCheckout, {});

  const cancelMine = useMutation(api.subscriptions.cancelMine);
  const resumeMine = useMutation(api.subscriptions.resumeMine);
  const startCheckout = useAction(api.billing.checkout.createCheckout);
  const cancelCheckout = useMutation(api.billing.checkout.cancelCheckout);
  const syncCheckout = useAction(api.billing.checkout.syncCheckoutStatus);

  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentPlanId = subscription?.subscription.planId ?? null;
  const status = subscription?.subscription.status ?? null;
  const periodEndAt = subscription?.subscription.currentPeriodEndAt ?? null;
  const cancelAtPeriodEnd = Boolean(subscription?.subscription.cancelAtPeriodEnd);

  // Automatically verify and poll payment status if redirected from checkout with ?billing=success
  useEffect(() => {
    if (!activeCheckout && billingResult !== "success") return;

    let isMounted = true;
    let attempts = 0;
    const maxAttempts = 10;
    setSyncing(true);

    const checkPayment = async () => {
      try {
        const res = await syncCheckout({});
        if (!isMounted) return;
        if (res.status === "activated") {
          toast.success(`Subscription activated! You are now on the ${res.planName} plan.`);
          setSyncing(false);
          return;
        }
        if (res.status === "cancelled" || res.status === "no_pending" || res.status === "already_active") {
          setSyncing(false);
          return;
        }
        attempts++;
        if (attempts < maxAttempts && isMounted) {
          setTimeout(checkPayment, 2000);
        } else if (isMounted) {
          setSyncing(false);
        }
      } catch {
        if (isMounted) setSyncing(false);
      }
    };

    void checkPayment();

    return () => {
      isMounted = false;
    };
  }, [billingResult, activeCheckout?.paymentId, syncCheckout]);

  const handleCheckout = async (planName: string) => {
    setBusyPlan(planName);
    try {
      const url = await startCheckout({ planName });
      window.location.assign(url);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusyPlan(null);
    }
  };

  const handleCancelCheckout = async () => {
    try {
      await cancelCheckout({});
      toast.info("Checkout cancelled.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleSyncCheckout = async () => {
    setSyncing(true);
    try {
      const res = await syncCheckout({});
      if (res.status === "activated") {
        toast.success(`Subscription activated! You are now on the ${res.planName} plan.`);
      } else if (res.status === "still_pending") {
        toast.info(
          "Payment is not yet confirmed by PayMongo. If you have completed payment, please wait a moment and try again.",
        );
      } else if (res.status === "cancelled") {
        toast.info("The checkout session was cancelled or expired.");
      } else if (res.status === "error") {
        toast.error(res.message ?? "Could not verify payment with PayMongo.");
      } else {
        toast.info("No pending checkout found.");
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      await cancelMine({});
      toast.success("Cancellation scheduled. You retain all benefits until your billing period ends.");
      setCancelDialogOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsCancelling(false);
    }
  };

  const handleResumeSubscription = async () => {
    setIsResuming(true);
    try {
      await resumeMine({});
      toast.success("Subscription resumed! Your plan will renew automatically.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsResuming(false);
    }
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success("Reference copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (subscription === undefined || plans === undefined) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/85 px-4 sm:px-8 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Trophy className="size-4" />
            </span>
            <span className="font-heading font-bold text-sm tracking-tight text-foreground">Tabulation</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          <div className="grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  const visiblePlans = plans.filter((plan) => plan.isActive !== false);
  const pendingCheckoutUrl = activeCheckout?.checkoutUrl ?? null;
  const currentPlan = plans.find((p) => p._id === currentPlanId);
  const isPaidPlan = (currentPlan?.priceCents ?? 0) > 0;
  const currentPrice = currentPlan?.priceCents ?? 0;

  const requestedPlanName = searchParams.get("plan");
  const targetPlan = requestedPlanName
    ? plans.find((p) => p.name.toLowerCase() === requestedPlanName.toLowerCase())
    : undefined;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Application Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/85 px-4 sm:px-8 backdrop-blur-md print:hidden">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/app" className="flex items-center gap-2.5 group">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shadow-xs">
              <Trophy className="size-4" />
            </span>
            <span className="font-heading font-bold text-sm tracking-tight text-foreground">
              Tabulation
            </span>
          </Link>
          <span className="text-muted-foreground/30 hidden sm:inline-block">/</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-semibold bg-muted/50 border-border/60 gap-1.5 py-0.5">
              <CreditCard className="size-3 text-primary" />
              Account Billing
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {fromOrg ? (
            <Link href={`/app/${fromOrg}/billing`}>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-semibold shadow-xs border-border/70 hover:bg-muted">
                <ArrowLeft className="size-3.5 text-muted-foreground" />
                Back to <span className="font-bold text-foreground">{fromOrg}</span>
              </Button>
            </Link>
          ) : (
            <Link href="/app">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-3.5" />
                Back to Workspace
              </Button>
            </Link>
          )}
          <div className="h-4 w-px bg-border/60 hidden sm:block" />
          <NotificationBell />
          <UserMenu />
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page Title & Context */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-border/50">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Subscription & Coverage
              </span>
              {isPaidPlan && !cancelAtPeriodEnd ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              ) : cancelAtPeriodEnd ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Cancelling
                </span>
              ) : null}
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Account Billing
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
              Your subscription covers every organization you create. Upgrade once, tabulate everywhere.
            </p>
          </div>
        </div>

        {/* Selected Plan Alert from Landing Page */}
        {targetPlan && targetPlan._id !== currentPlanId ? (
          <div className="p-4 bg-primary/10 border border-primary/25 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm shadow-xs">
            <div className="flex items-start gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary shrink-0 mt-0.5">
                <Sparkles className="size-5" />
              </span>
              <div>
                <span className="font-bold text-foreground">Selected Plan: {targetPlan.name}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You selected the {targetPlan.name} plan ({formatPeso(targetPlan.priceCents ?? 0)}/month). Complete checkout below to activate it across all your organizations.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="font-semibold shrink-0 gap-1.5 shadow-xs"
              disabled={busyPlan === targetPlan.name || activeCheckout !== null}
              onClick={() => void handleCheckout(targetPlan.name)}
            >
              {busyPlan === targetPlan.name ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CreditCard className="size-3.5" />
              )}
              Upgrade to {targetPlan.name}
            </Button>
          </div>
        ) : null}

        {/* Payment Confirmation Banner */}
        {billingResult === "success" ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 shadow-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 shrink-0" />
              <span className="font-medium">
                {syncing
                  ? "Verifying payment with PayMongo…"
                  : "Payment received — your subscription is active across all organizations."}
              </span>
            </div>
            {syncing ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          </div>
        ) : null}
        {billingResult === "cancelled" ? (
          <div className="rounded-xl border border-border/80 bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            Checkout session was cancelled — no charges were made.
          </div>
        ) : null}

        {/* Past Due Warning */}
        {status === "past_due" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-muted p-4 text-sm text-warning shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 shrink-0 mt-0.5 text-warning" />
              <div>
                <p className="font-bold text-foreground">Payment Past Due</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your subscription expired on {formatDate(periodEndAt)}. Renew within the 7-day grace period to keep your paid features.
                </p>
              </div>
            </div>
            {currentPlan ? (
              <Button
                size="sm"
                className="font-semibold shadow-xs"
                disabled={busyPlan === currentPlan.name || activeCheckout !== null}
                onClick={() => void handleCheckout(currentPlan.name)}
              >
                Renew Subscription
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Active Checkout Card */}
        {activeCheckout ? (
          <Card className="border-primary/40 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Checkout in progress</CardTitle>
              <CardDescription>
                A {activeCheckout.planName} payment of {formatPeso(activeCheckout.amountCents)} is waiting to be completed.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-wrap gap-2 pt-0">
              {pendingCheckoutUrl ? (
                <Button onClick={() => window.location.assign(pendingCheckoutUrl)}>
                  Complete payment <ExternalLink aria-hidden className="size-4 ml-1.5" />
                </Button>
              ) : null}
              <Button variant="outline" disabled={syncing} onClick={handleSyncCheckout}>
                {syncing ? (
                  <>
                    <Loader2 aria-hidden className="size-4 animate-spin mr-1.5" /> Verifying…
                  </>
                ) : (
                  <>
                    <RefreshCw aria-hidden className="size-4 mr-1.5" /> Verify payment
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleCancelCheckout}>
                Cancel checkout
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {/* Current Subscription Hero Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card to-card/70 p-6 sm:p-8 shadow-sm backdrop-blur-xs">
          {/* Ambient Glow */}
          <div className="absolute -top-24 -right-24 size-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3.5">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs shrink-0">
                  <ShieldCheck className="size-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                      {currentPlan?.name ?? "Free"} Plan
                    </h2>
                    {cancelAtPeriodEnd ? (
                      <Badge variant="outline" className="border-warning/50 text-warning bg-warning-muted text-xs font-semibold">
                        Cancels at Period End
                      </Badge>
                    ) : status === "past_due" ? (
                      <Badge variant="outline" className="border-destructive/50 text-destructive bg-destructive/10 text-xs font-semibold">
                        Past Due
                      </Badge>
                    ) : isPaidPlan ? (
                      <Badge className="bg-emerald-600 text-white text-xs font-semibold shadow-xs">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs font-semibold">
                        Free Forever
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isPaidPlan
                      ? `${formatPeso(currentPlan?.priceCents ?? 0)} billed monthly · Covers all your created organizations`
                      : "Basic limits for personal tabulations and events"}
                  </p>
                </div>
              </div>

              {/* Capacity Stat Pills */}
              <div className="flex flex-wrap gap-2.5 pt-1">
                <div className="inline-flex items-center gap-2 rounded-lg bg-muted/60 border border-border/60 px-3 py-1.5 text-xs text-foreground shadow-2xs">
                  <CalendarDays className="size-3.5 text-primary shrink-0" />
                  <span className="font-bold">{currentPlan?.limits.maxEvents ?? 1}</span>
                  <span className="text-muted-foreground">Pooled Event{(currentPlan?.limits.maxEvents ?? 1) === 1 ? "" : "s"}</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg bg-muted/60 border border-border/60 px-3 py-1.5 text-xs text-foreground shadow-2xs">
                  <Users className="size-3.5 text-primary shrink-0" />
                  <span className="font-bold">{currentPlan?.limits.maxJudges ?? 5}</span>
                  <span className="text-muted-foreground">Pooled Judges</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg bg-muted/60 border border-border/60 px-3 py-1.5 text-xs text-foreground shadow-2xs">
                  <Award className="size-3.5 text-primary shrink-0" />
                  <span className="font-bold">{currentPlan?.limits.maxContestants ?? 20}</span>
                  <span className="text-muted-foreground">Pooled Contestants</span>
                </div>
              </div>
            </div>

            {/* Right Status & Actions */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-border/50">
              {isPaidPlan ? (
                <div className="text-left lg:text-right">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground block font-medium">
                    {cancelAtPeriodEnd ? "Access Period Ends" : "Next Renewal Date"}
                  </span>
                  <span className="text-sm font-semibold font-mono text-foreground mt-0.5 block">
                    {formatDate(periodEndAt)}
                  </span>
                </div>
              ) : null}

              <div className="flex items-center gap-2 pt-1">
                {cancelAtPeriodEnd ? (
                  <Button
                    size="sm"
                    className="font-semibold shadow-xs gap-1.5"
                    disabled={isResuming}
                    onClick={handleResumeSubscription}
                  >
                    {isResuming ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Resume Subscription
                  </Button>
                ) : isPaidPlan ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 shadow-2xs"
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    Cancel Auto-Renewal
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Cancellation Notice Banner inside card */}
          {cancelAtPeriodEnd ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-muted/70 p-4 text-xs text-warning">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" />
              <div className="space-y-0.5">
                <p className="font-bold text-foreground">Cancellation scheduled for {formatDate(periodEndAt)}</p>
                <p className="text-muted-foreground">
                  You retain full access to all {currentPlan?.name} features until then. After this date, your organizations will downgrade to Free tier limits.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Plans Comparison Section */}
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">
                Available Plans
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose the plan that fits your competition and festival scale.
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3 items-stretch">
            {visiblePlans.map((plan) => {
              const isCurrent = plan._id === currentPlanId;
              const isFree = (plan.priceCents ?? 0) === 0;
              const planPrice = plan.priceCents ?? 0;
              const isUpgrade = planPrice > currentPrice;
              const busy = busyPlan === plan.name;
              const isSelectedFromLanding = Boolean(
                requestedPlanName &&
                plan.name.toLowerCase() === requestedPlanName.toLowerCase() &&
                !isCurrent
              );
              const isFeatured =
                plan.name.toLowerCase().includes("pro") ||
                plan.name.toLowerCase().includes("growth") ||
                isSelectedFromLanding;

              const cardContent = (
                <div className="flex flex-col h-full justify-between p-6 sm:p-7">
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-heading font-extrabold text-xl tracking-tight text-foreground">
                        {plan.name}
                      </h3>
                      {isCurrent ? (
                        <Badge className="bg-primary text-primary-foreground text-[10px] font-bold shadow-xs">
                          Current Plan
                        </Badge>
                      ) : isSelectedFromLanding ? (
                        <Badge className="bg-primary text-primary-foreground text-[10px] font-bold gap-1 shadow-xs">
                          <Sparkles className="size-3" />
                          Selected
                        </Badge>
                      ) : isFeatured ? (
                        <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-[10px] font-bold">
                          Recommended
                        </Badge>
                      ) : null}
                    </div>

                    <p className="text-xs text-muted-foreground min-h-[32px] mb-4">
                      {PLAN_DESCRIPTIONS[plan.name] ?? "Enhanced capacity and capabilities."}
                    </p>

                    {/* Price */}
                    <div className="mb-5 pb-5 border-b border-border/60">
                      <div className="flex items-baseline">
                        <span className="font-heading font-extrabold text-3xl text-foreground">
                          {isFree ? "Free" : formatPeso(plan.priceCents ?? 0)}
                        </span>
                        {!isFree && (
                          <span className="text-xs text-muted-foreground ml-1.5 font-normal">
                            / month
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {isFree ? "Free forever for basic scoring" : "Billed monthly via PayMongo"}
                      </span>
                    </div>

                    {/* Pooled Limits Highlight */}
                    <div className="space-y-1.5 mb-5 pb-5 border-b border-border/60 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Events:</span>
                        <span className="font-bold text-foreground">Up to {plan.limits.maxEvents} pooled</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Judges:</span>
                        <span className="font-bold text-foreground">Up to {plan.limits.maxJudges} pooled</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Contestants:</span>
                        <span className="font-bold text-foreground">Up to {plan.limits.maxContestants} pooled</span>
                      </div>
                    </div>

                    {/* Feature List */}
                    <ul className="space-y-2.5 mb-6 text-xs">
                      {PLAN_FEATURE_LABELS.map(({ key, label }) => {
                        const enabled = plan.features[key as keyof typeof plan.features] === true;
                        return (
                          <li
                            key={key}
                            className={cn(
                              "flex items-center gap-2.5",
                              enabled ? "text-foreground font-medium" : "text-muted-foreground/45",
                            )}
                          >
                            {enabled ? (
                              <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                                <Check className="size-2.5 stroke-[3]" />
                              </span>
                            ) : (
                              <span className="flex size-4 items-center justify-center rounded-full bg-muted text-muted-foreground/40 shrink-0">
                                <X className="size-2.5" />
                              </span>
                            )}
                            <span>{label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Card Bottom CTA */}
                  <div className="pt-2">
                    {isCurrent ? (
                      cancelAtPeriodEnd ? (
                        <Button
                          className="w-full font-semibold shadow-xs"
                          disabled={isResuming}
                          onClick={handleResumeSubscription}
                        >
                          {isResuming ? (
                            <>
                              <Loader2 className="size-4 animate-spin mr-1.5" />
                              Resuming…
                            </>
                          ) : (
                            <>
                              <RefreshCw className="size-4 mr-1.5" />
                              Resume Subscription
                            </>
                          )}
                        </Button>
                      ) : status === "past_due" ? (
                        <Button
                          className="w-full font-semibold shadow-xs"
                          disabled={busy || activeCheckout !== null}
                          onClick={() => void handleCheckout(plan.name)}
                        >
                          {busy ? "Redirecting…" : "Renew Subscription"}
                        </Button>
                      ) : isFree ? (
                        <Button variant="outline" className="w-full font-medium" disabled>
                          Current Plan
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 cursor-default hover:bg-emerald-500/5 hover:text-emerald-600 gap-1.5"
                          disabled
                        >
                          <CheckCircle2 className="size-4" />
                          Current Plan (Active)
                        </Button>
                      )
                    ) : isFree ? (
                      cancelAtPeriodEnd ? (
                        <Button variant="outline" className="w-full font-medium" disabled>
                          Downgrade Scheduled
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 shadow-2xs"
                          onClick={() => setCancelDialogOpen(true)}
                        >
                          Downgrade to Free
                        </Button>
                      )
                    ) : (
                      <Button
                        className={cn(
                          "w-full font-semibold shadow-xs transition-all",
                          isUpgrade
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                            : "hover:bg-muted"
                        )}
                        variant={isUpgrade ? "default" : "outline"}
                        disabled={busy || activeCheckout !== null}
                        onClick={() => void handleCheckout(plan.name)}
                      >
                        {busy
                          ? "Redirecting…"
                          : isUpgrade
                            ? `Upgrade to ${plan.name}`
                            : `Switch to ${plan.name}`}
                      </Button>
                    )}
                  </div>
                </div>
              );

              if ((isFeatured || isSelectedFromLanding) && !isCurrent) {
                return (
                  <BorderBeamPanel
                    key={plan._id}
                    glow
                    className="bg-card h-full rounded-2xl"
                    containerClassName="h-full rounded-2xl"
                  >
                    {cardContent}
                  </BorderBeamPanel>
                );
              }

              return (
                <Card
                  key={plan._id}
                  className={cn(
                    "flex flex-col h-full bg-card rounded-2xl transition-all duration-200 hover:shadow-md",
                    isCurrent && "border-primary/70 ring-2 ring-primary/20 shadow-xs"
                  )}
                >
                  {cardContent}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Cancellation / Downgrade Confirmation Dialog */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading text-lg">Cancel Subscription?</DialogTitle>
              <DialogDescription>
                Your subscription will remain active until the end of your current billing period.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm text-foreground">
              <div className="rounded-xl bg-muted/60 p-4 space-y-2 border border-border/60">
                <p className="font-semibold text-foreground">What happens next:</p>
                <ul className="list-disc list-inside space-y-1.5 text-xs text-muted-foreground">
                  <li>
                    You will keep all <strong>{currentPlan?.name ?? "Paid"}</strong> features across your organizations until{" "}
                    <span className="font-medium text-foreground">{formatDate(periodEndAt)}</span>.
                  </li>
                  <li>
                    On {formatDate(periodEndAt)}, your account will automatically downgrade to the <strong>Free tier</strong> (1 pooled event, 5 judges, 20 contestants).
                  </li>
                  <li>
                    You will not be billed again unless you choose to resubscribe.
                  </li>
                  <li>
                    You can resume your subscription anytime before your billing period ends.
                  </li>
                </ul>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setCancelDialogOpen(false)}
                disabled={isCancelling}
              >
                Keep Subscription
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelSubscription}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1.5" />
                    Cancelling…
                  </>
                ) : (
                  "Confirm Downgrade to Free"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment History Card */}
        <Card className="rounded-2xl border border-border/80 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">Payment History</CardTitle>
            <CardDescription>All transactions and invoices on your account.</CardDescription>
          </CardHeader>
          <CardContent>
            {payments === undefined ? (
              <div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy />
            ) : payments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead>Payment Reference</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Interval</TableHead>
                      <TableHead>Billing Period</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => {
                      const ref = payment.referenceNumber || payment._id;
                      return (
                        <TableRow key={payment._id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5 group">
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {ref}
                              </span>
                              <button
                                type="button"
                                title="Copy reference"
                                onClick={() => handleCopy(ref)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                              >
                                {copiedId === ref ? (
                                  <Check className="size-3 text-emerald-500" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </button>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(payment._creationTime)}</TableCell>
                          <TableCell className="font-medium text-xs">{payment.planName ?? "—"}</TableCell>
                          <TableCell className="font-bold text-xs">{formatPeso(payment.amountCents)}</TableCell>
                          <TableCell className="capitalize text-xs text-muted-foreground">{payment.billingInterval}</TableCell>
                          <TableCell className="text-xs">
                            {payment.periodStartAt === null
                              ? "—"
                              : `${formatDate(payment.periodStartAt)} → ${formatDate(payment.periodEndAt)}`}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                "border text-[11px] capitalize font-semibold px-2 py-0.5 shadow-2xs",
                                PAYMENT_STATUS_TONE[payment.status] ?? "bg-muted text-muted-foreground border-border/60",
                              )}
                            >
                              {payment.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function UserBillingPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
      <BillingContent />
    </Suspense>
  );
}
