"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/LoadingScreen";
import { formatScore } from "@/components/tabulation/status";

const MEDAL_CLASSES = ["bg-amber-400/15", "bg-slate-400/15", "bg-orange-400/15"] as const;

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
      // Fullscreen can be blocked by browser policy; the layout still works windowed.
    }
  }

  if (result === undefined) return <LoadingScreen label="Loading results…" />;

  // Null is the not-found contract for missing, non-public, and archived
  // events; an Error indicates a genuine query failure. Both render the same
  // non-leaking state.
  if (result === null || result instanceof Error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-2xl font-bold">Results not available</h1>
        <p className="text-sm text-muted-foreground">
          This event does not exist or has not made its results public.
        </p>
      </main>
    );
  }

  const round = result.rounds.find((r) => r.roundId === selectedRound) ?? result.rounds[0];
  const primaryColor = result.event.branding.primaryColor;

  return (
    <main
      className={`min-h-screen bg-background p-4 sm:p-8 ${isFullscreen ? "flex flex-col justify-center" : ""}`}
    >
      <div
        className={`animate-page-in stagger-fade mx-auto w-full ${isFullscreen ? "max-w-none" : "max-w-3xl"} space-y-6`}
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1
              className="text-2xl font-bold sm:text-3xl"
              style={primaryColor ? { color: primaryColor } : undefined}
            >
              {result.event.name}
            </h1>
            <p className="text-sm text-muted-foreground">Live results</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            {isFullscreen ? "Exit scoreboard" : "Scoreboard mode"}
          </Button>
        </header>

        {result.rounds.length === 0 ? (
          <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            No results have been published yet. This page updates automatically the moment they are.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rounds">
              {result.rounds.map((r) => (
                <Button
                  key={r.roundId}
                  variant={r.roundId === round?.roundId ? "default" : "outline"}
                  size={isFullscreen ? "lg" : "sm"}
                  role="tab"
                  aria-selected={r.roundId === round?.roundId}
                  onClick={() => setSelectedRound(r.roundId)}
                >
                  {r.name}
                </Button>
              ))}
            </div>

            {round?.categories
              .filter((category) => category.standings.length > 0)
              .map((category) => {
                const categoryName =
                  result.categories.find((c) => c.id === category.categoryId)?.name ?? "Standings";
                return (
                  <section key={category.categoryId} className="space-y-2" aria-label={`${categoryName} standings`}>
                    <h2 className={`font-semibold ${isFullscreen ? "text-3xl" : "text-lg"}`}>{categoryName}</h2>
                    <ol className="overflow-hidden rounded-lg border">
                      {category.standings.map((standing, i) => (
                        <li
                          key={`${standing.number}-${standing.name}`}
                          className={`flex items-center justify-between gap-4 border-b px-4 last:border-b-0 ${
                            isFullscreen ? "py-5 text-2xl" : "py-3 text-sm"
                          } ${i < 3 ? MEDAL_CLASSES[i] : ""}`}
                        >
                          <span className="flex items-center gap-3 font-medium">
                            <span className={`font-mono ${isFullscreen ? "text-3xl" : "text-base"}`}>
                              {standing.rank ?? "—"}
                            </span>
                            <span className="text-muted-foreground">#{standing.number}</span>
                            <span>{standing.name}</span>
                          </span>
                          <span className={`font-mono font-semibold ${isFullscreen ? "text-3xl" : ""}`}>
                            {standing.roundScore === null ? "—" : formatScore(standing.roundScore, 2)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
          </>
        )}
      </div>
    </main>
  );
}
