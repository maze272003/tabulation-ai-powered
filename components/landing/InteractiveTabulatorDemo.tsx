"use client";

import * as React from "react";
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Award,
  CheckCircle2,
  Clock,
  Crown,
  Eye,
  Hash,
  Lock,
  Monitor,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Contestant {
  id: string;
  name: string;
  entry: string;
  avatar: string;
  scores: {
    criteria1: number; // Vocal Mastery (40%)
    criteria2: number; // Stage Presence (30%)
    criteria3: number; // Musicality (30%)
  };
  judgeBreakdown: [number, number, number]; // Scores from Judge 1, 2, 3
}

const INITIAL_CONTESTANTS: Contestant[] = [
  {
    id: "c1",
    name: "Elena Rostova",
    entry: "#04 - Symphony of Grace",
    avatar: "ER",
    scores: { criteria1: 96, criteria2: 94, criteria3: 98 },
    judgeBreakdown: [96.0, 95.5, 96.8],
  },
  {
    id: "c2",
    name: "Marcus Vance",
    entry: "#07 - Midnight Odyssey",
    avatar: "MV",
    scores: { criteria1: 92, criteria2: 95, criteria3: 91 },
    judgeBreakdown: [92.6, 93.0, 92.4],
  },
  {
    id: "c3",
    name: "Aria Chen",
    entry: "#02 - Echoes of Daylight",
    avatar: "AC",
    scores: { criteria1: 89, criteria2: 90, criteria3: 92 },
    judgeBreakdown: [90.2, 90.0, 90.4],
  },
];

type DemoMode = "judge" | "stage" | "auditor";

