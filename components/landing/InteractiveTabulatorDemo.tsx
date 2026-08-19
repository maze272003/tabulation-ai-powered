"use client";

import * as React from "react";
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Award,
  CheckCircle2,
  Clock,
  Sparkles,
  Trophy,
  Users,
  Vote,
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
}

const INITIAL_CONTESTANTS: Contestant[] = [
  {
    id: "c1",
    name: "Elena Rostova",
    entry: "#04 - Symphony of Grace",
    avatar: "ER",
    scores: { criteria1: 96, criteria2: 94, criteria3: 98 },
  },
  {
    id: "c2",
    name: "Marcus Vance",
    entry: "#07 - Midnight Odyssey",
    avatar: "MV",
    scores: { criteria1: 92, criteria2: 95, criteria3: 91 },
  },
  {
    id: "c3",
    name: "Aria Chen",
    entry: "#02 - Echoes of Daylight",
    avatar: "AC",
    scores: { criteria1: 89, criteria2: 90, criteria3: 92 },
  },
];

export function InteractiveTabulatorDemo() {
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
          return {
            ...c,
            scores: {
              ...c.scores,
              [key]: Math.min(100, Math.max(50, val)),
            },
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
      containerClassName="w-full max-w-4xl mx-auto"
    >
      {/* Header bar of simulation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
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

        {/* Live judges status pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {[1, 2, 3].map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => setActiveJudge(j)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
                activeJudge === j
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/60 hover:bg-muted text-muted-foreground border-transparent"
              )}
            >
              <CheckCircle2 className="size-3" />
              <span>Judge {j}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main interactive grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6">
        {/* Left: Judge Scoring Controls */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adjust Contestant Scores
            </span>
            <span className="text-xs text-primary font-medium flex items-center gap-1">
              <Sparkles className="size-3" /> Live Recalculation
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
                  "flex-1 p-2.5 rounded-lg border text-left transition-all",
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
            {/* Criteria 1 */}
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

            {/* Criteria 2 */}
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

            {/* Criteria 3 */}
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
              Instant ranking calculated with tamper-proof audit trails.
            </p>
          </div>
        </div>
      </div>
    </BorderBeamPanel>
  );
}
