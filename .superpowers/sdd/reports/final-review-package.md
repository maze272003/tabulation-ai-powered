3736b57 docs: mark engine plan UI tasks superseded by ui-ux modules plan
cc3a0a5 feat: published results with versions, corrections, finalize
d087669 feat: tabulator review and publish screen
2451ef7 feat: round publish, versioned results, corrections, event finalization
99b57da feat: tabulator submission monitor grid
3d0b0e6 feat: round review, tie breaks, and advancement overrides
12eef97 feat: judge score entry form with autosave and locked state
6987a9a feat: event shell nav and judge scoring home
4c6d3c7 feat: round monitor query and close-reopen lifecycle
039beb8 feat: tabulation core advancement and event final standings
44818df feat: config editor extensions for round weight, advancement, scoring rules
c06c40f feat: tabulation display primitives
50d73e5 feat: judge score entry with authz, autosave drafts, immutable submits
61a2c10 feat: tabulation core ranking and tie cascade with strict judge firsts
90f0e2d feat: readiness extensions and lifecycle gating
f70f622 feat: confirm dialog and save indicator primitives
1e29e84 feat: tabulation status tokens and status vocabulary helpers
031aa45 feat: tabulation core aggregation and weighting
2d4d281 feat: score and result permissions with role wiring
ed1c6c8 feat: phase 3 schema extension with writer defaults
 .../[orgSlug]/events/[eventSlug]/results/page.tsx  | 197 +++++++++
 .../[eventSlug]/rounds/[roundId]/monitor/page.tsx  | 217 ++++++++++
 .../[eventSlug]/rounds/[roundId]/review/page.tsx   | 439 +++++++++++++++++++++
 .../[orgSlug]/events/[eventSlug]/rounds/page.tsx   | 310 ++++++++++++++-
 .../scoring/[roundId]/[contestantId]/page.tsx      | 315 +++++++++++++++
 .../[orgSlug]/events/[eventSlug]/scoring/page.tsx  | 102 +++++
 .../[orgSlug]/events/[eventSlug]/settings/page.tsx |  90 ++++-
 app/globals.css                                    |  27 ++
 components/EventShell.tsx                          |   2 +
 components/tabulation/BlackoutNotice.tsx           |  13 +
 components/tabulation/ConfirmDialog.tsx            |  68 ++++
 components/tabulation/Num.tsx                      |  34 ++
 components/tabulation/RoundResultsCard.tsx         | 133 +++++++
 components/tabulation/SaveIndicator.tsx            |  59 +++
 components/tabulation/StateBlock.tsx               |  82 ++++
 components/tabulation/StatusBadge.tsx              |  87 ++++
 components/tabulation/VersionBadge.tsx             |  20 +
 components/tabulation/status.test.ts               |  45 +++
 components/tabulation/status.ts                    |  41 ++
 convex-test/permissions3.test.ts                   |  41 ++
 convex-test/phase3Schema.test.ts                   | 162 ++++++++
 convex-test/publishResults.test.ts                 | 144 +++++++
 convex-test/reviewDecisions.test.ts                | 154 ++++++++
 convex-test/roundLifecycle3.test.ts                |  86 ++++
 convex-test/scoringEntry.test.ts                   | 116 ++++++
 convex-test/setup.ts                               |  81 ++++
 convex-test/tabulationCore.test.ts                 | 293 ++++++++++++++
 convex/_generated/api.d.ts                         |  10 +
 convex/eventLifecycle.ts                           |  16 +-
 convex/events.ts                                   |  29 +-
 convex/lib/constants.ts                            |  17 +-
 convex/lib/errors.ts                               |   1 +
 convex/lib/eventAuthz.ts                           |  32 +-
 convex/lib/roundCompute.ts                         | 141 +++++++
 convex/lib/tabulation.ts                           | 348 ++++++++++++++++
 convex/results.ts                                  | 162 ++++++++
 convex/roundAdmin.ts                               | 358 +++++++++++++++++
 convex/rounds.ts                                   |  32 ++
 convex/schema.ts                                   | 109 ++++-
 convex/scoring.ts                                  | 191 +++++++++
 convex/templates.ts                                |   6 +-
 .../plans/2026-08-16-phase3-tabulation-engine.md   |   6 +
 vitest.config.ts                                   |   2 +-
 43 files changed, 4769 insertions(+), 49 deletions(-)
