"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEnterSession } from "@/components/enter/EnterAppShell";
import { RoundIntegrityPanel } from "@/components/enter/RoundIntegrityPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  AlertTriangle,
  Award,
  CheckCircle2,
  CirclePause,
  Loader2,
  TrendingUp,
  XCircle,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function StaffRoundReviewPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const resolvedParams = use(params);
  const roundId = resolvedParams.roundId as Id<"rounds">;
  const { sessionToken } = useEnterSession();
  const router = useRouter();

  const reviewData = useQuery(api.enter.rounds.roundReview, { sessionToken, roundId });
  const publishMutation = useMutation(api.enter.rounds.publishRound);
  const addTieBreakMutation = useMutation(api.enter.rounds.addTieBreak);
  const removeTieBreakMutation = useMutation(api.enter.rounds.removeTieBreak);
  const addOverrideMutation = useMutation(api.enter.rounds.addAdvancementOverride);
  const removeOverrideMutation = useMutation(api.enter.rounds.removeAdvancementOverride);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);

  // Tie break modal state
  const [tieBreakModalOpen, setTieBreakModalOpen] = useState(false);
  const [selectedTie, setSelectedTie] = useState<{ categoryId: Id<"categories">; contestantIds: Id<"contestants">[]; names: string[] } | null>(null);
  const [orderedTieIds, setOrderedTieIds] = useState<Id<"contestants">[]>([]);
  const [isSavingTieBreak, setIsSavingTieBreak] = useState(false);

  // Override modal state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedContestant, setSelectedContestant] = useState<{ id: Id<"contestants">; name: string } | null>(null);
  const [overrideAction, setOverrideAction] = useState<"force_advance" | "force_cut">("force_advance");
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  if (reviewData === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Computing round review standings...</p>
      </div>
    );
  }

  if (reviewData === null) {
    return (
      <div className="max-w-6xl mx-auto animate-in fade-in-50 duration-300">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="py-16 px-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-warning-muted border border-warning/30 flex items-center justify-center">
                <CirclePause className="w-6 h-6 text-warning" aria-hidden />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">Close the round before review</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Review and publishing become available once judging is closed for this round.
              </p>
              <Link
                href={`/enter/staff/rounds/${roundId}/monitor`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 gap-1.5")}
              >
                <ArrowLeft className="w-4 h-4" aria-hidden />
                <span>Go to Live Monitor</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { round, eliminationEnabled, standings, unresolvedTies, tieBreaks, overrides } = reviewData;

  async function handlePublish() {
    setIsPublishing(true);
    try {
      await publishMutation({ sessionToken, roundId });
      toast.success("Round results published successfully!");
      setPublishConfirmOpen(false);
      router.push("/enter/results");
      router.refresh();
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to publish round results.");
    } finally {
      setIsPublishing(false);
    }
  }

  function openTieBreak(tie: { categoryId: Id<"categories">; contestantIds: Id<"contestants">[]; names: string[] }) {
    setSelectedTie(tie);
    setOrderedTieIds([...tie.contestantIds]);
    setTieBreakModalOpen(true);
  }

  async function handleSaveTieBreak() {
    if (!selectedTie) return;
    setIsSavingTieBreak(true);
    try {
      await addTieBreakMutation({
        sessionToken,
        roundId,
        tiedContestantIds: selectedTie.contestantIds,
        orderedIds: orderedTieIds,
      });
      toast.success("Tie break resolved successfully.");
      setTieBreakModalOpen(false);
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to save tie break.");
    } finally {
      setIsSavingTieBreak(false);
    }
  }

  async function handleRemoveTieBreak(tieBreakId: Id<"tieBreaks">) {
    try {
      await removeTieBreakMutation({ sessionToken, tieBreakId });
      toast.success("Tie break removed.");
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to remove tie break.");
    }
  }

  function openOverride(id: Id<"contestants">, name: string) {
    setSelectedContestant({ id, name });
    setOverrideAction("force_advance");
    setOverrideModalOpen(true);
  }

  async function handleSaveOverride() {
    if (!selectedContestant) return;
    setIsSavingOverride(true);
    try {
      await addOverrideMutation({
        sessionToken,
        roundId,
        contestantId: selectedContestant.id,
        action: overrideAction,
      });
      toast.success(`Advancement override applied for ${selectedContestant.name}.`);
      setOverrideModalOpen(false);
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to save override.");
    } finally {
      setIsSavingOverride(false);
    }
  }

  async function handleRemoveOverride(overrideId: Id<"advancementOverrides">) {
    try {
      await removeOverrideMutation({ sessionToken, overrideId });
      toast.success("Override removed.");
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to remove override.");
    }
  }

  const hasUnresolvedTies = unresolvedTies.length > 0;
  const isPublished = (round.status as string) === "published";

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
      {/* Top Navigation & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href={`/enter/staff/rounds/${roundId}/monitor`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground hover:text-foreground w-fit")}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Live Monitor</span>
        </Link>

        <div className="flex items-center gap-3">
          {!isPublished && (
            <Button
              variant="default"
              size="sm"
              disabled={hasUnresolvedTies || isPublishing}
              onClick={() => setPublishConfirmOpen(true)}
              className="gap-2 h-9 font-semibold shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Publish Round Results</span>
            </Button>
          )}

          {isPublished && (
            <Link
              href="/enter/results"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-2 h-9")}
            >
              <Award className="w-4 h-4" />
              <span>View Official Results</span>
            </Link>
          )}
        </div>
      </div>

      {/* Unresolved Ties Alert Banner */}
      {hasUnresolvedTies && (
        <div className="p-4 rounded-xl bg-warning-muted border border-warning/30 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">Unresolved Ties Detected ({unresolvedTies.length})</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                All ties must be broken before you can publish official results for this round.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {unresolvedTies.map((tie: { categoryId: Id<"categories">; contestantIds: Id<"contestants">[]; names: string[] }, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between bg-card p-3 rounded-lg border border-border/60 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground">Tied Contestants:</span>
                  <p className="text-muted-foreground truncate max-w-56">{tie.names.join(", ")}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openTieBreak(tie)}
                  className="h-8 text-xs font-medium"
                >
                  Break Tie
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Round Header */}
      <Card className="border-border/60 shadow-sm bg-gradient-to-r from-card via-card to-muted/30">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono">
                  Round Review
                </Badge>
                <Badge variant={isPublished ? "default" : "secondary"} className="capitalize text-xs">
                  {round.status}
                </Badge>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{round.name} Standings</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-3">
                <span>Advancement: {round.advancement.mode}</span>
                <span>•</span>
                <span>Elimination: {eliminationEnabled ? "Enabled" : "Off"}</span>
              </p>
            </div>

            <div className="flex items-center gap-3 bg-background/80 border border-border/60 p-3 rounded-xl text-xs">
              <div>
                <span className="text-muted-foreground block">Tie Breaks</span>
                <span className="font-bold text-foreground">{tieBreaks.length} applied</span>
              </div>
              <div className="w-px h-6 bg-border/60" />
              <div>
                <span className="text-muted-foreground block">Overrides</span>
                <span className="font-bold text-foreground">{overrides.length} active</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Standings Table */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/20">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            <span>Computed Standings</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Contestant scores calculated using round criteria weights and drop-high-low rules.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground font-semibold">
                <th className="text-center py-3 px-3 w-16">Rank</th>
                <th className="text-left py-3 px-4 min-w-48">Contestant</th>
                <th className="text-right py-3 px-4">Round Score</th>
                <th className="text-center py-3 px-3">Tie Resolution</th>
                {eliminationEnabled && round.qualifiesToNextRound && (
                  <th className="text-center py-3 px-3">Advancement</th>
                )}
                {round.advancement.allowOverride && !isPublished && (
                  <th className="text-right py-3 px-4">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {standings.map((row: { contestantId: Id<"contestants">; contestantName: string; rank: number | null; roundScore: number | null; tieResolvedBy: string; advancement: boolean | null }) => (
                <tr key={row.contestantId} className="hover:bg-muted/20 transition-colors">
                  <td className="text-center py-3 px-3 font-mono font-bold text-foreground">
                    {row.rank ? (
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                          row.rank === 1
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold"
                            : row.rank === 2
                            ? "bg-slate-300/30 text-slate-700 dark:text-slate-200"
                            : row.rank === 3
                            ? "bg-amber-700/20 text-amber-800 dark:text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {row.rank}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-3 px-4 font-semibold text-foreground">
                    {row.contestantName}
                  </td>
                  <td className="text-right py-3 px-4 font-mono font-bold text-foreground">
                    {row.roundScore !== null ? row.roundScore.toFixed(2) : "-"}
                  </td>
                  <td className="text-center py-3 px-3">
                    {row.tieResolvedBy !== "none" ? (
                      <Badge variant="outline" className="text-2xs capitalize">
                        {row.tieResolvedBy.replace("_", " ")}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                  {eliminationEnabled && round.qualifiesToNextRound && (
                    <td className="text-center py-3 px-3">
                      {row.advancement === true ? (
                        <Badge variant="default" className="bg-success hover:bg-success text-success-foreground text-xs">
                          Advances
                        </Badge>
                      ) : row.advancement === false ? (
                        <Badge variant="secondary" className="text-muted-foreground text-xs">
                          Cut
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  {round.advancement.allowOverride && !isPublished && (
                    <td className="text-right py-3 px-4">
                      {overrides.some((o: { contestantId: Id<"contestants"> }) => o.contestantId === row.contestantId) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const o = overrides.find((x: { contestantId: Id<"contestants">; _id: Id<"advancementOverrides"> }) => x.contestantId === row.contestantId);
                            if (o) handleRemoveOverride(o._id);
                          }}
                          className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        >
                          Clear Override
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openOverride(row.contestantId, row.contestantName)}
                          className="h-7 text-xs"
                        >
                          Override
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <RoundIntegrityPanel roundId={roundId} />

      {/* Applied Tie Breaks */}
      {tieBreaks.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="py-3 px-6 border-b border-border/40 bg-muted/20">
            <CardTitle className="text-sm font-semibold">Applied Manual Tie Breaks ({tieBreaks.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {tieBreaks.map((tb: { _id: Id<"tieBreaks">; orderedNames: string[] }) => (
              <div key={tb._id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 text-xs">
                <div>
                  <span className="font-semibold text-foreground">Tie Break Order:</span>
                  <p className="text-muted-foreground">{tb.orderedNames.join(" > ")}</p>
                </div>
                {!isPublished && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveTieBreak(tb._id)}
                    className="h-7 text-destructive hover:bg-destructive/10 gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Publish Confirmation Modal */}
      <Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish Round Results</DialogTitle>
            <DialogDescription>
              Are you ready to publish official results for <span className="font-semibold text-foreground">{round.name}</span>?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 border-y border-border/50 text-sm">
            <p className="text-xs text-muted-foreground">
              Publishing freezes the current standings into an immutable Version 1 snapshot. Subsequent changes require an audited correction reason.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPublishConfirmOpen(false)} disabled={isPublishing}>
              Cancel
            </Button>
            <Button variant="default" onClick={handlePublish} disabled={isPublishing} className="gap-2">
              {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>Publish Official Results</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tie Break Modal */}
      <Dialog open={tieBreakModalOpen} onOpenChange={setTieBreakModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Tie</DialogTitle>
            <DialogDescription>
              Drag or reorder contestants below to establish the official rank order.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 border-y border-border/50">
            {orderedTieIds.map((id, idx) => {
              const name = selectedTie?.names[selectedTie.contestantIds.indexOf(id)] ?? id;
              return (
                <div
                  key={id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs font-mono">#{idx + 1}</span>
                    <span className="text-sm font-semibold">{name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {idx > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          const next = [...orderedTieIds];
                          const temp = next[idx - 1];
                          next[idx - 1] = next[idx];
                          next[idx] = temp;
                          setOrderedTieIds(next);
                        }}
                      >
                        ▲ Up
                      </Button>
                    )}
                    {idx < orderedTieIds.length - 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          const next = [...orderedTieIds];
                          const temp = next[idx + 1];
                          next[idx + 1] = next[idx];
                          next[idx] = temp;
                          setOrderedTieIds(next);
                        }}
                      >
                        ▼ Down
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTieBreakModalOpen(false)} disabled={isSavingTieBreak}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleSaveTieBreak} disabled={isSavingTieBreak}>
              {isSavingTieBreak ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Save Tie Break
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Modal */}
      <Dialog open={overrideModalOpen} onOpenChange={setOverrideModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Advancement Override</DialogTitle>
            <DialogDescription>
              Force advance or force cut <span className="font-semibold text-foreground">{selectedContestant?.name}</span> for this round.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 border-y border-border/50">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOverrideAction("force_advance")}
                className={`p-4 rounded-xl border text-center transition-all ${
                  overrideAction === "force_advance"
                    ? "border-success bg-success-muted text-success font-bold"
                    : "border-border/60 hover:bg-muted"
                }`}
              >
                <TrendingUp className="w-5 h-5 mx-auto mb-1 text-success" />
                <span>Force Advance</span>
              </button>

              <button
                type="button"
                onClick={() => setOverrideAction("force_cut")}
                className={`p-4 rounded-xl border text-center transition-all ${
                  overrideAction === "force_cut"
                    ? "border-destructive bg-destructive/10 text-destructive font-bold"
                    : "border-border/60 hover:bg-muted"
                }`}
              >
                <XCircle className="w-5 h-5 mx-auto mb-1 text-destructive" />
                <span>Force Cut</span>
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOverrideModalOpen(false)} disabled={isSavingOverride}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleSaveOverride} disabled={isSavingOverride}>
              {isSavingOverride ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
