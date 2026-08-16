"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ClipboardList } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Num } from "@/components/tabulation/Num";
import { StatusBadge, StatusDot } from "@/components/tabulation/StatusBadge";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { sheetStatusLabel } from "@/components/tabulation/status";

export default function ScoringPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const mine = useQuery(api.scoring.myAssignments, { orgSlug, eventSlug });

  if (mine === undefined) return <TableSkeleton rows={4} cols={3} />;
  if (mine instanceof Error) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Scoring unavailable"
        hint="You may not have permission to enter scores for this event."
      />
    );
  }
  if (mine.judgeId === null) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="You are not a judge for this event"
        hint="Judges see their score sheets here once the event is published."
      />
    );
  }
  if (mine.rounds.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No score sheets assigned yet"
        hint="Sheets appear when the event is published and judges are assigned."
      />
    );
  }

  return (
    <div className="space-y-6">
      {mine.rounds.map((round) => {
        const submitted = round.sheets.filter(
          (s) => s.status === "submitted" || s.status === "locked",
        ).length;
        return (
          <section
            key={round.roundId}
            className="space-y-2 rounded-lg border p-4"
            aria-label={round.name}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{round.name}</h2>
                <StatusBadge kind="round" status={round.status} />
              </div>
              <span className="text-xs text-muted-foreground">
                <Num value={submitted} /> / <Num value={round.sheets.length} /> submitted
              </span>
            </div>
            <ul className="divide-y">
              {round.sheets.map((sheet) => {
                const actionable =
                  round.status === "open" &&
                  sheet.status !== "submitted" &&
                  sheet.status !== "locked";
                return (
                  <li
                    key={sheet.sheetId}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <StatusDot
                        status={sheet.status}
                        label={`${sheet.contestantName}: ${sheetStatusLabel[sheet.status]}`}
                      />
                      <span className="font-mono tabular-nums text-muted-foreground">
                        #{sheet.contestantNumber}
                      </span>
                      {sheet.contestantName}
                    </span>
                    {actionable ? (
                      <Link
                        className="underline underline-offset-4"
                        href={`/app/${orgSlug}/events/${eventSlug}/scoring/${round.roundId}/${sheet.contestantId}`}
                      >
                        {sheet.status === "in_progress" ? "Continue" : "Score"}
                      </Link>
                    ) : (
                      <StatusBadge kind="sheet" status={sheet.status} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