diff --git a/app/app/[orgSlug]/events/[eventSlug]/results/page.tsx b/app/app/[orgSlug]/events/[eventSlug]/results/page.tsx
new file mode 100644
index 0000000..5652681
--- /dev/null
+++ b/app/app/[orgSlug]/events/[eventSlug]/results/page.tsx
@@ -0,0 +1,197 @@
+"use client";
+
+import { use, useMemo, useState } from "react";
+import { useMutation, useQuery } from "convex/react";
+import { EyeOff, Flag, History } from "lucide-react";
+import { api } from "@/convex/_generated/api";
+import type { Id } from "@/convex/_generated/dataModel";
+import { Button } from "@/components/ui/button";
+import { toast } from "sonner";
+import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
+import { Num } from "@/components/tabulation/Num";
+import { RoundResultsCard } from "@/components/tabulation/RoundResultsCard";
+import { EmptyState, ErrorState, TableSkeleton } from "@/components/tabulation/StateBlock";
+
+export default function ResultsPage({
+  params,
+}: {
+  params: Promise<{ orgSlug: string; eventSlug: string }>;
+}) {
+  const { orgSlug, eventSlug } = use(params);
+  const results = useQuery(api.results.eventResults, { orgSlug, eventSlug });
+  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
+  const finalize = useMutation(api.results.finalizeEvent);
+  const correct = useMutation(api.roundAdmin.correctResults);
+  const [correctFor, setCorrectFor] = useState<string | null>(null);
+  const [reason, setReason] = useState("");
+  const [finalizeOpen, setFinalizeOpen] = useState(false);
+  const [busy, setBusy] = useState(false);
+
+  const nameMap = useMemo(() => {
+    const map = new Map<string, string>();
+    if (!results || results instanceof Error) return map;
+    for (const round of results.rounds) {
+      for (const s of round.standings) map.set(s.contestantId, s.contestantName);
+    }
+    for (const f of results.final) map.set(f.contestantId, f.contestantName);
+    return map;
+  }, [results]);
+
+  const onError = (err: unknown) => {
+    const data = (err as { data?: { code?: string; message?: string } })?.data;
+    toast.error(data?.message ?? "Action failed.");
+  };
+
+  if (results === undefined || ev === undefined) return <TableSkeleton rows={6} cols={4} />;
+  if (results instanceof Error) {
+    return <ErrorState message="Results are not available." />;
+  }
+  if (ev === null) return <EmptyState icon={EyeOff} title="Event not found" />;
+
+  const canManage = ev.status === "ready";
+
+  return (
+    <div className="space-y-6">
+      <div className="flex items-center justify-between">
+        <h2 className="text-lg font-semibold">Results</h2>
+        {canManage && (
+          <Button
+            disabled={busy || results.rounds.length === 0}
+            onClick={() => setFinalizeOpen(true)}
+          >
+            <Flag aria-hidden />
+            Finalize event
+          </Button>
+        )}
+      </div>
+
+      {results.rounds.length === 0 && (
+        <EmptyState
+          icon={EyeOff}
+          title="No published rounds yet"
+          hint="Publish from a round's review screen ΓÇö results appear here exactly at publish."
+        />
+      )}
+      {results.rounds.map((round) => (
+        <div key={round.roundId} className="space-y-2">
+          <RoundResultsCard
+            orgSlug={orgSlug}
+            eventSlug={eventSlug}
+            round={round}
+            decimalPrecision={ev.decimalPrecision}
+            nameMap={nameMap}
+          />
+          {canManage && (
+            <div className="flex justify-end">
+              <Button
+                variant="outline"
+                size="sm"
+                onClick={() => {
+                  setCorrectFor(round.roundId);
+                  setReason("");
+                }}
+              >
+                <History aria-hidden />
+                Correct
+              </Button>
+            </div>
+          )}
+        </div>
+      ))}
+
+      {results.rounds.length > 0 && (
+        <section className="space-y-2 rounded-lg border p-4" aria-label="Final standings">
+          <h3 className="font-medium">Final standings</h3>
+          <table className="w-full text-sm">
+            <caption className="sr-only">Event final standings</caption>
+            <thead className="text-left text-muted-foreground">
+              <tr>
+                <th className="py-1">Rank</th>
+                <th>Contestant</th>
+                <th>Total</th>
+                <th>Eliminated in round</th>
+              </tr>
+            </thead>
+            <tbody>
+              {results.final.map((row) => (
+                <tr key={row.contestantId} className="border-t">
+                  <td className="py-1">
+                    <Num value={row.rank} />
+                  </td>
+                  <td>{row.contestantName}</td>
+                  <td>
+                    <Num value={row.totalScore} precision={ev.decimalPrecision} />
+                  </td>
+                  <td className="text-muted-foreground">
+                    {row.eliminatedInRoundOrder === null
+                      ? "ΓÇö"
+                      : `round ${row.eliminatedInRoundOrder}`}
+                  </td>
+                </tr>
+              ))}
+            </tbody>
+          </table>
+        </section>
+      )}
+
+      <ConfirmDialog
+        open={correctFor !== null}
+        onOpenChange={(open) => {
+          if (!open) setCorrectFor(null);
+        }}
+        title="Record a correction"
+        description="A new result version will supersede the current one. Submitted scores are never edited."
+        confirmLabel="Record correction"
+        busy={busy}
+        onConfirm={async () => {
+          if (correctFor === null) return;
+          setBusy(true);
+          try {
+            await correct({ orgSlug, eventSlug, roundId: correctFor as Id<"rounds">, reason });
+            setCorrectFor(null);
+            toast.success("Correction recorded.");
+          } catch (err) {
+            onError(err);
+          } finally {
+            setBusy(false);
+          }
+        }}
+      >
+        <label className="grid gap-1 text-sm">
+          Correction reason (required)
+          <textarea
+            className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
+            value={reason}
+            onChange={(e) => setReason(e.target.value)}
+          />
+        </label>
+      </ConfirmDialog>
+
+      <ConfirmDialog
+        open={finalizeOpen}
+        onOpenChange={setFinalizeOpen}
+        title="Finalize event"
+        description="Finalizing locks all results and corrections permanently. Every round must already be published."
+        confirmLabel="Finalize event"
+        busy={busy}
+        onConfirm={async () => {
+          setBusy(true);
+          try {
+            await finalize({ orgSlug, eventSlug });
+            toast.success("Event finalized.");
+            setFinalizeOpen(false);
+          } catch (err) {
+            const data = (err as { data?: { code?: string; message?: string } })?.data;
+            toast.error(
+              data?.code === "VALIDATION_ERROR"
+                ? "Every round must be published before finalizing."
+                : data?.message ?? "Could not finalize.",
+            );
+          } finally {
+            setBusy(false);
+          }
+        }}
+      />
+    </div>
+  );
+}
diff --git a/app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx b/app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx
new file mode 100644
index 0000000..84eaf82
--- /dev/null
+++ b/app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx
@@ -0,0 +1,217 @@
+"use client";
+
+import { use, useMemo, useState } from "react";
+import Link from "next/link";
+import { useMutation, useQuery } from "convex/react";
+import { Radar } from "lucide-react";
+import { api } from "@/convex/_generated/api";
+import type { Id } from "@/convex/_generated/dataModel";
+import { Button } from "@/components/ui/button";
+import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
+import { toast } from "sonner";
+import { BlackoutNotice } from "@/components/tabulation/BlackoutNotice";
+import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
+import { Num } from "@/components/tabulation/Num";
+import { StatusBadge, StatusDot } from "@/components/tabulation/StatusBadge";
+import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
+import { sheetStatusLabel, type SheetStatus } from "@/components/tabulation/status";
+
+const legend: SheetStatus[] = ["submitted", "in_progress", "not_started", "locked"];
+
+export default function MonitorPage({
+  params,
+}: {
+  params: Promise<{ orgSlug: string; eventSlug: string; roundId: string }>;
+}) {
+  const { orgSlug, eventSlug, roundId } = use(params);
+  const monitor = useQuery(api.roundAdmin.roundMonitor, {
+    orgSlug,
+    eventSlug,
+    roundId: roundId as Id<"rounds">,
+  });
+  const closeRound = useMutation(api.roundAdmin.closeRound);
+  const reopenRound = useMutation(api.roundAdmin.reopenRound);
+  const [busy, setBusy] = useState(false);
+  const [closeOpen, setCloseOpen] = useState(false);
+
+  const sheetMap = useMemo(() => {
+    const map = new Map<string, SheetStatus>();
+    if (!monitor || monitor instanceof Error) return map;
+    for (const s of monitor.sheets) map.set(`${s.judgeId}:${s.contestantId}`, s.status);
+    return map;
+  }, [monitor]);
+
+  const onError = (err: unknown) => {
+    const data = (err as { data?: { code?: string; message?: string } })?.data;
+    toast.error(data?.message ?? "Action failed.");
+  };
+
+  if (monitor === undefined) return <TableSkeleton rows={6} cols={6} />;
+  if (monitor instanceof Error) {
+    return (
+      <EmptyState
+        icon={Radar}
+        title="Monitor unavailable"
+        hint={
+          (monitor as Error & { data?: { code?: string } }).data?.code === "FORBIDDEN"
+            ? "You need scoring permission to view this."
+            : undefined
+        }
+      />
+    );
+  }
+
+  const total = monitor.sheets.length;
+  const submitted = monitor.sheets.filter(
+    (s) => s.status === "submitted" || s.status === "locked",
+  ).length;
+  const unsubmitted = total - submitted;
+
+  const run = async (fn: () => Promise<unknown>, success: string) => {
+    setBusy(true);
+    try {
+      await fn();
+      toast.success(success);
+      return true;
+    } catch (err) {
+      onError(err);
+      return false;
+    } finally {
+      setBusy(false);
+    }
+  };
+
+  return (
+    <div className="space-y-4">
+      <div className="flex flex-wrap items-center justify-between gap-2">
+        <div className="flex flex-wrap items-center gap-3">
+          <h2 className="flex items-center gap-2 text-lg font-semibold">
+            Submission progress
+            <StatusBadge kind="round" status={monitor.roundStatus} />
+          </h2>
+          <span className="text-sm text-muted-foreground">
+            <Num value={submitted} /> / <Num value={total} /> submitted
+          </span>
+          <div
+            className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"
+            role="progressbar"
+            aria-valuenow={submitted}
+            aria-valuemin={0}
+            aria-valuemax={total}
+            aria-label="Sheets submitted"
+          >
+            <div
+              className="h-full bg-success transition-all duration-200"
+              style={{ width: total === 0 ? "0%" : `${(submitted / total) * 100}%` }}
+            />
+          </div>
+        </div>
+        <div className="flex items-center gap-2">
+          {monitor.roundStatus === "open" && (
+            <>
+              <BlackoutNotice />
+              <Button disabled={busy} onClick={() => setCloseOpen(true)}>
+                Close round
+              </Button>
+            </>
+          )}
+          {monitor.roundStatus === "closed" && (
+            <>
+              <Button
+                variant="outline"
+                disabled={busy}
+                title="Reopening is recorded in the audit log"
+                onClick={() =>
+                  run(async () => {
+                    await reopenRound({ orgSlug, eventSlug, roundId: roundId as Id<"rounds"> });
+                  }, "Round reopened.")
+                }
+              >
+                Reopen
+              </Button>
+              <Button
+                render={
+                  <Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${roundId}/review`} />
+                }
+              >
+                Review &amp; publish
+              </Button>
+            </>
+          )}
+        </div>
+      </div>
+      <div className="overflow-x-auto">
+        <table className="w-full text-sm">
+          <caption className="sr-only">Judge submission progress per contestant</caption>
+          <thead className="text-left text-muted-foreground">
+            <tr>
+              <th className="sticky left-0 bg-background py-1 pr-4">Judge</th>
+              {monitor.contestants.map((k) => (
+                <th key={k.contestantId} className="min-w-11 py-1 text-center">
+                  <span className="font-mono tabular-nums">#{k.number}</span>
+                </th>
+              ))}
+            </tr>
+          </thead>
+          <tbody>
+            {monitor.judges.map((judge) => (
+              <tr key={judge.judgeId} className="border-t">
+                <td className="sticky left-0 bg-background py-1 pr-4">{judge.name}</td>
+                {monitor.contestants.map((k) => {
+                  const status = sheetMap.get(`${judge.judgeId}:${k.contestantId}`);
+                  const label = `${judge.name} ┬╖ #${k.number} ┬╖ ${
+                    status ? sheetStatusLabel[status] : "no sheet"
+                  }`;
+                  return (
+                    <td key={k.contestantId} className="py-1 text-center">
+                      {status ? (
+                        <Tooltip>
+                          <TooltipTrigger
+                            render={
+                              <button
+                                type="button"
+                                aria-label={label}
+                                className="flex size-10 items-center justify-center rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
+                              />
+                            }
+                          >
+                            <StatusDot status={status} />
+                          </TooltipTrigger>
+                          <TooltipContent>{label}</TooltipContent>
+                        </Tooltip>
+                      ) : (
+                        <span aria-label="no sheet">ΓÇö</span>
+                      )}
+                    </td>
+                  );
+                })}
+              </tr>
+            ))}
+          </tbody>
+        </table>
+      </div>
+      <p className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
+        {legend.map((status) => (
+          <span key={status} className="flex items-center gap-1.5">
+            <StatusDot status={status} />
+            {sheetStatusLabel[status]}
+          </span>
+        ))}
+      </p>
+      <ConfirmDialog
+        open={closeOpen}
+        onOpenChange={setCloseOpen}
+        title="Close round"
+        description={`${unsubmitted} sheet${unsubmitted === 1 ? " is" : "s are"} unsubmitted and will be excluded from results. Unsubmitted judges can no longer submit.`}
+        confirmLabel="Close round"
+        busy={busy}
+        onConfirm={async () => {
+          const ok = await run(async () => {
+            await closeRound({ orgSlug, eventSlug, roundId: roundId as Id<"rounds"> });
+          }, "Round closed.");
+          if (ok) setCloseOpen(false);
+        }}
+      />
+    </div>
+  );
+}
diff --git a/app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/review/page.tsx b/app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/review/page.tsx
new file mode 100644
index 0000000..f531996
--- /dev/null
+++ b/app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/review/page.tsx
@@ -0,0 +1,439 @@
+"use client";
+
+import { Fragment, use, useMemo, useRef, useState } from "react";
+import Link from "next/link";
+import { useRouter } from "next/navigation";
+import { useMutation, useQuery } from "convex/react";
+import { ArrowDownRight, ArrowUpRight, CirclePause, Equal, X } from "lucide-react";
+import { api } from "@/convex/_generated/api";
+import type { Id } from "@/convex/_generated/dataModel";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { toast } from "sonner";
+import { BlackoutNotice } from "@/components/tabulation/BlackoutNotice";
+import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
+import { Num } from "@/components/tabulation/Num";
+import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
+import { tieResolvedByLabel } from "@/components/tabulation/status";
+
+const contestantStatusLabel: Record<string, string> = {
+  active: "",
+  scratched: "Scratched",
+  disqualified: "Disqualified",
+};
+
+export default function ReviewPage({
+  params,
+}: {
+  params: Promise<{ orgSlug: string; eventSlug: string; roundId: string }>;
+}) {
+  const { orgSlug, eventSlug, roundId } = use(params);
+  const router = useRouter();
+  const review = useQuery(api.roundAdmin.roundReview, {
+    orgSlug,
+    eventSlug,
+    roundId: roundId as Id<"rounds">,
+  });
+  const categories = useQuery(api.categories.list, { orgSlug, eventSlug });
+  const publishRound = useMutation(api.roundAdmin.publishRound);
+  const addTieBreak = useMutation(api.roundAdmin.addTieBreak);
+  const removeTieBreak = useMutation(api.roundAdmin.removeTieBreak);
+  const addOverride = useMutation(api.roundAdmin.addAdvancementOverride);
+  const removeOverride = useMutation(api.roundAdmin.removeAdvancementOverride);
+  const [positions, setPositions] = useState<Record<string, string>>({});
+  const [busy, setBusy] = useState(false);
+  const [publishOpen, setPublishOpen] = useState(false);
+  const [tieError, setTieError] = useState(false);
+  const tiesRef = useRef<HTMLDivElement>(null);
+
+  const tiedIds = useMemo(
+    () =>
+      new Set(
+        review && !(review instanceof Error)
+          ? review.unresolvedTies.flatMap((t) => t.contestantIds)
+          : [],
+      ),
+    [review],
+  );
+  const overrideByContestant = useMemo(
+    () =>
+      new Map(
+        review && !(review instanceof Error)
+          ? review.overrides.map((o) => [o.contestantId, o] as const)
+          : [],
+      ),
+    [review],
+  );
+  const standingsByCategory = useMemo(() => {
+    if (!review || review instanceof Error) return [];
+    const groups = new Map<string, typeof review.standings>();
+    for (const row of review.standings) {
+      const list = groups.get(row.categoryId) ?? [];
+      list.push(row);
+      groups.set(row.categoryId, list);
+    }
+    return [...groups.entries()].map(([categoryId, rows]) => ({
+      categoryId,
+      name: categories?.find((c) => c._id === categoryId)?.name ?? "Category",
+      rows: [...rows].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)),
+    }));
+  }, [review, categories]);
+
+  if (review === undefined) return <TableSkeleton rows={6} cols={5} />;
+  if (review instanceof Error) {
+    return (
+      <EmptyState
+        icon={CirclePause}
+        title="Close the round before review"
+        hint="Review and publish become available once the round is closed."
+        action={
+          <Link
+            className="text-sm underline underline-offset-4"
+            href={`/app/${orgSlug}/events/${eventSlug}/rounds/${roundId}/monitor`}
+          >
+            Go to monitor
+          </Link>
+        }
+      />
+    );
+  }
+
+  const advancementActive =
+    review.eliminationEnabled &&
+    review.round.qualifiesToNextRound &&
+    review.round.advancement.mode !== "none";
+  const allowOverride = advancementActive && review.round.advancement.allowOverride;
+  const unresolvedCount = review.unresolvedTies.length;
+
+  const onError = (err: unknown) => {
+    const data = (err as { data?: { code?: string; message?: string } })?.data;
+    toast.error(data?.message ?? "Action failed.");
+  };
+
+  const orderValid = (ids: string[]) => {
+    const nums = ids.map((id, i) => Number(positions[id] ?? String(i + 1)));
+    const sorted = [...nums].sort((a, b) => a - b);
+    return sorted.every((n, i) => n === i + 1);
+  };
+
+  const publish = async () => {
+    setBusy(true);
+    try {
+      await publishRound({ orgSlug, eventSlug, roundId: roundId as Id<"rounds"> });
+      toast.success("Results published.");
+      router.push(`/app/${orgSlug}/events/${eventSlug}/results`);
+    } catch (err) {
+      const data = (err as { data?: { code?: string; message?: string } })?.data;
+      if (data?.code === "TIES_UNRESOLVED") {
+        toast.error("Resolve the highlighted tie groups first.");
+        setTieError(true);
+        tiesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
+      } else {
+        toast.error(data?.message ?? "Could not publish.");
+      }
+      setBusy(false);
+      setPublishOpen(false);
+    }
+  };
+
+  const cutDescription = !advancementActive
+    ? "no cut"
+    : {
+        none: "no cut",
+        top_count: `top ${review.round.advancement.count ?? 0}`,
+        top_percent: `top ${review.round.advancement.percent ?? 0}%`,
+        manual: "manual",
+      }[review.round.advancement.mode];
+
+  return (
+    <div className="space-y-6">
+      <div className="flex flex-wrap items-center justify-between gap-2">
+        <h2 className="text-lg font-semibold">{review.round.name} ΓÇö review</h2>
+        <div className="flex items-center gap-2">
+          {unresolvedCount > 0 && (
+            <span className="flex items-center gap-1.5 rounded-lg bg-warning-muted px-2 py-1 text-xs font-medium text-warning">
+              <Equal aria-hidden className="size-3.5" />
+              <Num value={unresolvedCount} /> unresolved tie{unresolvedCount === 1 ? "" : "s"}
+            </span>
+          )}
+          <Button onClick={() => setPublishOpen(true)} disabled={busy || unresolvedCount > 0}>
+            Publish results
+          </Button>
+        </div>
+      </div>
+
+      <BlackoutNotice />
+
+      {standingsByCategory.map((group) => (
+        <section key={group.categoryId} className="space-y-2" aria-label={group.name}>
+          <h3 className="text-sm font-medium">{group.name}</h3>
+          <div className="overflow-x-auto">
+            <table className="w-full text-sm">
+              <caption className="sr-only">{group.name} standings</caption>
+              <thead className="text-left text-muted-foreground">
+                <tr>
+                  <th className="py-1">Rank</th>
+                  <th>Contestant</th>
+                  <th>Score</th>
+                  <th>Resolved by</th>
+                  {advancementActive && <th>Advances</th>}
+                </tr>
+              </thead>
+              <tbody>
+                {group.rows.map((row, i) => {
+                  const next = group.rows[i + 1];
+                  const showCutLine =
+                    advancementActive &&
+                    row.advancement === true &&
+                    next !== undefined &&
+                    next.advancement === false;
+                  const override = overrideByContestant.get(row.contestantId);
+                  return (
+                    <Fragment key={row.contestantId}>
+                      <tr
+                        className={
+                          tiedIds.has(row.contestantId)
+                            ? tieError
+                              ? "border-t bg-destructive/10"
+                              : "border-t bg-warning-muted"
+                            : "border-t"
+                        }
+                      >
+                        <td className="py-1">
+                          <Num value={row.rank} />
+                        </td>
+                        <td>
+                          {row.contestantName}
+                          {row.status !== "active" && (
+                            <span className="ml-2 text-xs text-muted-foreground">
+                              {contestantStatusLabel[row.status]}
+                            </span>
+                          )}
+                          {override && (
+                            <span className="ml-2 inline-flex items-center gap-1 rounded border border-warning/50 px-1.5 py-0.5 text-xs text-warning">
+                              Override: {override.action === "force_advance" ? "advance" : "cut"}
+                              <button
+                                type="button"
+                                aria-label={`Remove override for ${row.contestantName}`}
+                                disabled={busy}
+                                onClick={async () => {
+                                  try {
+                                    await removeOverride({
+                                      orgSlug,
+                                      eventSlug,
+                                      overrideId: override._id,
+                                    });
+                                  } catch (err) {
+                                    onError(err);
+                                  }
+                                }}
+                              >
+                                <X aria-hidden className="size-3" />
+                              </button>
+                            </span>
+                          )}
+                        </td>
+                        <td>
+                          <Num value={row.roundScore} />
+                        </td>
+                        <td className="text-muted-foreground">
+                          {tieResolvedByLabel[row.tieResolvedBy] ?? "ΓÇö"}
+                        </td>
+                        {advancementActive && (
+                          <td>
+                            <span
+                              className={
+                                row.advancement === true
+                                  ? "flex items-center gap-1 font-medium text-success"
+                                  : "flex items-center gap-1 text-muted-foreground"
+                              }
+                            >
+                              {row.advancement === null ? (
+                                "ΓÇö"
+                              ) : row.advancement ? (
+                                <>
+                                  <ArrowUpRight aria-hidden className="size-3.5" />
+                                  Advances
+                                </>
+                              ) : (
+                                <>
+                                  <ArrowDownRight aria-hidden className="size-3.5" />
+                                  Cut
+                                </>
+                              )}
+                            </span>
+                            {allowOverride && !override && (
+                              <span className="ml-2 flex gap-1">
+                                <Button
+                                  variant="ghost"
+                                  size="xs"
+                                  disabled={busy}
+                                  onClick={async () => {
+                                    try {
+                                      await addOverride({
+                                        orgSlug,
+                                        eventSlug,
+                                        roundId: roundId as Id<"rounds">,
+                                        contestantId: row.contestantId,
+                                        action: "force_advance",
+                                      });
+                                    } catch (err) {
+                                      onError(err);
+                                    }
+                                  }}
+                                >
+                                  Force advance
+                                </Button>
+                                <Button
+                                  variant="ghost"
+                                  size="xs"
+                                  disabled={busy}
+                                  onClick={async () => {
+                                    try {
+                                      await addOverride({
+                                        orgSlug,
+                                        eventSlug,
+                                        roundId: roundId as Id<"rounds">,
+                                        contestantId: row.contestantId,
+                                        action: "force_cut",
+                                      });
+                                    } catch (err) {
+                                      onError(err);
+                                    }
+                                  }}
+                                >
+                                  Force cut
+                                </Button>
+                              </span>
+                            )}
+                          </td>
+                        )}
+                      </tr>
+                      {showCutLine && (
+                        <tr className="border-t">
+                          <td colSpan={advancementActive ? 5 : 4} className="py-1">
+                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
+                              <span aria-hidden className="h-px flex-1 bg-border" />
+                              advances: {cutDescription}
+                              <span aria-hidden className="h-px flex-1 bg-border" />
+                            </span>
+                          </td>
+                        </tr>
+                      )}
+                    </Fragment>
+                  );
+                })}
+              </tbody>
+            </table>
+          </div>
+        </section>
+      ))}
+
+      <div ref={tiesRef} className="space-y-4">
+        {review.unresolvedTies.length > 0 && (
+          <div
+            className={`space-y-3 rounded-lg border p-4 ${
+              tieError ? "border-destructive" : "border-warning/50"
+            }`}
+          >
+            <h3 className={`font-medium ${tieError ? "text-destructive" : "text-warning"}`}>
+              Unresolved ties ΓÇö set the final order (1 = first)
+            </h3>
+            {review.unresolvedTies.map((tie) => (
+              <div key={tie.contestantIds.join()} className="space-y-2">
+                <div className="flex flex-wrap gap-3">
+                  {tie.contestantIds.map((id, i) => (
+                    <label key={id} className="flex items-center gap-1 text-sm">
+                      <Input
+                        className="w-16"
+                        type="number"
+                        min={1}
+                        max={tie.contestantIds.length}
+                        aria-label={`Position of ${tie.names[i]}`}
+                        value={positions[id] ?? String(i + 1)}
+                        onChange={(e) => setPositions({ ...positions, [id]: e.target.value })}
+                      />
+                      {tie.names[i]}
+                    </label>
+                  ))}
+                </div>
+                <Button
+                  size="sm"
+                  disabled={busy || !orderValid(tie.contestantIds)}
+                  onClick={async () => {
+                    const ordered = [...tie.contestantIds].sort(
+                      (a, b) =>
+                        Number(positions[a] ?? String(tie.contestantIds.indexOf(a) + 1)) -
+                        Number(positions[b] ?? String(tie.contestantIds.indexOf(b) + 1)),
+                    );
+                    try {
+                      await addTieBreak({
+                        orgSlug,
+                        eventSlug,
+                        roundId: roundId as Id<"rounds">,
+                        tiedContestantIds: tie.contestantIds,
+                        orderedIds: ordered,
+                      });
+                      setPositions({});
+                    } catch (err) {
+                      onError(err);
+                    }
+                  }}
+                >
+                  Save tie break
+                </Button>
+              </div>
+            ))}
+          </div>
+        )}
+
+        {review.tieBreaks.length > 0 && (
+          <div className="space-y-2 rounded-lg border p-4">
+            <h3 className="font-medium">Manual tie breaks</h3>
+            <ul className="space-y-1 text-sm">
+              {review.tieBreaks.map((tb) => (
+                <li key={tb._id} className="flex items-center justify-between">
+                  <span className="text-muted-foreground">
+                    {tb.orderedIds
+                      .map(
+                        (id) =>
+                          review.standings.find((s) => s.contestantId === id)
+                            ?.contestantName ?? "ΓÇö",
+                      )
+                      .join(" ΓÇ║ ")}
+                  </span>
+                  <Button
+                    variant="ghost"
+                    size="sm"
+                    disabled={busy}
+                    onClick={async () => {
+                      try {
+                        await removeTieBreak({ orgSlug, eventSlug, tieBreakId: tb._id });
+                      } catch (err) {
+                        onError(err);
+                      }
+                    }}
+                  >
+                    Remove
+                  </Button>
+                </li>
+              ))}
+            </ul>
+          </div>
+        )}
+      </div>
+
+      <ConfirmDialog
+        open={publishOpen}
+        onOpenChange={setPublishOpen}
+        title={`Publish results for ${review.round.name}`}
+        description={`${standingsByCategory.length} categories ┬╖ ${review.standings.length} contestants ┬╖ ${review.tieBreaks.length} manual tie breaks ┬╖ cut: ${cutDescription}${
+          review.overrides.length > 0 ? ` ┬╖ ${review.overrides.length} override(s)` : ""
+        }. Scores become permanent.`}
+        confirmLabel="Publish results"
+        busy={busy}
+        onConfirm={publish}
+      />
+    </div>
+  );
+}
diff --git a/app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx b/app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx
index f695aca..71d544c 100644
--- a/app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx
+++ b/app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx
@@ -1,102 +1,374 @@
 "use client";
 
 import { use, useState } from "react";
+import Link from "next/link";
 import { useMutation, useQuery } from "convex/react";
 import { api } from "@/convex/_generated/api";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
 import { toast } from "sonner";
+import { Num } from "@/components/tabulation/Num";
 
-export default function RoundsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
+const ADVANCEMENT_MODES = ["none", "top_count", "top_percent", "manual"] as const;
+
+export default function RoundsPage({
+  params,
+}: {
+  params: Promise<{ orgSlug: string; eventSlug: string }>;
+}) {
   const { orgSlug, eventSlug } = use(params);
   const rounds = useQuery(api.rounds.list, { orgSlug, eventSlug });
   const ev = useQuery(api.events.get, { orgSlug, eventSlug });
   const addRound = useMutation(api.rounds.add);
+  const updateRound = useMutation(api.rounds.update);
   const removeRound = useMutation(api.rounds.remove);
   const addCriterion = useMutation(api.criteria.add);
   const removeCriterion = useMutation(api.criteria.remove);
   const [roundName, setRoundName] = useState("");
+  const [roundWeight, setRoundWeight] = useState("");
+  const [weightEdit, setWeightEdit] = useState<Record<string, string>>({});
+  const [advForm, setAdvForm] = useState<
+    Record<string, { mode: string; count: string; percent: string; allowOverride: boolean }>
+  >({});
   const [form, setForm] = useState<Record<string, { name: string; weight: string; min: string; max: string }>>({});
 
   const locked = ev !== undefined && ev !== null && ev.status !== "draft";
+  const eliminationOn = ev?.eliminationEnabled ?? true;
   const onError = (err: unknown) => {
     const data = (err as { data?: { code?: string; message?: string } })?.data;
     if (data?.code === "CONFLICT") toast.error("Configuration is locked.");
+    else if (data?.code === "LIMIT_EXCEEDED") toast.error("Limit reached ΓÇö upgrade your plan.");
     else toast.error(data?.message ?? "Action failed.");
   };
 
+  const weightsSum = (rounds ?? []).reduce((s, r) => s + r.weight, 0);
+
+  const advancementPatch = (roundId: string, r: NonNullable<typeof rounds>[number]) => {
+    const f = advForm[roundId] ?? {
+      mode: r.advancement.mode,
+      count: String(r.advancement.count ?? ""),
+      percent: String(r.advancement.percent ?? ""),
+      allowOverride: r.advancement.allowOverride,
+    };
+    return {
+      mode: f.mode as (typeof ADVANCEMENT_MODES)[number],
+      count: f.mode === "top_count" && f.count ? Number(f.count) : undefined,
+      percent: f.mode === "top_percent" && f.percent ? Number(f.percent) : undefined,
+      allowOverride: f.allowOverride,
+    };
+  };
+
   return (
     <div className="space-y-6">
       {!locked && (
-        <div className="flex gap-2">
-          <Input placeholder="New round name" value={roundName} onChange={(e) => setRoundName(e.target.value)} />
-          <Button onClick={async () => { try { await addRound({ orgSlug, eventSlug, name: roundName }); setRoundName(""); } catch (e) { onError(e); } }}>
+        <div className="flex flex-wrap gap-2">
+          <Input
+            className="w-48"
+            placeholder="New round name"
+            aria-label="New round name"
+            value={roundName}
+            onChange={(e) => setRoundName(e.target.value)}
+          />
+          <Input
+            className="w-24"
+            placeholder="Weight %"
+            aria-label="Round weight percent"
+            value={roundWeight}
+            onChange={(e) => setRoundWeight(e.target.value)}
+          />
+          <Button
+            onClick={async () => {
+              try {
+                await addRound({
+                  orgSlug,
+                  eventSlug,
+                  name: roundName,
+                  weight: roundWeight ? Number(roundWeight) : undefined,
+                });
+                setRoundName("");
+                setRoundWeight("");
+              } catch (e) {
+                onError(e);
+              }
+            }}
+          >
             Add round
           </Button>
         </div>
       )}
       {rounds?.map((r) => {
         const f = form[r._id] ?? { name: "", weight: "", min: "0", max: "100" };
+        const a = advForm[r._id] ?? {
+          mode: r.advancement.mode,
+          count: String(r.advancement.count ?? ""),
+          percent: String(r.advancement.percent ?? ""),
+          allowOverride: r.advancement.allowOverride,
+        };
         const sum = r.criteria.reduce((s, c) => s + c.weight, 0);
         return (
           <div key={r._id} className="space-y-2 rounded-lg border p-4">
-            <div className="flex items-center justify-between">
+            <div className="flex flex-wrap items-center justify-between gap-2">
               <div className="font-medium">{r.name}</div>
-              <div className="flex items-center gap-2 text-sm">
-                <span className={sum === 100 ? "text-muted-foreground" : "text-destructive"}>weights: {sum}%</span>
+              <div className="flex flex-wrap items-center gap-2 text-sm">
+                <span className="text-muted-foreground">
+                  round weight: <Num value={r.weight} />%
+                </span>
                 {!locked && (
-                  <Button variant="ghost" size="sm" onClick={async () => { try { await removeRound({ orgSlug, eventSlug, roundId: r._id }); } catch (e) { onError(e); } }}>
+                  <>
+                    <Input
+                      className="w-20"
+                      aria-label={`New weight for ${r.name}`}
+                      placeholder="Weight"
+                      value={weightEdit[r._id] ?? ""}
+                      onChange={(e) =>
+                        setWeightEdit({ ...weightEdit, [r._id]: e.target.value })
+                      }
+                    />
+                    <Button
+                      size="sm"
+                      variant="outline"
+                      disabled={weightEdit[r._id] === undefined || weightEdit[r._id] === ""}
+                      onClick={async () => {
+                        try {
+                          await updateRound({
+                            orgSlug,
+                            eventSlug,
+                            roundId: r._id,
+                            weight: Number(weightEdit[r._id]),
+                          });
+                          setWeightEdit({ ...weightEdit, [r._id]: "" });
+                          toast.success("Weight saved.");
+                        } catch (e) {
+                          onError(e);
+                        }
+                      }}
+                    >
+                      Save weight
+                    </Button>
+                  </>
+                )}
+                <span className={sum === 100 ? "text-muted-foreground" : "text-destructive"}>
+                  criterion weights: <Num value={sum} />%
+                </span>
+                {ev?.status === "ready" && (
+                  <>
+                    <Link
+                      className="underline underline-offset-4"
+                      href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/monitor`}
+                    >
+                      Monitor
+                    </Link>
+                    <Link
+                      className="underline underline-offset-4"
+                      href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/review`}
+                    >
+                      Review
+                    </Link>
+                  </>
+                )}
+                {!locked && (
+                  <Button
+                    variant="ghost"
+                    size="sm"
+                    onClick={async () => {
+                      try {
+                        await removeRound({ orgSlug, eventSlug, roundId: r._id });
+                      } catch (e) {
+                        onError(e);
+                      }
+                    }}
+                  >
                     Remove
                   </Button>
                 )}
               </div>
             </div>
+            {!locked && eliminationOn && (
+              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2 text-sm">
+                <Label htmlFor={`adv-mode-${r._id}`} className="text-muted-foreground">
+                  Advances
+                </Label>
+                <select
+                  id={`adv-mode-${r._id}`}
+                  className="rounded border bg-background px-2 py-1"
+                  value={a.mode}
+                  onChange={(e) =>
+                    setAdvForm({ ...advForm, [r._id]: { ...a, mode: e.target.value } })
+                  }
+                >
+                  {ADVANCEMENT_MODES.map((m) => (
+                    <option key={m} value={m}>
+                      {m}
+                    </option>
+                  ))}
+                </select>
+                {a.mode === "top_count" && (
+                  <Input
+                    className="w-24"
+                    placeholder="Top N"
+                    aria-label="Top count"
+                    value={a.count}
+                    onChange={(e) =>
+                      setAdvForm({ ...advForm, [r._id]: { ...a, count: e.target.value } })
+                    }
+                  />
+                )}
+                {a.mode === "top_percent" && (
+                  <Input
+                    className="w-24"
+                    placeholder="Top %"
+                    aria-label="Top percent"
+                    value={a.percent}
+                    onChange={(e) =>
+                      setAdvForm({ ...advForm, [r._id]: { ...a, percent: e.target.value } })
+                    }
+                  />
+                )}
+                <label className="flex items-center gap-1">
+                  <input
+                    type="checkbox"
+                    checked={a.allowOverride}
+                    onChange={(e) =>
+                      setAdvForm({
+                        ...advForm,
+                        [r._id]: { ...a, allowOverride: e.target.checked },
+                      })
+                    }
+                  />
+                  allow override
+                </label>
+                <Button
+                  size="sm"
+                  variant="outline"
+                  onClick={async () => {
+                    try {
+                      await updateRound({
+                        orgSlug,
+                        eventSlug,
+                        roundId: r._id,
+                        qualifiesToNextRound: r.qualifiesToNextRound,
+                        advancement: advancementPatch(r._id, r),
+                      });
+                      toast.success("Advancement saved.");
+                    } catch (e) {
+                      onError(e);
+                    }
+                  }}
+                >
+                  Save advancement
+                </Button>
+              </div>
+            )}
             <table className="w-full text-sm">
               <thead className="text-left text-muted-foreground">
-                <tr><th className="py-1">Criterion</th><th>Weight %</th><th>Range</th><th /></tr>
+                <tr>
+                  <th className="py-1">Criterion</th>
+                  <th>Weight %</th>
+                  <th>Range</th>
+                  <th />
+                </tr>
               </thead>
               <tbody>
                 {r.criteria.map((c) => (
                   <tr key={c._id} className="border-t">
                     <td className="py-1">{c.name}</td>
-                    <td>{c.weight}</td>
-                    <td>{c.minScore} - {c.maxScore}</td>
+                    <td>
+                      <Num value={c.weight} />
+                    </td>
+                    <td>
+                      {c.minScore} - {c.maxScore}
+                    </td>
                     <td className="text-right">
                       {!locked && (
-                        <Button variant="ghost" size="sm" onClick={async () => { try { await removeCriterion({ orgSlug, eventSlug, criterionId: c._id }); } catch (e) { onError(e); } }}>
+                        <Button
+                          variant="ghost"
+                          size="sm"
+                          onClick={async () => {
+                            try {
+                              await removeCriterion({
+                                orgSlug,
+                                eventSlug,
+                                criterionId: c._id,
+                              });
+                            } catch (e) {
+                              onError(e);
+                            }
+                          }}
+                        >
                           Remove
                         </Button>
                       )}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
             {!locked && (
               <div className="flex flex-wrap gap-2">
-                <Input className="w-40" placeholder="Criterion" value={f.name} onChange={(e) => setForm({ ...form, [r._id]: { ...f, name: e.target.value } })} />
-                <Input className="w-24" placeholder="Weight" value={f.weight} onChange={(e) => setForm({ ...form, [r._id]: { ...f, weight: e.target.value } })} />
-                <Input className="w-20" placeholder="Min" value={f.min} onChange={(e) => setForm({ ...form, [r._id]: { ...f, min: e.target.value } })} />
-                <Input className="w-20" placeholder="Max" value={f.max} onChange={(e) => setForm({ ...form, [r._id]: { ...f, max: e.target.value } })} />
+                <Input
+                  className="w-40"
+                  placeholder="Criterion"
+                  aria-label={`New criterion for ${r.name}`}
+                  value={f.name}
+                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, name: e.target.value } })}
+                />
+                <Input
+                  className="w-24"
+                  placeholder="Weight"
+                  aria-label="Criterion weight"
+                  value={f.weight}
+                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, weight: e.target.value } })}
+                />
+                <Input
+                  className="w-20"
+                  placeholder="Min"
+                  aria-label="Criterion minimum"
+                  value={f.min}
+                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, min: e.target.value } })}
+                />
+                <Input
+                  className="w-20"
+                  placeholder="Max"
+                  aria-label="Criterion maximum"
+                  value={f.max}
+                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, max: e.target.value } })}
+                />
                 <Button
                   size="sm"
                   onClick={async () => {
                     try {
                       await addCriterion({
-                        orgSlug, eventSlug, roundId: r._id, name: f.name,
-                        weight: Number(f.weight), minScore: Number(f.min), maxScore: Number(f.max), decimalPrecision: 0,
+                        orgSlug,
+                        eventSlug,
+                        roundId: r._id,
+                        name: f.name,
+                        weight: Number(f.weight),
+                        minScore: Number(f.min),
+                        maxScore: Number(f.max),
+                        decimalPrecision: 0,
                       });
                       setForm({ ...form, [r._id]: { ...f, name: "", weight: "" } });
-                    } catch (e) { onError(e); }
+                    } catch (e) {
+                      onError(e);
+                    }
                   }}
                 >
                   Add criterion
                 </Button>
               </div>
             )}
           </div>
         );
       })}
+      <p
+        className={
+          weightsSum === 100 ? "text-xs text-muted-foreground" : "text-xs text-warning"
+        }
+      >
+        Round weights: <Num value={weightsSum} />% of 100% ΓÇö must total 100% before
+        publishing.
+      </p>
     </div>
   );
 }
diff --git a/app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx b/app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx
new file mode 100644
index 0000000..826962a
--- /dev/null
+++ b/app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx
@@ -0,0 +1,315 @@
+"use client";
+
+import { use, useEffect, useMemo, useRef, useState } from "react";
+import Link from "next/link";
+import { useMutation, useQuery } from "convex/react";
+import { ChevronLeft, ClipboardList, Lock } from "lucide-react";
+import { api } from "@/convex/_generated/api";
+import type { Doc, Id } from "@/convex/_generated/dataModel";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import { toast } from "sonner";
+import { Num } from "@/components/tabulation/Num";
+import { SaveIndicator, type SaveState } from "@/components/tabulation/SaveIndicator";
+import { StatusBadge } from "@/components/tabulation/StatusBadge";
+import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
+
+function validateRaw(raw: string, c: Doc<"criteria">): string | null {
+  if (raw.trim() === "") return null;
+  const num = Number(raw);
+  if (Number.isNaN(num)) return "Enter a number";
+  if (num < c.minScore || num > c.maxScore) {
+    return `Enter a value between ${c.minScore} and ${c.maxScore}`;
+  }
+  const scale = 10 ** c.decimalPrecision;
+  if (Math.abs(num * scale - Math.round(num * scale)) > 1e-9) {
+    return `Use at most ${c.decimalPrecision} decimal${c.decimalPrecision === 1 ? "" : "s"}`;
+  }
+  return null;
+}
+
+export default function ScoreEntryPage({
+  params,
+}: {
+  params: Promise<{
+    orgSlug: string;
+    eventSlug: string;
+    roundId: string;
+    contestantId: string;
+  }>;
+}) {
+  const { orgSlug, eventSlug, roundId, contestantId } = use(params);
+  const detail = useQuery(api.scoring.sheetDetail, {
+    orgSlug,
+    eventSlug,
+    roundId: roundId as Id<"rounds">,
+    contestantId: contestantId as Id<"contestants">,
+  });
+  const mine = useQuery(api.scoring.myAssignments, { orgSlug, eventSlug });
+  const saveDraft = useMutation(api.scoring.saveDraft);
+  const submitSheet = useMutation(api.scoring.submitSheet);
+
+  const [raw, setRaw] = useState<Record<string, string>>({});
+  const [touched, setTouched] = useState<Record<string, boolean>>({});
+  const [saveState, setSaveState] = useState<SaveState>("idle");
+  const [savedAt, setSavedAt] = useState<number | null>(null);
+  const [submitting, setSubmitting] = useState(false);
+  const [justSubmitted, setJustSubmitted] = useState<Record<string, number> | null>(null);
+  const hydrated = useRef(false);
+
+  useEffect(() => {
+    if (detail && !hydrated.current) {
+      hydrated.current = true;
+      const drafts = detail.sheet?.draftValues ?? {};
+      setRaw(Object.fromEntries(Object.entries(drafts).map(([k, v]) => [k, String(v)])));
+    }
+  }, [detail]);
+
+  const sheetId = detail?.sheet?._id;
+
+  useEffect(() => {
+    if (!hydrated.current || !sheetId || saveState !== "dirty") return;
+    const timer = setTimeout(() => {
+      const payload: Record<string, number> = {};
+      for (const [id, value] of Object.entries(raw)) {
+        const criterion = detail?.criteria.find((c) => c._id === id);
+        if (criterion && value.trim() !== "" && validateRaw(value, criterion) === null) {
+          payload[id] = Number(value);
+        }
+      }
+      setSaveState("saving");
+      saveDraft({ orgSlug, eventSlug, sheetId, draftValues: payload })
+        .then(() => {
+          setSavedAt(Date.now());
+          setSaveState("saved");
+        })
+        .catch(() => setSaveState("error"));
+    }, 800);
+    return () => clearTimeout(timer);
+  }, [saveState, raw, sheetId, orgSlug, eventSlug, saveDraft, detail]);
+
+  useEffect(() => {
+    if (saveState !== "dirty" && saveState !== "error") return;
+    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
+    window.addEventListener("beforeunload", handler);
+    return () => window.removeEventListener("beforeunload", handler);
+  }, [saveState]);
+
+  const criteria = detail?.criteria ?? [];
+  const errors = useMemo(() => {
+    const map: Record<string, string | null> = {};
+    for (const c of criteria) {
+      map[c._id] = touched[c._id] ? validateRaw(raw[c._id] ?? "", c) : null;
+    }
+    return map;
+  }, [criteria, raw, touched]);
+
+  const validValues = useMemo(() => {
+    const out: Record<string, number> = {};
+    for (const c of criteria) {
+      const value = raw[c._id];
+      if (value !== undefined && value.trim() !== "" && validateRaw(value, c) === null) {
+        out[c._id] = Number(value);
+      }
+    }
+    return out;
+  }, [criteria, raw]);
+
+  if (detail === undefined || mine === undefined) return <TableSkeleton rows={4} cols={2} />;
+  if (!detail.contestant) {
+    return <EmptyState icon={ClipboardList} title="Contestant not found" />;
+  }
+  if (!detail.sheet) {
+    return (
+      <EmptyState
+        icon={ClipboardList}
+        title="You have no score sheet for this contestant"
+        action={
+          <Link
+            className="text-sm underline underline-offset-4"
+            href={`/app/${orgSlug}/events/${eventSlug}/scoring`}
+          >
+            Back to scoring
+          </Link>
+        }
+      />
+    );
+  }
+
+  const round = mine.rounds.find((r) => r.roundId === roundId);
+  const sheet = detail.sheet;
+  const locked =
+    justSubmitted !== null || sheet.status === "submitted" || sheet.status === "locked";
+  const backHref = `/app/${orgSlug}/events/${eventSlug}/scoring`;
+  const filledCount = criteria.filter((c) => validValues[c._id] !== undefined).length;
+  const allValid =
+    filledCount === criteria.length && criteria.every((c) => errors[c._id] === null);
+
+  if (locked) {
+    const summary = justSubmitted ?? null;
+    return (
+      <div className="max-w-md space-y-4">
+        <div className="flex items-center justify-between">
+          <h2 className="flex items-center gap-2 text-lg font-semibold">
+            #{detail.contestant.number} {detail.contestant.name}
+            {round && <StatusBadge kind="round" status={round.status} />}
+          </h2>
+          <span className="flex items-center gap-1 text-xs text-muted-foreground">
+            <Lock aria-hidden className="size-3.5" />
+            Locked
+          </span>
+        </div>
+        <p className="text-sm text-muted-foreground">
+          Scores submitted{summary ? " ΓÇö see the summary below" : ""}. Submitted scores
+          cannot be changed.
+        </p>
+        {summary && (
+          <table className="w-full text-sm">
+            <caption className="sr-only">Submitted scores</caption>
+            <thead className="text-left text-muted-foreground">
+              <tr>
+                <th className="py-1">Criterion</th>
+                <th>Score</th>
+              </tr>
+            </thead>
+            <tbody>
+              {criteria.map((c) => (
+                <tr key={c._id} className="border-t">
+                  <td className="py-1">{c.name}</td>
+                  <td>
+                    <Num value={summary[c._id]} precision={c.decimalPrecision} />
+                  </td>
+                </tr>
+              ))}
+            </tbody>
+          </table>
+        )}
+        <Link
+          className="flex items-center gap-1 text-sm underline underline-offset-4"
+          href={backHref}
+        >
+          <ChevronLeft aria-hidden className="size-3.5" />
+          Back to scoring
+        </Link>
+      </div>
+    );
+  }
+
+  if (round && round.status !== "open") {
+    return (
+      <div className="max-w-md space-y-3">
+        <h2 className="flex items-center gap-2 text-lg font-semibold">
+          #{detail.contestant.number} {detail.contestant.name}
+          <StatusBadge kind="round" status={round.status} />
+        </h2>
+        <p className="text-sm text-muted-foreground">
+          This round is closed ΓÇö scoring is finished. Your draft is kept but cannot be
+          submitted.
+        </p>
+        <Link
+          className="flex items-center gap-1 text-sm underline underline-offset-4"
+          href={backHref}
+        >
+          <ChevronLeft aria-hidden className="size-3.5" />
+          Back to scoring
+        </Link>
+      </div>
+    );
+  }
+
+  const setValue = (id: string, value: string) => {
+    setRaw((prev) => ({ ...prev, [id]: value }));
+    setSaveState("dirty");
+  };
+
+  const onBlurField = (id: string) => setTouched((prev) => ({ ...prev, [id]: true }));
+
+  const onSubmit = async () => {
+    const invalid = criteria.find((c) => {
+      const value = raw[c._id];
+      return value === undefined || value.trim() === "" || validateRaw(value, c) !== null;
+    });
+    if (invalid) {
+      setTouched((prev) => ({ ...prev, [invalid._id]: true }));
+      document.getElementById(invalid._id)?.focus();
+      return;
+    }
+    setSubmitting(true);
+    try {
+      await submitSheet({ orgSlug, eventSlug, sheetId: sheet._id, values: validValues });
+      setJustSubmitted(validValues);
+      setSaveState("idle");
+      toast.success("Scores submitted.");
+    } catch (err) {
+      const data = (err as { data?: { code?: string; message?: string } })?.data;
+      if (data?.code === "CONFLICT") toast.error("This round is closed ΓÇö scoring is finished.");
+      else if (data?.code === "VALIDATION_ERROR") {
+        toast.error(data.message ?? "Some scores are invalid.");
+      } else toast.error(data?.message ?? "Could not submit.");
+      setSubmitting(false);
+    }
+  };
+
+  return (
+    <div className="max-w-md space-y-4">
+      <div className="flex items-center justify-between">
+        <h2 className="flex items-center gap-2 text-lg font-semibold">
+          #{detail.contestant.number} {detail.contestant.name}
+          {round && <StatusBadge kind="round" status={round.status} />}
+        </h2>
+        <SaveIndicator
+          state={saveState}
+          savedAt={savedAt}
+          onRetry={saveState === "error" ? () => setSaveState("dirty") : undefined}
+        />
+      </div>
+      {criteria.map((criterion) => {
+        const error = errors[criterion._id];
+        return (
+          <div key={criterion._id} className="space-y-1">
+            <Label htmlFor={criterion._id}>
+              {criterion.name}
+              <span className="ml-1 font-normal text-muted-foreground">
+                weight {criterion.weight}% ┬╖ {criterion.minScore}ΓÇô{criterion.maxScore} ┬╖{" "}
+                {criterion.decimalPrecision} decimal
+                {criterion.decimalPrecision === 1 ? "" : "s"}
+              </span>
+            </Label>
+            <Input
+              id={criterion._id}
+              type="number"
+              inputMode="decimal"
+              min={criterion.minScore}
+              max={criterion.maxScore}
+              step={10 ** -criterion.decimalPrecision}
+              aria-invalid={error ? true : undefined}
+              aria-describedby={error ? `${criterion._id}-error` : undefined}
+              value={raw[criterion._id] ?? ""}
+              onBlur={() => onBlurField(criterion._id)}
+              onChange={(e) => setValue(criterion._id, e.target.value)}
+            />
+            {error && (
+              <p id={`${criterion._id}-error`} className="text-xs text-destructive">
+                {error}
+              </p>
+            )}
+          </div>
+        );
+      })}
+      <div className="flex items-center justify-between">
+        <span className="text-xs text-muted-foreground">
+          <Num value={filledCount} /> / <Num value={criteria.length} /> scored
+        </span>
+        <div className="flex gap-2">
+          <Button onClick={onSubmit} disabled={submitting || !allValid}>
+            {submitting ? "SubmittingΓÇª" : "Submit scores"}
+          </Button>
+          <Link className="self-center text-sm underline underline-offset-4" href={backHref}>
+            Cancel
+          </Link>
+        </div>
+      </div>
+    </div>
+  );
+}
diff --git a/app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx b/app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx
new file mode 100644
index 0000000..89aea7b
--- /dev/null
+++ b/app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx
@@ -0,0 +1,102 @@
+"use client";
+
+import { use } from "react";
+import Link from "next/link";
+import { useQuery } from "convex/react";
+import { ClipboardList } from "lucide-react";
+import { api } from "@/convex/_generated/api";
+import { Num } from "@/components/tabulation/Num";
+import { StatusBadge, StatusDot } from "@/components/tabulation/StatusBadge";
+import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
+import { sheetStatusLabel } from "@/components/tabulation/status";
+
+export default function ScoringPage({
+  params,
+}: {
+  params: Promise<{ orgSlug: string; eventSlug: string }>;
+}) {
+  const { orgSlug, eventSlug } = use(params);
+  const mine = useQuery(api.scoring.myAssignments, { orgSlug, eventSlug });
+
+  if (mine === undefined) return <TableSkeleton rows={4} cols={3} />;
+  if (mine.judgeId === null) {
+    return (
+      <EmptyState
+        icon={ClipboardList}
+        title="You are not a judge for this event"
+        hint="Judges see their score sheets here once the event is published."
+      />
+    );
+  }
+  if (mine.rounds.length === 0) {
+    return (
+      <EmptyState
+        icon={ClipboardList}
+        title="No score sheets assigned yet"
+        hint="Sheets appear when the event is published and judges are assigned."
+      />
+    );
+  }
+
+  return (
+    <div className="space-y-6">
+      {mine.rounds.map((round) => {
+        const submitted = round.sheets.filter(
+          (s) => s.status === "submitted" || s.status === "locked",
+        ).length;
+        return (
+          <section
+            key={round.roundId}
+            className="space-y-2 rounded-lg border p-4"
+            aria-label={round.name}
+          >
+            <div className="flex items-center justify-between">
+              <div className="flex items-center gap-2">
+                <h2 className="font-medium">{round.name}</h2>
+                <StatusBadge kind="round" status={round.status} />
+              </div>
+              <span className="text-xs text-muted-foreground">
+                <Num value={submitted} /> / <Num value={round.sheets.length} /> submitted
+              </span>
+            </div>
+            <ul className="divide-y">
+              {round.sheets.map((sheet) => {
+                const actionable =
+                  round.status === "open" &&
+                  sheet.status !== "submitted" &&
+                  sheet.status !== "locked";
+                return (
+                  <li
+                    key={sheet.sheetId}
+                    className="flex items-center justify-between py-1.5 text-sm"
+                  >
+                    <span className="flex items-center gap-2">
+                      <StatusDot
+                        status={sheet.status}
+                        label={`${sheet.contestantName}: ${sheetStatusLabel[sheet.status]}`}
+                      />
+                      <span className="font-mono tabular-nums text-muted-foreground">
+                        #{sheet.contestantNumber}
+                      </span>
+                      {sheet.contestantName}
+                    </span>
+                    {actionable ? (
+                      <Link
+                        className="underline underline-offset-4"
+                        href={`/app/${orgSlug}/events/${eventSlug}/scoring/${round.roundId}/${sheet.contestantId}`}
+                      >
+                        {sheet.status === "in_progress" ? "Continue" : "Score"}
+                      </Link>
+                    ) : (
+                      <StatusBadge kind="sheet" status={sheet.status} />
+                    )}
+                  </li>
+                );
+              })}
+            </ul>
+          </section>
+        );
+      })}
+    </div>
+  );
+}
diff --git a/app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx b/app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx
index ddd61be..d9e1dc0 100644
--- a/app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx
+++ b/app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx
@@ -1,52 +1,116 @@
 "use client";
 
 import { use, useState } from "react";
 import { useMutation, useQuery } from "convex/react";
 import { api } from "@/convex/_generated/api";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
 import { toast } from "sonner";
 
-export default function EventSettingsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
+export default function EventSettingsPage({
+  params,
+}: {
+  params: Promise<{ orgSlug: string; eventSlug: string }>;
+}) {
   const { orgSlug, eventSlug } = use(params);
   const ev = useQuery(api.events.get, { orgSlug, eventSlug });
   const update = useMutation(api.events.update);
   const [name, setName] = useState("");
   const [venue, setVenue] = useState("");
+  const [dropHighLow, setDropHighLow] = useState(false);
+  const [elimination, setElimination] = useState(true);
   const [prevKey, setPrevKey] = useState<string | null>(null);
 
   if (ev !== undefined && ev !== null && prevKey !== ev._id) {
     setPrevKey(ev._id);
     setName(ev.name);
     setVenue(ev.venue ?? "");
+    setDropHighLow(ev.scoringRules.dropHighLow);
+    setElimination(ev.eliminationEnabled);
   }
 
   if (ev === undefined) return <div>LoadingΓÇª</div>;
   if (ev === null) return <div>Event not found.</div>;
 
+  const save = async (patch: Record<string, unknown>) => {
+    try {
+      await update({ orgSlug, eventSlug, ...patch });
+      toast.success("Saved.");
+    } catch (err: unknown) {
+      const data = (err as { data?: { code?: string; message?: string } })?.data;
+      toast.error(
+        data?.code === "CONFLICT" ? "Configuration is locked." : data?.message ?? "Could not save.",
+      );
+    }
+  };
+
   return (
     <div className="space-y-4">
       <div className="flex gap-2">
-        <Input value={name} onChange={(e) => setName(e.target.value)} />
+        <Input
+          aria-label="Event name"
+          value={name}
+          onChange={(e) => setName(e.target.value)}
+        />
         <Button
           disabled={ev.status !== "draft" || !name || name === ev.name}
-          onClick={async () => {
-            try {
-              await update({ orgSlug, eventSlug, name, venue });
-              toast.success("Saved.");
-            } catch (err: unknown) {
-              const data = (err as { data?: { code?: string; message?: string } })?.data;
-              toast.error(data?.code === "CONFLICT" ? "Configuration is locked." : data?.message ?? "Could not save.");
-            }
-          }}
+          onClick={() => save({ name, venue })}
         >
           Save
         </Button>
       </div>
       <div className="flex gap-2">
-        <Input value={venue} placeholder="Venue" onChange={(e) => setVenue(e.target.value)} />
+        <Input
+          aria-label="Venue"
+          value={venue}
+          placeholder="Venue"
+          onChange={(e) => setVenue(e.target.value)}
+        />
       </div>
-      <p className="text-sm text-muted-foreground">Slug: {ev.slug} - Status: {ev.status}</p>
+      {ev.status === "draft" && (
+        <div className="space-y-3 rounded-lg border p-4">
+          <h3 className="font-medium">Scoring</h3>
+          <div className="space-y-2">
+            <Label className="flex items-center gap-2 font-normal">
+              <input
+                type="checkbox"
+                checked={dropHighLow}
+                onChange={(e) => setDropHighLow(e.target.checked)}
+              />
+              Drop highest and lowest judge scores
+              <span className="text-xs text-muted-foreground">
+                (applies when 3+ judges scored a contestant-criterion)
+              </span>
+            </Label>
+            <Label className="flex items-center gap-2 font-normal">
+              <input
+                type="checkbox"
+                checked={elimination}
+                onChange={(e) => setElimination(e.target.checked)}
+              />
+              Elimination rounds enabled
+              <span className="text-xs text-muted-foreground">
+                (shows advancement controls on the Rounds page)
+              </span>
+            </Label>
+          </div>
+          <Button
+            size="sm"
+            variant="outline"
+            disabled={
+              dropHighLow === ev.scoringRules.dropHighLow &&
+              elimination === ev.eliminationEnabled
+            }
+            onClick={() => save({ scoringRules: { dropHighLow }, eliminationEnabled: elimination })}
+          >
+            Save scoring settings
+          </Button>
+        </div>
+      )}
+      <p className="text-sm text-muted-foreground">
+        Slug: {ev.slug} - Status: {ev.status}
+      </p>
     </div>
   );
 }
diff --git a/app/globals.css b/app/globals.css
index 392643c..29023db 100644
--- a/app/globals.css
+++ b/app/globals.css
@@ -16,20 +16,29 @@
   --color-sidebar-accent: var(--sidebar-accent);
   --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
   --color-sidebar-primary: var(--sidebar-primary);
   --color-sidebar-foreground: var(--sidebar-foreground);
   --color-sidebar: var(--sidebar);
   --color-chart-5: var(--chart-5);
   --color-chart-4: var(--chart-4);
   --color-chart-3: var(--chart-3);
   --color-chart-2: var(--chart-2);
   --color-chart-1: var(--chart-1);
+  --color-success: var(--success);
+  --color-success-foreground: var(--success-foreground);
+  --color-success-muted: var(--success-muted);
+  --color-warning: var(--warning);
+  --color-warning-foreground: var(--warning-foreground);
+  --color-warning-muted: var(--warning-muted);
+  --color-info: var(--info);
+  --color-info-foreground: var(--info-foreground);
+  --color-info-muted: var(--info-muted);
   --color-ring: var(--ring);
   --color-input: var(--input);
   --color-border: var(--border);
   --color-destructive: var(--destructive);
   --color-accent-foreground: var(--accent-foreground);
   --color-accent: var(--accent);
   --color-muted-foreground: var(--muted-foreground);
   --color-muted: var(--muted);
   --color-secondary-foreground: var(--secondary-foreground);
   --color-secondary: var(--secondary);
@@ -74,20 +83,29 @@
   --chart-5: oklch(0.269 0 0);
   --radius: 0.625rem;
   --sidebar: oklch(0.985 0 0);
   --sidebar-foreground: oklch(0.145 0 0);
   --sidebar-primary: oklch(0.205 0 0);
   --sidebar-primary-foreground: oklch(0.985 0 0);
   --sidebar-accent: oklch(0.97 0 0);
   --sidebar-accent-foreground: oklch(0.205 0 0);
   --sidebar-border: oklch(0.922 0 0);
   --sidebar-ring: oklch(0.708 0 0);
+  --success: oklch(0.53 0.14 150);
+  --success-foreground: oklch(0.985 0 0);
+  --success-muted: oklch(0.95 0.04 150);
+  --warning: oklch(0.62 0.16 60);
+  --warning-foreground: oklch(0.985 0 0);
+  --warning-muted: oklch(0.96 0.05 80);
+  --info: oklch(0.55 0.15 250);
+  --info-foreground: oklch(0.985 0 0);
+  --info-muted: oklch(0.95 0.04 250);
 }
 
 .dark {
   --background: oklch(0.145 0 0);
   --foreground: oklch(0.985 0 0);
   --card: oklch(0.205 0 0);
   --card-foreground: oklch(0.985 0 0);
   --popover: oklch(0.205 0 0);
   --popover-foreground: oklch(0.985 0 0);
   --primary: oklch(0.922 0 0);
@@ -108,20 +126,29 @@
   --chart-4: oklch(0.371 0 0);
   --chart-5: oklch(0.269 0 0);
   --sidebar: oklch(0.205 0 0);
   --sidebar-foreground: oklch(0.985 0 0);
   --sidebar-primary: oklch(0.488 0.243 264.376);
   --sidebar-primary-foreground: oklch(0.985 0 0);
   --sidebar-accent: oklch(0.269 0 0);
   --sidebar-accent-foreground: oklch(0.985 0 0);
   --sidebar-border: oklch(1 0 0 / 10%);
   --sidebar-ring: oklch(0.556 0 0);
+  --success: oklch(0.68 0.15 150);
+  --success-foreground: oklch(0.145 0 0);
+  --success-muted: oklch(0.28 0.05 150);
+  --warning: oklch(0.75 0.15 70);
+  --warning-foreground: oklch(0.145 0 0);
+  --warning-muted: oklch(0.3 0.06 70);
+  --info: oklch(0.68 0.13 250);
+  --info-foreground: oklch(0.145 0 0);
+  --info-muted: oklch(0.28 0.05 250);
 }
 
 @layer base {
   * {
     @apply border-border outline-ring/50;
   }
   body {
     @apply bg-background text-foreground;
   }
   html {
diff --git a/components/EventShell.tsx b/components/EventShell.tsx
index ff16e93..bb6b06c 100644
--- a/components/EventShell.tsx
+++ b/components/EventShell.tsx
@@ -19,22 +19,24 @@ export function EventShell({
   if (ev === undefined) return <div className="p-8">LoadingΓÇª</div>;
   if (ev === null) return notFound();
 
   const base = `/app/${orgSlug}/events/${eventSlug}`;
   const nav = [
     ["Overview", `${base}/overview`],
     ["Rounds", `${base}/rounds`],
     ["Categories", `${base}/categories`],
     ["Contestants", `${base}/contestants`],
     ["Judges", `${base}/judges`],
+    ["Scoring", `${base}/scoring`],
     ["Readiness", `${base}/readiness`],
     ["Settings", `${base}/settings`],
+    ["Results", `${base}/results`],
   ] as const;
 
   return (
     <div className="space-y-4">
       <div className="flex items-center gap-3">
         <h1 className="text-2xl font-semibold">{ev.name}</h1>
         <Badge variant={ev.status === "draft" ? "outline" : "secondary"}>{ev.status}</Badge>
         {ev.status !== "draft" && (
           <Link href={`${base}/publish`} className="text-sm text-muted-foreground underline">
             Locked - manage
diff --git a/components/tabulation/BlackoutNotice.tsx b/components/tabulation/BlackoutNotice.tsx
new file mode 100644
index 0000000..0a00f44
--- /dev/null
+++ b/components/tabulation/BlackoutNotice.tsx
@@ -0,0 +1,13 @@
+import { EyeOff } from "lucide-react";
+
+export function BlackoutNotice() {
+  return (
+    <div
+      role="note"
+      className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground"
+    >
+      <EyeOff aria-hidden className="size-3.5 shrink-0" />
+      Results stay hidden to judges and staff until the round is published.
+    </div>
+  );
+}
diff --git a/components/tabulation/ConfirmDialog.tsx b/components/tabulation/ConfirmDialog.tsx
new file mode 100644
index 0000000..b08d0c3
--- /dev/null
+++ b/components/tabulation/ConfirmDialog.tsx
@@ -0,0 +1,68 @@
+"use client";
+
+import type { ReactNode } from "react";
+import { LoaderCircle } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import {
+  Dialog,
+  DialogContent,
+  DialogDescription,
+  DialogFooter,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+
+export function ConfirmDialog({
+  open,
+  onOpenChange,
+  title,
+  description,
+  confirmLabel,
+  busy = false,
+  destructive = false,
+  onConfirm,
+  children,
+}: {
+  open: boolean;
+  onOpenChange: (open: boolean) => void;
+  title: string;
+  description: string;
+  confirmLabel: string;
+  busy?: boolean;
+  destructive?: boolean;
+  onConfirm: () => void;
+  children?: ReactNode;
+}) {
+  return (
+    <Dialog open={open} onOpenChange={onOpenChange}>
+      <DialogContent>
+        <DialogHeader>
+          <DialogTitle>{title}</DialogTitle>
+          <DialogDescription>{description}</DialogDescription>
+        </DialogHeader>
+        {children}
+        <DialogFooter>
+          <Button
+            variant="outline"
+            disabled={busy}
+            onClick={() => onOpenChange(false)}
+            autoFocus={destructive}
+          >
+            Cancel
+          </Button>
+          <Button
+            variant={destructive ? "destructive" : "default"}
+            disabled={busy}
+            onClick={onConfirm}
+            autoFocus={!destructive}
+          >
+            {busy && (
+              <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
+            )}
+            {busy ? "WorkingΓÇª" : confirmLabel}
+          </Button>
+        </DialogFooter>
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/components/tabulation/Num.tsx b/components/tabulation/Num.tsx
new file mode 100644
index 0000000..657c0b1
--- /dev/null
+++ b/components/tabulation/Num.tsx
@@ -0,0 +1,34 @@
+import { cn } from "@/lib/utils";
+import { formatScore } from "./status";
+
+export function Num({
+  value,
+  precision = 0,
+  tone = "default",
+  className,
+}: {
+  value: number | null | undefined;
+  precision?: number;
+  tone?: "default" | "success" | "muted";
+  className?: string;
+}) {
+  if (value === null || value === undefined) {
+    return (
+      <span aria-label="no value" className={cn("font-mono tabular-nums", className)}>
+        ΓÇö
+      </span>
+    );
+  }
+  return (
+    <span
+      className={cn(
+        "font-mono tabular-nums",
+        tone === "success" && "text-success",
+        tone === "muted" && "text-muted-foreground",
+        className,
+      )}
+    >
+      {formatScore(value, precision)}
+    </span>
+  );
+}
diff --git a/components/tabulation/RoundResultsCard.tsx b/components/tabulation/RoundResultsCard.tsx
new file mode 100644
index 0000000..76a16e7
--- /dev/null
+++ b/components/tabulation/RoundResultsCard.tsx
@@ -0,0 +1,133 @@
+"use client";
+
+import { useState } from "react";
+import { useQuery } from "convex/react";
+import { api } from "@/convex/_generated/api";
+import type { Id } from "@/convex/_generated/dataModel";
+import { Button } from "@/components/ui/button";
+import { Num } from "@/components/tabulation/Num";
+import { VersionBadge } from "@/components/tabulation/VersionBadge";
+
+type RoundSummary = {
+  roundId: string;
+  name: string;
+  order: number;
+  weight: number;
+  version: number;
+  standings: {
+    contestantId: string;
+    contestantName: string;
+    rank: number | null;
+    roundScore: number | null;
+  }[];
+};
+
+export function RoundResultsCard({
+  orgSlug,
+  eventSlug,
+  round,
+  decimalPrecision,
+  nameMap,
+}: {
+  orgSlug: string;
+  eventSlug: string;
+  round: RoundSummary;
+  decimalPrecision: number;
+  nameMap: Map<string, string>;
+}) {
+  const versions = useQuery(api.results.listRoundVersions, {
+    orgSlug,
+    eventSlug,
+    roundId: round.roundId as Id<"rounds">,
+  });
+  const [picked, setPicked] = useState<number | null>(null);
+  const historicalQuery = useQuery(
+    api.results.roundResults,
+    picked === null || picked === round.version
+      ? "skip"
+      : {
+          orgSlug,
+          eventSlug,
+          roundId: round.roundId as Id<"rounds">,
+          version: picked,
+        },
+  );
+
+  const historical =
+    picked === null || picked === round.version || historicalQuery instanceof Error
+      ? undefined
+      : historicalQuery;
+  const rows =
+    historical !== undefined
+      ? historical.snapshot.categories.flatMap((category) =>
+          category.standings.map((s) => ({
+            contestantId: s.contestantId as string,
+            contestantName: nameMap.get(s.contestantId as string) ?? "ΓÇö",
+            rank: s.rank as number | null,
+            roundScore: s.roundScore as number | null,
+          })),
+        )
+      : round.standings;
+
+  return (
+    <section className="space-y-2 rounded-lg border p-4" aria-label={round.name}>
+      <div className="flex flex-wrap items-center justify-between gap-2">
+        <div className="flex flex-wrap items-center gap-2">
+          <span className="font-medium">{round.name}</span>
+          <VersionBadge version={round.version} latest />
+          <span className="text-xs text-muted-foreground">
+            weight <Num value={round.weight} />%
+          </span>
+        </div>
+        {round.version > 1 && (
+          <label className="flex items-center gap-1 text-xs text-muted-foreground">
+            Version
+            <select
+              className="rounded border bg-background px-2 py-1 text-sm"
+              value={picked ?? round.version}
+              onChange={(e) => setPicked(Number(e.target.value))}
+            >
+              {(versions ?? []).map((v) => (
+                <option key={v.version} value={v.version}>
+                  v{v.version}
+                  {v.version === round.version ? " (current)" : ""}
+                </option>
+              ))}
+            </select>
+          </label>
+        )}
+      </div>
+      {picked !== null && picked !== round.version && (
+        <p className="text-xs text-warning">
+          Viewing v{picked} ΓÇö current is v{round.version}.{" "}
+          <Button variant="link" size="xs" onClick={() => setPicked(null)}>
+            Back to current
+          </Button>
+        </p>
+      )}
+      <table className="w-full text-sm">
+        <caption className="sr-only">{round.name} standings</caption>
+        <thead className="text-left text-muted-foreground">
+          <tr>
+            <th className="py-1">Rank</th>
+            <th>Contestant</th>
+            <th>Round score</th>
+          </tr>
+        </thead>
+        <tbody>
+          {rows.map((row) => (
+            <tr key={row.contestantId} className="border-t">
+              <td className="py-1">
+                <Num value={row.rank} />
+              </td>
+              <td>{row.contestantName}</td>
+              <td>
+                <Num value={row.roundScore} precision={decimalPrecision} />
+              </td>
+            </tr>
+          ))}
+        </tbody>
+      </table>
+    </section>
+  );
+}
diff --git a/components/tabulation/SaveIndicator.tsx b/components/tabulation/SaveIndicator.tsx
new file mode 100644
index 0000000..c2d1d8c
--- /dev/null
+++ b/components/tabulation/SaveIndicator.tsx
@@ -0,0 +1,59 @@
+"use client";
+
+import { Check, LoaderCircle, Pencil, TriangleAlert } from "lucide-react";
+import { Button } from "@/components/ui/button";
+
+export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
+
+export function SaveIndicator({
+  state,
+  savedAt,
+  onRetry,
+}: {
+  state: SaveState;
+  savedAt?: number | null;
+  onRetry?: () => void;
+}) {
+  if (state === "idle") return null;
+  return (
+    <div aria-live="polite" className="flex items-center gap-1.5 text-xs">
+      {state === "dirty" && (
+        <>
+          <Pencil aria-hidden className="size-3.5 text-warning" />
+          <span className="text-muted-foreground">Unsaved changes</span>
+        </>
+      )}
+      {state === "saving" && (
+        <>
+          <LoaderCircle
+            aria-hidden
+            className="size-3.5 animate-spin text-info motion-reduce:animate-none"
+          />
+          <span className="text-muted-foreground">SavingΓÇª</span>
+        </>
+      )}
+      {state === "saved" && (
+        <>
+          <Check aria-hidden className="size-3.5 text-success" />
+          <span className="text-muted-foreground">
+            Saved
+            {savedAt
+              ? ` ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
+              : ""}
+          </span>
+        </>
+      )}
+      {state === "error" && (
+        <>
+          <TriangleAlert aria-hidden className="size-3.5 text-destructive" />
+          <span className="text-destructive">Save failed</span>
+          {onRetry && (
+            <Button variant="outline" size="xs" onClick={onRetry}>
+              Retry
+            </Button>
+          )}
+        </>
+      )}
+    </div>
+  );
+}
diff --git a/components/tabulation/StateBlock.tsx b/components/tabulation/StateBlock.tsx
new file mode 100644
index 0000000..995cc59
--- /dev/null
+++ b/components/tabulation/StateBlock.tsx
@@ -0,0 +1,82 @@
+import type { ReactNode } from "react";
+import type { LucideIcon } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import { cn } from "@/lib/utils";
+
+export function TableSkeleton({
+  rows = 5,
+  cols = 4,
+  className,
+}: {
+  rows?: number;
+  cols?: number;
+  className?: string;
+}) {
+  return (
+    <div role="status" aria-label="Loading" className={cn("space-y-2", className)}>
+      {Array.from({ length: rows }).map((_, r) => (
+        <div
+          key={r}
+          className="grid gap-2"
+          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
+        >
+          {Array.from({ length: cols }).map((_, c) => (
+            <div key={c} className="h-4 animate-pulse rounded bg-muted" />
+          ))}
+        </div>
+      ))}
+    </div>
+  );
+}
+
+export function EmptyState({
+  icon: Icon,
+  title,
+  hint,
+  action,
+  className,
+}: {
+  icon: LucideIcon;
+  title: string;
+  hint?: string;
+  action?: ReactNode;
+  className?: string;
+}) {
+  return (
+    <div
+      className={cn(
+        "flex flex-col items-center gap-1 rounded-lg border border-dashed p-8 text-center",
+        className,
+      )}
+    >
+      <Icon aria-hidden className="size-4 text-muted-foreground" />
+      <p className="text-sm font-medium">{title}</p>
+      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
+      {action}
+    </div>
+  );
+}
+
+export function ErrorState({
+  message,
+  onRetry,
+  className,
+}: {
+  message: string;
+  onRetry?: () => void;
+  className?: string;
+}) {
+  return (
+    <div
+      role="alert"
+      className={cn("rounded-lg border border-destructive/40 p-4 text-sm text-destructive", className)}
+    >
+      <p>{message}</p>
+      {onRetry && (
+        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
+          Retry
+        </Button>
+      )}
+    </div>
+  );
+}
diff --git a/components/tabulation/StatusBadge.tsx b/components/tabulation/StatusBadge.tsx
new file mode 100644
index 0000000..15e19f9
--- /dev/null
+++ b/components/tabulation/StatusBadge.tsx
@@ -0,0 +1,87 @@
+import { BadgeCheck, Circle, CirclePause, Lock } from "lucide-react";
+import { Badge } from "@/components/ui/badge";
+import { cn } from "@/lib/utils";
+import {
+  roundStatusLabel,
+  roundStatusTone,
+  sheetStatusLabel,
+  sheetStatusTone,
+  type RoundStatus,
+  type SheetStatus,
+  type Tone,
+} from "./status";
+
+const toneClasses: Record<Tone, string> = {
+  muted: "bg-muted text-muted-foreground",
+  info: "bg-info-muted text-info",
+  success: "bg-success-muted text-success",
+  warning: "bg-warning-muted text-warning",
+  secondary: "bg-secondary text-secondary-foreground",
+};
+
+const dotClasses: Record<SheetStatus, string> = {
+  not_started: "rounded-full border border-muted-foreground/60 bg-transparent",
+  in_progress:
+    "rounded-full ring-1 ring-info bg-[linear-gradient(to_right,var(--info)_50%,transparent_50%)]",
+  submitted: "rounded-full bg-success ring-2 ring-success/30",
+  locked: "rounded-[2px] bg-muted-foreground",
+};
+
+export function StatusDot({
+  status,
+  label,
+  className,
+}: {
+  status: SheetStatus;
+  label?: string;
+  className?: string;
+}) {
+  return (
+    <span
+      role="img"
+      aria-label={label}
+      title={label}
+      aria-hidden={label ? undefined : true}
+      className={cn("inline-block size-2 shrink-0", dotClasses[status], className)}
+    />
+  );
+}
+
+const roundIcons: Record<RoundStatus, typeof Circle> = {
+  open: Circle,
+  closed: CirclePause,
+  published: BadgeCheck,
+};
+
+export function StatusBadge({
+  status,
+  kind,
+}: {
+  status: SheetStatus | RoundStatus;
+  kind: "sheet" | "round";
+}) {
+  if (status === "locked") {
+    return (
+      <Badge variant="secondary">
+        <Lock aria-hidden />
+        {sheetStatusLabel.locked}
+      </Badge>
+    );
+  }
+  if (kind === "round") {
+    const roundStatus = status as RoundStatus;
+    const Icon = roundIcons[roundStatus];
+    return (
+      <Badge className={cn("border-transparent", toneClasses[roundStatusTone[roundStatus]])}>
+        <Icon aria-hidden />
+        {roundStatusLabel[roundStatus]}
+      </Badge>
+    );
+  }
+  const sheetStatus = status as SheetStatus;
+  return (
+    <Badge className={cn("border-transparent", toneClasses[sheetStatusTone[sheetStatus]])}>
+      {sheetStatusLabel[sheetStatus]}
+    </Badge>
+  );
+}
diff --git a/components/tabulation/VersionBadge.tsx b/components/tabulation/VersionBadge.tsx
new file mode 100644
index 0000000..4cbd7dd
--- /dev/null
+++ b/components/tabulation/VersionBadge.tsx
@@ -0,0 +1,20 @@
+import { History } from "lucide-react";
+import { Badge } from "@/components/ui/badge";
+import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
+import { cn } from "@/lib/utils";
+
+export function VersionBadge({ version, latest }: { version: number; latest?: boolean }) {
+  const badge = (
+    <Badge variant="outline" className={cn(version >= 2 && "border-warning/50 text-warning")}>
+      <History aria-hidden />v{version}
+      {latest && " ┬╖ current"}
+    </Badge>
+  );
+  if (version < 2) return badge;
+  return (
+    <Tooltip>
+      <TooltipTrigger render={badge} />
+      <TooltipContent>Corrected version ΓÇö earlier versions are kept</TooltipContent>
+    </Tooltip>
+  );
+}
diff --git a/components/tabulation/status.test.ts b/components/tabulation/status.test.ts
new file mode 100644
index 0000000..6f26155
--- /dev/null
+++ b/components/tabulation/status.test.ts
@@ -0,0 +1,45 @@
+import { describe, expect, it } from "vitest";
+import {
+  formatScore,
+  roundStatusLabel,
+  roundStatusTone,
+  sheetStatusLabel,
+  sheetStatusTone,
+  tieResolvedByLabel,
+} from "./status";
+
+describe("formatScore", () => {
+  it("keeps trailing zeros at the requested precision", () => {
+    expect(formatScore(89.2, 2)).toBe("89.20");
+    expect(formatScore(87.5, 1)).toBe("87.5");
+    expect(formatScore(100, 0)).toBe("100");
+  });
+
+  it("renders an em dash for missing values", () => {
+    expect(formatScore(null, 2)).toBe("ΓÇö");
+    expect(formatScore(undefined, 1)).toBe("ΓÇö");
+  });
+});
+
+describe("status vocabulary", () => {
+  it("labels every sheet status with a tone", () => {
+    for (const status of ["not_started", "in_progress", "submitted", "locked"] as const) {
+      expect(sheetStatusLabel[status].length).toBeGreaterThan(0);
+      expect(sheetStatusTone[status]).toBeDefined();
+    }
+  });
+
+  it("labels every round status with a tone", () => {
+    for (const status of ["open", "closed", "published"] as const) {
+      expect(roundStatusLabel[status].length).toBeGreaterThan(0);
+      expect(roundStatusTone[status]).toBeDefined();
+    }
+  });
+
+  it("labels tie resolution sources", () => {
+    expect(tieResolvedByLabel.criteria_cascade).toBe("criteria cascade");
+    expect(tieResolvedByLabel.judge_firsts).toBe("judge firsts");
+    expect(tieResolvedByLabel.manual).toBe("manual");
+    expect(tieResolvedByLabel.none).toBe("ΓÇö");
+  });
+});
diff --git a/components/tabulation/status.ts b/components/tabulation/status.ts
new file mode 100644
index 0000000..8d0e7b7
--- /dev/null
+++ b/components/tabulation/status.ts
@@ -0,0 +1,41 @@
+export type SheetStatus = "not_started" | "in_progress" | "submitted" | "locked";
+export type RoundStatus = "open" | "closed" | "published";
+export type Tone = "muted" | "info" | "success" | "warning" | "secondary";
+
+export const sheetStatusLabel: Record<SheetStatus, string> = {
+  not_started: "Not started",
+  in_progress: "In progress",
+  submitted: "Submitted",
+  locked: "Locked",
+};
+
+export const roundStatusLabel: Record<RoundStatus, string> = {
+  open: "Open",
+  closed: "Closed ΓÇö in review",
+  published: "Published",
+};
+
+export const sheetStatusTone: Record<SheetStatus, Tone> = {
+  not_started: "muted",
+  in_progress: "info",
+  submitted: "success",
+  locked: "secondary",
+};
+
+export const roundStatusTone: Record<RoundStatus, Tone> = {
+  open: "info",
+  closed: "warning",
+  published: "success",
+};
+
+export const tieResolvedByLabel: Record<string, string> = {
+  none: "ΓÇö",
+  criteria_cascade: "criteria cascade",
+  judge_firsts: "judge firsts",
+  manual: "manual",
+};
+
+export function formatScore(value: number | null | undefined, precision: number): string {
+  if (value === null || value === undefined || Number.isNaN(value)) return "ΓÇö";
+  return value.toFixed(precision);
+}
diff --git a/convex-test/permissions3.test.ts b/convex-test/permissions3.test.ts
new file mode 100644
index 0000000..e107ba0
--- /dev/null
+++ b/convex-test/permissions3.test.ts
@@ -0,0 +1,41 @@
+import { describe, expect, it } from "vitest";
+import { aliceIdentity, seedAndProvision, setupTest } from "./setup";
+
+const EXPECTED: Record<string, string[]> = {
+  "Org Owner": ["score.manage", "result.view"],
+  "Org Admin": ["score.manage", "result.view"],
+  "Event Admin": ["score.manage", "result.view"],
+  Tabulator: ["score.manage", "result.view"],
+  Judge: ["score.enter", "result.view"],
+  Staff: ["result.view"],
+  Viewer: ["result.view"],
+};
+
+describe("score permissions wiring", () => {
+  it("seeds new permissions and role links", async () => {
+    const t = setupTest();
+    await seedAndProvision(t, aliceIdentity);
+    const result = await t.run(async (q) => {
+      const perms = await q.db.query("permissions").collect();
+      const roles = await q.db.query("roles").collect();
+      const out: Record<string, string[]> = {};
+      for (const role of roles) {
+        const links = await q.db
+          .query("rolePermissions")
+          .withIndex("by_role_id", (q2) => q2.eq("roleId", role._id))
+          .collect();
+        out[role.name] = links
+          .map((l) => perms.find((p) => p._id === l.permissionId)!.name)
+          .filter((n) => n === "score.enter" || n === "score.manage" || n === "result.view")
+          .sort();
+      }
+      return { out, permNames: perms.map((p) => p.name) };
+    });
+    for (const [role, perms] of Object.entries(EXPECTED)) {
+      expect(result.out[role]).toEqual([...perms].sort());
+    }
+    expect(result.permNames).toContain("score.enter");
+    expect(result.permNames).toContain("score.manage");
+    expect(result.permNames).toContain("result.view");
+  });
+});
diff --git a/convex-test/phase3Schema.test.ts b/convex-test/phase3Schema.test.ts
new file mode 100644
index 0000000..f1ada93
--- /dev/null
+++ b/convex-test/phase3Schema.test.ts
@@ -0,0 +1,162 @@
+import { describe, expect, it } from "vitest";
+import { api } from "../convex/_generated/api";
+import { aliceIdentity, bobIdentity, createOrgAndEvent, setupTest } from "./setup";
+
+async function configureMinimalEvent(t: ReturnType<typeof setupTest>) {
+  await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
+  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
+  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
+  const roundId = rounds[0]._id;
+  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { orgSlug: "acme", eventSlug: "gala", roundId, name: "A", weight: 60, minScore: 0, maxScore: 10, decimalPrecision: 0 });
+  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { orgSlug: "acme", eventSlug: "gala", roundId, name: "B", weight: 40, minScore: 0, maxScore: 10, decimalPrecision: 0 });
+  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
+  await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: "bob@example.com", roleName: "Judge" });
+  const pending = await t.withIdentity(bobIdentity).query(api.invitations.listForUser, {});
+  await t.withIdentity(bobIdentity).mutation(api.invitations.accept, { token: pending[0].token });
+  const members = await t.withIdentity(aliceIdentity).query(api.members.list, { orgSlug: "acme" });
+  const bobId = members.find((m: { email: string }) => m.email === "bob@example.com")!.userId;
+  await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: bobId });
+  const judges = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "gala" });
+  await t.withIdentity(aliceIdentity).mutation(api.judges.addAssignment, { orgSlug: "acme", eventSlug: "gala", judgeId: judges[0]._id });
+  return roundId;
+}
+
+describe("phase3 schema defaults", () => {
+  it("new events get default scoring rules and elimination", async () => {
+    const t = setupTest();
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
+    expect(ev?.scoringRules).toEqual({ dropHighLow: false });
+    expect(ev?.eliminationEnabled).toBe(true);
+  });
+
+  it("first round defaults weight 100/open, second 0", async () => {
+    const t = setupTest();
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R1" });
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R2" });
+    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
+    expect(rounds.map((r) => [r.name, r.weight, r.status, r.advancement.mode])).toEqual([
+      ["R1", 100, "open", "none"],
+      ["R2", 0, "open", "none"],
+    ]);
+  });
+
+  it("round weight and advancement update and validate", async () => {
+    const t = setupTest();
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
+    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
+    const roundId = rounds[0]._id;
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.update, {
+      orgSlug: "acme", eventSlug: "gala", roundId, weight: 60,
+      advancement: { mode: "top_count", count: 5, allowOverride: true },
+    });
+    const after = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
+    expect(after[0].weight).toBe(60);
+    expect(after[0].advancement).toEqual({ mode: "top_count", count: 5, allowOverride: true });
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.rounds.update, {
+        orgSlug: "acme", eventSlug: "gala", roundId, advancement: { mode: "top_count", allowOverride: true },
+      }),
+    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.rounds.update, { orgSlug: "acme", eventSlug: "gala", roundId, weight: 101 }),
+    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
+  });
+
+  it("events.update handles scoring rules and elimination", async () => {
+    const t = setupTest();
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+    await t.withIdentity(aliceIdentity).mutation(api.events.update, {
+      orgSlug: "acme", eventSlug: "gala", scoringRules: { dropHighLow: true }, eliminationEnabled: false,
+    });
+    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
+    expect(ev?.scoringRules).toEqual({ dropHighLow: true });
+    expect(ev?.eliminationEnabled).toBe(false);
+  });
+
+  it("save-as-template round-trips phase 3 fields", async () => {
+    const t = setupTest();
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+    await t.withIdentity(aliceIdentity).mutation(api.events.update, {
+      orgSlug: "acme", eventSlug: "gala", scoringRules: { dropHighLow: true }, eliminationEnabled: false,
+    });
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
+      orgSlug: "acme", eventSlug: "gala", name: "R", weight: 100,
+      advancement: { mode: "top_percent", percent: 50, allowOverride: false },
+    });
+    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
+    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
+      orgSlug: "acme", eventSlug: "gala", roundId: rounds[0]._id, name: "C", weight: 100, minScore: 0, maxScore: 10, decimalPrecision: 0,
+    });
+    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
+    await t.withIdentity(aliceIdentity).mutation(api.templates.createFromEvent, { orgSlug: "acme", eventSlug: "gala", name: "T3" });
+    const tpls = await t.withIdentity(aliceIdentity).query(api.templates.list, { orgSlug: "acme" });
+    const tpl = tpls.find((x) => x.name === "T3")!;
+    expect(tpl.configSnapshot.eliminationEnabled).toBe(false);
+    expect(tpl.configSnapshot.scoringRules).toEqual({ dropHighLow: true });
+    expect(tpl.configSnapshot.rounds[0].weight).toBe(100);
+    await t.withIdentity(aliceIdentity).mutation(api.events.createFromTemplate, { orgSlug: "acme", name: "G2", slug: "g2", templateId: tpl._id });
+    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "g2" });
+    expect(ev?.eliminationEnabled).toBe(false);
+    expect(ev?.scoringRules).toEqual({ dropHighLow: true });
+    const r2 = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "g2" });
+    expect(r2[0].weight).toBe(100);
+    expect(r2[0].advancement).toEqual({ mode: "top_percent", percent: 50, allowOverride: false });
+  });
+});
+
+describe("readiness & lifecycle gating", () => {
+  it("multi-round weights must sum to 100", async () => {
+    const t = setupTest();
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R1", weight: 60 });
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R2", weight: 60 });
+    const checks = await t.withIdentity(aliceIdentity).query(api.events.readiness, { orgSlug: "acme", eventSlug: "gala" });
+    expect(checks.find((c) => c.item === "rounds.weightsSum")?.passed).toBe(false);
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.update, { orgSlug: "acme", eventSlug: "gala", roundId: (await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" }))[1]._id, weight: 40 });
+    const after = await t.withIdentity(aliceIdentity).query(api.events.readiness, { orgSlug: "acme", eventSlug: "gala" });
+    expect(after.find((c) => c.item === "rounds.weightsSum")?.passed).toBe(true);
+  });
+
+  it("bad advancement config fails readiness", async () => {
+    const t = setupTest();
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
+    await t.run(async (q) => {
+      const rounds = await q.db.query("rounds").collect();
+      await q.db.patch(rounds[0]._id, { advancement: { mode: "top_percent", percent: 150, allowOverride: true } });
+    });
+    const checks = await t.withIdentity(aliceIdentity).query(api.events.readiness, { orgSlug: "acme", eventSlug: "gala" });
+    expect(checks.find((c) => c.item === "rounds.advancement")?.passed).toBe(false);
+  });
+
+  it("reopen is blocked once a sheet is submitted", async () => {
+    const t = setupTest();
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+    await configureMinimalEvent(t);
+    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
+    await t.run(async (q) => {
+      const sheets = await q.db.query("scoreSheets").collect();
+      await q.db.patch(sheets[0]._id, { status: "submitted" });
+    });
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.reopen, { orgSlug: "acme", eventSlug: "gala" }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+  });
+
+  it("reopen is blocked once a round is closed", async () => {
+    const t = setupTest();
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+    await configureMinimalEvent(t);
+    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
+    await t.run(async (q) => {
+      const rounds = await q.db.query("rounds").collect();
+      await q.db.patch(rounds[0]._id, { status: "closed" });
+    });
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.reopen, { orgSlug: "acme", eventSlug: "gala" }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+  });
+});
diff --git a/convex-test/publishResults.test.ts b/convex-test/publishResults.test.ts
new file mode 100644
index 0000000..816b7bc
--- /dev/null
+++ b/convex-test/publishResults.test.ts
@@ -0,0 +1,144 @@
+import { describe, expect, it } from "vitest";
+import { api } from "../convex/_generated/api";
+import type { Id } from "../convex/_generated/dataModel";
+import { aliceIdentity, bobIdentity, carolIdentity, prepareScoredEvent, setupTest } from "./setup";
+
+async function submitJudgeScores(
+  t: ReturnType<typeof setupTest>,
+  identity: typeof bobIdentity | typeof carolIdentity,
+  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
+  perContestant: number[][],
+) {
+  const mine = await t.withIdentity(identity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
+  const sheets = [...mine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
+  for (const [i, sheet] of sheets.entries()) {
+    await t.withIdentity(identity).mutation(api.scoring.submitSheet, {
+      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId,
+      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
+    });
+  }
+}
+
+async function closeAndPublish(t: ReturnType<typeof setupTest>, roundId: Id<"rounds">) {
+  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId });
+  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId });
+}
+
+describe("publish, results, corrections, finalize", () => {
+  it("publish is blocked by unresolved ties, then succeeds after a manual break", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await submitJudgeScores(t, bobIdentity, ids, [[7, 7], [7, 7]]);
+    await submitJudgeScores(t, carolIdentity, ids, [[7, 7], [7, 7]]);
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
+    ).rejects.toMatchObject({ data: { code: "TIES_UNRESOLVED" } });
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+      tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
+    });
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    const result = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+    });
+    expect(result.version).toBe(1);
+    expect(result.reason).toBeUndefined();
+    const maria = result.snapshot.categories[0].standings.find(
+      (s: { contestantId: string }) => s.contestantId === ids.contestantIds[0],
+    )!;
+    expect(maria.rank).toBe(1);
+    expect(maria.roundScore).toBe(70);
+  });
+
+  it("private results are for score.manage holders only; organization visibility opens them up", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
+    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
+    await closeAndPublish(t, ids.roundId);
+    await expect(
+      t.withIdentity(bobIdentity).query(api.results.roundResults, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
+    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
+    const t2 = setupTest();
+    const ids2 = await prepareScoredEvent(t2, { resultVisibility: "organization" });
+    await submitJudgeScores(t2, bobIdentity, ids2, [[8, 6], [5, 5]]);
+    await submitJudgeScores(t2, carolIdentity, ids2, [[9, 7], [5, 5]]);
+    await closeAndPublish(t2, ids2.roundId);
+    const asJudge = await t2.withIdentity(bobIdentity).query(api.results.roundResults, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids2.roundId,
+    });
+    expect(asJudge.snapshot.categories[0].standings.length).toBe(2);
+  });
+
+  it("corrections create version 2; finalization locks the event", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
+    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
+    await closeAndPublish(t, ids.roundId);
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
+        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "  ",
+      }),
+    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "clerical verification",
+    });
+    const versions = await t.withIdentity(aliceIdentity).query(api.results.listRoundVersions, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+    });
+    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
+    const latest = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+    });
+    expect(latest.version).toBe(2);
+    expect(latest.reason).toBe("clerical verification");
+    await t.withIdentity(aliceIdentity).mutation(api.results.finalizeEvent, { orgSlug: "acme", eventSlug: "gala" });
+    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
+    expect(ev?.status).toBe("finalized");
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
+        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "too late",
+      }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.archive, { orgSlug: "acme", eventSlug: "gala" });
+  });
+
+  it("publish requires the round to be closed; scoring stops after publish", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
+    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
+    await closeAndPublish(t, ids.roundId);
+    const mine = await t.withIdentity(bobIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
+    expect(mine.rounds[0].status).toBe("published");
+  });
+
+  it("eventResults computes weighted final standings", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
+    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
+    await closeAndPublish(t, ids.roundId);
+    const results = await t.withIdentity(aliceIdentity).query(api.results.eventResults, {
+      orgSlug: "acme", eventSlug: "gala",
+    });
+    expect(results.rounds.length).toBe(1);
+    expect(results.rounds[0].weight).toBe(100);
+    expect(results.final.map((f: { contestantName: string }) => f.contestantName)).toEqual(["Maria", "Nina"]);
+    expect(results.final[0].totalScore).toBe(77);
+    expect(results.final[0].rank).toBe(1);
+  });
+
+  it("finalize requires every round published", async () => {
+    const t = setupTest();
+    await prepareScoredEvent(t);
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.results.finalizeEvent, { orgSlug: "acme", eventSlug: "gala" }),
+    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
+  });
+});
diff --git a/convex-test/reviewDecisions.test.ts b/convex-test/reviewDecisions.test.ts
new file mode 100644
index 0000000..5dab88e
--- /dev/null
+++ b/convex-test/reviewDecisions.test.ts
@@ -0,0 +1,154 @@
+import { describe, expect, it } from "vitest";
+import { api } from "../convex/_generated/api";
+import type { Id } from "../convex/_generated/dataModel";
+import { aliceIdentity, bobIdentity, carolIdentity, prepareScoredEvent, setupTest } from "./setup";
+
+async function submitJudgeScores(
+  t: ReturnType<typeof setupTest>,
+  identity: typeof bobIdentity | typeof carolIdentity,
+  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
+  perContestant: number[][],
+) {
+  const mine = await t.withIdentity(identity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
+  const sheets = [...mine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
+  for (const [i, sheet] of sheets.entries()) {
+    await t.withIdentity(identity).mutation(api.scoring.submitSheet, {
+      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId,
+      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
+    });
+  }
+}
+
+async function closeRound(t: ReturnType<typeof setupTest>, roundId: Id<"rounds">) {
+  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId });
+}
+
+describe("review & decisions", () => {
+  it("review refuses while the round is open, works when closed", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
+    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
+    await expect(
+      t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+    await closeRound(t, ids.roundId);
+    const review = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+    });
+    const maria = review.standings.find((s: { contestantName: string }) => s.contestantName === "Maria")!;
+    const nina = review.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")!;
+    expect(maria.rank).toBe(1);
+    expect(maria.roundScore).toBe(77);
+    expect(nina.rank).toBe(2);
+    expect(nina.roundScore).toBe(50);
+    expect(review.unresolvedTies).toEqual([]);
+  });
+
+  it("review requires score.manage", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await closeRound(t, ids.roundId);
+    await expect(
+      t.withIdentity(bobIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
+    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
+  });
+
+  it("identical scores surface an unresolved tie; a manual break resolves it", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await submitJudgeScores(t, bobIdentity, ids, [[7, 7], [7, 7]]);
+    await submitJudgeScores(t, carolIdentity, ids, [[7, 7], [7, 7]]);
+    await closeRound(t, ids.roundId);
+    const before = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    expect(before.unresolvedTies.length).toBe(1);
+    expect(before.unresolvedTies[0].names.sort()).toEqual(["Maria", "Nina"]);
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+      tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
+    });
+    const after = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    expect(after.unresolvedTies).toEqual([]);
+    expect(after.standings.find((s: { contestantName: string }) => s.contestantName === "Maria")?.rank).toBe(1);
+    expect(after.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.rank).toBe(2);
+    expect(after.tieBreaks.length).toBe(1);
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.removeTieBreak, {
+      orgSlug: "acme", eventSlug: "gala", tieBreakId: after.tieBreaks[0]._id,
+    });
+    const reverted = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    expect(reverted.unresolvedTies.length).toBe(1);
+  });
+
+  it("tie breaks validate the window and the permutation", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
+        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+        tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
+      }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+    await closeRound(t, ids.roundId);
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
+        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+        tiedContestantIds: ids.contestantIds, orderedIds: [ids.contestantIds[0]],
+      }),
+    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
+  });
+
+  it("advancement preview honors top_count and overrides", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t, {
+      qualifiesToNextRound: true,
+      advancement: { mode: "top_count", count: 1, allowOverride: true },
+    });
+    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
+    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
+    await closeRound(t, ids.roundId);
+    const review = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    expect(review.standings.find((s: { contestantName: string }) => s.contestantName === "Maria")?.advancement).toBe(true);
+    expect(review.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.advancement).toBe(false);
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+      contestantId: ids.contestantIds[1], action: "force_advance",
+    });
+    const overridden = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    expect(overridden.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.advancement).toBe(true);
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.removeAdvancementOverride, {
+      orgSlug: "acme", eventSlug: "gala", overrideId: overridden.overrides[0]._id,
+    });
+    const reverted = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    expect(reverted.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.advancement).toBe(false);
+  });
+
+  it("overrides are refused when not allowed or elimination is off", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t, {
+      qualifiesToNextRound: true,
+      advancement: { mode: "top_count", count: 1, allowOverride: false },
+    });
+    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
+    await closeRound(t, ids.roundId);
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
+        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+        contestantId: ids.contestantIds[0], action: "force_advance",
+      }),
+    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
+    const t2 = setupTest();
+    const ids2 = await prepareScoredEvent(t2, {
+      eliminationEnabled: false,
+      qualifiesToNextRound: true,
+      advancement: { mode: "top_count", count: 1, allowOverride: true },
+    });
+    await submitJudgeScores(t2, bobIdentity, ids2, [[8, 6], [5, 5]]);
+    await closeRound(t2, ids2.roundId);
+    await expect(
+      t2.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
+        orgSlug: "acme", eventSlug: "gala", roundId: ids2.roundId,
+        contestantId: ids2.contestantIds[0], action: "force_advance",
+      }),
+    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
+  });
+});
diff --git a/convex-test/roundLifecycle3.test.ts b/convex-test/roundLifecycle3.test.ts
new file mode 100644
index 0000000..1e44831
--- /dev/null
+++ b/convex-test/roundLifecycle3.test.ts
@@ -0,0 +1,86 @@
+import { describe, expect, it } from "vitest";
+import { api } from "../convex/_generated/api";
+import { aliceIdentity, bobIdentity, carolIdentity, createOrgAndEvent, prepareScoredEvent, setupTest } from "./setup";
+
+async function submitJudgeScores(
+  t: ReturnType<typeof setupTest>,
+  identity: typeof bobIdentity,
+  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
+  perContestant: number[][],
+) {
+  const mine = await t.withIdentity(identity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
+  const sheets = [...mine.rounds[0].sheets].sort(
+    (a, b) => a.contestantNumber - b.contestantNumber,
+  );
+  for (const [i, sheet] of sheets.entries()) {
+    await t.withIdentity(identity).mutation(api.scoring.submitSheet, {
+      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId,
+      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
+    });
+  }
+}
+
+describe("round lifecycle", () => {
+  it("monitor shows statuses without any score payload", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
+    const monitor = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundMonitor, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
+    });
+    expect(monitor.roundStatus).toBe("open");
+    expect(monitor.sheets.length).toBe(4);
+    expect(monitor.sheets.filter((s: { status: string }) => s.status === "submitted").length).toBe(2);
+    expect(JSON.stringify(monitor)).not.toContain("draftValues");
+    expect(JSON.stringify(monitor)).not.toContain("value");
+  });
+
+  it("closing blocks submits; reopening re-allows them", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    const carolMine = await t.withIdentity(carolIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
+    const sheet = carolMine.rounds[0].sheets[0];
+    const values = Object.fromEntries(ids.criterionIds.map((id) => [id, 7]));
+    await expect(
+      t.withIdentity(carolIdentity).mutation(api.scoring.submitSheet, {
+        orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId, values,
+      }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    await t.withIdentity(carolIdentity).mutation(api.scoring.submitSheet, {
+      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId, values,
+    });
+  });
+
+  it("only score.manage holders run the round lifecycle", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await expect(
+      t.withIdentity(bobIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
+    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
+    await expect(
+      t.mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
+    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
+    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme2", eventSlug: "gala2" });
+    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme2", eventSlug: "gala2", name: "R" });
+    const otherRounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme2", eventSlug: "gala2" });
+    await expect(
+      t.withIdentity(aliceIdentity).query(api.roundAdmin.roundMonitor, { orgSlug: "acme", eventSlug: "gala", roundId: otherRounds[0]._id }),
+    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
+  });
+
+  it("closing twice conflicts; reopening an open round conflicts", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+  });
+});
diff --git a/convex-test/scoringEntry.test.ts b/convex-test/scoringEntry.test.ts
new file mode 100644
index 0000000..50c52d8
--- /dev/null
+++ b/convex-test/scoringEntry.test.ts
@@ -0,0 +1,116 @@
+import { describe, expect, it } from "vitest";
+import { api } from "../convex/_generated/api";
+import { aliceIdentity, bobIdentity, carolIdentity, prepareScoredEvent, setupTest } from "./setup";
+
+async function bobSheets(t: ReturnType<typeof setupTest>) {
+  const mine = await t.withIdentity(bobIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
+  return mine.rounds[0].sheets;
+}
+
+describe("score entry", () => {
+  it("judge sees only their own sheets", async () => {
+    const t = setupTest();
+    await prepareScoredEvent(t);
+    const bobList = await bobSheets(t);
+    const carolMine = await t.withIdentity(carolIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
+    expect(bobList.length).toBe(2);
+    expect(carolMine.rounds[0].sheets.length).toBe(2);
+    expect(new Set([...bobList, ...carolMine.rounds[0].sheets].map((s) => s.sheetId)).size).toBe(4);
+  });
+
+  it("saves a draft and marks in_progress", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    const sheets = await bobSheets(t);
+    await t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
+      orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
+      draftValues: { [ids.criterionIds[0]]: 7 },
+    });
+    const detail = await t.withIdentity(bobIdentity).query(api.scoring.sheetDetail, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, contestantId: sheets[0].contestantId,
+    });
+    expect(detail.sheet?.status).toBe("in_progress");
+    expect(detail.sheet?.draftValues?.[ids.criterionIds[0]]).toBe(7);
+  });
+
+  it("rejects out-of-range drafts", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    const sheets = await bobSheets(t);
+    await expect(
+      t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
+        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
+        draftValues: { [ids.criterionIds[0]]: 11 },
+      }),
+    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
+  });
+
+  it("submits a complete sheet immutably", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    const sheets = await bobSheets(t);
+    await t.withIdentity(bobIdentity).mutation(api.scoring.submitSheet, {
+      orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
+      values: { [ids.criterionIds[0]]: 8, [ids.criterionIds[1]]: 6 },
+    });
+    const detail = await t.withIdentity(bobIdentity).query(api.scoring.sheetDetail, {
+      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, contestantId: sheets[0].contestantId,
+    });
+    expect(detail.sheet?.status).toBe("submitted");
+    expect(detail.sheet?.draftValues).toBeUndefined();
+    const scoreRows = await t.run(async (q) =>
+      (await q.db.query("scores").withIndex("by_sheet_id", (sq) => sq.eq("sheetId", sheets[0].sheetId)).collect()).length,
+    );
+    expect(scoreRows).toBe(2);
+    await expect(
+      t.withIdentity(bobIdentity).mutation(api.scoring.submitSheet, {
+        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
+        values: { [ids.criterionIds[0]]: 1, [ids.criterionIds[1]]: 1 },
+      }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+    await expect(
+      t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
+        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId, draftValues: {},
+      }),
+    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
+  });
+
+  it("incomplete submit is rejected", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    const sheets = await bobSheets(t);
+    await expect(
+      t.withIdentity(bobIdentity).mutation(api.scoring.submitSheet, {
+        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
+        values: { [ids.criterionIds[0]]: 8 },
+      }),
+    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
+  });
+
+  it("judges cannot touch each other's sheets", async () => {
+    const t = setupTest();
+    const ids = await prepareScoredEvent(t);
+    const carolMine = await t.withIdentity(carolIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
+    const carolSheet = carolMine.rounds[0].sheets[0].sheetId;
+    await expect(
+      t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
+        orgSlug: "acme", eventSlug: "gala", sheetId: carolSheet,
+        draftValues: { [ids.criterionIds[0]]: 5 },
+      }),
+    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
+  });
+
+  it("non-judges and unauthenticated are refused", async () => {
+    const t = setupTest();
+    await prepareScoredEvent(t);
+    const sheets = await bobSheets(t);
+    await expect(
+      t.withIdentity(aliceIdentity).mutation(api.scoring.saveDraft, {
+        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId, draftValues: {},
+      }),
+    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
+    await expect(
+      t.mutation(api.scoring.saveDraft, { orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId, draftValues: {} }),
+    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
+  });
+});
diff --git a/convex-test/setup.ts b/convex-test/setup.ts
index 7b7bf77..021d51c 100644
--- a/convex-test/setup.ts
+++ b/convex-test/setup.ts
@@ -1,14 +1,15 @@
 /// <reference types="vite/client" />
 import { convexTest } from "convex-test";
 import type { UserIdentity } from "convex/server";
 import { api } from "../convex/_generated/api";
