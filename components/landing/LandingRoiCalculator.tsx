"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Clock,
  FileCheck2,
  Leaf,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function LandingRoiCalculator() {
  const [contestants, setContestants] = React.useState<number>(24);
  const [judges, setJudges] = React.useState<number>(5);
  const [rounds, setRounds] = React.useState<number>(3);

  // Math models
  const totalScores = contestants * judges * rounds;
  // Manual time: ~45 seconds per score sheet manual verification, double tally, cross check
  const manualMinutes = Math.round((totalScores * 45) / 60);
  const manualHours = (manualMinutes / 60).toFixed(1);

  // Paper sheets: 1 per judge per contestant per round + tally summary sheets
  const paperSheets = totalScores + judges * rounds + rounds * 3;

  return (
    <section id="roi-calculator" className="relative border-b border-border/60 bg-muted/20 py-24 md:py-32 overflow-hidden">
      {/* Background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[600px] rounded-full bg-primary/10 blur-3xl opacity-60"
      />

      <div className="relative mx-auto w-full max-w-5xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Badge
            variant="outline"
            className="mb-4 gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary"
          >
            <Calculator className="size-3.5" />
            Interactive Impact Estimator
          </Badge>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl text-balance">
            Calculate your hours saved & risk reduction
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base leading-relaxed">
            See the direct time, paper, and stress savings Tabulation AI delivers
            for your upcoming event scale.
          </p>
        </div>

        {/* Calculator Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-10 shadow-xl shadow-primary/5 backdrop-blur-md">
          <div className="grid gap-10 lg:grid-cols-12 items-center">
            {/* Left Controls: Sliders */}
            <div className="space-y-6 lg:col-span-6">
              {/* Contestants Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="text-foreground flex items-center gap-1.5">
                    Contestants / Participants
                  </span>
                  <span className="font-mono text-sm text-primary font-bold bg-primary/10 px-2.5 py-0.5 rounded-md border border-primary/20">
                    {contestants} contestants
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="60"
                  step="2"
                  value={contestants}
                  onChange={(e) => setContestants(parseInt(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>6 (Small Contest)</span>
                  <span>30 (Regional)</span>
                  <span>60 (Major Pageant)</span>
                </div>
              </div>

              {/* Judges Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="text-foreground flex items-center gap-1.5">
                    Panel of Judges
                  </span>
                  <span className="font-mono text-sm text-primary font-bold bg-primary/10 px-2.5 py-0.5 rounded-md border border-primary/20">
                    {judges} judges
                  </span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="11"
                  step="1"
                  value={judges}
                  onChange={(e) => setJudges(parseInt(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>3 judges</span>
                  <span>7 judges</span>
                  <span>11 judges</span>
                </div>
              </div>

              {/* Rounds Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="text-foreground flex items-center gap-1.5">
                    Scoring Rounds / Segments
                  </span>
                  <span className="font-mono text-sm text-primary font-bold bg-primary/10 px-2.5 py-0.5 rounded-md border border-primary/20">
                    {rounds} rounds
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={rounds}
                  onChange={(e) => setRounds(parseInt(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>1 (Single Round)</span>
                  <span>3 (Prelims, Semis, Finals)</span>
                  <span>5 (Full Festival)</span>
                </div>
              </div>
            </div>

            {/* Right: Calculated Metrics Box */}
            <div className="lg:col-span-6 flex flex-col justify-between rounded-xl bg-gradient-to-br from-primary/10 via-card to-background p-6 sm:p-7 border border-primary/20">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Projected Savings & Accuracy
                  </span>
                  <Badge variant="outline" className="text-[10px] border-success/40 text-success bg-success-muted/50 gap-1">
                    <Sparkles className="size-3" /> Live Projection
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Metric 1: Hours Saved */}
                  <div className="rounded-lg bg-card/80 p-3.5 border border-border/60 shadow-xs">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Clock className="size-3.5 text-primary" />
                      <span>Tally Time Saved</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-heading text-2xl sm:text-3xl font-extrabold text-foreground">
                        {manualHours}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">hrs</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      From {manualMinutes}m down to &lt; 2s
                    </p>
                  </div>

                  {/* Metric 2: Error Risk Reduction */}
                  <div className="rounded-lg bg-card/80 p-3.5 border border-border/60 shadow-xs">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <ShieldCheck className="size-3.5 text-emerald-500" />
                      <span>Math Precision</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-heading text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                        100%
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Zero human tabulation errors
                    </p>
                  </div>

                  {/* Metric 3: Total Marks Calculated */}
                  <div className="rounded-lg bg-card/80 p-3.5 border border-border/60 shadow-xs">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <FileCheck2 className="size-3.5 text-sky-500" />
                      <span>Scores Processed</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-heading text-2xl sm:text-3xl font-extrabold text-foreground">
                        {totalScores}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">marks</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Synchronized concurrently
                    </p>
                  </div>

                  {/* Metric 4: Paper eliminated */}
                  <div className="rounded-lg bg-card/80 p-3.5 border border-border/60 shadow-xs">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Leaf className="size-3.5 text-emerald-500" />
                      <span>Paper Saved</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-heading text-2xl sm:text-3xl font-extrabold text-foreground">
                        {paperSheets}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">sheets</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      100% digital & eco-friendly
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-4 border-t border-border/60">
                <Button
                  size="default"
                  render={<Link href="/sign-in" />}
                  className="w-full font-bold text-xs gap-2 shadow-sm shadow-primary/20"
                >
                  Configure This {contestants}-Contestant Event Now
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
