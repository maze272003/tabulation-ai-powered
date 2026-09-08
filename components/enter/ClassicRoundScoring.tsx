"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/tabulation/StatusBadge";
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
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle2,
  Lock,
  FileText,
  Loader2,
  Trophy,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { BondPaperScoreSheetProps, BondPaperContestantItem } from "./BondPaperScoreSheet";

interface ClassicRoundScoringProps {
  sessionToken: string;
  roundId: Id<"rounds">;
  initialSheetId?: Id<"scoreSheets">;
  data: BondPaperScoreSheetProps["data"];
  onSwitchToBondPaper: () => void;
}

export function ClassicRoundScoring({
  sessionToken,
  roundId,
  initialSheetId,
  data,
  onSwitchToBondPaper,
}: ClassicRoundScoringProps) {
  const router = useRouter();
  const { event, judge, round, criteria, contestants, isRoundClosed } = data;

  const saveDraftMutation = useMutation(api.enter.scoring.saveDraft);
  const submitSheetMutation = useMutation(api.enter.scoring.submitSheet);

  // Active contestant index
  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    if (initialSheetId) {
      const idx = contestants.findIndex((c) => c.sheet._id === initialSheetId);
      if (idx !== -1) return idx;
    }
    return 0;
  });

  const activeItem: BondPaperContestantItem | undefined = contestants[selectedIndex];

  // Store scores per sheet
  const [scoresBySheet, setScoresBySheet] = useState<Record<string, Record<string, number | "">>>(() => {
    const init: Record<string, Record<string, number | "">> = {};
    for (const item of contestants) {
      const vals: Record<string, number | ""> = {};
      if (item.isImmutable && item.scores) {
        for (const s of item.scores) {
          vals[s.criterionId] = s.value;
        }
      } else if (item.sheet.draftValues) {
        for (const [k, v] of Object.entries(item.sheet.draftValues)) {
          vals[k] = v as number;
        }
      }
      init[item.sheet._id] = vals;
    }
    return init;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activeSheetId = activeItem?.sheet._id;
  const activeValues = (activeSheetId ? scoresBySheet[activeSheetId] : {}) ?? {};

  // Score validation for active contestant
  const { validationErrors, totalScore, isComplete } = useMemo(() => {
    const errs: Record<string, string> = {};
    let sum = 0;
    let complete = true;

    for (const c of criteria) {
      const val = activeValues[c._id];
      if (val === undefined || val === "") {
        complete = false;
        continue;
      }

      const num = Number(val);
      if (isNaN(num)) {
        errs[c._id] = "Must be a valid number";
        complete = false;
      } else if (num < c.minScore) {
        errs[c._id] = `Score cannot be less than ${c.minScore}`;
        complete = false;
      } else if (num > c.maxScore) {
        errs[c._id] = `Score cannot exceed ${c.maxScore}`;
        complete = false;
      } else {
        const factor = 10 ** (c.decimalPrecision ?? 0);
        if (Math.abs(num * factor - Math.round(num * factor)) > 1e-6) {
          errs[c._id] =
            c.decimalPrecision === 0
              ? "Must be a whole number"
              : `At most ${c.decimalPrecision} decimal place${c.decimalPrecision === 1 ? "" : "s"}`;
          complete = false;
        } else {
          sum += num;
        }
      }
    }

    return {
      validationErrors: errs,
      totalScore: sum,
      isComplete: complete && Object.keys(errs).length === 0,
    };
  }, [criteria, activeValues]);

  const handleScoreChange = (criterionId: string, valStr: string) => {
    if (!activeSheetId || activeItem?.isImmutable) return;

    const num = valStr === "" ? "" : parseFloat(valStr);
    setScoresBySheet((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...(prev[activeSheetId] ?? {}),
        [criterionId]: isNaN(num as number) ? "" : num,
      },
    }));
  };

  const handleSaveDraft = async () => {
    if (!activeSheetId || activeItem?.isImmutable) return;
    setIsSaving(true);
    try {
      const payload: Record<string, number> = {};
      for (const [k, v] of Object.entries(activeValues)) {
        if (v !== "" && typeof v === "number" && !isNaN(v)) {
          payload[k] = v;
        }
      }
      await saveDraftMutation({
        sessionToken,
        sheetId: activeSheetId,
        draftValues: payload,
      });
      toast.success(`Draft scores saved for ${activeItem?.contestant.name}.`);
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to save draft.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeSheetId || activeItem?.isImmutable) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, number> = {};
      for (const c of criteria) {
        const val = activeValues[c._id];
        if (val === undefined || val === "" || typeof val !== "number") {
          toast.error(`Please provide a score for ${c.name}.`);
          setIsSubmitting(false);
          return;
        }
        payload[c._id] = val;
      }

      await submitSheetMutation({
        sessionToken,
        sheetId: activeSheetId,
        values: payload,
      });

      toast.success(`Official scores locked for ${activeItem?.contestant.name}.`);
      setConfirmOpen(false);

      // Auto-advance to next incomplete contestant if available
      const nextIncomplete = contestants.findIndex(
        (c, idx) => idx > selectedIndex && !c.isImmutable,
      );
      if (nextIncomplete !== -1) {
        setSelectedIndex(nextIncomplete);
      }
      router.refresh();
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to submit scores.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeItem) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">No contestants assigned in this round.</p>
        <Button onClick={onSwitchToBondPaper} className="mt-4">
          Switch to Bond Paper View
        </Button>
      </div>
    );
  }

  const completedCount = contestants.filter((c) => c.isImmutable).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation and Layout Switcher Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/70 shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/enter"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "gap-1.5 text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          <div className="h-4 w-px bg-border/60" />
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{round.name}</span>
            <Badge variant="outline" className="text-xs font-mono">
              {completedCount}/{contestants.length} Locked
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Switcher Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onSwitchToBondPaper}
            className="gap-1.5 h-8 text-xs font-bold border-primary/30 text-primary hover:bg-primary/5"
            title="Switch to All-Contestants Bond Paper Tabulation Sheet"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Switch to Bond Paper Sheet</span>
          </Button>
        </div>
      </div>

      {/* Contestant Strip Carousel / Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {contestants.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          const isLocked = item.isImmutable;
          return (
            <button
              key={item.sheet._id}
              type="button"
              onClick={() => setSelectedIndex(idx)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium whitespace-nowrap transition-all shrink-0",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : isLocked
                  ? "bg-muted/60 text-muted-foreground border-border/50 hover:bg-muted"
                  : "bg-card text-foreground border-border/70 hover:border-primary/50",
              )}
            >
              <span className="font-mono font-bold">#{item.contestant.number}</span>
              <span className="max-w-[120px] truncate">{item.contestant.name}</span>
              {isLocked ? (
                <Lock className="w-3 h-3 opacity-70 shrink-0" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active Contestant Card Header */}
      <Card className="border-border/60 shadow-sm bg-gradient-to-r from-card via-card to-muted/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-sm px-2.5 py-0.5 font-bold">
                  #{activeItem.contestant.number}
                </Badge>
                {activeItem.category && (
                  <Badge variant="secondary" className="text-xs">
                    {activeItem.category.name}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground font-mono">
                  Contestant {selectedIndex + 1} of {contestants.length}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {activeItem.contestant.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                Round {round.order}: {round.name} • Assigned Judge: {judge.displayName}
              </p>
            </div>

            {/* Total Score Summary Pill */}
            <div className="flex flex-col items-center sm:items-end justify-center bg-background/90 border border-border/60 px-5 py-3 rounded-xl shadow-2xs min-w-[130px]">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Total Score
              </span>
              <span className="text-2xl font-extrabold text-primary font-mono">
                {totalScore.toFixed(event.decimalPrecision)}
              </span>
            </div>
          </div>

          {activeItem.isImmutable && (
            <div className="mt-4 p-3 rounded-lg bg-muted/60 border border-border/50 text-xs text-muted-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-warning shrink-0" />
              <span>This sheet is submitted and locked. Scores cannot be modified.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criteria Scoring Form Cards */}
      <div className="space-y-4">
        {criteria.map((criterion: Doc<"criteria">, idx: number) => {
          const val = activeValues[criterion._id] ?? "";
          const error = validationErrors[criterion._id];

          return (
            <Card
              key={criterion._id}
              className={`border-border/60 shadow-2xs transition-all ${
                error ? "border-destructive/60" : "hover:border-primary/40"
              }`}
            >
              <CardHeader className="pb-3 pt-5 px-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-muted-foreground">
                        {idx + 1}.
                      </span>
                      <CardTitle className="text-base font-bold text-foreground">
                        {criterion.name}
                      </CardTitle>
                      <Badge variant="outline" className="text-2xs font-mono">
                        Weight: {criterion.weight}%
                      </Badge>
                    </div>
                    {criterion.description && (
                      <CardDescription className="text-xs">
                        {criterion.description}
                      </CardDescription>
                    )}
                  </div>

                  <Badge variant="secondary" className="text-xs shrink-0 font-mono">
                    {criterion.minScore} - {criterion.maxScore} pts ·{" "}
                    {criterion.decimalPrecision === 0
                      ? "integers"
                      : `${criterion.decimalPrecision} dec`}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="px-6 pb-5 pt-0">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Input
                        type="number"
                        min={criterion.minScore}
                        max={criterion.maxScore}
                        step={
                          criterion.decimalPrecision === 0
                            ? 1
                            : Math.pow(10, -(criterion.decimalPrecision ?? 1))
                        }
                        value={val}
                        onChange={(e) => handleScoreChange(criterion._id, e.target.value)}
                        disabled={activeItem.isImmutable}
                        placeholder={`Enter score (${criterion.minScore} - ${criterion.maxScore})`}
                        className={`font-mono text-base font-semibold h-11 ${
                          error ? "border-destructive focus-visible:ring-destructive" : ""
                        }`}
                      />
                    </div>
                    {val !== "" && !error && (
                      <div className="text-success">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      </div>
                    )}
                  </div>
                  {error && <p className="text-xs text-destructive font-medium">{error}</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Contestant Navigation Footer (Prev / Next) & Actions */}
      <div className="sticky bottom-4 z-20 p-4 rounded-2xl bg-card/90 backdrop-blur-md border border-border/80 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedIndex === 0}
            onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
            className="gap-1 h-9 flex-1 sm:flex-none"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedIndex === contestants.length - 1}
            onClick={() => setSelectedIndex((prev) => Math.min(contestants.length - 1, prev + 1))}
            className="gap-1 h-9 flex-1 sm:flex-none"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {!activeItem.isImmutable && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isSaving || isSubmitting}
              className="gap-1.5 h-9 flex-1 sm:flex-none font-medium"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Draft</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={!isComplete || isSaving || isSubmitting}
              className="gap-1.5 h-9 flex-1 sm:flex-none font-bold shadow-xs"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Submit & Lock</span>
            </Button>
          </div>
        )}
      </div>

      {/* Submit Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Score Submission</DialogTitle>
            <DialogDescription>
              Are you sure you want to lock and submit your scores for{" "}
              <span className="font-semibold text-foreground">{activeItem.contestant.name}</span>?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 border-y border-border/50">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Contestant:</span>
              <span className="font-semibold">
                #{activeItem.contestant.number} {activeItem.contestant.name}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Computed Score:</span>
              <span className="font-mono font-bold text-primary text-base">
                {totalScore.toFixed(event.decimalPrecision)} pts
              </span>
            </div>
            <p className="text-2xs text-muted-foreground pt-1">
              Once submitted, this score sheet becomes immutable and locked.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>Confirm & Lock</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
