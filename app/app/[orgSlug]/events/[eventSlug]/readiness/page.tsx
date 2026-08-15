"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function ReadinessPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });

  return (
    <ul className="space-y-1 text-sm">
      {checks?.map((c) => (
        <li key={c.item} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
          {c.passed ? "PASS" : "FAIL"} - {c.item} ({c.detail})
        </li>
      ))}
    </ul>
  );
}
