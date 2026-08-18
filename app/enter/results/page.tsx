"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEnterSession } from "@/components/enter/EnterAppShell";
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
  Trophy,
  Lock,
  Loader2,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface FinalStandingRow {
  contestantId: Id<"contestants">;
  contestantName: string;
  rank: number;
  totalScore: number;
  eliminatedInRoundOrder: number | null;
}

interface RoundStandingRow {
  contestantId: Id<"contestants">;
  contestantName: string;
  rank: number | null;
  roundScore: number | null;
}

interface RoundResultTab {
  roundId: Id<"rounds">;
  name: string;
  weight: number;
  version: number | undefined;
  standings: RoundStandingRow[];
}

export default function EnterResultsPage() {
  const { sessionToken, session } = useEnterSession();
  const { account, event } = session;

  const resultsData = useQuery(api.enter.results.eventResults, { sessionToken });
  const finalizeMutation = useMutation(api.enter.results.finalizeEvent);

  const [activeTab, setActiveTab] = useState<"final" | string>("final");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);

  if (resultsData === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Calculating official standings...</p>
      </div>
    );
  }

  const { rounds, final } = resultsData as { rounds: RoundResultTab[]; final: FinalStandingRow[] };
  const isFinalized = event.status === "finalized";
  const allRoundsPublished = rounds.length > 0 && !rounds.some((r) => r.version === undefined);

  async function handleFinalize() {
    setIsFinalizing(true);
    try {
      await finalizeMutation({ sessionToken });
      toast.success("Event officially finalized! All standings are locked.");
      setFinalizeConfirmOpen(false);
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to finalize event.");
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/enter"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground hover:text-foreground w-fit")}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>

        {account.kind === "staff" && !isFinalized && (
          <Button
            variant="default"
            size="sm"
            onClick={() => setFinalizeConfirmOpen(true)}
            disabled={!allRoundsPublished || isFinalizing}
            className="gap-2 h-9 font-semibold shadow-xs"
          >
            <Lock className="w-4 h-4" />
            <span>Finalize Event</span>
          </Button>
        )}
      </div>

      {/* Banner */}
      <Card className="border-border/60 shadow-sm bg-gradient-to-r from-warning/10 via-warning/5 to-muted border-warning/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono">
                  Official Results
                </Badge>
                {isFinalized ? (
                  <Badge variant="default" className="bg-success hover:bg-success text-success-foreground text-xs">
                    Event Finalized
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    In Progress
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{event.name} Standings</h1>
              <p className="text-xs text-muted-foreground">
                Official aggregated and weighted scores across all published rounds.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-background/80 border border-border/60 p-3 rounded-xl">
              <Trophy className="w-6 h-6 text-warning" />
              <div>
                <span className="text-2xs uppercase font-semibold text-muted-foreground block">
                  Top Contestant
                </span>
                <span className="font-bold text-sm text-foreground">
                  {final.length > 0 ? final[0].contestantName : "TBD"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-border/60">
        <button
          type="button"
          onClick={() => setActiveTab("final")}
          className={`flex items-center gap-2 py-2 px-4 rounded-lg font-medium text-xs transition-all ${
            activeTab === "final"
              ? "bg-primary text-primary-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>Final Standings</span>
        </button>

        {rounds.map((round) => (
          <button
            key={round.roundId}
            type="button"
            onClick={() => setActiveTab(round.roundId)}
            className={`flex items-center gap-2 py-2 px-4 rounded-lg font-medium text-xs transition-all whitespace-nowrap ${
              activeTab === round.roundId
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{round.name} (v{round.version})</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Overall Final Standings */}
      {activeTab === "final" && (
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/20">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-warning" />
              <span>Weighted Final Standings</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Weighted composite standings computed according to configured round percentages.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground font-semibold">
                  <th className="text-center py-3 px-3 w-16">Rank</th>
                  <th className="text-left py-3 px-4">Contestant</th>
                  <th className="text-right py-3 px-4">Cumulative Score</th>
                  <th className="text-center py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {final.map((row) => (
                  <tr key={row.contestantId} className="hover:bg-muted/20 transition-colors">
                    <td className="text-center py-3 px-3 font-mono font-bold text-foreground">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                          row.rank === 1
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold"
                            : row.rank === 2
                            ? "bg-slate-300/30 text-slate-700 dark:text-slate-200 font-semibold"
                            : row.rank === 3
                            ? "bg-amber-700/20 text-amber-800 dark:text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {row.rank}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">{row.contestantName}</td>
                    <td className="text-right py-3 px-4 font-mono font-bold text-foreground">
                      {row.totalScore.toFixed(2)} pts
                    </td>
                    <td className="text-center py-3 px-3">
                      {row.eliminatedInRoundOrder !== null ? (
                        <Badge variant="secondary" className="text-2xs">
                          Eliminated (R{row.eliminatedInRoundOrder})
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-2xs text-success border-success/30">
                          Active
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Tab 2+: Round-by-Round Breakdown */}
      {rounds.map((round) => {
        if (activeTab !== round.roundId) return null;

        return (
          <Card key={round.roundId} className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">{round.name} Standings</CardTitle>
                  <CardDescription className="text-xs">
                    Round weight: {round.weight}% • Snapshot Version {round.version}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  v{round.version}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground font-semibold">
                    <th className="text-center py-3 px-3 w-16">Rank</th>
                    <th className="text-left py-3 px-4">Contestant</th>
                    <th className="text-right py-3 px-4">Round Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {round.standings.map((row) => (
                    <tr key={row.contestantId} className="hover:bg-muted/20 transition-colors">
                      <td className="text-center py-3 px-3 font-mono font-bold text-foreground">
                        {row.rank ?? "-"}
                      </td>
                      <td className="py-3 px-4 font-semibold text-foreground">{row.contestantName}</td>
                      <td className="text-right py-3 px-4 font-mono font-bold text-foreground">
                        {row.roundScore !== null ? row.roundScore.toFixed(2) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}

      {/* Finalize Confirmation Modal */}
      <Dialog open={finalizeConfirmOpen} onOpenChange={setFinalizeConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Finalize Event</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently finalize <span className="font-semibold text-foreground">{event.name}</span>?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 border-y border-border/50 text-sm">
            <p className="text-xs text-muted-foreground">
              Finalizing seals the event results. All rounds must be published and no further corrections can be made without administrator unlock.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFinalizeConfirmOpen(false)} disabled={isFinalizing}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleFinalize} disabled={isFinalizing} className="gap-2">
              {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>Confirm & Finalize</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
