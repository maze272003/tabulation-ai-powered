"use client";

import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Archive, CheckCircle2, RotateCcw, Rocket, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/tabulation/StateBlock";

export default function PublishPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });
  const publish = useMutation(api.eventLifecycle.publish);
  const reopen = useMutation(api.eventLifecycle.reopen);
  const archive = useMutation(api.eventLifecycle.archive);
  const failed = checks?.filter((c) => !c.passed) ?? [];

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      if (data?.code === "VALIDATION_ERROR") {
        toast.error("Not ready — fix the failing items first.");
      } else {
        toast.error(data?.message ?? "Action failed.");
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Publish checklist</CardTitle>
            {checks !== undefined ? (
              <Badge
                className={cn(
                  "border-transparent",
                  failed.length === 0 ? "bg-success-muted text-success" : "bg-destructive/10 text-destructive",
                )}
              >
                {failed.length === 0 ? "Ready" : `${failed.length} failing`}
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            Publishing locks configuration, generates score sheets, and issues judge access.
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

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle actions</CardTitle>
          <CardDescription>Current status: {ev?.status ?? "…"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {ev?.status === "draft" ? (
            <Button
              disabled={failed.length > 0}
              onClick={() => run(() => publish({ orgSlug, eventSlug }), "Event published.")}
            >
              <Rocket aria-hidden />
              Publish event
            </Button>
          ) : null}
          {ev?.status === "ready" ? (
            <>
              <Button
                variant="outline"
                onClick={() => run(() => reopen({ orgSlug, eventSlug }), "Event reopened.")}
              >
                <RotateCcw aria-hidden />
                Reopen (deletes score sheets)
              </Button>
              <Button
                variant="secondary"
                onClick={() => run(() => archive({ orgSlug, eventSlug }), "Event archived.")}
              >
                <Archive aria-hidden />
                Archive
              </Button>
            </>
          ) : null}
          {ev?.status === "archived" ? (
            <p className="text-sm text-muted-foreground">
              This event is archived and read-only.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
