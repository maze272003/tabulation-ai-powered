"use client";

import { use } from "react";
import { Card } from "@/components/ui/card";

export default function OverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-sm text-muted-foreground">Events</div><div className="text-2xl">0</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">Members</div><div className="text-2xl">—</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">Plan</div><div className="text-2xl">Free</div></Card>
      </div>
      <p className="text-sm text-muted-foreground">Welcome to {orgSlug}. Competition features arrive in Phase 2.</p>
    </div>
  );
}
