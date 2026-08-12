"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";

export default function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const data = useQuery(api.subscriptions.getForOrg, { orgSlug });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <Card className="p-4 space-y-2">
        <div className="text-sm text-muted-foreground">Current plan</div>
        <div className="text-2xl">{data?.plan?.name ?? "—"}</div>
        <div className="text-xs text-muted-foreground">Status: {data?.subscription.status}</div>
      </Card>
      <p className="text-sm text-muted-foreground">Stripe integration and plan changes arrive in Phase 6.</p>
    </div>
  );
}
