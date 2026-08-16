"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const SUBSCRIPTION_TONE: Record<string, string> = {
  active: "bg-success-muted text-success",
  trialing: "bg-info-muted text-info",
  past_due: "bg-warning-muted text-warning",
  canceled: "bg-muted text-muted-foreground",
};

export default function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const data = useQuery(api.subscriptions.getForOrg, { orgSlug });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Your subscription plan and usage limits for this organization."
      />
      <div className="max-w-xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CreditCard aria-hidden className="size-5" />
              </span>
              <div>
                <CardTitle className="font-heading text-xl">{data?.plan?.name ?? "—"}</CardTitle>
                <CardDescription>Current plan</CardDescription>
              </div>
              {data?.subscription ? (
                <Badge
                  className={cn(
                    "ml-auto border-transparent capitalize",
                    SUBSCRIPTION_TONE[data.subscription.status] ??
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {data.subscription.status}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Stripe integration and plan changes arrive in Phase 6.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