export function InteractiveTabulatorDemo() {
  const [mode, setMode] = React.useState<DemoMode>("judge");
  const [contestants, setContestants] = React.useState<Contestant[]>(INITIAL_CONTESTANTS);
  const [activeJudge, setActiveJudge] = React.useState<number>(1);
  const [selectedContestantId, setSelectedContestantId] = React.useState<string>("c1");

  const selectedContestant =
    contestants.find((c) => c.id === selectedContestantId) ?? contestants[0];

  const computeTotal = (c: Contestant) => {
    const total =
      c.scores.criteria1 * 0.4 +
      c.scores.criteria2 * 0.3 +
      c.scores.criteria3 * 0.3;
    return total.toFixed(2);
  };

  const handleScoreChange = (
    key: keyof Contestant["scores"],
    val: number
  ) => {
    setContestants((prev) =>
      prev.map((c) => {
        if (c.id === selectedContestantId) {
          const updated = {
            ...c,
            scores: {
              ...c.scores,
              [key]: Math.min(100, Math.max(50, val)),
            },
          };
          const newAvg = parseFloat(
            (
              updated.scores.criteria1 * 0.4 +
              updated.scores.criteria2 * 0.3 +
              updated.scores.criteria3 * 0.3
            ).toFixed(1)
          );
          return {
            ...updated,
            judgeBreakdown: [
              activeJudge === 1 ? newAvg : c.judgeBreakdown[0],
              activeJudge === 2 ? newAvg : c.judgeBreakdown[1],
              activeJudge === 3 ? newAvg : c.judgeBreakdown[2],
            ],
          };
        }
        return c;
      })
    );
  };

  // Sort contestants by total score descending
  const sorted = [...contestants].sort(
    (a, b) => parseFloat(computeTotal(b)) - parseFloat(computeTotal(a))
  );

  return (
    <BorderBeamPanel
      glow
      className="p-6 md:p-8 bg-card/95 backdrop-blur-md border border-border/70 shadow-2xl"
      containerClassName="w-full max-w-5xl mx-auto"
    >
      {/* Header bar of simulation with Mode Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Trophy className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-bold text-base md:text-lg">
                National Solo Championship 2026
              </h3>
              <Badge className="bg-success-muted text-success border-success/30 text-[10px] px-2 py-0.5">
                ● Live Round
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Finals • 3 Judges Assigned • Real-time Weighted Tabulation
            </p>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-muted/40 p-1 border border-border/60 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setMode("judge")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              mode === "judge"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sliders className="size-3.5 text-primary" />
            <span>Judge Pad</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("stage")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              mode === "stage"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Monitor className="size-3.5 text-amber-500" />
            <span>Stage LED Wall</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("auditor")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              mode === "auditor"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ShieldCheck className="size-3.5 text-emerald-500" />
            <span>Auditor Matrix</span>
          </button>
        </div>
      </div>

      {/* MODE 1: Judge Scoring Pad View */}
      {mode === "judge" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6">
          {/* Left: Judge Scoring Controls */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Judge:
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3].map((j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => setActiveJudge(j)}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-mono font-bold transition-all cursor-pointer",
                        activeJudge === j
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      Judge {j}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-xs text-primary font-medium flex items-center gap-1">
                <Sparkles className="size-3" /> Auto-Saving
              </span>
            </div>

            {/* Contestant selector tabs */}
            <div className="flex gap-2">
              {contestants.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedContestantId(c.id)}
                  className={cn(
                    "flex-1 p-2.5 rounded-lg border text-left transition-all cursor-pointer",
                    selectedContestantId === c.id
                      ? "bg-primary/10 border-primary text-foreground shadow-xs ring-1 ring-primary/20"
                      : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  <p className="text-xs font-semibold truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.entry}</p>
                </button>
              ))}
            </div>

            {/* Criteria Sliders */}
            <div className="space-y-3.5 rounded-lg bg-muted/20 p-4 border border-border/50">
              <div>
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span>Vocal Tone & Technique (40% weight)</span>
                  <span className="font-mono font-bold text-primary">
                    {selectedContestant.scores.criteria1}/100
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={selectedContestant.scores.criteria1}
                  onChange={(e) =>
                    handleScoreChange("criteria1", parseInt(e.target.value))
                  }
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span>Stage Performance & Emotion (30% weight)</span>
                  <span className="font-mono font-bold text-primary">
                    {selectedContestant.scores.criteria2}/100
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={selectedContestant.scores.criteria2}
                  onChange={(e) =>
                    handleScoreChange("criteria2", parseInt(e.target.value))
                  }
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span>Musicality & Timing (30% weight)</span>
                  <span className="font-mono font-bold text-primary">
                    {selectedContestant.scores.criteria3}/100
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={selectedContestant.scores.criteria3}
                  onChange={(e) =>
                    handleScoreChange("criteria3", parseInt(e.target.value))
                  }
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          </div>

          {/* Right: Instant Leaderboard Podium View */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Instant Standings
              </span>
              <Badge variant="outline" className="text-[10px] gap-1">
                <Clock className="size-3 text-warning" /> Auto-synced
              </Badge>
            </div>

            <div className="space-y-2.5">
              {sorted.map((c, idx) => {
                const rank = idx + 1;
                const total = computeTotal(c);
                const isFirst = rank === 1;

                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all",
                      isFirst
                        ? "bg-primary/10 border-primary/40 shadow-xs ring-1 ring-primary/20"
                        : "bg-card border-border/60"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold font-mono",
                          rank === 1
                            ? "bg-amber-500 text-amber-950"
                            : rank === 2
                            ? "bg-slate-300 text-slate-900"
                            : "bg-amber-700/60 text-amber-100"
                        )}
                      >
                        {rank}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {c.entry}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-sm font-extrabold text-foreground">
                        {total}%
                      </span>
                      <p className="text-[10px] text-muted-foreground">Weighted</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
              <p className="text-xs text-muted-foreground">
                Move any slider above to watch live mathematical re-ranking in real time!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: Stage Projector / LED Wall Mode */}
      {mode === "stage" && (
        <div className="pt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Venue Projector / LED Wall Broadcast View
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Full-screen stage graphics revealed live to the audience as winners are announced.
              </p>
            </div>
            <Badge className="bg-amber-500 text-amber-950 font-bold text-xs gap-1">
              <Crown className="size-3.5" /> Stage Podium Live
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-4">
            {/* 2nd Place (Silver) */}
            <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-card p-5 text-center order-2 md:order-1 relative">
              <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm">
                2nd
              </div>
              <h4 className="font-heading font-bold text-base">{sorted[1]?.name}</h4>
              <p className="text-xs text-muted-foreground">{sorted[1]?.entry}</p>
              <div className="mt-3 py-1.5 px-3 rounded-md bg-muted/60 font-mono text-lg font-extrabold text-foreground">
                {computeTotal(sorted[1])}%
              </div>
              <Badge variant="outline" className="mt-2 text-[10px] text-slate-600">
                1st Runner Up
              </Badge>
            </div>

            {/* 1st Place (Gold Champion) */}
            <div className="rounded-xl border-2 border-amber-500 bg-amber-500/10 p-6 text-center order-1 md:order-2 relative shadow-lg ring-2 ring-amber-500/20">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-amber-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                <Crown className="size-3" /> Champion
              </span>
              <div className="mx-auto mb-2 mt-1 flex size-12 items-center justify-center rounded-full bg-amber-500 text-amber-950 font-extrabold text-base shadow-md">
                1st
              </div>
              <h4 className="font-heading font-extrabold text-lg text-foreground">
                {sorted[0]?.name}
              </h4>
              <p className="text-xs text-muted-foreground">{sorted[0]?.entry}</p>
              <div className="mt-3 py-2 px-4 rounded-md bg-amber-500/20 border border-amber-500/40 font-mono text-2xl font-black text-amber-600 dark:text-amber-400">
                {computeTotal(sorted[0])}%
              </div>
              <p className="mt-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                Coronated Grand Winner
              </p>
            </div>

            {/* 3rd Place (Bronze) */}
            <div className="rounded-xl border border-amber-700/40 bg-card p-5 text-center order-3 relative">
              <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-amber-700/20 text-amber-700 dark:text-amber-400 font-bold text-sm">
                3rd
              </div>
              <h4 className="font-heading font-bold text-base">{sorted[2]?.name}</h4>
              <p className="text-xs text-muted-foreground">{sorted[2]?.entry}</p>
              <div className="mt-3 py-1.5 px-3 rounded-md bg-muted/60 font-mono text-lg font-extrabold text-foreground">
                {computeTotal(sorted[2])}%
              </div>
              <Badge variant="outline" className="mt-2 text-[10px] text-amber-700">
                2nd Runner Up
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* MODE 3: Auditor Verification Matrix */}
      {mode === "auditor" && (
        <div className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Audit Committee Verification Ledger
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Immutable record with judge-by-judge scores and cryptographic hash verification.
              </p>
            </div>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-xs font-bold gap-1">
              <ShieldCheck className="size-3.5" /> 100% CPA Verified
            </Badge>
          </div>

          <div className="rounded-xl border border-border/70 overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b border-border/60 text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4 text-left font-semibold">Rank</th>
                    <th className="py-3 px-4 text-left font-semibold">Contestant</th>
                    <th className="py-3 px-3 text-center font-semibold">Judge 1</th>
                    <th className="py-3 px-3 text-center font-semibold">Judge 2</th>
                    <th className="py-3 px-3 text-center font-semibold">Judge 3</th>
                    <th className="py-3 px-4 text-right font-semibold">Final Weighted</th>
                    <th className="py-3 px-4 text-center font-semibold">Audit Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sorted.map((c, idx) => (
                    <tr key={c.id} className="hover:bg-muted/20">
                      <td className="py-3 px-4 font-mono font-bold">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-foreground">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.entry}</p>
                      </td>
                      <td className="py-3 px-3 text-center font-mono">{c.judgeBreakdown[0].toFixed(1)}</td>
                      <td className="py-3 px-3 text-center font-mono">{c.judgeBreakdown[1].toFixed(1)}</td>
                      <td className="py-3 px-3 text-center font-mono">{c.judgeBreakdown[2].toFixed(1)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-primary">
                        {computeTotal(c)}%
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-mono text-[10px] bg-muted/60 px-2 py-0.5 rounded text-muted-foreground flex items-center justify-center gap-1">
                          <Lock className="size-2.5 text-emerald-500" />
                          sha256:7e{c.id}a9b
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </BorderBeamPanel>
  );
}