+import type { Id } from "../convex/_generated/dataModel";
 import schema from "../convex/schema";
 
 const testModules = import.meta.glob("../convex/**/*.ts");
 
 export function setupTest() {
   return convexTest(schema, testModules);
 }
 
 export async function seedAndProvision(
   t: ReturnType<typeof setupTest>,
@@ -29,26 +30,106 @@ export const aliceIdentity = {
 
 export const bobIdentity = {
   tokenIdentifier: "bob-token",
   subject: "bob-subject",
   name: "Bob",
   email: "bob@example.com",
   pictureUrl: "https://example.com/b.png",
   issuer: "https://tabulation.example.com",
 } as const;
 
+export const carolIdentity = {
+  tokenIdentifier: "carol-token",
+  subject: "carol-subject",
+  name: "Carol",
+  email: "carol@example.com",
+  pictureUrl: "https://example.com/c.png",
+  issuer: "https://tabulation.example.com",
+} as const;
+
 export async function createOrgAndEvent(
   t: ReturnType<typeof setupTest>,
   identity: Partial<UserIdentity>,
   opts: { orgSlug: string; eventSlug: string; eventName?: string },
 ): Promise<void> {
   await seedAndProvision(t, identity);
   await t.withIdentity(identity).mutation(api.organizations.create, {
     name: opts.orgSlug,
     slug: opts.orgSlug,
   });
   await t.withIdentity(identity).mutation(api.events.create, {
     orgSlug: opts.orgSlug,
     name: opts.eventName ?? opts.eventSlug,
     slug: opts.eventSlug,
   });
 }
+
+type ScoredEventOpts = {
+  advancement?: { mode: "none" | "top_count" | "top_percent" | "manual"; count?: number; percent?: number; allowOverride: boolean };
+  qualifiesToNextRound?: boolean;
+  dropHighLow?: boolean;
+  eliminationEnabled?: boolean;
+  resultVisibility?: "private" | "organization" | "public";
+};
+
+export async function prepareScoredEvent(
+  t: ReturnType<typeof setupTest>,
+  opts: ScoredEventOpts = {},
+): Promise<{
+  roundId: Id<"rounds">;
+  criterionIds: Id<"criteria">[];
+  contestantIds: Id<"contestants">[];
+  judgeIds: { bob: Id<"judges">; carol: Id<"judges"> };
+}> {
+  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
+  await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
+  await t.withIdentity(carolIdentity).mutation(api.auth.ensureUserProfile, {});
+  const eventPatch: Record<string, unknown> = {};
+  if (opts.dropHighLow !== undefined) eventPatch.scoringRules = { dropHighLow: opts.dropHighLow };
+  if (opts.eliminationEnabled !== undefined) eventPatch.eliminationEnabled = opts.eliminationEnabled;
+  if (opts.resultVisibility !== undefined) eventPatch.resultVisibility = opts.resultVisibility;
+  if (Object.keys(eventPatch).length > 0) {
+    await t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "gala", ...eventPatch });
+  }
+  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
+    orgSlug: "acme", eventSlug: "gala", name: "R",
+    qualifiesToNextRound: opts.qualifiesToNextRound,
+    advancement: opts.advancement,
+  });
+  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
+  const roundId = rounds[0]._id;
+  for (const [name, weight] of [["A", 60], ["B", 40]] as const) {
+    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
+      orgSlug: "acme", eventSlug: "gala", roundId, name, weight, minScore: 0, maxScore: 10, decimalPrecision: 0,
+    });
+  }
+  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
+  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Nina", number: 2 });
+  for (const identity of [bobIdentity, carolIdentity]) {
+    await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: identity.email, roleName: "Judge" });
+    const pending = await t.withIdentity(identity).query(api.invitations.listForUser, {});
+    await t.withIdentity(identity).mutation(api.invitations.accept, { token: pending[0].token });
+  }
+  const members = await t.withIdentity(aliceIdentity).query(api.members.list, { orgSlug: "acme" });
+  const bobId = members.find((m: { email: string }) => m.email === "bob@example.com")!.userId;
+  const carolId = members.find((m: { email: string }) => m.email === "carol@example.com")!.userId;
+  for (const userId of [bobId, carolId]) {
+    await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId });
+  }
+  const judges = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "gala" });
+  for (const judge of judges) {
+    await t.withIdentity(aliceIdentity).mutation(api.judges.addAssignment, { orgSlug: "acme", eventSlug: "gala", judgeId: judge._id });
+  }
+  await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
+  const after = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
+  const contestants = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
+  const orderedContestants = [...contestants].sort((a, b) => a.number - b.number);
+  return {
+    roundId,
+    criterionIds: after[0].criteria.map((c) => c._id as Id<"criteria">),
+    contestantIds: orderedContestants.map((k) => k._id as Id<"contestants">),
+    judgeIds: {
+      bob: judges.find((j: { userId: string }) => j.userId === bobId)!._id,
+      carol: judges.find((j: { userId: string }) => j.userId === carolId)!._id,
+    },
+  };
+}
diff --git a/convex-test/tabulationCore.test.ts b/convex-test/tabulationCore.test.ts
new file mode 100644
index 0000000..86d3867
--- /dev/null
+++ b/convex-test/tabulationCore.test.ts
@@ -0,0 +1,293 @@
+import { describe, expect, it } from "vitest";
+import type { Id } from "../convex/_generated/dataModel";
+import {
+  aggregateJudgeValues, computeContestantCriteria, computeRoundScore, roundToPrecision,
+} from "../convex/lib/tabulation";
+import { computeRoundStandings, type RoundComputeInput } from "../convex/lib/tabulation";
+
+const j = (s: string) => s as Id<"judges">;
+const c = (s: string) => s as Id<"criteria">;
+const p = (s: string) => s as Id<"contestants">;
+
+describe("aggregation", () => {
+  it("averages all judges when dropping is on but only 2 judges", () => {
+    const r = aggregateJudgeValues([{ judgeId: j("j1"), value: 1 }, { judgeId: j("j2"), value: 3 }], true);
+    expect(r.avg).toBe(2);
+    expect(r.dropped).toEqual([]);
+  });
+
+  it("drops one high and one low at 3 judges", () => {
+    const r = aggregateJudgeValues(
+      [{ judgeId: j("j1"), value: 5 }, { judgeId: j("j2"), value: 9 }, { judgeId: j("j3"), value: 7 }],
+      true,
+    );
+    expect(r.avg).toBe(7);
+    expect(r.dropped.map((d) => d.value).sort()).toEqual([5, 9]);
+  });
+
+  it("drops exactly one high and one low beyond 3 judges", () => {
+    const r = aggregateJudgeValues(
+      [{ judgeId: j("j1"), value: 1 }, { judgeId: j("j2"), value: 2 }, { judgeId: j("j3"), value: 8 }, { judgeId: j("j4"), value: 9 }],
+      true,
+    );
+    expect(r.avg).toBe(5);
+    expect(r.dropped.length).toBe(2);
+  });
+
+  it("no drop when disabled", () => {
+    const r = aggregateJudgeValues(
+      [{ judgeId: j("j1"), value: 5 }, { judgeId: j("j2"), value: 9 }, { judgeId: j("j3"), value: 7 }],
+      false,
+    );
+    expect(r.avg).toBeCloseTo(7, 10);
+    expect(r.dropped).toEqual([]);
+  });
+});
+
+describe("weighting", () => {
+  it("weights and normalizes across different max scores", () => {
+    const criteria = [
+      { id: c("cr1"), weight: 60, minScore: 0, maxScore: 10 },
+      { id: c("cr2"), weight: 40, minScore: 0, maxScore: 20 },
+    ];
+    const scores = [
+      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 8 },
+      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: 15 },
+    ];
+    const results = computeContestantCriteria(p("k1"), criteria, scores, false, 2);
+    expect(computeRoundScore(results)).toBeCloseTo(48 + 30, 6);
+    expect(results[0].avgRaw).toBe(8);
+    expect(results[1].avgRaw).toBe(15);
+  });
+
+  it("judge participation is per criterion", () => {
+    const criteria = [{ id: c("cr1"), weight: 100, minScore: 0, maxScore: 10 }];
+    const scores = [
+      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 4 },
+      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr1"), value: 8 },
+    ];
+    const results = computeContestantCriteria(p("k1"), criteria, scores, true, 0);
+    expect(results[0].avgRaw).toBe(6);
+    expect(results[0].dropped).toEqual([]);
+  });
+
+  it("roundToPrecision rounds half up", () => {
+    expect(roundToPrecision(7.335, 2)).toBe(7.34);
+    expect(roundToPrecision(7.5, 0)).toBe(8);
+  });
+});
+
+const cat = (s: string) => s as Id<"categories">;
+
+function fixture(marks: { k1: [number, number]; k2: [number, number] }): RoundComputeInput {
+  return {
+    winner: "highest" as const,
+    dropHighLow: false,
+    decimalPrecision: 2,
+    criteria: [
+      { id: c("cr1"), weight: 60, minScore: 0, maxScore: 10 },
+      { id: c("cr2"), weight: 40, minScore: 0, maxScore: 10 },
+    ],
+    contestants: [
+      { id: p("k1"), categoryId: cat("A"), status: "active" as const },
+      { id: p("k2"), categoryId: cat("A"), status: "active" as const },
+    ],
+    scores: [
+      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: marks.k1[0] },
+      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: marks.k1[1] },
+      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr1"), value: marks.k2[0] },
+      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr2"), value: marks.k2[1] },
+    ],
+    manualTieBreaks: [],
+  };
+}
+
+describe("ranking & ties", () => {
+  it("ranks by weighted score, highest first", () => {
+    const { standings, unresolvedTies } = computeRoundStandings(fixture({ k1: [9, 9], k2: [5, 5] }));
+    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
+    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(2);
+    expect(unresolvedTies).toEqual([]);
+    expect(standings.find((s) => s.contestantId === p("k1"))?.tieResolvedBy).toBe("none");
+  });
+
+  it("lowest-wins inverts ranking", () => {
+    const { standings } = computeRoundStandings({ ...fixture({ k1: [9, 9], k2: [5, 5] }), winner: "lowest" });
+    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(1);
+    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(2);
+  });
+
+  it("resolves equal totals via criteria cascade (higher weight first)", () => {
+    const { standings, unresolvedTies } = computeRoundStandings(fixture({ k1: [10, 5], k2: [8, 8] }));
+    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
+    expect(standings.find((s) => s.contestantId === p("k1"))?.tieResolvedBy).toBe("criteria_cascade");
+    expect(unresolvedTies).toEqual([]);
+  });
+
+  it("flags fully tied contestants as unresolved without a manual break", () => {
+    const { standings, unresolvedTies } = computeRoundStandings(fixture({ k1: [8, 8], k2: [8, 8] }));
+    expect(unresolvedTies.length).toBe(1);
+    expect([...unresolvedTies[0].contestantIds].sort()).toEqual([p("k1"), p("k2")].sort());
+    expect(standings.every((s) => s.rank === 1)).toBe(true);
+  });
+
+  it("judge firsts resolve ties before manual breaks", () => {
+    const input = fixture({ k1: [0, 0], k2: [0, 0] });
+    input.scores = [
+      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
+      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: 0 },
+      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr1"), value: 5 },
+      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr2"), value: 0 },
+      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr1"), value: 10 },
+      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr2"), value: 0 },
+      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr1"), value: 5 },
+      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr2"), value: 0 },
+      { judgeId: j("j3"), contestantId: p("k1"), criterionId: c("cr1"), value: 0 },
+      { judgeId: j("j3"), contestantId: p("k1"), criterionId: c("cr2"), value: 0 },
+      { judgeId: j("j3"), contestantId: p("k2"), criterionId: c("cr1"), value: 10 },
+      { judgeId: j("j3"), contestantId: p("k2"), criterionId: c("cr2"), value: 0 },
+    ];
+    const { standings, unresolvedTies } = computeRoundStandings(input);
+    expect(unresolvedTies).toEqual([]);
+    const k1 = standings.find((s) => s.contestantId === p("k1"))!;
+    expect(k1.rank).toBe(1);
+    expect(k1.tieResolvedBy).toBe("judge_firsts");
+  });
+
+  it("manual tie breaks resolve identical totals", () => {
+    const input = fixture({ k1: [8, 8], k2: [8, 8] });
+    input.manualTieBreaks = [{ tiedContestantIds: [p("k1"), p("k2")], orderedIds: [p("k2"), p("k1")] }];
+    const { standings, unresolvedTies } = computeRoundStandings(input);
+    expect(unresolvedTies).toEqual([]);
+    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(1);
+    expect(standings.find((s) => s.contestantId === p("k2"))?.tieResolvedBy).toBe("manual");
+    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(2);
+  });
+
+  it("excludes scratched and disqualified from ranking", () => {
+    const input = fixture({ k1: [9, 9], k2: [5, 5] });
+    input.contestants = [
+      { id: p("k1"), categoryId: cat("A"), status: "active" },
+      { id: p("k2"), categoryId: cat("A"), status: "disqualified" },
+    ];
+    const { standings } = computeRoundStandings(input);
+    const k2 = standings.find((s) => s.contestantId === p("k2"))!;
+    expect(k2.rank).toBeNull();
+    expect(k2.roundScore).toBeNull();
+    expect(k2.criterionScores).toEqual([]);
+    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
+  });
+
+  it("deterministic across repeated runs", () => {
+    const input = fixture({ k1: [8, 8], k2: [8, 8] });
+    input.manualTieBreaks = [{ tiedContestantIds: [p("k1"), p("k2")], orderedIds: [p("k2"), p("k1")] }];
+    const a = computeRoundStandings(input);
+    const b = computeRoundStandings(input);
+    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
+  });
+});
+
+import { applyAdvancement, computeEventFinal, type StandingRow } from "../convex/lib/tabulation";
+
+const rd = (s: string) => s as Id<"rounds">;
+
+function standingRow(id: string, rank: number | null, categoryId = "A"): StandingRow {
+  return {
+    contestantId: p(id),
+    categoryId: cat(categoryId),
+    status: "active",
+    roundScore: rank === null ? null : 100 - rank,
+    criterionScores: [],
+    rank,
+    tieResolvedBy: "none",
+  };
+}
+
+describe("advancement", () => {
+  const standings = [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 3), standingRow("k4", 4)];
+
+  it("disabled advancement returns all null", () => {
+    const m = applyAdvancement(standings, { enabled: false, mode: "top_count", count: 2, percent: null, allowOverride: true }, []);
+    expect([...m.values()].every((v) => v === null)).toBe(true);
+  });
+
+  it("top_count advances first N ranked", () => {
+    const m = applyAdvancement(standings, { enabled: true, mode: "top_count", count: 2, percent: null, allowOverride: true }, []);
+    expect(m.get(p("k1"))).toBe(true);
+    expect(m.get(p("k2"))).toBe(true);
+    expect(m.get(p("k3"))).toBe(false);
+    expect(m.get(p("k4"))).toBe(false);
+  });
+
+  it("top_percent uses ceiling", () => {
+    const m = applyAdvancement(
+      [...standings, standingRow("k5", 5), standingRow("k6", 6)],
+      { enabled: true, mode: "top_percent", count: null, percent: 50, allowOverride: true },
+      [],
+    );
+    expect(m.get(p("k3"))).toBe(true);
+    expect(m.get(p("k4"))).toBe(false);
+  });
+
+  it("manual mode advances nobody automatically", () => {
+    const m = applyAdvancement(standings, { enabled: true, mode: "manual", count: null, percent: null, allowOverride: true }, []);
+    expect(m.get(p("k1"))).toBe(false);
+    expect(m.get(p("k4"))).toBe(false);
+  });
+
+  it("overrides force through the computed cut", () => {
+    const m = applyAdvancement(
+      standings,
+      { enabled: true, mode: "top_count", count: 2, percent: null, allowOverride: true },
+      [{ contestantId: p("k4"), action: "force_advance" }, { contestantId: p("k1"), action: "force_cut" }],
+    );
+    expect(m.get(p("k4"))).toBe(true);
+    expect(m.get(p("k1"))).toBe(false);
+  });
+});
+
+describe("event final", () => {
+  it("combines round scores by weight and ranks survivors first", () => {
+    const rounds = [
+      {
+        roundId: rd("rd1"), order: 0, weight: 40,
+        standings: [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 3)],
+        advancement: { [p("k1")]: true, [p("k2")]: true, [p("k3")]: false },
+      },
+      {
+        roundId: rd("rd2"), order: 1, weight: 60,
+        standings: [standingRow("k1", 2), standingRow("k2", 1)],
+        advancement: { [p("k1")]: null, [p("k2")]: null },
+      },
+    ];
+    const final = computeEventFinal(rounds, 2);
+    const k1 = final.find((f) => f.contestantId === p("k1"))!;
+    const k3 = final.find((f) => f.contestantId === p("k3"))!;
+    expect(k1.totalScore).toBeCloseTo((99 * 40 + 98 * 60) / 100, 6);
+    expect(k1.eliminatedInRoundOrder).toBeNull();
+    expect(k3.eliminatedInRoundOrder).toBe(0);
+    expect(k1.rank).toBeLessThan(k3.rank);
+  });
+
+  it("eliminated contestants rank by later elimination then score", () => {
+    const rounds = [{
+      roundId: rd("rd1"), order: 0, weight: 100,
+      standings: [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 3)],
+      advancement: { [p("k1")]: true, [p("k2")]: false, [p("k3")]: false },
+    }];
+    const final = computeEventFinal(rounds, 2);
+    expect(final.map((f) => f.contestantId)).toEqual([p("k1"), p("k2"), p("k3")]);
+  });
+
+  it("non-elimination events rank purely by weighted total", () => {
+    const rounds = [{
+      roundId: rd("rd1"), order: 0, weight: 100,
+      standings: [standingRow("k1", 1), standingRow("k2", 2)],
+      advancement: {},
+    }];
+    const final = computeEventFinal(rounds, 2);
+    expect(final[0].rank).toBe(1);
+    expect(final[0].contestantId).toBe(p("k1"));
+    expect(final.every((f) => f.eliminatedInRoundOrder === null)).toBe(true);
+  });
+});
diff --git a/convex/_generated/api.d.ts b/convex/_generated/api.d.ts
index 6b05bf4..adc5a85 100644
--- a/convex/_generated/api.d.ts
+++ b/convex/_generated/api.d.ts
@@ -18,28 +18,33 @@ import type * as events from "../events.js";
 import type * as http from "../http.js";
 import type * as invitations from "../invitations.js";
 import type * as judges from "../judges.js";
 import type * as lib_audit from "../lib/audit.js";
 import type * as lib_auth from "../lib/auth.js";
 import type * as lib_authz from "../lib/authz.js";
 import type * as lib_constants from "../lib/constants.js";
 import type * as lib_entitlements from "../lib/entitlements.js";
 import type * as lib_errors from "../lib/errors.js";
 import type * as lib_eventAuthz from "../lib/eventAuthz.js";
