"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import {
  Crown,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Radio,
  RotateCcw,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
import { LoadingScreen } from "@/components/LoadingScreen";
import { formatScore } from "@/components/tabulation/status";
import { cn } from "@/lib/utils";

// Canvas confetti generator without external runtime dependencies
function fireCanvasConfetti() {
  if (typeof window === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "99999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles: Array<{
    x: number;
    y: number;
    size: number;
    color: string;
    vx: number;
    vy: number;
    rotation: number;
    vRot: number;
    opacity: number;
  }> = [];

  const colors = ["#f59e0b", "#fbbf24", "#e11d48", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.4 + (Math.random() - 0.5) * 100,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 16,
      vy: Math.random() * -14 - 6,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 12,
      opacity: 1,
    });
  }

  let animationFrame: number;
  const start = Date.now();

  function render() {
    if (!ctx) return;
    const elapsed = Date.now() - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.rotation += p.vRot;
      p.opacity = Math.max(0, 1 - elapsed / 3500);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    if (elapsed < 3500) {
      animationFrame = requestAnimationFrame(render);
    } else {
      canvas.remove();
    }
  }

  animationFrame = requestAnimationFrame(render);
}

interface FlattenedStanding {
  number: number;
  name: string;
  photoUrl: string | null;
  rank: number | null;
  roundScore: number | null;
  advanced: boolean | null;
  categoryName: string;
}

