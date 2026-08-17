### Task 8: Billing page UI + route protection e2e

**Files:**
- Modify: `app/app/[orgSlug]/billing/page.tsx` (full rebuild)
- Modify: `e2e/05-organizer-workspace.spec.ts` (append billing route test)

**Interfaces:**
- Consumes: `api.plans.list`, `api.subscriptions.getForOrg`, `api.billing.payments.listForOrg`, `api.billing.payments.getActiveCheckout`, `api.billing.checkout.createCheckout`, `api.billing.checkout.cancelCheckout`, `api.subscriptions.changePlan`, `api.subscriptions.resume`; UI components `Button`, `Card*`, `Badge`, `Table*`, `PageHeader`; `sonner` toast.
- Produces: the complete billing surface (`/app/[orgSlug]/billing`).

- [ ] **Step 1: Rebuild the billing page**

Replace the entire contents of `app/app/[orgSlug]/billing/page.tsx` with:

```tsx
"use client";

import { Suspense, use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
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
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    if (typeof data.message === "string") return data.message;
  }
  return "Something went wrong. Please try again.";
}

const PAYMENT_STATUS_TONE: Record<string, string> = {
  paid: "bg-success-muted text-success",
  pending: "bg-warning-muted text-warning",
  flagged: "bg-destructive/15 text-destructive",
  failed: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

const PLAN_FEATURE_LABELS: { key: string; label: string }[] = [
  { key: "canExportReports", label: "Report exports" },
  { key: "canUseCustomBranding", label: "Custom branding" },
  { key: "canUseAuditLogs", label: "Audit logs" },
  { key: "canCreateTemplates", label: "Event templates" },
  { key: "canUseAdvancedAnalytics", label: "Advanced analytics" },
];

function BillingContent({ orgSlug }: { orgSlug: string }) {
  const searchParams = useSearchParams();
  const billingResult = searchParams.get("billing");

  const subscription = useQuery(api.subscriptions.getForOrg, { orgSlug });
  const plans = useQuery(api.plans.list, {});
  const payments = useQuery(api.billing.payments.listForOrg, { orgSlug });
  const activeCheckout = useQuery(api.billing.payments.getActiveCheckout, { orgSlug });

  const startCheckout = useMutation(api.billing.checkout.createCheckout);
  const cancelCheckout = useMutation(api.billing.checkout.cancelCheckout);
  const changePlan = useMutation(api.subscriptions.changePlan);
  const resume = useMutation(api.subscriptions.resume);

  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const currentPlanId = subscription?.subscription.planId ?? null;
  const status = subscription?.subscription.status ?? null;
  const cancelAtPeriodEnd = subscription?.subscription.cancelAtPeriodEnd ?? false;
  const periodEndAt = subscription?.subscription.currentPeriodEndAt ?? null;

  const handleCheckout = async (planName: string) => {
    setBusyPlan(planName);
    try {
      const url = await startCheckout({ orgSlug, planName });
      window.location.href = url;
    } catch (error) {
      toast.error(errorMessage(error));
      setBusyPlan(null);
    }
  };

  const handleSwitchToFree = async () => {
    setBusyPlan("Free");
    try {
      await changePlan({ orgSlug, planName: "Free" });
      toast.success("Your plan will cancel at the end of the paid period.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyPlan(null);
    }
  };

  const handleResume = async () => {
    try {
      await resume({ orgSlug });
      toast.success("Subscription resumed.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleCancelCheckout = async () => {
    try {
      await cancelCheckout({ orgSlug });
      toast.info("Checkout cancelled.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (subscription === undefined || plans === undefined) {
    return (
      <div className="grid gap-4 md:grid-cols-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  const visiblePlans = plans.filter((plan) => plan.isActive !== false);
  const pendingCheckoutUrl = activeCheckout?.checkoutUrl ?? null;

  return (
    <div className="space-y-6">
      {billingResult === "success" ? (
        <div className="rounded-lg border border-success/30 bg-success-muted px-4 py-3 text-sm text-success">
          Payment received — your plan updates as soon as PayMongo confirms it (usually within a
          minute).
        </div>
      ) : null}
      {billingResult === "cancelled" ? (
        <div className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Checkout cancelled — nothing was charged.
        </div>
      ) : null}

      {status === "past_due" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-muted px-4 py-3 text-sm text-warning">
          <span>
            Your subscription expired on {formatDate(periodEndAt)}. Renew within the 7-day grace
            period to keep your paid features.
          </span>
        </div>
      ) : null}
      {cancelAtPeriodEnd && status === "active" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/40 bg-info-muted px-4 py-3 text-sm text-info">
          <span>Your subscription cancels on {formatDate(periodEndAt)}.</span>
          <Button size="sm" variant="outline" onClick={handleResume}>
            Resume subscription
          </Button>
        </div>
      ) : null}

      {activeCheckout ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Checkout in progress</CardTitle>
            <CardDescription>
              A {activeCheckout.planName} payment of {formatPeso(activeCheckout.amountCents)} is
              waiting to be completed.
            </CardDescription>
          </CardHeader>
          <CardFooter className="gap-2">
            {pendingCheckoutUrl ? (
              <Button onClick={() => (window.location.href = pendingCheckoutUrl)}>
                Complete payment <ExternalLink aria-hidden className="size-4" />
              </Button>
            ) : null}            <Button variant="outline" onClick={handleCancelCheckout}>
              Cancel checkout
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {visiblePlans.map((plan) => {
          const isCurrent = plan._id === currentPlanId;
          const isFree = (plan.priceCents ?? 0) === 0;
          const busy = busyPlan === plan.name;
          return (
            <Card
              key={plan._id}
              className={cn("flex flex-col", isCurrent && "border-primary ring-1 ring-primary")}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-heading text-xl">{plan.name}</CardTitle>
                  {isCurrent ? <Badge>Current</Badge> : null}
                </div>
                <CardDescription>
                  {isFree ? "Free forever" : `${formatPeso(plan.priceCents ?? 0)} / month`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Up to {plan.limits.maxEvents} event{plan.limits.maxEvents === 1 ? "" : "s"} ·{" "}
                  {plan.limits.maxJudges} judges · {plan.limits.maxContestants} contestants
                </p>
                <ul className="space-y-1.5">
                  {PLAN_FEATURE_LABELS.map(({ key, label }) => {
                    const enabled = plan.features[key as keyof typeof plan.features] === true;
                    return (
                      <li
                        key={key}
                        className={cn(
                          "flex items-center gap-2",
                          enabled ? "text-foreground" : "text-muted-foreground/60",
                        )}
                      >
                        {enabled ? (
                          <CheckCircle2 aria-hidden className="size-4 text-success" />
                        ) : (
                          <XCircle aria-hidden className="size-4" />
                        )}
                        {label}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                {isCurrent && !isFree ? (
                  <>
                    <Button
                      className="w-full"
                      disabled={busy || activeCheckout !== null}
                      onClick={() => void handleCheckout(plan.name)}
                    >
                      {busy ? "Redirecting…" : "Renew"}
                    </Button>
                    {cancelAtPeriodEnd ? null : (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busy || activeCheckout !== null}
                        onClick={handleSwitchToFree}
                      >
                        Switch to Free at period end
                      </Button>
                    )}
                  </>
                ) : !isCurrent && isFree ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={busy || activeCheckout !== null}
                    onClick={handleSwitchToFree}
                  >
                    Switch to Free at period end
                  </Button>
                ) : !isCurrent ? (
                  <Button
                    className="w-full"
                    disabled={busy || activeCheckout !== null}
                    onClick={() => void handleCheckout(plan.name)}
                  >
                    {busy ? "Redirecting…" : `Get ${plan.name}`}
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Payment history</CardTitle>
          <CardDescription>Recent payments for this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments === undefined ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy />
          ) : payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment._id}>
                    <TableCell>{formatDate(payment._creationTime)}</TableCell>
                    <TableCell>{payment.planName ?? "—"}</TableCell>
                    <TableCell>{formatPeso(payment.amountCents)}</TableCell>
                    <TableCell className="capitalize">{payment.billingInterval}</TableCell>
                    <TableCell>
                      {payment.periodStartAt === null
                        ? "—"
                        : `${formatDate(payment.periodStartAt)} → ${formatDate(payment.periodEndAt)}`}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "border-transparent capitalize",
                          PAYMENT_STATUS_TONE[payment.status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {payment.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Your subscription plan, payments, and checkout for this organization."
      />
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
        <BillingContent orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}
```

The `CreditCard` icon is intentionally not imported (the old page used it; the new page does not). Keep only `CheckCircle2`, `ExternalLink`, `XCircle` from lucide.

- [ ] **Step 2: Append the e2e route-protection test**

In `e2e/05-organizer-workspace.spec.ts`, append inside the describe block:

```ts
  test("should enforce unauthenticated route protection on billing page", async ({ page }) => {
    await page.goto("/app/e2e-org/billing");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fapp%2Fe2e-org%2Fbilling/);
  });
```

- [ ] **Step 3: Validate**

```powershell
npm run lint; if ($?) { npm run typecheck }
```

Expected: both pass. If lint flags unused imports, remove them and re-run.

Then run the production build:

```powershell
npm run build
```

Expected: build succeeds (Next 16 may warn about the dynamic page — warnings are fine, errors are not).

- [ ] **Step 4: Commit**

```powershell
git add "app/app/[orgSlug]/billing/page.tsx" e2e/05-organizer-workspace.spec.ts
git commit -m "feat(billing): rebuild billing page with plans, checkout, and payment history"
```

---

