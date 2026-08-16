"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Num } from "@/components/tabulation/Num";
import { VersionBadge } from "@/components/tabulation/VersionBadge";

type RoundSummary = {
  roundId: string;
  name: string;
  order: number;
  weight: number;
  version: number;
  standings: {
    contestantId: string;
    contestantName: string;
    rank: number | null;
    roundScore: number | null;
  }[];
};

export function RoundResultsCard({
  orgSlug,
  eventSlug,
  round,
  decimalPrecision,
  nameMap,
}: {
  orgSlug: string;
  eventSlug: string;
  round: RoundSummary;
  decimalPrecision: number;
  nameMap: Map<string, string>;
}) {
  const versions = useQuery(api.results.listRoundVersions, {
    orgSlug,
    eventSlug,
    roundId: round.roundId as Id<"rounds">,
  });
  const [picked, setPicked] = useState<number | null>(null);
  const historicalQuery = useQuery(
    api.results.roundResults,
    picked === null || picked === round.version
      ? "skip"
      : {
          orgSlug,
          eventSlug,
          roundId: round.roundId as Id<"rounds">,
          version: picked,
        },
  );

  const historical =
    picked === null || picked === round.version || historicalQuery instanceof Error
      ? undefined
      : historicalQuery;
  const rows =
    historical !== undefined
      ? historical.snapshot.categories.flatMap((category) =>
          category.standings.map((s) => ({
            contestantId: s.contestantId as string,
            contestantName: nameMap.get(s.contestantId as string) ?? "—",
            rank: s.rank as number | null,
            roundScore: s.roundScore as number | null,
          })),
        )
      : round.standings;

  return (
    <section className="space-y-2 rounded-lg border p-4" aria-label={round.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{round.name}</span>
          <VersionBadge version={round.version} latest />
          <span className="text-xs text-muted-foreground">
            weight <Num value={round.weight} />%
          </span>
        </div>
        {round.version > 1 && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Version
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={picked ?? round.version}
              onChange={(e) => setPicked(Number(e.target.value))}
            >
              {(versions ?? []).map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                  {v.version === round.version ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {picked !== null && picked !== round.version && (
        <p className="text-xs text-warning">
          Viewing v{picked} — current is v{round.version}.{" "}
          <Button variant="link" size="xs" onClick={() => setPicked(null)}>
            Back to current
          </Button>
        </p>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">{round.name} standings</caption>
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Rank</th>
            <th>Contestant</th>
            <th>Round score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.contestantId} className="border-t">
              <td className="py-1">
                <Num value={row.rank} />
              </td>
              <td>{row.contestantName}</td>
              <td>
                <Num value={row.roundScore} precision={decimalPrecision} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
