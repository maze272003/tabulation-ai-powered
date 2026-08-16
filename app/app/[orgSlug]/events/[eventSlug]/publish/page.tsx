"use client";

import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
        toast.error("Not ready - fix the failing items first.");
      } else {
        toast.error(data?.message ?? "Action failed.");
      }
    }
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-1 text-sm">
        {checks?.map((c) => (
          <li key={c.item} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
            {c.passed ? "PASS" : "FAIL"} - {c.item} ({c.detail})
          </li>
        ))}
      </ul>
      {ev?.status === "draft" && (
        <Button disabled={failed.length > 0} onClick={() => run(() => publish({ orgSlug, eventSlug }), "Event published.")}>
          Publish event
        </Button>
      )}
      {ev?.status === "ready" && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => run(() => reopen({ orgSlug, eventSlug }), "Event reopened.")}>
            Reopen (delete score sheets)
          </Button>
          <Button variant="secondary" onClick={() => run(() => archive({ orgSlug, eventSlug }), "Event archived.")}>
            Archive
          </Button>
        </div>
      )}
      {ev?.status === "archived" && <p className="text-sm text-muted-foreground">This event is archived.</p>}
    </div>
  );
}
