"use client";

import { Fragment, use, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowDownRight, ArrowUpRight, CirclePause, Equal, ExternalLink, FastForward, Sparkles, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BlackoutNotice } from "@/components/tabulation/BlackoutNotice";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
import { Num } from "@/components/tabulation/Num";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { tieResolvedByLabel } from "@/components/tabulation/status";

const contestantStatusLabel: Record<string, string> = {
  active: "",
  scratched: "Scratched",
  disqualified: "Disqualified",
};

export default function ReviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string; roundId: string }>;
}) {
  const { orgSlug, eventSlug, roundId } = use(params);
  const router = useRouter();
  const review = useQuery(api.roundAdmin.roundReview, {
    orgSlug,
    eventSlug,
    roundId: roundId as Id<"rounds">,
  });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const categories = useQuery(api.categories.list, { orgSlug, eventSlug });
  const publishRound = useMutation(api.roundAdmin.publishRound);
  const autoAdvance = useMutation(api.roundAdmin.autoAdvanceNextRound);
  const addTieBreak = useMutation(api.roundAdmin.addTieBreak);
  const removeTieBreak = useMutation(api.roundAdmin.removeTieBreak);
  const addOverride = useMutation(api.roundAdmin.addAdvancementOverride);
  const removeOverride = useMutation(api.roundAdmin.removeAdvancementOverride);
  const [positions, setPositions] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [failedTieSignature, setFailedTieSignature] = useState<string | null>(null);
  const tiesRef = useRef<HTMLDivElement>(null);

  const tiedIds = useMemo(
    () => new Set(review ? review.unresolvedTies.flatMap((t) => t.contestantIds) : []),
    [review],
  );
  const overrideByContestant = useMemo(
    () =>
      new Map(
        review ? review.overrides.map((o) => [o.contestantId, o] as const) : [],
      ),
    [review],
  );
  const standingsByCategory = useMemo(() => {
    if (!review) return [];
    const groups = new Map<string, typeof review.standings>();
    for (const row of review.standings) {
      const list = groups.get(row.categoryId) ?? [];
      list.push(row);
      groups.set(row.categoryId, list);
    }
    return [...groups.entries()].map(([categoryId, rows]) => ({
      categoryId,
      name: categories?.find((c) => c._id === categoryId)?.name ?? "Category",
      rows: [...rows].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)),
    }));
  }, [review, categories]);

  const unresolvedTieSignature =
    review ? review.unresolvedTies.map((t) => t.contestantIds.join(",")).join("|") : "";
  const tieError = failedTieSignature !== null && failedTieSignature === unresolvedTieSignature;

  if (review === undefined || ev === undefined) return <TableSkeleton rows={6} cols={5} />;
  if (ev === null) return <ErrorState message="Event not found." />;
  if (review === null) {
    return (
      <EmptyState
        icon={CirclePause}
        title="Close the round before review"
        hint="Review and publish become available once the round is closed."
        action={
          <Link
            className="text-sm underline underline-offset-4"
            href={`/app/${orgSlug}/events/${eventSlug}/rounds/${roundId}/monitor`}
          >
            Go to monitor
          </Link>
        }
      />
    );
  }

  const advancementActive =
    review.eliminationEnabled &&
    review.round.qualifiesToNextRound &&
    review.round.advancement.mode !== "none";
  const allowOverride = advancementActive && review.round.advancement.allowOverride;
  const unresolvedCount = review.unresolvedTies.length;

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    toast.error(data?.message ?? "Action failed.");
  };

  const orderValid = (groupId: string, ids: string[]) => {
    const group = positions[groupId] ?? {};
    const nums = ids.map((id, i) => Number(group[id] ?? String(i + 1)));
    const sorted = [...nums].sort((a, b) => a - b);
    return sorted.every((n, i) => n === i + 1);
  };

  const publish = async () => {
    setBusy(true);
    try {
      await publishRound({ orgSlug, eventSlug, roundId: roundId as Id<"rounds"> });
      toast.success("Results published.");
      router.push(`/app/${orgSlug}/events/${eventSlug}/results`);
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      if (data?.code === "TIES_UNRESOLVED") {
        toast.error("Resolve the highlighted tie groups first.");
        setFailedTieSignature(unresolvedTieSignature);
        tiesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        toast.error(data?.message ?? "Could not publish.");
      }
      setBusy(false);
      setPublishOpen(false);
    }
  };

  const cutDescription = !advancementActive
    ? "no cut"
    : {
        none: "no cut",
        top_count: `top ${review.round.advancement.count ?? 0}`,
        top_percent: `top ${review.round.advancement.percent ?? 0}%`,
        manual: "manual",
      }[review.round.advancement.mode];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{review.round.name} — review</h2>
        <div className="flex flex-wrap items-center gap-2">
          {ev?.eventCode && (
            <Link
              href={`/stage/${ev.eventCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Sparkles className="size-3.5 text-amber-500" />
              <span>Live Stage Display</span>
              <ExternalLink className="size-3 text-muted-foreground" />
            </Link>
          )}

          {review.round.status === "published" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await autoAdvance({
                    orgSlug,
                    eventSlug,
                    roundId: roundId as Id<"rounds">,
                  });
                  toast.success(res.message);
                } catch (err) {
                  onError(err);
                } finally {
                  setBusy(false);
                }
              }}
              className="gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/10"
            >
              <FastForward className="size-3.5" />
              <span>Auto-Advance to Next Round</span>
            </Button>
          )}

          {unresolvedCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-lg bg-warning-muted px-2 py-1 text-xs font-medium text-warning">
              <Equal aria-hidden className="size-3.5" />
              <Num value={unresolvedCount} /> unresolved tie{unresolvedCount === 1 ? "" : "s"}
            </span>
          )}
          {review.round.status !== "published" && (
            <Button onClick={() => setPublishOpen(true)} disabled={busy || unresolvedCount > 0}>
              Publish results
            </Button>
          )}
        </div>
      </div>

      <BlackoutNotice />

      {standingsByCategory.map((group) => (
        <section key={group.categoryId} className="space-y-2" aria-label={group.name}>
          <h3 className="text-sm font-medium">{group.name}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{group.name} standings</caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1">Rank</th>
                  <th>Contestant</th>
                  <th>Score</th>
                  <th>Resolved by</th>
                  {advancementActive && <th>Advances</th>}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, i) => {
                  const next = group.rows[i + 1];
                  const showCutLine =
                    advancementActive &&
                    row.advancement === true &&
                    next !== undefined &&
                    next.advancement === false;
                  const override = overrideByContestant.get(row.contestantId);
                  return (
                    <Fragment key={row.contestantId}>
                      <tr
                        className={
                          tiedIds.has(row.contestantId)
                            ? tieError
                              ? "border-t bg-destructive/10"
                              : "border-t bg-warning-muted"
                            : "border-t"
                        }
                      >
                        <td className="py-1">
                          <Num value={row.rank} />
                        </td>
                        <td>
                          {row.contestantName}
                          {row.status !== "active" && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {contestantStatusLabel[row.status]}
                            </span>
                          )}
                          {override && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded border border-warning/50 px-1.5 py-0.5 text-xs text-warning">
                              Override: {override.action === "force_advance" ? "advance" : "cut"}
                              <button
                                type="button"
                                aria-label={`Remove override for ${row.contestantName}`}
                                disabled={busy}
                                onClick={async () => {
                                  try {
                                    await removeOverride({
                                      orgSlug,
                                      eventSlug,
                                      overrideId: override._id,
                                    });
                                  } catch (err) {
                                    onError(err);
                                  }
                                }}
                              >
                                <X aria-hidden className="size-3" />
                              </button>
                            </span>
                          )}
                        </td>
                        <td>
                          <Num value={row.roundScore} precision={ev.decimalPrecision} />
                        </td>
                        <td className="text-muted-foreground">
                          {tieResolvedByLabel[row.tieResolvedBy] ?? "—"}
                        </td>
                        {advancementActive && (
                          <td>
                            <span
                              className={
                                row.advancement === true
                                  ? "flex items-center gap-1 font-medium text-success"
                                  : "flex items-center gap-1 text-muted-foreground"
                              }
                            >
                              {row.advancement === null ? (
                                "—"
                              ) : row.advancement ? (
                                <>
                                  <ArrowUpRight aria-hidden className="size-3.5" />
                                  Advances
                                </>
                              ) : (
                                <>
                                  <ArrowDownRight aria-hidden className="size-3.5" />
                                  Cut
                                </>
                              )}
                            </span>
                            {allowOverride && !override && (
                              <span className="ml-2 flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  disabled={busy}
                                  onClick={async () => {
                                    try {
                                      await addOverride({
                                        orgSlug,
                                        eventSlug,
                                        roundId: roundId as Id<"rounds">,
                                        contestantId: row.contestantId,
                                        action: "force_advance",
                                      });
                                    } catch (err) {
                                      onError(err);
                                    }
                                  }}
                                >
                                  Force advance
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  disabled={busy}
                                  onClick={async () => {
                                    try {
                                      await addOverride({
                                        orgSlug,
                                        eventSlug,
                                        roundId: roundId as Id<"rounds">,
                                        contestantId: row.contestantId,
                                        action: "force_cut",
                                      });
                                    } catch (err) {
                                      onError(err);
                                    }
                                  }}
                                >
                                  Force cut
                                </Button>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                      {showCutLine && (
                        <tr className="border-t">
                          <td colSpan={advancementActive ? 5 : 4} className="py-1">
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span aria-hidden className="h-px flex-1 bg-border" />
                              advances: {cutDescription}
                              <span aria-hidden className="h-px flex-1 bg-border" />
                            </span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <div ref={tiesRef} className="space-y-4">
        {review.unresolvedTies.length > 0 && (
          <div
            className={`space-y-3 rounded-lg border p-4 ${
              tieError ? "border-destructive" : "border-warning/50"
            }`}
          >
            <h3 className={`font-medium ${tieError ? "text-destructive" : "text-warning"}`}>
              Unresolved ties — set the final order (1 = first)
            </h3>
            {review.unresolvedTies.map((tie) => {
              const groupId = tie.contestantIds.join(",");
              return (
                <div key={groupId} className="space-y-2">
                  <div className="flex flex-wrap gap-3">
                    {tie.contestantIds.map((id, i) => (
                      <label key={id} className="flex items-center gap-1 text-sm">
                        <Input
                          className="w-16"
                          type="number"
                          min={1}
                          max={tie.contestantIds.length}
                          aria-label={`Position of ${tie.names[i]}`}
                          value={positions[groupId]?.[id] ?? String(i + 1)}
                          onChange={(e) =>
                            setPositions({
                              ...positions,
                              [groupId]: { ...positions[groupId], [id]: e.target.value },
                            })
                          }
                        />
                        {tie.names[i]}
                      </label>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    disabled={busy || !orderValid(groupId, tie.contestantIds)}
                    onClick={async () => {
                      const group = positions[groupId] ?? {};
                      const ordered = [...tie.contestantIds].sort(
                        (a, b) =>
                          Number(group[a] ?? String(tie.contestantIds.indexOf(a) + 1)) -
                          Number(group[b] ?? String(tie.contestantIds.indexOf(b) + 1)),
                      );
                      try {
                        await addTieBreak({
                          orgSlug,
                          eventSlug,
                          roundId: roundId as Id<"rounds">,
                          tiedContestantIds: tie.contestantIds,
                          orderedIds: ordered,
                        });
                        setPositions((prev) => {
                          const next = { ...prev };
                          delete next[groupId];
                          return next;
                        });
                      } catch (err) {
                        onError(err);
                      }
                    }}
                  >
                    Save tie break
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {review.tieBreaks.length > 0 && (
          <div className="space-y-2 rounded-lg border p-4">
            <h3 className="font-medium">Manual tie breaks</h3>
            <ul className="space-y-1 text-sm">
              {review.tieBreaks.map((tb) => (
                <li key={tb._id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {tb.orderedIds
                      .map(
                        (id) =>
                          review.standings.find((s) => s.contestantId === id)
                            ?.contestantName ?? "—",
                      )
                      .join(" › ")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await removeTieBreak({ orgSlug, eventSlug, tieBreakId: tb._id });
                      } catch (err) {
                        onError(err);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={`Publish results for ${review.round.name}`}
        description={`${standingsByCategory.length} categories · ${review.standings.length} contestants · ${review.tieBreaks.length} manual tie breaks · cut: ${cutDescription}${
          review.overrides.length > 0 ? ` · ${review.overrides.length} override(s)` : ""
        }. Scores become permanent.`}
        confirmLabel="Publish results"
        busy={busy}
        onConfirm={publish}
      />
    </div>
  );
}