+import type * as lib_roundCompute from "../lib/roundCompute.js";
 import type * as lib_serializers from "../lib/serializers.js";
+import type * as lib_tabulation from "../lib/tabulation.js";
 import type * as lib_usage from "../lib/usage.js";
 import type * as members from "../members.js";
 import type * as organizations from "../organizations.js";
 import type * as plans from "../plans.js";
 import type * as platform from "../platform.js";
+import type * as results from "../results.js";
 import type * as roles from "../roles.js";
+import type * as roundAdmin from "../roundAdmin.js";
 import type * as rounds from "../rounds.js";
+import type * as scoring from "../scoring.js";
 import type * as seed from "../seed.js";
 import type * as subscriptions from "../subscriptions.js";
 import type * as templates from "../templates.js";
 
 import type {
   ApiFromModules,
   FilterApi,
   FunctionReference,
 } from "convex/server";
 
@@ -54,28 +59,33 @@ declare const fullApi: ApiFromModules<{
   http: typeof http;
   invitations: typeof invitations;
   judges: typeof judges;
   "lib/audit": typeof lib_audit;
   "lib/auth": typeof lib_auth;
   "lib/authz": typeof lib_authz;
   "lib/constants": typeof lib_constants;
   "lib/entitlements": typeof lib_entitlements;
   "lib/errors": typeof lib_errors;
   "lib/eventAuthz": typeof lib_eventAuthz;
+  "lib/roundCompute": typeof lib_roundCompute;
   "lib/serializers": typeof lib_serializers;
+  "lib/tabulation": typeof lib_tabulation;
   "lib/usage": typeof lib_usage;
   members: typeof members;
   organizations: typeof organizations;
   plans: typeof plans;
   platform: typeof platform;
+  results: typeof results;
   roles: typeof roles;
+  roundAdmin: typeof roundAdmin;
   rounds: typeof rounds;
+  scoring: typeof scoring;
   seed: typeof seed;
   subscriptions: typeof subscriptions;
   templates: typeof templates;
 }>;
 
 /**
  * A utility for referencing Convex functions in your app's public API.
  *
  * Usage:
  * ```js
diff --git a/convex/eventLifecycle.ts b/convex/eventLifecycle.ts
index 569401c..9b4bc1f 100644
--- a/convex/eventLifecycle.ts
+++ b/convex/eventLifecycle.ts
@@ -42,39 +42,49 @@ export const publish = mutation({
   },
 });
 
 export const reopen = mutation({
   args: { orgSlug: v.string(), eventSlug: v.string() },
   handler: async (ctx, args) => {
     const eactx = await requireEventPermission(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.publish" });
     if (eactx.event.status !== "ready") {
       throw appError(ErrorCode.CONFLICT, "Only ready events can be reopened");
     }
+    const rounds = await ctx.db
+      .query("rounds")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    if (rounds.some((r) => r.status !== "open")) {
+      throw appError(ErrorCode.CONFLICT, "Round scoring has started");
+    }
     const sheets = await ctx.db
       .query("scoreSheets")
       .withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", eactx.event._id))
       .collect();
+    if (sheets.some((s) => s.status === "submitted" || s.status === "locked")) {
+      throw appError(ErrorCode.CONFLICT, "Scores have been submitted");
+    }
     for (const s of sheets) await ctx.db.delete(s._id);
     await ctx.db.patch(eactx.event._id, { status: "draft" });
     await writeAudit(ctx, {
       orgId: eactx.org._id, actorId: eactx.user._id, action: "event.reopened",
       resourceType: "event", resourceId: eactx.event._id,
       before: { status: "ready" }, after: { status: "draft", scoreSheetsDeleted: sheets.length },
     });
   },
 });
 
 export const archive = mutation({
   args: { orgSlug: v.string(), eventSlug: v.string() },
   handler: async (ctx, args) => {
     const eactx = await requireEventPermission(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.archive" });
-    if (eactx.event.status !== "ready") {
-      throw appError(ErrorCode.CONFLICT, "Only ready events can be archived");
+    if (eactx.event.status !== "ready" && eactx.event.status !== "finalized") {
+      throw appError(ErrorCode.CONFLICT, "Only ready or finalized events can be archived");
     }
     await ctx.db.patch(eactx.event._id, { status: "archived" });
     await writeAudit(ctx, {
       orgId: eactx.org._id, actorId: eactx.user._id, action: "event.archived",
       resourceType: "event", resourceId: eactx.event._id,
-      before: { status: "ready" }, after: { status: "archived" },
+      before: { status: eactx.event.status }, after: { status: "archived" },
     });
   },
 });
diff --git a/convex/events.ts b/convex/events.ts
index f3a9a62..b77dca0 100644
--- a/convex/events.ts
+++ b/convex/events.ts
@@ -6,40 +6,48 @@ import { appError, ErrorCode } from "./lib/errors";
 import { requireOrgMember, requirePermission } from "./lib/authz";
 import { requireEventMember, requireDraftEvent } from "./lib/eventAuthz";
 import { writeAudit } from "./lib/audit";
 import { requireLimit } from "./lib/entitlements";
 import { incrementUsage } from "./lib/usage";
 
 function slugify(name: string): string {
   return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
 }
 
+function defaultRoundWeight(index: number, total: number): number {
+  if (total === 1) return 100;
+  const base = Math.floor(100 / total);
+  return index === total - 1 ? 100 - base * (total - 1) : base;
+}
+
 export const create = mutation({
   args: { orgSlug: v.string(), name: v.string(), slug: v.optional(v.string()) },
   handler: async (ctx, args): Promise<string> => {
     const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "event.create" });
     const slug = slugify(args.slug ?? args.name);
     if (!slug) throw appError(ErrorCode.VALIDATION_ERROR, "Event name must contain letters or digits");
     const existing = await ctx.db
       .query("events")
       .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", actx.org._id).eq("slug", slug))
       .unique();
     if (existing) throw appError(ErrorCode.CONFLICT, "Event slug already taken", { slug });
     await requireLimit(ctx, actx.subscription, "events");
     const eventId = await ctx.db.insert("events", {
       orgId: actx.org._id,
       slug,
       name: args.name.trim(),
       description: "",
       status: "draft",
       decimalPrecision: 2,
       resultVisibility: "private",
+      scoringRules: { dropHighLow: false },
+      eliminationEnabled: true,
       branding: {},
       createdById: actx.user._id,
     });
     await ctx.db.insert("categories", { eventId, name: "Open", order: 0 });
     await incrementUsage(ctx, actx.org._id, "events", 1);
     await writeAudit(ctx, {
       orgId: actx.org._id, actorId: actx.user._id, action: "event.created",
       resourceType: "event", resourceId: eventId, after: { slug, name: args.name },
     });
     return slug;
@@ -75,42 +83,46 @@ export const update = mutation({
     orgSlug: v.string(),
     eventSlug: v.string(),
     name: v.optional(v.string()),
     description: v.optional(v.string()),
     startDate: v.optional(v.number()),
     endDate: v.optional(v.number()),
     venue: v.optional(v.string()),
     timezone: v.optional(v.string()),
     decimalPrecision: v.optional(v.number()),
     resultVisibility: v.optional(v.union(v.literal("private"), v.literal("organization"), v.literal("public"))),
+    scoringRules: v.optional(v.object({ dropHighLow: v.boolean() })),
+    eliminationEnabled: v.optional(v.boolean()),
   },
   handler: async (ctx, args) => {
     const eactx = await requireDraftEvent(ctx, {
       orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update",
     });
     if (args.name !== undefined && !args.name.trim()) {
       throw appError(ErrorCode.VALIDATION_ERROR, "name must not be empty");
     }
-    const patch: Record<string, string | number> = {};
+    const patch: Record<string, unknown> = {};
     if (args.name !== undefined) patch.name = args.name.trim();
     if (args.description !== undefined) patch.description = args.description;
     if (args.startDate !== undefined) patch.startDate = args.startDate;
     if (args.endDate !== undefined) patch.endDate = args.endDate;
     if (args.venue !== undefined) patch.venue = args.venue;
     if (args.timezone !== undefined) patch.timezone = args.timezone;
     if (args.decimalPrecision !== undefined) {
       if (!Number.isInteger(args.decimalPrecision) || args.decimalPrecision < 0 || args.decimalPrecision > 4) {
         throw appError(ErrorCode.VALIDATION_ERROR, "decimalPrecision must be an integer 0-4");
       }
       patch.decimalPrecision = args.decimalPrecision;
     }
     if (args.resultVisibility !== undefined) patch.resultVisibility = args.resultVisibility;
+    if (args.scoringRules !== undefined) patch.scoringRules = args.scoringRules;
+    if (args.eliminationEnabled !== undefined) patch.eliminationEnabled = args.eliminationEnabled;
     if (Object.keys(patch).length === 0) return;
     await ctx.db.patch(eactx.event._id, patch);
     await writeAudit(ctx, {
       orgId: eactx.org._id, actorId: eactx.user._id, action: "event.updated",
       resourceType: "event", resourceId: eactx.event._id,
       before: { name: eactx.event.name }, after: { name: patch.name ?? eactx.event.name },
     });
   },
 });
 
@@ -129,31 +141,39 @@ export async function computeReadiness(
   const criteriaPerRound = await Promise.all(
     rounds.map((r) => ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", r._id)).collect()),
   );
 
   const emptyRounds = rounds.filter((_, i) => criteriaPerRound[i].length === 0);
   const badSums = rounds.filter((_, i) => {
     const total = criteriaPerRound[i].reduce((sum, c) => sum + c.weight, 0);
     return total !== 100;
   });
   const badRanges = criteriaPerRound.flat().filter((c) => !(c.minScore < c.maxScore));
+  const weightSum = rounds.reduce((s, r) => s + r.weight, 0);
+  const badAdvancement = rounds.filter(
+    (r) =>
+      (r.advancement.mode === "top_count" && !(Number.isInteger(r.advancement.count) && (r.advancement.count ?? 0) >= 1)) ||
+      (r.advancement.mode === "top_percent" && !((r.advancement.percent ?? 0) >= 1 && (r.advancement.percent ?? 0) <= 100)),
+  );
   const activeContestants = contestants.filter((c) => c.status === "active");
   const judgesWithAssignments = judges.filter((j) => assignments.some((a) => a.judgeId === j._id));
 
   return [
     { item: "rounds.exist", passed: rounds.length >= 1, detail: `${rounds.length} round(s)` },
     { item: "rounds.criteria", passed: emptyRounds.length === 0, detail: emptyRounds.length === 0 ? "all rounds have criteria" : `${emptyRounds.length} round(s) without criteria` },
     { item: "rounds.weights", passed: badSums.length === 0, detail: badSums.length === 0 ? "all weights sum to 100" : `${badSums.length} round(s) with weights not summing to 100` },
     { item: "criteria.ranges", passed: badRanges.length === 0, detail: badRanges.length === 0 ? "all ranges valid" : `${badRanges.length} criterion/criteria with invalid ranges` },
     { item: "categories.exist", passed: categories.length >= 1, detail: `${categories.length} categor(y/ies)` },
     { item: "contestants.exist", passed: activeContestants.length >= 1, detail: `${activeContestants.length} active contestant(s)` },
     { item: "judges.exist", passed: judgesWithAssignments.length >= 1, detail: `${judgesWithAssignments.length} judge(s) with assignments` },
+    { item: "rounds.weightsSum", passed: weightSum === 100, detail: weightSum === 100 ? "round weights sum to 100" : `round weights sum to ${weightSum}, expected 100` },
+    { item: "rounds.advancement", passed: badAdvancement.length === 0, detail: badAdvancement.length === 0 ? "advancement rules valid" : `${badAdvancement.length} round(s) with invalid advancement config` },
   ];
 }
 
 export const readiness = query({
   args: { orgSlug: v.string(), eventSlug: v.string() },
   handler: async (ctx, args): Promise<ReadinessCheck[]> => {
     const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
     return computeReadiness(ctx, eactx.event._id);
   },
 });
@@ -176,38 +196,43 @@ export const createFromTemplate = mutation({
     if (existing) throw appError(ErrorCode.CONFLICT, "Event slug already taken", { slug });
     const snap = tpl.configSnapshot;
     const eventId = await ctx.db.insert("events", {
       orgId: actx.org._id,
       slug,
       name: args.name.trim(),
       description: "",
       status: "draft",
       decimalPrecision: snap.decimalPrecision,
       resultVisibility: snap.resultVisibility,
+      scoringRules: snap.scoringRules ?? { dropHighLow: false },
+      eliminationEnabled: snap.eliminationEnabled ?? true,
       branding: {},
       templateId: tpl._id,
       createdById: actx.user._id,
     });
     if (snap.categories && snap.categories.length > 0) {
       for (const c of snap.categories) {
         await ctx.db.insert("categories", { eventId, name: c.name, order: c.order });
       }
     } else {
       await ctx.db.insert("categories", { eventId, name: "Open", order: 0 });
     }
-    for (const r of snap.rounds) {
+    for (const [i, r] of snap.rounds.entries()) {
       const roundId = await ctx.db.insert("rounds", {
         eventId,
         name: r.name,
         order: r.order,
         qualifiesToNextRound: r.qualifiesToNextRound,
         scoringRules: r.scoringRules,
+        weight: r.weight ?? defaultRoundWeight(i, snap.rounds.length),
+        status: "open",
+        advancement: r.advancement ?? { mode: "none", allowOverride: true },
       });
       for (const c of r.criteria) {
         await ctx.db.insert("criteria", {
           roundId,
           name: c.name,
           order: c.order,
           weight: c.weight,
           minScore: c.minScore,
           maxScore: c.maxScore,
           decimalPrecision: c.decimalPrecision,
diff --git a/convex/lib/constants.ts b/convex/lib/constants.ts
index 5609804..70a56b7 100644
--- a/convex/lib/constants.ts
+++ b/convex/lib/constants.ts
@@ -19,30 +19,33 @@ export const SYSTEM_PERMISSIONS = [
   { name: "subscription.view", category: "subscription", description: "View subscription" },
   { name: "subscription.manage", category: "subscription", description: "Change subscription plan" },
   { name: "event.create", category: "event", description: "Create events" },
   { name: "event.view", category: "event", description: "View events" },
   { name: "event.update", category: "event", description: "Update event configuration" },
   { name: "event.delete", category: "event", description: "Delete events" },
   { name: "event.publish", category: "event", description: "Publish and reopen events" },
   { name: "event.archive", category: "event", description: "Archive events" },
   { name: "contestant.manage", category: "contestant", description: "Manage contestants" },
   { name: "judge.manage", category: "judge", description: "Manage judges and assignments" },
+  { name: "score.enter", category: "score", description: "Enter and submit own score sheets" },
+  { name: "score.manage", category: "score", description: "Run rounds, publish results, finalize events" },
+  { name: "result.view", category: "result", description: "View published results" },
 ] as const;
 
 export const ROLE_PERMISSIONS: Record<string, string[]> = {
-  "Org Owner": ["organization.view", "organization.update", "organization.members.manage", "organization.delete", "audit.view", "subscription.view", "subscription.manage", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage"],
-  "Org Admin": ["organization.view", "organization.update", "organization.members.manage", "audit.view", "subscription.view", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage"],
-  "Event Admin": ["organization.view", "subscription.view", "event.create", "event.view", "event.update", "event.publish", "event.archive", "contestant.manage", "judge.manage"],
-  "Tabulator": ["organization.view", "event.view"],
-  "Judge": ["organization.view", "event.view"],
-  "Staff": ["organization.view", "event.view", "contestant.manage"],
-  "Viewer": ["organization.view", "event.view"],
+  "Org Owner": ["organization.view", "organization.update", "organization.members.manage", "organization.delete", "audit.view", "subscription.view", "subscription.manage", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage", "score.manage", "result.view"],
+  "Org Admin": ["organization.view", "organization.update", "organization.members.manage", "audit.view", "subscription.view", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage", "score.manage", "result.view"],
+  "Event Admin": ["organization.view", "subscription.view", "event.create", "event.view", "event.update", "event.publish", "event.archive", "contestant.manage", "judge.manage", "score.manage", "result.view"],
+  "Tabulator": ["organization.view", "event.view", "score.manage", "result.view"],
+  "Judge": ["organization.view", "event.view", "score.enter", "result.view"],
+  "Staff": ["organization.view", "event.view", "contestant.manage", "result.view"],
+  "Viewer": ["organization.view", "event.view", "result.view"],
 };
 
 export const SYSTEM_PLANS = [
   {
     name: "Free",
     sortOrder: 0,
     features: {
       canCreateEvent: true, canExportReports: false, canUseCustomBranding: false,
       canUseAuditLogs: false, canCreateTemplates: false, canUseAdvancedAnalytics: false, canUseApi: false,
     },
diff --git a/convex/lib/errors.ts b/convex/lib/errors.ts
index bddf1b1..d4f5966 100644
--- a/convex/lib/errors.ts
+++ b/convex/lib/errors.ts
@@ -3,20 +3,21 @@ import type { Value } from "convex/values";
 
 export const ErrorCode = {
   UNAUTHENTICATED: "UNAUTHENTICATED",
   PROFILE_NOT_PROVISIONED: "PROFILE_NOT_PROVISIONED",
   FORBIDDEN: "FORBIDDEN",
   NOT_FOUND: "NOT_FOUND",
   VALIDATION_ERROR: "VALIDATION_ERROR",
   LIMIT_EXCEEDED: "LIMIT_EXCEEDED",
   FEATURE_UNAVAILABLE: "FEATURE_UNAVAILABLE",
   CONFLICT: "CONFLICT",
+  TIES_UNRESOLVED: "TIES_UNRESOLVED",
 } as const;
 
 export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
 
 export type AppErrorData = {
   code: ErrorCode;
   message: string;
   context?: Record<string, Value>;
 };
 
diff --git a/convex/lib/eventAuthz.ts b/convex/lib/eventAuthz.ts
index 4ed864d..9bc53a3 100644
--- a/convex/lib/eventAuthz.ts
+++ b/convex/lib/eventAuthz.ts
@@ -1,12 +1,12 @@
 import type { QueryCtx } from "../_generated/server";
-import type { Doc } from "../_generated/dataModel";
+import type { Doc, Id } from "../_generated/dataModel";
 import { appError, ErrorCode } from "./errors";
 import { requireOrgMember, type AuthCtx } from "./authz";
 
 export type EventAuthCtx = AuthCtx & { event: Doc<"events"> };
 
 export async function resolveEventBySlug(
   ctx: QueryCtx,
   args: { orgSlug: string; eventSlug: string },
 ): Promise<{ actx: AuthCtx; event: Doc<"events"> }> {
   const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
@@ -43,10 +43,40 @@ export async function requireEventPermission(
 export async function requireDraftEvent(
   ctx: QueryCtx,
   args: { orgSlug: string; eventSlug: string; permission: string },
 ): Promise<EventAuthCtx> {
   const eactx = await requireEventPermission(ctx, args);
   if (eactx.event.status !== "draft") {
     throw appError(ErrorCode.CONFLICT, "Event configuration is locked");
   }
   return eactx;
 }
+
+export async function requireReadyEvent(
+  ctx: QueryCtx,
+  args: { orgSlug: string; eventSlug: string; permission: string },
+): Promise<EventAuthCtx> {
+  const eactx = await requireEventPermission(ctx, args);
+  if (eactx.event.status !== "ready") {
+    throw appError(ErrorCode.CONFLICT, "Event is not in scoring state");
+  }
+  return eactx;
+}
+
+export async function requireJudgeRow(ctx: QueryCtx, eactx: EventAuthCtx): Promise<Doc<"judges">> {
+  const judge = await ctx.db
+    .query("judges")
+    .withIndex("by_event_id_and_user_id", (q) => q.eq("eventId", eactx.event._id).eq("userId", eactx.user._id))
+    .unique();
+  if (!judge) throw appError(ErrorCode.NOT_FOUND, "No judge record for this event");
+  return judge;
+}
+
+export async function loadRound(
+  ctx: QueryCtx,
+  eactx: EventAuthCtx,
+  roundId: Id<"rounds">,
+): Promise<Doc<"rounds">> {
+  const round = await ctx.db.get(roundId);
+  if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
+  return round;
+}
diff --git a/convex/lib/roundCompute.ts b/convex/lib/roundCompute.ts
new file mode 100644
index 0000000..f76b11f
--- /dev/null
+++ b/convex/lib/roundCompute.ts
@@ -0,0 +1,141 @@
+import type { QueryCtx } from "../_generated/server";
+import type { Doc, Id } from "../_generated/dataModel";
+import { loadRound, type EventAuthCtx } from "./eventAuthz";
+import {
+  applyAdvancement, computeRoundStandings,
+  type AdvancementConfig, type AdvancementOverrideRow, type CoreContestant, type CoreCriterion,
+  type CoreScoreRow, type RoundComputeInput, type StandingRow, type UnresolvedTie,
+} from "./tabulation";
+
+export type RoundComputeResult = {
+  round: Doc<"rounds">;
+  standings: StandingRow[];
+  unresolvedTies: UnresolvedTie[];
+  advancement: Map<Id<"contestants">, boolean | null>;
+  advancementConfig: AdvancementConfig;
+  judgeParticipation: { judgeId: Id<"judges">; sheetsSubmitted: number; sheetsTotal: number }[];
+  tieBreaks: Doc<"tieBreaks">[];
+  overrides: Doc<"advancementOverrides">[];
+};
+
+export async function loadRoundCompute(
+  ctx: QueryCtx,
+  eactx: EventAuthCtx,
+  roundId: Id<"rounds">,
+  extraOverrides: AdvancementOverrideRow[] = [],
+): Promise<RoundComputeResult> {
+  const round = await loadRound(ctx, eactx, roundId);
+  const criteriaDocs = await ctx.db
+    .query("criteria")
+    .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
+    .collect();
+  const contestants = await ctx.db
+    .query("contestants")
+    .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+    .collect();
+  const sheets = await ctx.db
+    .query("scoreSheets")
+    .withIndex("by_event_id_and_round_id", (q) =>
+      q.eq("eventId", eactx.event._id).eq("roundId", round._id))
+    .collect();
+  const scoreDocs = await ctx.db
+    .query("scores")
+    .withIndex("by_event_id_and_round_id", (q) =>
+      q.eq("eventId", eactx.event._id).eq("roundId", round._id))
+    .collect();
+  const judges = await ctx.db
+    .query("judges")
+    .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+    .collect();
+  const tieBreaks = await ctx.db
+    .query("tieBreaks")
+    .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
+    .collect();
+  const overrideDocs = await ctx.db
+    .query("advancementOverrides")
+    .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
+    .collect();
+
+  const criteria: CoreCriterion[] = criteriaDocs.map((c) => ({
+    id: c._id, weight: c.weight, minScore: c.minScore, maxScore: c.maxScore,
+  }));
+  const coreContestants: CoreContestant[] = contestants.map((k) => ({
+    id: k._id, categoryId: k.categoryId, status: k.status,
+  }));
+  const scores: CoreScoreRow[] = scoreDocs.map((s) => ({
+    judgeId: s.judgeId, contestantId: s.contestantId, criterionId: s.criterionId, value: s.value,
+  }));
+  const input: RoundComputeInput = {
+    winner: round.scoringRules?.winner ?? "highest",
+    dropHighLow: eactx.event.scoringRules.dropHighLow,
+    decimalPrecision: eactx.event.decimalPrecision,
+    criteria,
+    contestants: coreContestants,
+    scores,
+    manualTieBreaks: tieBreaks.map((b) => ({
+      tiedContestantIds: b.tiedContestantIds, orderedIds: b.orderedIds,
+    })),
+  };
+  const { standings, unresolvedTies } = computeRoundStandings(input);
+  const advancementConfig: AdvancementConfig = {
+    enabled:
+      eactx.event.eliminationEnabled &&
+      round.qualifiesToNextRound &&
+      round.advancement.mode !== "none",
+    mode: round.advancement.mode,
+    count: round.advancement.count ?? null,
+    percent: round.advancement.percent ?? null,
+    allowOverride: round.advancement.allowOverride,
+  };
+  const overrides: AdvancementOverrideRow[] = [
+    ...overrideDocs.map((o) => ({ contestantId: o.contestantId, action: o.action })),
+    ...extraOverrides,
+  ];
+  const advancement = applyAdvancement(standings, advancementConfig, overrides);
+  const judgeParticipation = judges.map((j) => {
+    const own = sheets.filter((s) => s.judgeId === j._id);
+    return {
+      judgeId: j._id,
+      sheetsSubmitted: own.filter((s) => s.status === "submitted" || s.status === "locked").length,
+      sheetsTotal: own.length,
+    };
+  });
+  return {
+    round, standings, unresolvedTies, advancement, advancementConfig,
+    judgeParticipation, tieBreaks, overrides: overrideDocs,
+  };
+}
+
+export function buildSnapshot(result: RoundComputeResult, now: number, decimalPrecision: number) {
+  const categoryIds = [...new Set(result.standings.map((s) => s.categoryId))].sort();
+  return {
+    computedAt: now,
+    decimalPrecision,
+    categories: categoryIds.map((categoryId) => ({
+      categoryId,
+      standings: result.standings
+        .filter((s) => s.categoryId === categoryId)
+        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.contestantId < b.contestantId ? -1 : 1))
+        .map((s) => ({
+          contestantId: s.contestantId,
+          status: s.status,
+          rank: s.rank,
+          roundScore: s.roundScore,
+          criterionScores: s.criterionScores.map((cs) => ({
+            criterionId: cs.criterionId, avgRaw: cs.avgRaw, contribution: cs.contribution, dropped: cs.dropped,
+          })),
+          tieResolvedBy: s.tieResolvedBy,
+          advanced: result.advancement.get(s.contestantId) ?? null,
+        })),
+    })),
+    judgeParticipation: result.judgeParticipation,
+    decisions: {
+      tieBreaks: result.tieBreaks.map((b) => ({
+        tiedContestantIds: b.tiedContestantIds, orderedIds: b.orderedIds, createdById: b.createdById,
+      })),
+      advancementOverrides: result.overrides.map((o) => ({
+        contestantId: o.contestantId, action: o.action, createdById: o.createdById,
+      })),
+    },
+  };
+}
diff --git a/convex/lib/tabulation.ts b/convex/lib/tabulation.ts
new file mode 100644
index 0000000..957030b
--- /dev/null
+++ b/convex/lib/tabulation.ts
@@ -0,0 +1,348 @@
+import type { Id } from "../_generated/dataModel";
+
+export type CoreCriterion = { id: Id<"criteria">; weight: number; minScore: number; maxScore: number };
+
+export type CoreContestant = {
+  id: Id<"contestants">;
+  categoryId: Id<"categories">;
+  status: "active" | "scratched" | "disqualified";
+};
+
+export type CoreScoreRow = {
+  judgeId: Id<"judges">;
+  contestantId: Id<"contestants">;
+  criterionId: Id<"criteria">;
+  value: number;
+};
+
+export type CriterionResult = {
+  criterionId: Id<"criteria">;
+  avgRaw: number;
+  contribution: number;
+  dropped: { judgeId: Id<"judges">; value: number }[];
+};
+
+export function roundToPrecision(value: number, precision: number): number {
+  const f = 10 ** precision;
+  return Math.round((value + Number.EPSILON) * f) / f;
+}
+
+export function aggregateJudgeValues(
+  entries: { judgeId: Id<"judges">; value: number }[],
+  dropHighLow: boolean,
+): { avg: number; dropped: { judgeId: Id<"judges">; value: number }[] } {
+  const sorted = [...entries].sort((a, b) => a.value - b.value || (a.judgeId < b.judgeId ? -1 : 1));
+  let used = sorted;
+  let dropped: { judgeId: Id<"judges">; value: number }[] = [];
+  if (dropHighLow && sorted.length >= 3) {
+    dropped = [sorted[0], sorted[sorted.length - 1]];
+    used = sorted.slice(1, -1);
+  }
+  const avg = used.reduce((s, e) => s + e.value, 0) / used.length;
+  return { avg, dropped };
+}
+
+export function computeContestantCriteria(
+  contestantId: Id<"contestants">,
+  criteria: CoreCriterion[],
+  scores: CoreScoreRow[],
+  dropHighLow: boolean,
+  decimalPrecision: number,
+): CriterionResult[] {
+  return [...criteria]
+    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))
+    .map((c) => {
+      const entries = scores
+        .filter((s) => s.contestantId === contestantId && s.criterionId === c.id)
+        .map((s) => ({ judgeId: s.judgeId, value: s.value }));
+      const { avg, dropped } = aggregateJudgeValues(entries, dropHighLow);
+      const contribution = c.maxScore === 0 ? 0 : roundToPrecision((avg / c.maxScore) * c.weight, 6);
+      return { criterionId: c.id, avgRaw: roundToPrecision(avg, decimalPrecision), contribution, dropped };
+    });
+}
+
+export function computeRoundScore(results: CriterionResult[]): number {
+  return roundToPrecision(results.reduce((s, r) => s + r.contribution, 0), 6);
+}
+
+export type RoundComputeInput = {
+  winner: "highest" | "lowest";
+  dropHighLow: boolean;
+  decimalPrecision: number;
+  criteria: CoreCriterion[];
+  contestants: CoreContestant[];
+  scores: CoreScoreRow[];
+  manualTieBreaks: { tiedContestantIds: Id<"contestants">[]; orderedIds: Id<"contestants">[] }[];
+};
+
+export type StandingRow = {
+  contestantId: Id<"contestants">;
+  categoryId: Id<"categories">;
+  status: CoreContestant["status"];
+  roundScore: number | null;
+  criterionScores: CriterionResult[];
+  rank: number | null;
+  tieResolvedBy: "none" | "criteria_cascade" | "judge_firsts" | "manual";
+};
+
+export type UnresolvedTie = { categoryId: Id<"categories">; contestantIds: Id<"contestants">[] };
+
+type WorkRow = StandingRow & { firsts: number; manualRank: number };
+
+function judgeFirsts(
+  tied: Id<"contestants">[],
+  scores: CoreScoreRow[],
+  winner: "highest" | "lowest",
+): Map<Id<"contestants">, number> {
+  const totals = new Map<string, number>();
+  const judges = new Set<Id<"judges">>();
+  for (const s of scores) {
+    if (!tied.includes(s.contestantId)) continue;
+    judges.add(s.judgeId);
+    const key = `${s.judgeId}|${s.contestantId}`;
+    totals.set(key, (totals.get(key) ?? 0) + s.value);
+  }
+  const firsts = new Map<Id<"contestants">, number>();
+  for (const judge of [...judges].sort()) {
+    const judgeTotals = [...tied].sort().map((contestant) => ({
+      contestant,
+      total: totals.get(`${judge}|${contestant}`) ?? 0,
+    }));
+    const bestTotal = judgeTotals.reduce(
+      (best, entry) => (winner === "highest" ? Math.max(best, entry.total) : Math.min(best, entry.total)),
+      judgeTotals[0].total,
+    );
+    const holders = judgeTotals.filter((entry) => entry.total === bestTotal);
+    if (holders.length === 1) {
+      const best = holders[0].contestant;
+      firsts.set(best, (firsts.get(best) ?? 0) + 1);
+    }
+  }
+  return firsts;
+}
+
+function manualRankFor(contestantId: Id<"contestants">, breaks: RoundComputeInput["manualTieBreaks"]): number {
+  for (const b of breaks) {
+    const idx = b.orderedIds.indexOf(contestantId);
+    if (idx !== -1) return idx;
+  }
+  return Number.MAX_SAFE_INTEGER;
+}
+
+export function computeRoundStandings(input: RoundComputeInput): {
+  standings: StandingRow[];
+  unresolvedTies: UnresolvedTie[];
+} {
+  const rows: WorkRow[] = input.contestants
+    .slice()
+    .sort((a, b) => (a.id < b.id ? -1 : 1))
+    .map((k) => {
+      const rankable = k.status === "active";
+      const criterionScores = rankable
+        ? computeContestantCriteria(k.id, input.criteria, input.scores, input.dropHighLow, input.decimalPrecision)
+        : [];
+      return {
+        contestantId: k.id,
+        categoryId: k.categoryId,
+        status: k.status,
+        roundScore: rankable ? computeRoundScore(criterionScores) : null,
+        criterionScores,
+        rank: null,
+        tieResolvedBy: "none" as const,
+        firsts: 0,
+        manualRank: Number.MAX_SAFE_INTEGER,
+      };
+    });
+
+  const dir = input.winner === "highest" ? 1 : -1;
+  const unresolvedTies: UnresolvedTie[] = [];
+  const byCategory = new Map<Id<"categories">, WorkRow[]>();
+  for (const row of rows) {
+    const list = byCategory.get(row.categoryId) ?? [];
+    list.push(row);
+    byCategory.set(row.categoryId, list);
+  }
+
+  for (const [categoryId, categoryRows] of byCategory) {
+    const rankable = categoryRows.filter((r) => r.roundScore !== null);
+    for (const r of categoryRows) {
+      if (r.roundScore === null) r.rank = null;
+    }
+    rankable.sort((a, b) => (b.roundScore! - a.roundScore!) * dir || (a.contestantId < b.contestantId ? -1 : 1));
+
+    let index = 0;
+    while (index < rankable.length) {
+      let end = index;
+      while (end + 1 < rankable.length && rankable[end + 1].roundScore === rankable[index].roundScore) end += 1;
+      const group = rankable.slice(index, end + 1);
+      if (group.length === 1) {
+        group[0].rank = index + 1;
+        group[0].tieResolvedBy = "none";
+      } else {
+        const firsts = judgeFirsts(group.map((g) => g.contestantId), input.scores, input.winner);
+        for (const g of group) {
+          g.firsts = firsts.get(g.contestantId) ?? 0;
+          g.manualRank = manualRankFor(g.contestantId, input.manualTieBreaks);
+        }
+        group.sort((a, b) => {
+          for (let i = 0; i < Math.min(a.criterionScores.length, b.criterionScores.length); i += 1) {
+            const diff = (b.criterionScores[i].contribution - a.criterionScores[i].contribution) * dir;
+            if (diff !== 0) return diff;
+          }
+          if (a.firsts !== b.firsts) return (b.firsts - a.firsts) * dir;
+          if (a.manualRank !== b.manualRank) return a.manualRank - b.manualRank;
+          return a.contestantId < b.contestantId ? -1 : 1;
+        });
+        let separatedBy: WorkRow["tieResolvedBy"] = "manual";
+        let anySeparation = group.length > 1;
+        for (let i = 1; i < group.length; i += 1) {
+          const a = group[i - 1];
+          const b = group[i];
+          let tier: WorkRow["tieResolvedBy"] | null = null;
+          for (let k = 0; k < Math.min(a.criterionScores.length, b.criterionScores.length); k += 1) {
+            if (a.criterionScores[k].contribution !== b.criterionScores[k].contribution) {
+              tier = "criteria_cascade";
+              break;
+            }
+          }
+          if (!tier && a.firsts !== b.firsts) tier = "judge_firsts";
+          if (!tier && a.manualRank !== b.manualRank) tier = "manual";
+          if (!tier) {
+            anySeparation = false;
+            break;
+          }
+          separatedBy = tier;
+        }
+        if (anySeparation) {
+          for (const g of group) {
+            g.rank = index + group.indexOf(g) + 1;
+            g.tieResolvedBy = separatedBy;
+          }
+        } else {
+          unresolvedTies.push({ categoryId, contestantIds: group.map((g) => g.contestantId).sort() });
+          for (const g of group) {
+            g.rank = index + 1;
+            g.tieResolvedBy = "none";
+          }
+        }
+      }
+      index = end + 1;
+    }
+  }
+
+  return {
+    standings: rows.map((r) => ({
+      contestantId: r.contestantId,
+      categoryId: r.categoryId,
+      status: r.status,
+      roundScore: r.roundScore,
+      criterionScores: r.criterionScores,
+      rank: r.rank,
+      tieResolvedBy: r.tieResolvedBy,
+    })),
+    unresolvedTies,
+  };
+}
+
+export type AdvancementConfig = {
+  enabled: boolean;
+  mode: "none" | "top_count" | "top_percent" | "manual";
+  count: number | null;
+  percent: number | null;
+  allowOverride: boolean;
+};
+
+export type AdvancementOverrideRow = {
+  contestantId: Id<"contestants">;
+  action: "force_advance" | "force_cut";
+};
+
+export function applyAdvancement(
+  standings: StandingRow[],
+  config: AdvancementConfig,
+  overrides: AdvancementOverrideRow[],
+): Map<Id<"contestants">, boolean | null> {
+  const outcome = new Map<Id<"contestants">, boolean | null>();
+  for (const s of standings) outcome.set(s.contestantId, null);
+  if (!config.enabled) return outcome;
+  const rankable = standings
+    .filter((s) => s.rank !== null && s.status === "active")
+    .sort((a, b) => a.rank! - b.rank!);
+  let advancing = new Set<Id<"contestants">>();
+  if (config.mode === "top_count") {
+    advancing = new Set(rankable.slice(0, config.count ?? 0).map((s) => s.contestantId));
+  } else if (config.mode === "top_percent") {
+    const n = Math.ceil(((config.percent ?? 0) / 100) * rankable.length);
+    advancing = new Set(rankable.slice(0, n).map((s) => s.contestantId));
+  }
+  for (const s of rankable) outcome.set(s.contestantId, advancing.has(s.contestantId));
+  for (const o of overrides) {
+    outcome.set(o.contestantId, o.action === "force_advance");
+  }
+  return outcome;
+}
+
+export type RoundStandingSummary = {
+  roundId: Id<"rounds">;
+  order: number;
+  weight: number;
+  standings: StandingRow[];
+  advancement: Record<string, boolean | null>;
+};
+
+export type FinalStandingRow = {
+  contestantId: Id<"contestants">;
+  categoryId: Id<"categories">;
+  totalScore: number;
+  eliminatedInRoundOrder: number | null;
+  rank: number;
+};
+
+export function computeEventFinal(rounds: RoundStandingSummary[], decimalPrecision: number): FinalStandingRow[] {
+  type Work = { contestantId: Id<"contestants">; category: Id<"categories">; total: number; eliminated: number | null; rank: number };
+  const byContestant = new Map<Id<"contestants">, { total: number; category: Id<"categories">; eliminated: number | null }>();
+  for (const round of rounds) {
+    for (const s of round.standings) {
+      if (s.roundScore === null) continue;
+      const entry = byContestant.get(s.contestantId) ?? { total: 0, category: s.categoryId, eliminated: null };
+      entry.total += (s.roundScore * round.weight) / 100;
+      if (round.advancement[s.contestantId] === false && (entry.eliminated === null || round.order > entry.eliminated)) {
+        entry.eliminated = round.order;
+      }
+      byContestant.set(s.contestantId, entry);
+    }
+  }
+  const rows: Work[] = [...byContestant.entries()]
+    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
+    .map(([contestantId, e]) => ({
+      contestantId,
+      category: e.category,
+      total: roundToPrecision(e.total, decimalPrecision),
+      eliminated: e.eliminated,
+      rank: 0,
+    }));
+  const byCategory = new Map<Id<"categories">, Work[]>();
+  for (const row of rows) {
+    const list = byCategory.get(row.category) ?? [];
+    list.push(row);
+    byCategory.set(row.category, list);
+  }
+  for (const list of byCategory.values()) {
+    list.sort(
+      (a, b) =>
+        (a.eliminated === null ? 0 : 1) - (b.eliminated === null ? 0 : 1) ||
+        (b.eliminated ?? 0) - (a.eliminated ?? 0) ||
+        b.total - a.total,
+    );
+    list.forEach((row, i) => {
+      row.rank = i + 1;
+    });
+  }
+  return rows.map((r) => ({
+    contestantId: r.contestantId,
+    categoryId: r.category,
+    totalScore: r.total,
+    eliminatedInRoundOrder: r.eliminated,
+    rank: r.rank,
+  }));
+}
diff --git a/convex/results.ts b/convex/results.ts
new file mode 100644
index 0000000..c7b40a4
--- /dev/null
+++ b/convex/results.ts
@@ -0,0 +1,162 @@
+import { v } from "convex/values";
+import { mutation, query } from "./_generated/server";
+import type { QueryCtx } from "./_generated/server";
+import type { Doc, Id } from "./_generated/dataModel";
+import { appError, ErrorCode } from "./lib/errors";
+import { requireEventMember, requireEventPermission } from "./lib/eventAuthz";
+import { writeAudit } from "./lib/audit";
+import { computeEventFinal, type RoundStandingSummary, type StandingRow } from "./lib/tabulation";
+
+async function requireResultAccess(
+  ctx: QueryCtx,
+  args: { orgSlug: string; eventSlug: string },
+) {
+  const eactx = await requireEventMember(ctx, args);
+  if (!eactx.permissions.has("result.view")) {
+    throw appError(ErrorCode.FORBIDDEN, "Missing permission: result.view");
+  }
+  if (eactx.event.resultVisibility === "private" && !eactx.permissions.has("score.manage")) {
+    throw appError(ErrorCode.FORBIDDEN, "Results are private");
+  }
+  return eactx;
+}
+
+async function latestVersion(
+  ctx: QueryCtx,
+  roundId: Id<"rounds">,
+): Promise<Doc<"resultVersions"> | null> {
+  const versions = await ctx.db
+    .query("resultVersions")
+    .withIndex("by_round_id", (q) => q.eq("roundId", roundId))
+    .collect();
+  return versions.reduce<Doc<"resultVersions"> | null>(
+    (best, v) => (best === null || v.version > best.version ? v : best),
+    null,
+  );
+}
+
+export const roundResults = query({
+  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), version: v.optional(v.number()) },
+  handler: async (ctx, args) => {
+    const eactx = await requireResultAccess(ctx, args);
+    const round = await ctx.db.get(args.roundId);
+    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
+    const versions = await ctx.db
+      .query("resultVersions")
+      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
+      .collect();
+    const chosen = args.version !== undefined
+      ? versions.find((v) => v.version === args.version)
+      : versions.reduce<Doc<"resultVersions"> | null>((best, v) => (best === null || v.version > best.version ? v : best), null);
+    if (!chosen) throw appError(ErrorCode.NOT_FOUND, "Result version not found");
+    return {
+      version: chosen.version,
+      reason: chosen.reason,
+      createdAt: chosen.createdAt,
+      snapshot: chosen.snapshot,
+    };
+  },
+});
+
+export const listRoundVersions = query({
+  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
+  handler: async (ctx, args) => {
+    const eactx = await requireResultAccess(ctx, args);
+    const round = await ctx.db.get(args.roundId);
+    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
+    const versions = await ctx.db
+      .query("resultVersions")
+      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
+      .collect();
+    return versions
+      .sort((a, b) => b.version - a.version)
+      .map((v) => ({ version: v.version, createdAt: v.createdAt, reason: v.reason }));
+  },
+});
+
+export const eventResults = query({
+  args: { orgSlug: v.string(), eventSlug: v.string() },
+  handler: async (ctx, args) => {
+    const eactx = await requireResultAccess(ctx, args);
+    const rounds = await ctx.db
+      .query("rounds")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    const contestants = await ctx.db
+      .query("contestants")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    const summaries: (RoundStandingSummary & { name: string; version: number })[] = [];
+    for (const round of [...rounds].sort((a, b) => a.order - b.order)) {
+      if (round.status !== "published") continue;
+      const version = await latestVersion(ctx, round._id);
+      if (!version) continue;
+      const standings: StandingRow[] = version.snapshot.categories.flatMap((category) =>
+        category.standings.map((s) => ({
+          contestantId: s.contestantId,
+          categoryId: category.categoryId,
+          status: s.status,
+          roundScore: s.roundScore,
+          criterionScores: s.criterionScores.map((cs) => ({
+            criterionId: cs.criterionId, avgRaw: cs.avgRaw, contribution: cs.contribution, dropped: cs.dropped,
+          })),
+          rank: s.rank,
+          tieResolvedBy: s.tieResolvedBy,
+        })),
+      );
+      const advancement = Object.fromEntries(
+        version.snapshot.categories.flatMap((c) =>
+          c.standings.map((s) => [s.contestantId, s.advanced]),
+        ),
+      );
+      summaries.push({
+        roundId: round._id, order: round.order, weight: round.weight,
+        standings, advancement, name: round.name, version: version.version,
+      });
+    }
+    const final = computeEventFinal(summaries, eactx.event.decimalPrecision).map((f) => ({
+      contestantId: f.contestantId,
+      contestantName: contestants.find((k) => k._id === f.contestantId)?.name ?? "",
+      categoryId: f.categoryId,
+      totalScore: f.totalScore,
+      eliminatedInRoundOrder: f.eliminatedInRoundOrder,
+      rank: f.rank,
+    }));
+    return {
+      rounds: summaries.map(({ name, version, ...s }) => ({
+        roundId: s.roundId, name, order: s.order, weight: s.weight, version,
+        standings: s.standings.map((row) => ({
+          contestantId: row.contestantId,
+          contestantName: contestants.find((k) => k._id === row.contestantId)?.name ?? "",
+          rank: row.rank, roundScore: row.roundScore,
+        })),
+      })),
+      final,
+    };
+  },
+});
+
+export const finalizeEvent = mutation({
+  args: { orgSlug: v.string(), eventSlug: v.string() },
+  handler: async (ctx, args) => {
+    const eactx = await requireEventPermission(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    if (eactx.event.status !== "ready") {
+      throw appError(ErrorCode.CONFLICT, "Only ready events can be finalized");
+    }
+    const rounds = await ctx.db
+      .query("rounds")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    if (rounds.length === 0 || rounds.some((r) => r.status !== "published")) {
+      throw appError(ErrorCode.VALIDATION_ERROR, "Every round must be published before finalizing");
+    }
+    await ctx.db.patch(eactx.event._id, { status: "finalized" });
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.finalized",
+      resourceType: "event", resourceId: eactx.event._id,
+      before: { status: "ready" }, after: { status: "finalized" },
+    });
+  },
+});
diff --git a/convex/roundAdmin.ts b/convex/roundAdmin.ts
new file mode 100644
index 0000000..b2977a7
--- /dev/null
+++ b/convex/roundAdmin.ts
@@ -0,0 +1,358 @@
+import { v } from "convex/values";
+import { mutation, query } from "./_generated/server";
+import type { Id } from "./_generated/dataModel";
+import { appError, ErrorCode } from "./lib/errors";
+import { loadRound, requireReadyEvent } from "./lib/eventAuthz";
+import { buildSnapshot, loadRoundCompute } from "./lib/roundCompute";
+import { writeAudit } from "./lib/audit";
+
+export const roundMonitor = query({
+  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    const round = await loadRound(ctx, eactx, args.roundId);
+    const judges = await ctx.db
+      .query("judges")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    const contestants = await ctx.db
+      .query("contestants")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    const sheets = await ctx.db
+      .query("scoreSheets")
+      .withIndex("by_event_id_and_round_id", (q) =>
+        q.eq("eventId", eactx.event._id).eq("roundId", round._id))
+      .collect();
+    const judgesOut: { judgeId: Id<"judges">; name: string }[] = [];
+    for (const j of judges) {
+      const user = await ctx.db.get(j.userId);
+      judgesOut.push({ judgeId: j._id, name: user?.name ?? "" });
+    }
+    return {
+      roundStatus: round.status,
+      judges: judgesOut,
+      contestants: contestants.map((k) => ({ contestantId: k._id, name: k.name, number: k.number })),
+      sheets: sheets.map((s) => ({ judgeId: s.judgeId, contestantId: s.contestantId, status: s.status })),
+    };
+  },
+});
+
+export const closeRound = mutation({
+  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    const round = await loadRound(ctx, eactx, args.roundId);
+    if (round.status !== "open") {
+      throw appError(ErrorCode.CONFLICT, "Only open rounds can be closed");
+    }
+    await ctx.db.patch(round._id, { status: "closed" });
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.closed",
+      resourceType: "round", resourceId: round._id,
+      before: { status: "open" }, after: { status: "closed" },
+    });
+  },
+});
+
+export const reopenRound = mutation({
+  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    const round = await loadRound(ctx, eactx, args.roundId);
+    if (round.status !== "closed") {
+      throw appError(ErrorCode.CONFLICT, "Only closed rounds can be reopened");
+    }
+    await ctx.db.patch(round._id, { status: "open" });
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.reopened",
+      resourceType: "round", resourceId: round._id,
+      before: { status: "closed" }, after: { status: "open" },
+    });
+  },
+});
+
+export const roundReview = query({
+  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    const result = await loadRoundCompute(ctx, eactx, args.roundId);
+    if (result.round.status !== "closed") {
+      throw appError(ErrorCode.CONFLICT, "Close the round before review");
+    }
+    const contestants = await ctx.db
+      .query("contestants")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    const nameOf = (id: Id<"contestants">) => contestants.find((k) => k._id === id)?.name ?? "";
+    return {
+      round: {
+        name: result.round.name,
+        status: result.round.status,
+        advancement: result.round.advancement,
+        qualifiesToNextRound: result.round.qualifiesToNextRound,
+      },
+      eliminationEnabled: eactx.event.eliminationEnabled,
+      standings: result.standings.map((s) => ({
+        contestantId: s.contestantId,
+        contestantName: nameOf(s.contestantId),
+        categoryId: s.categoryId,
+        status: s.status,
+        roundScore: s.roundScore,
+        criterionScores: s.criterionScores,
+        rank: s.rank,
+        tieResolvedBy: s.tieResolvedBy,
+        advancement: result.advancement.get(s.contestantId) ?? null,
+      })),
+      unresolvedTies: result.unresolvedTies.map((u) => ({
+        categoryId: u.categoryId,
+        contestantIds: u.contestantIds,
+        names: u.contestantIds.map(nameOf),
+      })),
+      tieBreaks: result.tieBreaks,
+      overrides: result.overrides,
+    };
+  },
+});
+
+export const addTieBreak = mutation({
+  args: {
+    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"),
+    tiedContestantIds: v.array(v.id("contestants")),
+    orderedIds: v.array(v.id("contestants")),
+  },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    const round = await loadRound(ctx, eactx, args.roundId);
+    if (round.status !== "closed") {
+      throw appError(ErrorCode.CONFLICT, "Tie breaks are only allowed on closed rounds");
+    }
+    const tied = [...new Set(args.tiedContestantIds)];
+    if (tied.length < 2 || tied.length !== args.orderedIds.length || tied.length !== args.tiedContestantIds.length) {
+      throw appError(ErrorCode.VALIDATION_ERROR, "A tie break needs at least 2 distinct contestants and a full ordering");
+    }
+    const ordered = [...new Set(args.orderedIds)];
+    if (ordered.length !== tied.length || tied.some((id) => !ordered.includes(id))) {
+      throw appError(ErrorCode.VALIDATION_ERROR, "orderedIds must be a permutation of tiedContestantIds");
+    }
+    const contestants = await ctx.db
+      .query("contestants")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    if (tied.some((id) => !contestants.some((k) => k._id === id))) {
+      throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
+    }
+    const id = await ctx.db.insert("tieBreaks", {
+      eventId: eactx.event._id,
+      roundId: round._id,
+      tiedContestantIds: tied,
+      orderedIds: args.orderedIds,
+      createdById: eactx.user._id,
+      createdAt: Date.now(),
+    });
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.tiebreak.added",
+      resourceType: "tieBreak", resourceId: id, after: { roundId: round._id, contestants: tied.length },
+    });
+  },
+});
+
+export const removeTieBreak = mutation({
+  args: { orgSlug: v.string(), eventSlug: v.string(), tieBreakId: v.id("tieBreaks") },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    const tieBreak = await ctx.db.get(args.tieBreakId);
+    if (!tieBreak || tieBreak.eventId !== eactx.event._id) {
+      throw appError(ErrorCode.NOT_FOUND, "Tie break not found");
+    }
+    const round = await loadRound(ctx, eactx, tieBreak.roundId);
+    if (round.status !== "closed") {
+      throw appError(ErrorCode.CONFLICT, "Tie breaks are only editable on closed rounds");
+    }
+    await ctx.db.delete(args.tieBreakId);
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.tiebreak.removed",
+      resourceType: "tieBreak", resourceId: args.tieBreakId,
+    });
+  },
+});
+
+export const addAdvancementOverride = mutation({
+  args: {
+    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"),
+    contestantId: v.id("contestants"),
+    action: v.union(v.literal("force_advance"), v.literal("force_cut")),
+  },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    const round = await loadRound(ctx, eactx, args.roundId);
+    if (round.status !== "closed") {
+      throw appError(ErrorCode.CONFLICT, "Overrides are only allowed on closed rounds");
+    }
+    if (!round.advancement.allowOverride) {
+      throw appError(ErrorCode.VALIDATION_ERROR, "This round does not allow advancement overrides");
+    }
+    if (
+      !eactx.event.eliminationEnabled ||
+      !round.qualifiesToNextRound ||
+      round.advancement.mode === "none"
+    ) {
+      throw appError(ErrorCode.VALIDATION_ERROR, "This round has no active advancement rule");
+    }
+    const contestant = await ctx.db.get(args.contestantId);
+    if (!contestant || contestant.eventId !== eactx.event._id) {
+      throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
+    }
+    const existing = await ctx.db
+      .query("advancementOverrides")
+      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
+      .collect();
+    if (existing.some((o) => o.contestantId === args.contestantId)) {
+      throw appError(ErrorCode.CONFLICT, "An override already exists for this contestant");
+    }
+    const id = await ctx.db.insert("advancementOverrides", {
+      eventId: eactx.event._id,
+      roundId: round._id,
+      contestantId: args.contestantId,
+      action: args.action,
+      createdById: eactx.user._id,
+      createdAt: Date.now(),
+    });
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.advancement_override.added",
+      resourceType: "advancementOverride", resourceId: id,
+      after: { roundId: round._id, contestantId: args.contestantId, action: args.action },
+    });
+  },
+});
+
+export const removeAdvancementOverride = mutation({
+  args: { orgSlug: v.string(), eventSlug: v.string(), overrideId: v.id("advancementOverrides") },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    const override = await ctx.db.get(args.overrideId);
+    if (!override || override.eventId !== eactx.event._id) {
+      throw appError(ErrorCode.NOT_FOUND, "Override not found");
+    }
+    const round = await loadRound(ctx, eactx, override.roundId);
+    if (round.status !== "closed") {
+      throw appError(ErrorCode.CONFLICT, "Overrides are only editable on closed rounds");
+    }
+    await ctx.db.delete(args.overrideId);
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.advancement_override.removed",
+      resourceType: "advancementOverride", resourceId: args.overrideId,
+    });
+  },
+});
+
+export const publishRound = mutation({
+  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    const result = await loadRoundCompute(ctx, eactx, args.roundId);
+    if (result.round.status !== "closed") {
+      throw appError(ErrorCode.CONFLICT, "Only closed rounds can be published");
+    }
+    if (result.unresolvedTies.length > 0) {
+      throw appError(ErrorCode.TIES_UNRESOLVED, "Resolve all ties before publishing", {
+        ties: result.unresolvedTies,
+      });
+    }
+    const existing = await ctx.db
+      .query("resultVersions")
+      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
+      .collect();
+    const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
+    const now = Date.now();
+    await ctx.db.insert("resultVersions", {
+      eventId: eactx.event._id,
+      roundId: args.roundId,
+      version,
+      snapshot: buildSnapshot(result, now, eactx.event.decimalPrecision),
+      createdById: eactx.user._id,
+      createdAt: now,
+    });
+    await ctx.db.patch(args.roundId, { status: "published" });
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.published",
+      resourceType: "round", resourceId: args.roundId,
+      before: { status: "closed" }, after: { status: "published", version },
+    });
+  },
+});
+
+export const correctResults = mutation({
+  args: {
+    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), reason: v.string(),
+    overrides: v.optional(v.array(v.object({
+      contestantId: v.id("contestants"),
+      action: v.union(v.literal("force_advance"), v.literal("force_cut")),
+    }))),
+  },
+  handler: async (ctx, args) => {
+    const eactx = await requireReadyEvent(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
+    });
+    if (!args.reason.trim()) {
+      throw appError(ErrorCode.VALIDATION_ERROR, "A correction reason is required");
+    }
+    const contestants = await ctx.db
+      .query("contestants")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    const extra = (args.overrides ?? []).filter((o) => {
+      if (!contestants.some((k) => k._id === o.contestantId)) {
+        throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
+      }
+      return true;
+    });
+    const result = await loadRoundCompute(ctx, eactx, args.roundId, extra);
+    if (result.round.status !== "published") {
+      throw appError(ErrorCode.CONFLICT, "Only published rounds can be corrected");
+    }
+    if (result.unresolvedTies.length > 0) {
+      throw appError(ErrorCode.TIES_UNRESOLVED, "Resolve all ties before correcting", {
+        ties: result.unresolvedTies,
+      });
+    }
+    const existing = await ctx.db
+      .query("resultVersions")
+      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
+      .collect();
+    const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
+    const now = Date.now();
+    await ctx.db.insert("resultVersions", {
+      eventId: eactx.event._id,
+      roundId: args.roundId,
+      version,
+      snapshot: buildSnapshot(result, now, eactx.event.decimalPrecision),
+      createdById: eactx.user._id,
+      createdAt: now,
+      reason: args.reason.trim(),
+    });
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.corrected",
+      resourceType: "resultVersion", resourceId: args.roundId,
+      after: { version, reason: args.reason.trim() },
+    });
+  },
+});
diff --git a/convex/rounds.ts b/convex/rounds.ts
index 8e9879f..a11405b 100644
--- a/convex/rounds.ts
+++ b/convex/rounds.ts
@@ -1,58 +1,90 @@
 import { v } from "convex/values";
 import { mutation, query } from "./_generated/server";
 import { appError, ErrorCode } from "./lib/errors";
 import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
 import { writeAudit } from "./lib/audit";
 
+const advancementArgs = {
+  mode: v.union(v.literal("none"), v.literal("top_count"), v.literal("top_percent"), v.literal("manual")),
+  count: v.optional(v.number()),
+  percent: v.optional(v.number()),
+  allowOverride: v.boolean(),
+};
+
+function validateAdvancement(a: { mode: string; count?: number; percent?: number }): void {
+  if (a.mode === "top_count" && !(Number.isInteger(a.count) && (a.count ?? 0) >= 1)) {
+    throw appError(ErrorCode.VALIDATION_ERROR, "top_count advancement requires count >= 1");
+  }
+  if (a.mode === "top_percent" && !((a.percent ?? 0) >= 1 && (a.percent ?? 0) <= 100)) {
+    throw appError(ErrorCode.VALIDATION_ERROR, "top_percent advancement requires percent 1-100");
+  }
+}
+
 export const add = mutation({
   args: {
     orgSlug: v.string(), eventSlug: v.string(), name: v.string(),
     description: v.optional(v.string()), qualifiesToNextRound: v.optional(v.boolean()),
+    weight: v.optional(v.number()), advancement: v.optional(v.object(advancementArgs)),
   },
   handler: async (ctx, args) => {
     const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
     if (!args.name.trim()) throw appError(ErrorCode.VALIDATION_ERROR, "name must not be empty");
     const existing = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
+    if (args.advancement) validateAdvancement(args.advancement);
     const id = await ctx.db.insert("rounds", {
       eventId: eactx.event._id,
       name: args.name.trim(),
       description: args.description,
       order: existing.length,
       qualifiesToNextRound: args.qualifiesToNextRound ?? false,
+      weight: args.weight ?? (existing.length === 0 ? 100 : 0),
+      status: "open",
+      advancement: args.advancement ?? { mode: "none", allowOverride: true },
     });
     await writeAudit(ctx, {
       orgId: eactx.org._id, actorId: eactx.user._id, action: "round.added",
       resourceType: "round", resourceId: id, after: { name: args.name },
     });
   },
 });
 
 export const update = mutation({
   args: {
     orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"),
     name: v.optional(v.string()), description: v.optional(v.string()),
     qualifiesToNextRound: v.optional(v.boolean()),
     scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
+    weight: v.optional(v.number()), advancement: v.optional(v.object(advancementArgs)),
   },
   handler: async (ctx, args) => {
     const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
     if (args.name !== undefined && !args.name.trim()) {
       throw appError(ErrorCode.VALIDATION_ERROR, "name must not be empty");
     }
     const round = await ctx.db.get(args.roundId);
     if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
     const patch: Record<string, unknown> = {};
     if (args.name !== undefined) patch.name = args.name.trim();
     if (args.description !== undefined) patch.description = args.description;
     if (args.qualifiesToNextRound !== undefined) patch.qualifiesToNextRound = args.qualifiesToNextRound;
     if (args.scoringRules !== undefined) patch.scoringRules = args.scoringRules;
+    if (args.weight !== undefined) {
+      if (!Number.isInteger(args.weight) || args.weight < 0 || args.weight > 100) {
+        throw appError(ErrorCode.VALIDATION_ERROR, "weight must be an integer 0-100");
+      }
+      patch.weight = args.weight;
+    }
+    if (args.advancement !== undefined) {
+      validateAdvancement(args.advancement);
+      patch.advancement = args.advancement;
+    }
     if (Object.keys(patch).length === 0) return;
     await ctx.db.patch(args.roundId, patch);
     await writeAudit(ctx, {
       orgId: eactx.org._id, actorId: eactx.user._id, action: "round.updated",
       resourceType: "round", resourceId: args.roundId, before: { name: round.name }, after: patch,
     });
   },
 });
 
 export const remove = mutation({
diff --git a/convex/schema.ts b/convex/schema.ts
index 7f8467a..7b56bb1 100644
--- a/convex/schema.ts
+++ b/convex/schema.ts
@@ -149,23 +149,25 @@ export default defineSchema({
     orgId: v.id("organizations"),
     slug: v.string(),
     name: v.string(),
     description: v.string(),
     logoUrl: v.optional(v.string()),
     bannerUrl: v.optional(v.string()),
     startDate: v.optional(v.number()),
     endDate: v.optional(v.number()),
     venue: v.optional(v.string()),
     timezone: v.optional(v.string()),
-    status: v.union(v.literal("draft"), v.literal("ready"), v.literal("archived")),
+    status: v.union(v.literal("draft"), v.literal("ready"), v.literal("finalized"), v.literal("archived")),
     decimalPrecision: v.number(),
     resultVisibility: v.union(v.literal("private"), v.literal("organization"), v.literal("public")),
+    scoringRules: v.object({ dropHighLow: v.boolean() }),
+    eliminationEnabled: v.boolean(),
     branding: v.object({
       primaryColor: v.optional(v.string()),
       secondaryColor: v.optional(v.string()),
     }),
     templateId: v.optional(v.id("eventTemplates")),
     createdById: v.id("userProfiles"),
   })
     .index("by_org_id_and_slug", ["orgId", "slug"])
     .index("by_org_id_and_status", ["orgId", "status"])
     .index("by_org_id", ["orgId"]),
@@ -178,20 +180,28 @@ export default defineSchema({
   })
     .index("by_event_id", ["eventId"]),
 
   rounds: defineTable({
     eventId: v.id("events"),
     name: v.string(),
     description: v.optional(v.string()),
     order: v.number(),
     qualifiesToNextRound: v.boolean(),
     scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
+    weight: v.number(),
+    status: v.union(v.literal("open"), v.literal("closed"), v.literal("published")),
+    advancement: v.object({
+      mode: v.union(v.literal("none"), v.literal("top_count"), v.literal("top_percent"), v.literal("manual")),
+      count: v.optional(v.number()),
+      percent: v.optional(v.number()),
+      allowOverride: v.boolean(),
+    }),
   })
     .index("by_event_id", ["eventId"]),
 
   criteria: defineTable({
     roundId: v.id("rounds"),
     name: v.string(),
     description: v.optional(v.string()),
     order: v.number(),
     weight: v.number(),
     minScore: v.number(),
@@ -238,40 +248,135 @@ export default defineSchema({
     eventId: v.id("events"),
     roundId: v.id("rounds"),
     judgeId: v.id("judges"),
     contestantId: v.id("contestants"),
     status: v.union(
       v.literal("not_started"),
       v.literal("in_progress"),
       v.literal("submitted"),
       v.literal("locked"),
     ),
+    draftValues: v.optional(v.record(v.string(), v.number())),
   })
     .index("by_event_id_and_round_id", ["eventId", "roundId"])
     .index("by_judge_id_and_round_id", ["judgeId", "roundId"])
     .index("by_event_id_and_round_id_and_contestant_id", ["eventId", "roundId", "contestantId"]),
 
+  scores: defineTable({
+    sheetId: v.id("scoreSheets"),
+    eventId: v.id("events"),
+    roundId: v.id("rounds"),
+    judgeId: v.id("judges"),
+    contestantId: v.id("contestants"),
+    criterionId: v.id("criteria"),
+    value: v.number(),
+    submittedAt: v.number(),
+    submittedById: v.id("userProfiles"),
+  })
+    .index("by_sheet_id", ["sheetId"])
+    .index("by_event_id_and_round_id", ["eventId", "roundId"])
+    .index("by_event_id_and_round_id_and_contestant_id", ["eventId", "roundId", "contestantId"]),
+
+  resultVersions: defineTable({
+    eventId: v.id("events"),
+    roundId: v.id("rounds"),
+    version: v.number(),
+    snapshot: v.object({
+      computedAt: v.number(),
+      decimalPrecision: v.number(),
+      categories: v.array(v.object({
+        categoryId: v.id("categories"),
+        standings: v.array(v.object({
+          contestantId: v.id("contestants"),
+          status: v.union(v.literal("active"), v.literal("scratched"), v.literal("disqualified")),
+          rank: v.union(v.null(), v.number()),
+          roundScore: v.union(v.null(), v.number()),
+          criterionScores: v.array(v.object({
+            criterionId: v.id("criteria"),
+            avgRaw: v.number(),
+            contribution: v.number(),
+            dropped: v.array(v.object({ judgeId: v.id("judges"), value: v.number() })),
+          })),
+          tieResolvedBy: v.union(v.literal("none"), v.literal("criteria_cascade"), v.literal("judge_firsts"), v.literal("manual")),
+          advanced: v.union(v.null(), v.boolean()),
+        })),
+      })),
+      judgeParticipation: v.array(v.object({
+        judgeId: v.id("judges"),
+        sheetsSubmitted: v.number(),
+        sheetsTotal: v.number(),
+      })),
+      decisions: v.object({
+        tieBreaks: v.array(v.object({
+          tiedContestantIds: v.array(v.id("contestants")),
+          orderedIds: v.array(v.id("contestants")),
+          createdById: v.id("userProfiles"),
+        })),
+        advancementOverrides: v.array(v.object({
+          contestantId: v.id("contestants"),
+          action: v.string(),
+          createdById: v.id("userProfiles"),
+        })),
+      }),
+    }),
+    createdById: v.id("userProfiles"),
+    createdAt: v.number(),
+    reason: v.optional(v.string()),
+  })
+    .index("by_round_id", ["roundId"])
+    .index("by_event_id", ["eventId"]),
+
+  advancementOverrides: defineTable({
+    eventId: v.id("events"),
+    roundId: v.id("rounds"),
+    contestantId: v.id("contestants"),
+    action: v.union(v.literal("force_advance"), v.literal("force_cut")),
+    createdById: v.id("userProfiles"),
+    createdAt: v.number(),
+  })
+    .index("by_round_id", ["roundId"])
+    .index("by_event_id_and_contestant_id", ["eventId", "contestantId"]),
+
+  tieBreaks: defineTable({
+    eventId: v.id("events"),
+    roundId: v.id("rounds"),
+    tiedContestantIds: v.array(v.id("contestants")),
+    orderedIds: v.array(v.id("contestants")),
+    createdById: v.id("userProfiles"),
+    createdAt: v.number(),
+  })
+    .index("by_round_id", ["roundId"])
+    .index("by_event_id", ["eventId"]),
+
   eventTemplates: defineTable({
     orgId: v.optional(v.id("organizations")),
     name: v.string(),
     description: v.string(),
     configSnapshot: v.object({
       decimalPrecision: v.number(),
       resultVisibility: v.union(v.literal("private"), v.literal("organization"), v.literal("public")),
-      scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
+      eliminationEnabled: v.optional(v.boolean()),
+      scoringRules: v.optional(v.object({ dropHighLow: v.boolean() })),
       categories: v.optional(v.array(v.object({ name: v.string(), order: v.number() }))),
       rounds: v.array(
         v.object({
           name: v.string(),
           order: v.number(),
           qualifiesToNextRound: v.boolean(),
           scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
+          weight: v.optional(v.number()),
+          advancement: v.optional(v.object({
+            mode: v.union(v.literal("none"), v.literal("top_count"), v.literal("top_percent"), v.literal("manual")),
+            count: v.optional(v.number()),
+            percent: v.optional(v.number()),
+            allowOverride: v.boolean(),
+          })),
           criteria: v.array(
             v.object({
               name: v.string(),
               order: v.number(),
               weight: v.number(),
               minScore: v.number(),
               maxScore: v.number(),
               decimalPrecision: v.number(),
             }),
           ),
diff --git a/convex/scoring.ts b/convex/scoring.ts
new file mode 100644
index 0000000..e3a8d2f
--- /dev/null
+++ b/convex/scoring.ts
@@ -0,0 +1,191 @@
+import { v } from "convex/values";
+import { mutation, query } from "./_generated/server";
+import type { QueryCtx } from "./_generated/server";
+import type { Doc, Id } from "./_generated/dataModel";
+import { appError, ErrorCode } from "./lib/errors";
+import { loadRound, requireEventPermission, requireJudgeRow, requireReadyEvent } from "./lib/eventAuthz";
+import { writeAudit } from "./lib/audit";
+
+function checkValue(criterion: Doc<"criteria">, value: number): string | null {
+  if (value < criterion.minScore || value > criterion.maxScore) {
+    return `${criterion.name} must be between ${criterion.minScore} and ${criterion.maxScore}`;
+  }
+  const factor = 10 ** criterion.decimalPrecision;
+  if (Math.abs(value * factor - Math.round(value * factor)) > 1e-9) {
+    return `${criterion.name} allows ${criterion.decimalPrecision} decimal(s)`;
+  }
+  return null;
+}
+
+async function loadOwnSheet(
+  ctx: QueryCtx,
+  args: { orgSlug: string; eventSlug: string; sheetId: Id<"scoreSheets"> },
+) {
+  const eactx = await requireReadyEvent(ctx, {
+    orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.enter",
+  });
+  const judge = await requireJudgeRow(ctx, eactx);
+  const sheet = await ctx.db.get(args.sheetId);
+  if (!sheet || sheet.eventId !== eactx.event._id || sheet.judgeId !== judge._id) {
+    throw appError(ErrorCode.NOT_FOUND, "Score sheet not found");
+  }
+  const round = await loadRound(ctx, eactx, sheet.roundId);
+  if (round.status !== "open") {
+    throw appError(ErrorCode.CONFLICT, "Round is not open for scoring");
+  }
+  return { eactx, judge, sheet, round };
+}
+
+export const myAssignments = query({
+  args: { orgSlug: v.string(), eventSlug: v.string() },
+  handler: async (ctx, args) => {
+    const eactx = await requireEventPermission(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.enter",
+    });
+    const judge = await ctx.db
+      .query("judges")
+      .withIndex("by_event_id_and_user_id", (q) => q.eq("eventId", eactx.event._id).eq("userId", eactx.user._id))
+      .unique();
+    if (!judge) return { judgeId: null, rounds: [] };
+    const rounds = await ctx.db
+      .query("rounds")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    const contestants = await ctx.db
+      .query("contestants")
+      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
+      .collect();
+    const out: {
+      roundId: Id<"rounds">;
+      name: string;
+      order: number;
+      status: Doc<"rounds">["status"];
+      sheets: { sheetId: Id<"scoreSheets">; contestantId: Id<"contestants">; contestantName: string; contestantNumber: number; status: Doc<"scoreSheets">["status"] }[];
+    }[] = [];
+    for (const round of [...rounds].sort((a, b) => a.order - b.order)) {
+      const sheets = await ctx.db
+        .query("scoreSheets")
+        .withIndex("by_judge_id_and_round_id", (q) => q.eq("judgeId", judge._id).eq("roundId", round._id))
+        .collect();
+      out.push({
+        roundId: round._id,
+        name: round.name,
+        order: round.order,
+        status: round.status,
+        sheets: sheets.map((s) => {
+          const contestant = contestants.find((k) => k._id === s.contestantId);
+          return {
+            sheetId: s._id,
+            contestantId: s.contestantId,
+            contestantName: contestant?.name ?? "",
+            contestantNumber: contestant?.number ?? 0,
+            status: s.status,
+          };
+        }),
+      });
+    }
+    return { judgeId: judge._id, rounds: out };
+  },
+});
+
+export const sheetDetail = query({
+  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), contestantId: v.id("contestants") },
+  handler: async (ctx, args) => {
+    const eactx = await requireEventPermission(ctx, {
+      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.enter",
+    });
+    const judge = await requireJudgeRow(ctx, eactx);
+    const sheets = await ctx.db
+      .query("scoreSheets")
+      .withIndex("by_event_id_and_round_id_and_contestant_id", (q) =>
+        q.eq("eventId", eactx.event._id).eq("roundId", args.roundId).eq("contestantId", args.contestantId))
+      .collect();
+    const sheet = sheets.find((s) => s.judgeId === judge._id) ?? null;
+    const criteria = await ctx.db
+      .query("criteria")
+      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
+      .collect();
+    const contestant = await ctx.db.get(args.contestantId);
+    return { sheet, criteria: [...criteria].sort((a, b) => a.order - b.order), contestant };
+  },
+});
+
+export const saveDraft = mutation({
+  args: {
+    orgSlug: v.string(), eventSlug: v.string(), sheetId: v.id("scoreSheets"),
+    draftValues: v.record(v.string(), v.number()),
+  },
+  handler: async (ctx, args) => {
+    const { sheet, round } = await loadOwnSheet(ctx, args);
+    if (sheet.status !== "not_started" && sheet.status !== "in_progress") {
+      throw appError(ErrorCode.CONFLICT, "Score sheet is already submitted");
+    }
+    const criteria = await ctx.db
+      .query("criteria")
+      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
+      .collect();
+    for (const [criterionId, value] of Object.entries(args.draftValues)) {
+      const criterion = criteria.find((c) => c._id === criterionId);
+      if (!criterion) throw appError(ErrorCode.VALIDATION_ERROR, "Unknown criterion in draft");
+      const problem = checkValue(criterion, value);
+      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
+    }
+    await ctx.db.patch(args.sheetId, { status: "in_progress", draftValues: args.draftValues });
+  },
+});
+
+export const submitSheet = mutation({
+  args: {
+    orgSlug: v.string(), eventSlug: v.string(), sheetId: v.id("scoreSheets"),
+    values: v.record(v.string(), v.number()),
+  },
+  handler: async (ctx, args) => {
+    const { eactx, judge, sheet, round } = await loadOwnSheet(ctx, args);
+    if (sheet.status !== "not_started" && sheet.status !== "in_progress") {
+      throw appError(ErrorCode.CONFLICT, "Score sheet is already submitted");
+    }
+    const criteria = await ctx.db
+      .query("criteria")
+      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
+      .collect();
+    const assignments = await ctx.db
+      .query("judgeAssignments")
+      .withIndex("by_judge_id", (q) => q.eq("judgeId", judge._id))
+      .collect();
+    const scoped = assignments.filter((a) => a.roundId === undefined || a.roundId === round._id);
+    const scopedCriterionIds = scoped
+      .filter((a) => a.criterionId !== undefined)
+      .map((a) => a.criterionId!);
+    const required = scopedCriterionIds.length > 0
+      ? criteria.filter((c) => scopedCriterionIds.includes(c._id))
+      : criteria;
+    for (const criterion of required) {
+      const value = args.values[criterion._id];
+      if (value === undefined) {
+        throw appError(ErrorCode.VALIDATION_ERROR, `${criterion.name} is missing`);
+      }
+      const problem = checkValue(criterion, value);
+      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
+    }
+    const now = Date.now();
+    for (const criterion of required) {
+      await ctx.db.insert("scores", {
+        sheetId: sheet._id,
+        eventId: eactx.event._id,
+        roundId: round._id,
+        judgeId: judge._id,
+        contestantId: sheet.contestantId,
+        criterionId: criterion._id,
+        value: args.values[criterion._id],
+        submittedAt: now,
+        submittedById: eactx.user._id,
+      });
+    }
+    await ctx.db.patch(sheet._id, { status: "submitted", draftValues: undefined });
+    await writeAudit(ctx, {
+      orgId: eactx.org._id, actorId: eactx.user._id, action: "score.submitted",
+      resourceType: "scoreSheet", resourceId: sheet._id,
+      after: { roundId: round._id, contestantId: sheet.contestantId, criteria: required.length },
+    });
+  },
+});
diff --git a/convex/templates.ts b/convex/templates.ts
index 086b679..0b4ddbd 100644
--- a/convex/templates.ts
+++ b/convex/templates.ts
@@ -28,34 +28,38 @@ export const createFromEvent = mutation({
     const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.create" });
     await requireFeature(ctx, eactx.subscription, "canCreateTemplates");
     const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
     const categories = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
     const roundsWithCriteria = await Promise.all(
       rounds.map(async (r) => ({
         name: r.name,
         order: r.order,
         qualifiesToNextRound: r.qualifiesToNextRound,
         scoringRules: r.scoringRules,
+        weight: r.weight,
+        advancement: r.advancement,
         criteria: await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", r._id)).collect(),
       })),
     );
     const id = await ctx.db.insert("eventTemplates", {
       orgId: eactx.org._id,
       name: args.name.trim(),
       description: args.description ?? "",
       configSnapshot: {
         decimalPrecision: eactx.event.decimalPrecision,
         resultVisibility: eactx.event.resultVisibility,
+        eliminationEnabled: eactx.event.eliminationEnabled,
+        scoringRules: eactx.event.scoringRules,
         categories: categories.map((c) => ({ name: c.name, order: c.order })),
         rounds: roundsWithCriteria.map((r) => ({
           name: r.name, order: r.order, qualifiesToNextRound: r.qualifiesToNextRound,
-          scoringRules: r.scoringRules,
+          scoringRules: r.scoringRules, weight: r.weight, advancement: r.advancement,
           criteria: r.criteria.map((c) => ({
             name: c.name, order: c.order, weight: c.weight,
             minScore: c.minScore, maxScore: c.maxScore, decimalPrecision: c.decimalPrecision,
           })),
         })),
       },
       isSystem: false,
     });
     await writeAudit(ctx, {
       orgId: eactx.org._id, actorId: eactx.user._id, action: "template.created",
diff --git a/docs/superpowers/plans/2026-08-16-phase3-tabulation-engine.md b/docs/superpowers/plans/2026-08-16-phase3-tabulation-engine.md
index bcf9856..5a20c2a 100644
--- a/docs/superpowers/plans/2026-08-16-phase3-tabulation-engine.md
+++ b/docs/superpowers/plans/2026-08-16-phase3-tabulation-engine.md
@@ -3107,20 +3107,22 @@ export const finalizeEvent = mutation({
 (The `summaries.map(({ name, version, ...s })` rest pattern is fine here ΓÇö `s` is used.)
 
 - [ ] **Step 5: Run** `npx vitest run convex-test/publishResults.test.ts` ΓåÆ PASS. Full gate (`typecheck` + `npm test` + `npm run lint`).
 
 - [ ] **Step 6: Commit** ΓÇö `git commit -m "feat: round publish, versioned results, corrections, event finalization"`
 
 ---
 
 ## Task 12: Judge UI ΓÇö scoring home + entry form
 
+> **SUPERSEDED** by `2026-08-16-phase3-ui-ux-modules.md` Tasks 4ΓÇô5 ΓÇö do not execute.
+
 **Files:**
 - Modify: `components/EventShell.tsx`
 - Create: `app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx`
 - Create: `app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx`
 
 **Interfaces:**
 - Consumes: `api.scoring.{myAssignments,sheetDetail,saveDraft,submitSheet}` (Task 8), `api.events.get`.
 - Produces: judge-facing scoring pages. `myAssignments` returning `judgeId: null` (caller is not a judge) renders an empty state.
 
 - [ ] **Step 1: Extend the EventShell nav** ΓÇö in `components/EventShell.tsx`, add to the `nav` array after `Judges`:
@@ -3343,20 +3345,22 @@ npm test
 git add components/EventShell.tsx "app/app/[orgSlug]/events/[eventSlug]/scoring"
 git commit -m "feat: judge scoring home and score entry form"
 ```
 
 Expected: all green (UI-only addition).
 
 ---
 
 ## Task 13: Tabulator UI ΓÇö monitor + review
 
+> **SUPERSEDED** by `2026-08-16-phase3-ui-ux-modules.md` Tasks 6ΓÇô7 ΓÇö do not execute.
+
 **Files:**
 - Create: `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx`
 - Create: `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/review/page.tsx`
 - Modify: `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx` (monitor/review links)
 
 **Interfaces:**
 - Consumes: `api.roundAdmin.{roundMonitor,closeRound,reopenRound,roundReview,addTieBreak,removeTieBreak,addAdvancementOverride,removeAdvancementOverride,publishRound}` (Tasks 9ΓÇô11), `api.rounds.list`, `api.events.get`.
 
 - [ ] **Step 1: Monitor ΓÇö `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx`**
 
@@ -3639,20 +3643,22 @@ npm run lint
 npm run build
 npm test
 git add "app/app/[orgSlug]/events/[eventSlug]/rounds"
 git commit -m "feat: tabulator monitor and review/publish UI"
 ```
 
 ---
 
 ## Task 14: Results UI + config editor extensions
 
+> **SUPERSEDED** by `2026-08-16-phase3-ui-ux-modules.md` Tasks 8ΓÇô9 ΓÇö do not execute.
+
 **Files:**
 - Create: `app/app/[orgSlug]/events/[eventSlug]/results/page.tsx`
 - Modify: `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx` (weight + advancement editor; keeps the Task 13 links)
 - Modify: `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx` (scoring rules section)
 
 **Interfaces:**
 - Consumes: `api.results.{eventResults,roundResults,listRoundVersions,finalizeEvent}` (Task 11), `api.roundAdmin.correctResults`, `api.rounds.{list,add,update}`, `api.events.{get,update}`.
 - Produces: published-results page (round standings + final standings + finalize + correction with required reason); rounds editor with weight + elimination-aware advancement controls (shown only when `eliminationEnabled`); settings page with drop-hi/lo and elimination toggles.
 
 - [ ] **Step 1: Results page ΓÇö `app/app/[orgSlug]/events/[eventSlug]/results/page.tsx`**
diff --git a/vitest.config.ts b/vitest.config.ts
index e98df90..7432a6c 100644
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -1,8 +1,8 @@
 import { defineConfig } from "vitest/config";
 
 export default defineConfig({
   test: {
     environment: "edge-runtime",
-    include: ["convex-test/**/*.test.ts"],
+    include: ["convex-test/**/*.test.ts", "components/**/*.test.ts"],
   },
 });