export default function StagePresentationPage({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = use(params);
  const result = useQuery(api.publicResults.get, { eventCode });
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isRevealMode, setIsRevealMode] = useState(false);
  const [revealedRanks, setRevealedRanks] = useState<Set<number>>(new Set());
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
      // Fullscreen fallback
    }
  }

  const round = result && !(result instanceof Error)
    ? result.rounds.find((r) => r.roundId === selectedRound) ?? result.rounds[0]
    : null;

  const categories = result && !(result instanceof Error) ? result.categories : [];
  const activeCategory = selectedCategory ?? (categories[0]?.id || null);

  const standings: FlattenedStanding[] = round
    ? round.categories
        .filter((c) => !activeCategory || c.categoryId === activeCategory)
        .flatMap((c) => {
          const catName = categories.find((cat) => cat.id === c.categoryId)?.name || "General";
          return c.standings.map((s) => ({
            ...s,
            categoryName: catName,
          }));
        })
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    : [];

  const handleRevealNext = useCallback(() => {
    const unrevealedRanks = standings
      .map((s) => s.rank)
      .filter((r): r is number => r !== null && !revealedRanks.has(r))
      .sort((a, b) => b - a);

    if (unrevealedRanks.length > 0) {
      const nextToReveal = unrevealedRanks[0];
      setRevealedRanks((prev) => {
        const next = new Set(prev);
        next.add(nextToReveal);
        return next;
      });

      if (nextToReveal === 1) {
        fireCanvasConfetti();
      }
    }
  }, [standings, revealedRanks]);

  const handleResetReveals = useCallback(() => {
    setRevealedRanks(new Set());
  }, []);

  const handleRevealAll = useCallback(() => {
    const all = new Set<number>();
    for (const s of standings) {
      if (s.rank !== null) all.add(s.rank);
    }
    setRevealedRanks(all);
    fireCanvasConfetti();
  }, [standings]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space" || e.code === "ArrowRight") {
        e.preventDefault();
        handleRevealNext();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleResetReveals();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        handleRevealAll();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setIsRevealMode((prev) => !prev);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRevealNext, handleResetReveals, handleRevealAll]);

  if (result === undefined) return <LoadingScreen label="Connecting to live stage feed…" />;

  if (result === null || result instanceof Error) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8 text-center">
        <Trophy className="size-16 text-amber-500/40 mb-4 animate-pulse" />
        <h1 className="text-3xl font-heading font-bold">Stage Display Offline</h1>
        <p className="text-sm text-slate-400 mt-2 max-w-md">
          Event code <code className="font-mono text-amber-400">{eventCode.toUpperCase()}</code> not found or results are not published yet.
        </p>
      </main>
    );
  }

  const precision = result.event.decimalPrecision ?? 2;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8 selection:bg-amber-500/20 overflow-x-hidden">
      {/* Top Stage Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-amber-500/20 via-primary/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
            <Trophy className="size-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <Radio className="size-3 animate-pulse" />
                Live Stage Feed
              </span>
              <span className="text-xs font-mono text-slate-400">#{eventCode.toUpperCase()}</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold font-heading tracking-tight text-white mt-1">
              {result.event.name}
            </h1>
          </div>
        </div>

        {/* Controls Toolbar */}
        <div className="flex items-center gap-2">
          <Button
            variant={isRevealMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsRevealMode((prev) => !prev)}
            className="gap-2 font-semibold shadow-xs"
          >
            {isRevealMode ? <Sparkles className="size-4 text-amber-300" /> : <Eye className="size-4" />}
            <span>{isRevealMode ? "Suspense Mode (Active)" : "Standard View"}</span>
          </Button>

          {isRevealMode && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevealNext}
                className="gap-1.5 bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
              >
                <Zap className="size-4" />
                <span>Reveal Next (Space)</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetReveals}
                title="Reset reveals (R)"
                className="text-slate-400 hover:text-white"
              >
                <RotateCcw className="size-4" />
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleFullscreen()}
            className="gap-2 border-slate-700 text-slate-300"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </header>

      {/* Category / Round Tabs */}
      <div className="py-4 flex flex-wrap items-center justify-between gap-4">
        {result.rounds.length > 1 && (
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            {result.rounds.map((r) => (
              <button
                key={r.roundId}
                onClick={() => {
                  setSelectedRound(r.roundId);
                  setRevealedRanks(new Set());
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  (selectedRound === r.roundId || (!selectedRound && r === result.rounds[0]))
                    ? "bg-primary text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {categories.length > 1 && (
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setRevealedRanks(new Set());
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  activeCategory === cat.id
                    ? "bg-amber-500 text-slate-950 font-bold shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Presentation Body */}
      <div className="flex-1 my-6">
        {standings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 p-8">
            <Trophy className="size-10 text-slate-600 mb-3" />
            <p className="text-base text-slate-400 font-medium">
              No standings available for this round yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 max-w-5xl mx-auto">
            {standings.map((contestant) => {
              const rank = contestant.rank ?? 999;
              const isRevealed = !isRevealMode || revealedRanks.has(rank);
              const isChampion = rank === 1;
              const isPodium = rank <= 3;

              if (isChampion && isRevealed) {
                return (
                  <BorderBeamPanel
                    key={contestant.number}
                    glow
                    duration={4}
                    borderWidth={2}
                    beamColor="conic-gradient(from 0deg, transparent 0deg, rgba(245, 158, 11, 0.9) 180deg, transparent 360deg)"
                    className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/60 p-6 rounded-2xl flex items-center justify-between gap-4 shadow-2xl transition-all scale-102"
                  >
                    <div className="flex items-center gap-6">
                      <div className="size-16 sm:size-20 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex flex-col items-center justify-center text-amber-300 shadow-lg shadow-amber-500/20">
                        <Crown className="size-6 sm:size-8 animate-bounce text-amber-400" />
                        <span className="text-xs font-black uppercase tracking-wider">Champion</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-amber-500 text-slate-950 font-black text-xs">
                            1ST PLACE
                          </Badge>
                          <span className="font-mono text-sm text-amber-300/80 font-bold">
                            Contestant #{contestant.number}
                          </span>
                        </div>
                        <h2 className="text-2xl sm:text-4xl font-extrabold font-heading text-white mt-1">
                          {contestant.name}
                        </h2>
                        {contestant.categoryName && (
                          <p className="text-xs sm:text-sm text-slate-400 font-medium">
                            {contestant.categoryName}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block">
                        Final Score
                      </span>
                      <div className="text-3xl sm:text-5xl font-black font-mono text-amber-300">
                        {formatScore(contestant.roundScore, precision)}
                      </div>
                    </div>
                  </BorderBeamPanel>
                );
              }

              return (
                <div
                  key={contestant.number}
                  className={cn(
                    "flex items-center justify-between p-4 sm:p-5 rounded-xl border transition-all",
                    isRevealed
                      ? isPodium
                        ? "bg-slate-900/90 border-slate-700 shadow-md"
                        : "bg-slate-900/40 border-slate-800"
                      : "bg-slate-950/80 border-slate-800/60 opacity-60 backdrop-blur-xs"
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Rank Number Badge */}
                    <div
                      className={cn(
                        "size-12 sm:size-14 rounded-xl flex flex-col items-center justify-center font-heading font-black text-lg sm:text-xl shrink-0 border",
                        isRevealed
                          ? rank === 2
                            ? "bg-slate-300/15 border-slate-300/40 text-slate-200"
                            : rank === 3
                            ? "bg-amber-700/15 border-amber-600/40 text-amber-500"
                            : "bg-slate-800 border-slate-700 text-slate-300"
                          : "bg-slate-900 border-slate-800 text-slate-600"
                      )}
                    >
                      {isRevealed ? (
                        <>
                          <span>#{rank}</span>
                        </>
                      ) : (
                        <span>?</span>
                      )}
                    </div>

                    <div>
                      {isRevealed ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-400 font-bold">
                              #{contestant.number}
                            </span>
                            {contestant.categoryName && (
                              <span className="text-[11px] text-slate-500 font-semibold">
                                • {contestant.categoryName}
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg sm:text-2xl font-bold font-heading text-white">
                            {contestant.name}
                          </h3>
                        </>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="h-3 w-20 bg-slate-800 rounded animate-pulse" />
                          <div className="h-5 w-48 bg-slate-800 rounded animate-pulse" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score or Hidden Badge */}
                  <div>
                    {isRevealed ? (
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                          Score
                        </span>
                        <span className="text-xl sm:text-3xl font-mono font-bold text-slate-200">
                          {formatScore(contestant.roundScore, precision)}
                        </span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRevealedRanks((prev) => new Set([...prev, rank]));
                          if (rank === 1) fireCanvasConfetti();
                        }}
                        className="text-xs text-slate-500 hover:text-amber-400 hover:bg-slate-800 gap-1.5 font-mono"
                      >
                        <EyeOff className="size-3.5" />
                        <span>Click to reveal</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Stage Overlay Info */}
      <footer className="pt-6 border-t border-slate-900 flex flex-wrap items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <span>Official Stage Display</span>
          <span>•</span>
          <span>
            OBS Overlay URL:{" "}
            <code className="text-slate-400 font-mono">/stage/{eventCode}/overlay</code>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px]">
            Shortcuts: [Space] Next • [R] Reset • [P] Mode • [F] Fullscreen
          </span>
        </div>
      </footer>
    </main>
  );
}
