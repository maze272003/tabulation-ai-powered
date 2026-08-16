"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/tabulation/StateBlock";

function ReadinessList({ checks }: { checks: { item: string; detail: string; passed: boolean }[] | undefined }) {
  if (checks === undefined) return <TableSkeleton rows={4} cols={1} />;
  return (
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
  );
}

export default function OverviewPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });
  const router = useRouter();
  const failed = checks?.filter((c) => !c.passed).length ?? 0;
  const passedCount = checks?.filter((c) => c.passed).length ?? 0;
  const totalCount = checks?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">Readiness</div>
            <div
              className={cn(
                "font-heading text-2xl font-semibold tracking-tight",
                checks !== undefined && failed === 0 ? "text-success" : failed > 0 ? "text-destructive" : "",
              )}
            >
              {checks === undefined ? "…" : failed === 0 ? "Ready" : `${failed} issue${failed === 1 ? "" : "s"}`}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {passedCount} of {totalCount} checks passing
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">Visibility</div>
            <div className="font-heading text-2xl font-semibold tracking-tight">See settings</div>
            <div className="mt-1 text-xs text-muted-foreground">Result visibility is configured in settings</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-3">
            <div className="text-sm text-muted-foreground">Next step</div>
            <Button
              variant={failed === 0 ? "default" : "outline"}
              onClick={() => router.push(`/app/${orgSlug}/events/${eventSlug}/publish`)}
            >
              {failed === 0 ? "Publish event" : "Review readiness"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Readiness checklist</CardTitle>
          <CardDescription>
            All checks must pass before the event can be published.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReadinessList checks={checks} />
        </CardContent>
      </Card>
    </div>
  );
}
