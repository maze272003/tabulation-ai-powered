"use client";

import { use, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { EyeOff, Flag, History } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
import { Num } from "@/components/tabulation/Num";
import { RoundResultsCard } from "@/components/tabulation/RoundResultsCard";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/tabulation/StateBlock";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const results = useQuery(api.results.eventResults, { orgSlug, eventSlug });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const categories = useQuery(api.categories.list, { orgSlug, eventSlug });
  const finalize = useMutation(api.results.finalizeEvent);
  const correct = useMutation(api.roundAdmin.correctResults);
  const [correctFor, setCorrectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!results || results instanceof Error) return map;
    for (const round of results.rounds) {
      for (const s of round.standings) map.set(s.contestantId, s.contestantName);
    }
    for (const f of results.final) map.set(f.contestantId, f.contestantName);
    return map;
  }, [results]);

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();
    if (!categories || categories instanceof Error) return map;
    for (const category of categories) map.set(category._id, category.name);
    return map;
  }, [categories]);

  const finalByCategory = useMemo(() => {
    if (!results || results instanceof Error) return [];
    const groups = new Map<string, typeof results.final>();
    for (const row of results.final) {
      const list = groups.get(row.categoryId) ?? [];
      list.push(row);
      groups.set(row.categoryId, list);
    }
    return [...groups.entries()].map(([categoryId, rows]) => ({
      categoryId,
      name: categoryNames.get(categoryId) ?? "Category",
      rows,
    }));
  }, [results, categoryNames]);

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    toast.error(data?.message ?? "Action failed.");
  };

  if (results === undefined || ev === undefined || categories === undefined)
    return <TableSkeleton rows={6} cols={4} />;
  if (results instanceof Error) {
    return <ErrorState message="Results are not available." />;
  }
  if (ev === null) return <EmptyState icon={EyeOff} title="Event not found" />;

  const canManage = ev.status === "ready";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Results</h2>
        {canManage && (
          <Button
            disabled={busy || results.rounds.length === 0}
            onClick={() => setFinalizeOpen(true)}
          >
            <Flag aria-hidden />
            Finalize event
          </Button>
        )}
      </div>

      {results.rounds.length === 0 && (
        <EmptyState
          icon={EyeOff}
          title="No published rounds yet"
          hint="Publish from a round's review screen — results appear here exactly at publish."
        />
      )}
      {results.rounds.map((round) => (
        <div key={round.roundId} className="space-y-2">
          <RoundResultsCard
            orgSlug={orgSlug}
            eventSlug={eventSlug}
            round={round}
            decimalPrecision={ev.decimalPrecision}
            nameMap={nameMap}
            categoryNames={categoryNames}
          />
          {canManage && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCorrectFor(round.roundId);
                  setReason("");
                }}
              >
                <History aria-hidden />
                Correct
              </Button>
            </div>
          )}
        </div>
      ))}

      {results.rounds.length > 0 && (
        <Card aria-label="Final standings">
          <CardHeader>
            <CardTitle>Final standings</CardTitle>
            <CardDescription>
              Weighted totals across all published rounds, grouped by category.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {finalByCategory.map((group) => (
              <div key={group.categoryId} className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground">{group.name}</h4>
                <div className="rounded-lg border">
                  <Table>
                    <caption className="sr-only">{group.name} final standings</caption>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-16 pl-4">Rank</TableHead>
                        <TableHead>Contestant</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Eliminated in round</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((row) => (
                        <TableRow key={row.contestantId}>
                          <TableCell className="pl-4">
                            <Num value={row.rank} />
                          </TableCell>
                          <TableCell className="font-medium">{row.contestantName}</TableCell>
                          <TableCell>
                            <Num value={row.totalScore} precision={ev.decimalPrecision} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.eliminatedInRoundOrder === null
                              ? "—"
                              : `round ${row.eliminatedInRoundOrder}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={correctFor !== null}
        onOpenChange={(open) => {
          if (!open) setCorrectFor(null);
        }}
        title="Record a correction"
        description="A new result version will supersede the current one. Submitted scores are never edited."
        confirmLabel="Record correction"
        busy={busy}
        confirmDisabled={!reason.trim()}
        onConfirm={async () => {
          if (correctFor === null) return;
          setBusy(true);
          try {
            await correct({ orgSlug, eventSlug, roundId: correctFor as Id<"rounds">, reason });
            setCorrectFor(null);
            toast.success("Correction recorded.");
          } catch (err) {
            onError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm">
          Correction reason (required)
          <textarea
            className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        title="Finalize event"
        description="Finalizing locks all results and corrections permanently. Every round must already be published."
        confirmLabel="Finalize event"
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await finalize({ orgSlug, eventSlug });
            toast.success("Event finalized.");
            setFinalizeOpen(false);
          } catch (err) {
            const data = (err as { data?: { code?: string; message?: string } })?.data;
            toast.error(
              data?.code === "VALIDATION_ERROR"
                ? "Every round must be published before finalizing."
                : data?.message ?? "Could not finalize.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
