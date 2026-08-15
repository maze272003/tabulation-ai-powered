"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function OverviewPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });
  const router = useRouter();
  const failed = checks?.filter((c) => !c.passed).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Readiness</div>
          <div className="text-2xl">{failed === 0 ? "Ready" : `${failed} issue(s)`}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Visibility</div>
          <div className="text-2xl capitalize">{checks === undefined ? "…" : "See settings"}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Next step</div>
          <Button className="mt-1" variant={failed === 0 ? "default" : "outline"} onClick={() => router.push(`/app/${orgSlug}/events/${eventSlug}/publish`)}>
            {failed === 0 ? "Publish" : "Review readiness"}
          </Button>
        </div>
      </div>
      <ul className="space-y-1 text-sm">
        {checks?.map((c) => (
          <li key={c.item} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
            {c.passed ? "PASS" : "FAIL"} - {c.item} ({c.detail})
          </li>
        ))}
      </ul>
    </div>
  );
}
