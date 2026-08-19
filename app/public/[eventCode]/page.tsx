"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Award, Maximize2, Minimize2, Sparkles, Trophy } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingScreen } from "@/components/LoadingScreen";
import { formatScore } from "@/components/tabulation/status";
import { cn } from "@/lib/utils";

const MEDAL_STYLES = [
  "bg-amber-500/15 border-amber-500/30 text-amber-500",
  "bg-slate-300/15 border-slate-300/30 text-slate-300",
  "bg-amber-700/15 border-amber-700/30 text-amber-600",
] as const;

export default function PublicResultsPage({ params }: { params: Promise<{ eventCode: string }> }) {
  const { eventCode } = use(params);
  const result = useQuery(api.publicResults.get, { eventCode });
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen policy fallback
    }
  }

  if (result === undefined) return <LoadingScreen label="Loading official results…" />;

  if (result === null || result instanceof Error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center bg-background">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Trophy className="size-7 opacity-40" />
        </div>
        <h1 className="text-xl font-bold font-heading">Results Not Available</h1>
        <p className="text-xs text-muted-foreground max-w-sm">
          This event does not exist or official results have not been published by the organizer.
        </p>
      </main>
    );
  }

  const round = result.rounds.find((r) => r.roundId === selectedRound) ?? result.rounds[0];
  const primaryColor = result.event.branding.primaryColor;

  return (
    <main
      className={cn(
        "min-h-screen bg-background p-4 sm:p-8 transition-colors selection:bg-primary/20",
        isFullscreen && "flex flex-col justify-center bg-slate-950 text-white"
      )}
    >
      <div
        className={cn(
          "animate-page-in mx-auto w-full space-y-6",
          isFullscreen ? "max-w-none px-6" : "max-w-3xl"
        )}
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                Official Standings
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">Code: {eventCode.toUpperCase()}</span>
            </div>
            <h1
              className="text-2xl font-bold font-heading sm:text-3xl tracking-tight"
              style={primaryColor ? { color: primaryColor } : undefined}
            >
              {result.event.name}
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => void toggleFullscreen()} className="gap-2 shadow-xs">
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            <span>{isFullscreen ? "Exit Scoreboard" : "Scoreboard Mode"}</span>
          </Button>
        </header>

        {result.rounds.length === 0 ? (
          <div className="rounded-2xl border border-border/60 p-12 text-center text-sm text-muted-foreground bg-card/60">
            <Trophy className="size-8 mx-auto mb-2 opacity-30 text-primary" />
            <p>No results have been published yet. This page updates live in real time.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Round selection tablist */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Competition Rounds">
              {result.rounds.map((r) => (
                <Button
                  key={r.roundId}
                  variant={r.roundId === round?.roundId ? "default" : "outline"}
                  size={isFullscreen ? "lg" : "sm"}
                  role="tab"
                  aria-selected={r.roundId === round?.roundId}
                  onClick={() => setSelectedRound(r.roundId)}
                  className="font-semibold shadow-xs"
                >
                  {r.name}
                </Button>
              ))}
            </div>

            {round?.categories
              .filter((category) => category.standings.length > 0)
              .map((category) => {
                const categoryName =
                  result.categories.find((c) => c.id === category.categoryId)?.name ?? "Official Standings";
                return (
                  <section key={category.categoryId} className="space-y-3" aria-label={`${categoryName} standings`}>
                    <div className="flex items-center justify-between">
                      <h2 className={cn("font-heading font-bold", isFullscreen ? "text-3xl" : "text-lg")}>
                        {categoryName}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {category.standings.length} Contestants Ranked
                      </span>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm divide-y divide-border/60">
                      {category.standings.map((standing, i) => {
                        const isMedal = i < 3;
                        return (
                          <div
                            key={`${standing.number}-${standing.name}`}
                            className={cn(
                              "flex items-center justify-between gap-4 px-4 sm:px-6 transition-colors",
                              isFullscreen ? "py-5 text-2xl" : "py-3.5 text-sm",
                              i === 0
                                ? "bg-amber-500/10"
                                : i === 1
                                ? "bg-slate-300/10"
                                : i === 2
                                ? "bg-amber-700/10"
                                : "hover:bg-muted/30"
                            )}
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <span
                                className={cn(
                                  "flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold",
                                  i === 0
                                    ? "bg-amber-500 text-amber-950 font-extrabold"
                                    : i === 1
                                    ? "bg-slate-300 text-slate-900 font-extrabold"
                                    : i === 2
                                    ? "bg-amber-700/80 text-white font-extrabold"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {standing.rank ?? "—"}
                              </span>
                              <span className="text-xs font-mono text-muted-foreground font-semibold">
                                #{standing.number}
                              </span>
                              <span className="font-bold truncate text-foreground">{standing.name}</span>
                            </div>

                            <div className="text-right shrink-0">
                              <span className={cn("font-mono font-extrabold text-foreground", isFullscreen ? "text-3xl" : "text-base")}>
                                {standing.roundScore === null ? "—" : formatScore(standing.roundScore, 2)}
                              </span>
                              <span className="block text-[10px] text-muted-foreground">Final Score</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
          </div>
        )}
      </div>
    </main>
  );
}
