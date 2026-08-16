"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Radar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { BlackoutNotice } from "@/components/tabulation/BlackoutNotice";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
import { Num } from "@/components/tabulation/Num";
import { StatusBadge, StatusDot } from "@/components/tabulation/StatusBadge";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { sheetStatusLabel, type SheetStatus } from "@/components/tabulation/status";

const legend: SheetStatus[] = ["submitted", "in_progress", "not_started", "locked"];

export default function MonitorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string; roundId: string }>;
}) {
  const { orgSlug, eventSlug, roundId } = use(params);
  const monitor = useQuery(api.roundAdmin.roundMonitor, {
    orgSlug,
    eventSlug,
    roundId: roundId as Id<"rounds">,
  });
  const closeRound = useMutation(api.roundAdmin.closeRound);
  const reopenRound = useMutation(api.roundAdmin.reopenRound);
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const sheetMap = useMemo(() => {
    const map = new Map<string, SheetStatus>();
    if (!monitor || monitor instanceof Error) return map;
    for (const s of monitor.sheets) map.set(`${s.judgeId}:${s.contestantId}`, s.status);
    return map;
  }, [monitor]);

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    toast.error(data?.message ?? "Action failed.");
  };

  if (monitor === undefined) return <TableSkeleton rows={6} cols={6} />;
  if (monitor instanceof Error) {
    return (
      <EmptyState
        icon={Radar}
        title="Monitor unavailable"
        hint={
          (monitor as Error & { data?: { code?: string } }).data?.code === "FORBIDDEN"
            ? "You need scoring permission to view this."
            : undefined
        }
      />
    );
  }

  const total = monitor.sheets.length;
  const submitted = monitor.sheets.filter(
    (s) => s.status === "submitted" || s.status === "locked",
  ).length;
  const unsubmitted = total - submitted;

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      return true;
    } catch (err) {
      onError(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Submission progress
            <StatusBadge kind="round" status={monitor.roundStatus} />
          </h2>
          <span className="text-sm text-muted-foreground">
            <Num value={submitted} /> / <Num value={total} /> submitted
          </span>
          <div
            className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={submitted}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Sheets submitted"
          >
            <div
              className="h-full bg-success transition-all duration-200"
              style={{ width: total === 0 ? "0%" : `${(submitted / total) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {monitor.roundStatus === "open" && (
            <>
              <BlackoutNotice />
              <Button disabled={busy} onClick={() => setCloseOpen(true)}>
                Close round
              </Button>
            </>
          )}
          {monitor.roundStatus === "closed" && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                title="Reopening is recorded in the audit log"
                onClick={() =>
                  run(async () => {
                    await reopenRound({ orgSlug, eventSlug, roundId: roundId as Id<"rounds"> });
                  }, "Round reopened.")
                }
              >
                Reopen
              </Button>
              <Button
                render={
                  <Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${roundId}/review`} />
                }
              >
                Review &amp; publish
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Judge submission progress per contestant</caption>
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="sticky left-0 bg-background py-1 pr-4">Judge</th>
              {monitor.contestants.map((k) => (
                <th key={k.contestantId} className="min-w-11 py-1 text-center">
                  <span className="font-mono tabular-nums">#{k.number}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monitor.judges.map((judge) => (
              <tr key={judge.judgeId} className="border-t">
                <td className="sticky left-0 bg-background py-1 pr-4">{judge.name}</td>
                {monitor.contestants.map((k) => {
                  const status = sheetMap.get(`${judge.judgeId}:${k.contestantId}`);
                  const label = `${judge.name} · #${k.number} · ${
                    status ? sheetStatusLabel[status] : "no sheet"
                  }`;
                  return (
                    <td key={k.contestantId} className="py-1 text-center">
                      {status ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                aria-label={label}
                                className="flex size-10 items-center justify-center rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                              />
                            }
                          >
                            <StatusDot status={status} />
                          </TooltipTrigger>
                          <TooltipContent>{label}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span aria-label="no sheet">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {legend.map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <StatusDot status={status} />
            {sheetStatusLabel[status]}
          </span>
        ))}
      </p>
      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close round"
        description={`${unsubmitted} sheet${unsubmitted === 1 ? " is" : "s are"} unsubmitted and will be excluded from results. Unsubmitted judges can no longer submit.`}
        confirmLabel="Close round"
        busy={busy}
        onConfirm={async () => {
          const ok = await run(async () => {
            await closeRound({ orgSlug, eventSlug, roundId: roundId as Id<"rounds"> });
          }, "Round closed.");
          if (ok) setCloseOpen(false);
        }}
      />
    </div>
  );
}
