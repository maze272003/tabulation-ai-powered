"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/tabulation/StateBlock";

export default function ReadinessPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });
  const failed = checks?.filter((c) => !c.passed).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Readiness checklist</CardTitle>
        <CardDescription>
          {checks === undefined
            ? "Checking event configuration…"
            : failed === 0
              ? "All checks are passing. This event is ready to publish."
              : `${failed} check${failed === 1 ? "" : "s"} still failing. Resolve them before publishing.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {checks === undefined ? (
          <TableSkeleton rows={5} cols={1} />
        ) : (
          <ul className="space-y-1">
            {checks.map((c) => (
              <li
                key={c.item}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm",
                  c.passed ? "text-muted-foreground" : "bg-destructive/5 text-destructive",
                )}
              >
                {c.passed ? (
                  <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <span className="font-medium">{c.item}</span>
                <span className="text-muted-foreground">— {c.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
