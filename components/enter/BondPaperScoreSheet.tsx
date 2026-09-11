"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Printer,
  Save,
  CheckCircle2,
  Lock,
  Loader2,
  ShieldCheck,
  Search,
  Trophy,
  FileCheck2,
  Eye,
  EyeOff,
  LayoutGrid,
  AlertTriangle,
  PenTool,
} from "lucide-react";
import { JudgeRoundSummaryModal } from "@/components/signatures/JudgeRoundSummaryModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface BondPaperContestantItem {
  sheet: Doc<"scoreSheets">;
  contestant: Doc<"contestants">;
  category: Doc<"categories"> | null;
  scores?: Doc<"scores">[];
  isImmutable: boolean;
}

export interface BondPaperScoreSheetProps {
  sessionToken: string;
  roundId: Id<"rounds">;
  focusedSheetId?: Id<"scoreSheets">;
  onSwitchToClassic?: () => void;
  data: {
    event: {
      _id: Id<"events">;
      name: string;
      eventCode: string;
      logoUrl?: string;
      venue?: string;
      startDate?: number;
      decimalPrecision: number;
    };
    judge: {
      _id: Id<"eventAccounts">;
      displayName: string;
      username: string;
      signatureSpecimen?: string;
    };
    round: Doc<"rounds">;
    criteria: Doc<"criteria">[];
    contestants: BondPaperContestantItem[];
    isRoundClosed: boolean;
  };
}

export function BondPaperScoreSheet({
  sessionToken,
  roundId,
  focusedSheetId,
  onSwitchToClassic,
  data,
}: BondPaperScoreSheetProps) {
  const router = useRouter();
  const { event, judge, round, criteria, contestants, isRoundClosed } = data;

  const saveRoundDraftsMutation = useMutation(api.enter.scoring.saveRoundDraftsBatch);
  const submitRoundSheetsMutation = useMutation(api.enter.scoring.submitRoundSheetsBatch);
  const submitSheetMutation = useMutation(api.enter.scoring.submitSheet);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"number" | "name" | "rank">("number");

  // Privacy shield (anti-peeking mode for live judging)
  const [privacyMode, setPrivacyMode] = useState(false);

  // Auto-save state
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Scorecard Summary & Sign-off modal state
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);

  // Grid scores state: Map sheetId -> criterionId -> number | ""
  const [gridValues, setGridValues] = useState<Record<string, Record<string, number | "">>>(() => {
    const initial: Record<string, Record<string, number | "">> = {};
    for (const item of contestants) {
      const sheetValues: Record<string, number | ""> = {};
      if (item.isImmutable && item.scores) {
        for (const s of item.scores) {
          sheetValues[s.criterionId] = s.value;
        }
      } else if (item.sheet.draftValues) {
        for (const [k, v] of Object.entries(item.sheet.draftValues)) {
          sheetValues[k] = v as number;
        }
      }
      initial[item.sheet._id] = sheetValues;
    }
    return initial;
  });

  // Saving / Submitting UI states
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isSubmittingAll, setIsSubmittingAll] = useState(false);
  const [activeSubmittingSheetId, setActiveSubmittingSheetId] = useState<string | null>(null);
  const [confirmSubmitAllOpen, setConfirmSubmitAllOpen] = useState(false);
  const [singleSubmitTarget, setSingleSubmitTarget] = useState<BondPaperContestantItem | null>(null);

  // Table cell refs for arrow/tab keyboard navigation: `cell-${rowIndex}-${critIndex}`
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Scroll to focused sheet if passed
  useEffect(() => {
    if (focusedSheetId) {
      const rowElem = document.getElementById(`row-${focusedSheetId}`);
      if (rowElem) {
        rowElem.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [focusedSheetId]);

  // Handle in-cell score change
  const handleScoreChange = (sheetId: string, criterionId: string, valStr: string) => {
    const num = valStr === "" ? "" : parseFloat(valStr);
    setGridValues((prev) => ({
      ...prev,
      [sheetId]: {
        ...(prev[sheetId] ?? {}),
        [criterionId]: isNaN(num as number) ? "" : num,
      },
    }));
  };

  // Background auto-save on cell blur
  const handleCellBlur = async (sheetId: string) => {
    if (isRoundClosed) return;
    const target = contestants.find((c) => c.sheet._id === sheetId);
    if (!target || target.isImmutable) return;

    const vals = gridValues[sheetId] ?? {};
    const cleanVals: Record<string, number> = {};
    for (const [k, v] of Object.entries(vals)) {
      if (v !== "" && typeof v === "number" && !isNaN(v)) {
        cleanVals[k] = v;
      }
    }
    if (Object.keys(cleanVals).length === 0) return;

    setIsAutoSaving(true);
    try {
      await saveRoundDraftsMutation({
        sessionToken,
        roundId,
        drafts: [{ sheetId: target.sheet._id, draftValues: cleanVals }],
      });
      setLastSavedTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      );
    } catch {
      // Background autosave failure is non-blocking
    } finally {
      setIsAutoSaving(false);
    }
  };

  // Keyboard navigation handler for fast keyboard entry
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    critIndex: number,
    totalRows: number,
    totalCrits: number,
  ) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextRow = (rowIndex + 1) % totalRows;
      const key = `cell-${nextRow}-${critIndex}`;
      inputRefs.current.get(key)?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevRow = (rowIndex - 1 + totalRows) % totalRows;
      const key = `cell-${prevRow}-${critIndex}`;
      inputRefs.current.get(key)?.focus();
    } else if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      if (critIndex < totalCrits - 1) {
        e.preventDefault();
        const key = `cell-${rowIndex}-${critIndex + 1}`;
        inputRefs.current.get(key)?.focus();
      }
    } else if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
      if (critIndex > 0) {
        e.preventDefault();
        const key = `cell-${rowIndex}-${critIndex - 1}`;
        inputRefs.current.get(key)?.focus();
      }
    }
  };

  // Computed totals, validation errors, and standings
  const { contestantStats, rankMap, totalCompletedSheets, totalSubmittableSheets, tieGroups } = useMemo(() => {
    const stats: Record<
      string,
      {
        totalScore: number;
        isComplete: boolean;
        hasErrors: boolean;
        errors: Record<string, string>;
      }
    > = {};

    for (const item of contestants) {
      const sheetId = item.sheet._id;
      const values = gridValues[sheetId] ?? {};
      let total = 0;
      let complete = true;
      let hasError = false;
      const errors: Record<string, string> = {};

      for (const crit of criteria) {
        const val = values[crit._id];
        if (val === undefined || val === "") {
          complete = false;
          continue;
        }

        const num = Number(val);
        if (isNaN(num)) {
          errors[crit._id] = "Must be a number";
          complete = false;
          hasError = true;
        } else if (num < crit.minScore) {
          errors[crit._id] = `Min ${crit.minScore}`;
          complete = false;
          hasError = true;
        } else if (num > crit.maxScore) {
          errors[crit._id] = `Max ${crit.maxScore}`;
          complete = false;
          hasError = true;
        } else {
          const factor = 10 ** (crit.decimalPrecision ?? 0);
          if (Math.abs(num * factor - Math.round(num * factor)) > 1e-6) {
            errors[crit._id] = `Max ${crit.decimalPrecision} dec`;
            complete = false;
            hasError = true;
          } else {
            total += num;
          }
        }
      }

      stats[sheetId] = {
        totalScore: total,
        isComplete: complete && !hasError,
        hasErrors: hasError,
        errors,
      };
    }

    // Standard competition ranking: highest score = Rank 1
    const scoredContestants = [...contestants].filter(
      (c) => (stats[c.sheet._id]?.totalScore ?? 0) > 0,
    );

    scoredContestants.sort((a, b) => {
      const scoreA = stats[a.sheet._id]?.totalScore ?? 0;
      const scoreB = stats[b.sheet._id]?.totalScore ?? 0;
      // Highest score first (descending)
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return a.contestant.number - b.contestant.number;
    });

    const ranks: Record<string, number | null> = {};
    for (let i = 0; i < scoredContestants.length; i++) {
      const current = scoredContestants[i];
      const currentScore = stats[current.sheet._id]?.totalScore ?? 0;
      if (i > 0) {
        const prev = scoredContestants[i - 1];
        const prevScore = stats[prev.sheet._id]?.totalScore ?? 0;
        if (Math.abs(currentScore - prevScore) < 1e-6) {
          ranks[current.sheet._id] = ranks[prev.sheet._id]!;
        } else {
          ranks[current.sheet._id] = i + 1;
        }
      } else {
        ranks[current.sheet._id] = 1;
      }
    }

    for (const c of contestants) {
      if (ranks[c.sheet._id] === undefined) {
        ranks[c.sheet._id] = null;
      }
    }

    const completed = contestants.filter(
      (c) => c.isImmutable || stats[c.sheet._id]?.isComplete,
    ).length;

    const submittable = contestants.filter(
      (c) => !c.isImmutable && stats[c.sheet._id]?.isComplete,
    ).length;

    // Detect potential accidental ties among complete scores
    const tieGroups: Array<{ score: number; names: string[] }> = [];
    const scoreMap: Record<string, string[]> = {};
    for (const c of contestants) {
      const s = stats[c.sheet._id]?.totalScore;
      if (s && s > 0 && stats[c.sheet._id]?.isComplete) {
        const key = s.toFixed(event.decimalPrecision);
        if (!scoreMap[key]) scoreMap[key] = [];
        scoreMap[key].push(`#${c.contestant.number} ${c.contestant.name}`);
      }
    }
    for (const [scoreKey, names] of Object.entries(scoreMap)) {
      if (names.length > 1) {
        tieGroups.push({ score: Number(scoreKey), names });
      }
    }

    return {
      contestantStats: stats,
      rankMap: ranks,
      totalCompletedSheets: completed,
      totalSubmittableSheets: submittable,
      tieGroups,
    };
  }, [contestants, criteria, gridValues]);

  // Filtered and sorted list for display - Highest score goes to the top when sorted by rank
  const displayedContestants = useMemo(() => {
    let list = [...contestants];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.contestant.name.toLowerCase().includes(q) ||
          c.contestant.number.toString().includes(q) ||
          (c.category?.name && c.category.name.toLowerCase().includes(q)),
      );
    }

    if (sortBy === "number") {
      list.sort((a, b) => a.contestant.number - b.contestant.number);
    } else if (sortBy === "name") {
      list.sort((a, b) => a.contestant.name.localeCompare(b.contestant.name));
    } else if (sortBy === "rank") {
      list.sort((a, b) => {
        const scoreA = contestantStats[a.sheet._id]?.totalScore ?? 0;
        const scoreB = contestantStats[b.sheet._id]?.totalScore ?? 0;
        const hasScoresA = scoreA > 0;
        const hasScoresB = scoreB > 0;

        // Scored contestants strictly appear above unscored contestants
        if (hasScoresA && !hasScoresB) return -1;
        if (!hasScoresA && hasScoresB) return 1;

        // Highest score strictly goes to the TOP (descending totalScore)
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }

        // Secondary tie-break: lowest contestant number first
        return a.contestant.number - b.contestant.number;
      });
    }

    return list;
  }, [contestants, searchQuery, sortBy, rankMap, contestantStats]);

  // Batch Save All Drafts
  const handleSaveAllDrafts = async () => {
    setIsSavingAll(true);
    try {
      const draftsPayload: Array<{
        sheetId: Id<"scoreSheets">;
        draftValues: Record<string, number>;
      }> = [];

      for (const item of contestants) {
        if (item.isImmutable) continue;
        const vals = gridValues[item.sheet._id] ?? {};
        const cleanVals: Record<string, number> = {};
        for (const [k, v] of Object.entries(vals)) {
          if (v !== "" && typeof v === "number" && !isNaN(v)) {
            cleanVals[k] = v;
          }
        }
        if (Object.keys(cleanVals).length > 0) {
          draftsPayload.push({
            sheetId: item.sheet._id,
            draftValues: cleanVals,
          });
        }
      }

      if (draftsPayload.length === 0) {
        toast.info("No draft changes to save.");
        return;
      }

      await saveRoundDraftsMutation({
        sessionToken,
        roundId,
        drafts: draftsPayload,
      });
      toast.success(`Draft scores saved for ${draftsPayload.length} contestant(s).`);
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to save drafts.");
    } finally {
      setIsSavingAll(false);
    }
  };

  // Submit single contestant sheet
  const handleSingleSubmit = async (item: BondPaperContestantItem) => {
    setActiveSubmittingSheetId(item.sheet._id);
    try {
      const vals = gridValues[item.sheet._id] ?? {};
      const payload: Record<string, number> = {};
      for (const crit of criteria) {
        const val = vals[crit._id];
        if (val === undefined || val === "" || typeof val !== "number") {
          toast.error(`Missing score for ${crit.name}`);
          return;
        }
        payload[crit._id] = val;
      }

      await submitSheetMutation({
        sessionToken,
        sheetId: item.sheet._id,
        values: payload,
      });

      toast.success(`Official scores locked for ${item.contestant.name}.`);
      setSingleSubmitTarget(null);
      router.refresh();
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to submit scores.");
    } finally {
      setActiveSubmittingSheetId(null);
    }
  };

  // Submit all completed sheets in batch
  const handleBatchSubmit = async () => {
    setIsSubmittingAll(true);
    try {
      const submissions: Array<{
        sheetId: Id<"scoreSheets">;
        values: Record<string, number>;
      }> = [];

      for (const item of contestants) {
        if (item.isImmutable) continue;
        const stats = contestantStats[item.sheet._id];
        if (!stats?.isComplete) continue;

        const vals = gridValues[item.sheet._id] ?? {};
        const cleanVals: Record<string, number> = {};
        for (const crit of criteria) {
          cleanVals[crit._id] = Number(vals[crit._id]);
        }
        submissions.push({
          sheetId: item.sheet._id,
          values: cleanVals,
        });
      }

      if (submissions.length === 0) {
        toast.error("No completed sheets available for submission.");
        return;
      }

      const res = await submitRoundSheetsMutation({
        sessionToken,
        roundId,
        submissions,
      });

      toast.success(
        `Successfully submitted and locked ${res.submittedCount} score sheet(s)!`,
      );
      setConfirmSubmitAllOpen(false);
      router.refresh();
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to submit sheets.");
    } finally {
      setIsSubmittingAll(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalCriteriaWeight = criteria.reduce((sum, c) => sum + (c.weight ?? 0), 0);
  const totalMaxPoints = criteria.reduce((sum, c) => sum + (c.maxScore ?? 0), 0);

  const formattedDate = new Date(event.startDate || Date.now()).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-6 pb-24">
      {/* Top Floating Action & Navigation Bar (Hidden on Print) */}
      <div className="print:hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/70 shadow-xs">
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
            <span className="font-semibold text-sm text-foreground">{round.name}</span>
            <Badge variant="outline" className="font-mono text-xs">
              {totalCompletedSheets}/{contestants.length} Scored
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 md:w-48">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Find contestant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center rounded-md border border-border/60 bg-muted/30 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSortBy("number")}
              className={cn(
                "px-2 py-1 rounded font-medium transition-colors",
                sortBy === "number" ? "bg-background shadow-2xs text-foreground" : "text-muted-foreground",
              )}
            >
              By #
            </button>
            <button
              type="button"
              onClick={() => setSortBy("name")}
              className={cn(
                "px-2 py-1 rounded font-medium transition-colors",
                sortBy === "name" ? "bg-background shadow-2xs text-foreground" : "text-muted-foreground",
              )}
            >
              By Name
            </button>
            <button
              type="button"
              onClick={() => setSortBy("rank")}
              className={cn(
                "px-2 py-1 rounded font-medium transition-colors",
                sortBy === "rank" ? "bg-background shadow-2xs text-foreground" : "text-muted-foreground",
              )}
            >
              By Rank
            </button>
          </div>

          {/* Switch to Classic Cards View (if available) */}
          {onSwitchToClassic && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSwitchToClassic}
              className="h-8 gap-1.5 text-xs font-medium"
              title="Switch to Classic Contestant Cards View"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-primary" />
              <span>Classic Cards View</span>
            </Button>
          )}

          {/* Privacy Shield (Anti-Peeking for Neighboring Judges) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPrivacyMode(!privacyMode)}
            className={cn(
              "h-8 gap-1.5 text-xs font-medium transition-colors",
              privacyMode && "bg-amber-100 text-amber-900 border-amber-300 font-bold",
            )}
            title="Toggle Privacy Shield (Blur scores to prevent neighboring judges from peeking)"
          >
            {privacyMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{privacyMode ? "Privacy ON" : "Privacy Shield"}</span>
          </Button>

          {/* Auto-Save indicator */}
          {isAutoSaving && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span>Saving...</span>
            </span>
          )}
          {!isAutoSaving && lastSavedTime && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-700 font-mono"
              title={`Last auto-saved at ${lastSavedTime}`}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Drafts Synced</span>
            </span>
          )}

          {/* Save All Drafts */}
          {!isRoundClosed && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveAllDrafts}
              disabled={isSavingAll || isSubmittingAll}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              {isSavingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Save Drafts</span>
            </Button>
          )}

          {/* Submit All Sheets Button */}
          {!isRoundClosed && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setConfirmSubmitAllOpen(true)}
              disabled={totalSubmittableSheets === 0 || isSavingAll || isSubmittingAll}
              className="h-8 gap-1.5 text-xs font-bold shadow-2xs"
            >
              {isSubmittingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Submit & Lock All ({totalSubmittableSheets})</span>
            </Button>
          )}

          {/* Official Round Review & Sign-Off Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSummaryModalOpen(true)}
            className="h-8 gap-1.5 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/5"
            title="Review Scorecard Standings & Sign Off"
          >
            <PenTool className="w-3.5 h-3.5 text-primary" />
            <span>Scorecard Sign-Off</span>
          </Button>

          {/* Print Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="h-8 gap-1.5 text-xs font-medium"
            title="Print Official Bond Paper Score Sheet"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/*              AUTHENTIC BOND PAPER SCORING SHEET CONTAINER                 */}
      {/* ========================================================================= */}
      <div className="relative mx-auto max-w-7xl">
        {/* Paper drop-shadow frame with realistic bond paper background */}
        <div className="relative bg-white text-slate-900 border border-slate-300 dark:border-slate-400 shadow-2xl rounded-xs p-6 sm:p-10 md:p-12 selection:bg-amber-100 overflow-x-auto print:p-0 print:border-0 print:shadow-none">
          
          {/* Subtle security watermark in background */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03] select-none font-serif text-8xl font-black uppercase tracking-widest text-slate-900 rotate-[-25deg] overflow-hidden"
            aria-hidden="true"
          >
            Official Tabulation Sheet
          </div>

          {/* ----------------------------------------------------------------------- */}
          {/*                      OFFICIAL DOCUMENT LETTERHEAD                       */}
          {/* ----------------------------------------------------------------------- */}
          <header className="border-b-2 border-slate-900 pb-4 mb-6 relative">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-slate-900 bg-slate-50 text-slate-900 shadow-2xs">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-slate-900 text-white px-2 py-0.5 rounded-xs">
                      Official Judge Tabulation
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-600">
                      REF: {event.eventCode.toUpperCase()}-{round.order}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-black font-serif tracking-tight text-slate-900 uppercase mt-0.5">
                    {event.name}
                  </h1>
                  <p className="text-xs text-slate-600 font-medium">
                    {event.venue || "Official Competition Venue"} • {formattedDate}
                  </p>
                </div>
              </div>

              {/* Judge Identification Box */}
              <div className="border border-slate-800 bg-slate-50/80 p-3 rounded-xs text-right min-w-[220px]">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  Assigned Judge
                </div>
                <div className="text-base font-extrabold text-slate-900 font-serif">
                  {judge.displayName}
                </div>
                <div className="text-[11px] font-mono font-bold text-slate-600 mt-0.5">
                  Account: @{judge.username}
                </div>
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    {isRoundClosed ? "Round Concluded" : "Authorized Balloting"}
                  </span>
                </div>
              </div>
            </div>

            {/* Sub-header: Round Title & Criteria Summary */}
            <div className="mt-4 pt-3 border-t border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-serif font-black uppercase text-slate-900 text-sm">
                  Segment / Round:{" "}
                </span>
                <span className="font-extrabold text-slate-800 bg-amber-50 px-2 py-0.5 border border-amber-300 rounded-xs text-sm">
                  {round.name}
                </span>
              </div>
              <div className="font-mono text-slate-600 text-xs">
                Total Criteria Weight: <strong className="text-slate-900">{totalCriteriaWeight}%</strong> • 
                Scale Maximum: <strong className="text-slate-900">{totalMaxPoints} pts</strong>
              </div>
            </div>
          </header>

          {/* Accidental Tie Detection Notice */}
          {tieGroups.length > 0 && (
            <div className="print:hidden mb-4 p-3 rounded-md bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2.5 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Notice — Potential Tie Detected: </span>
                <span>
                  {tieGroups
                    .map(
                      (t) =>
                        `${t.names.join(" and ")} currently share the exact same total score (${t.score.toFixed(
                          event.decimalPrecision,
                        )} pts)`,
                    )
                    .join("; ")}
                  . Please verify if this tie is intentional before final submission.
                </span>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------------- */}
          {/*             MASTER TABULATION GRID - ALL CONTESTANTS LISTED             */}
          {/* ----------------------------------------------------------------------- */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border-2 border-slate-900 text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-900 border-b-2 border-slate-900">
                  <th className="border border-slate-400 p-2 sm:p-2.5 text-center font-black w-12 font-mono">
                    #
                  </th>
                  <th className="border border-slate-400 p-2 sm:p-2.5 font-black min-w-[180px] max-w-[260px]">
                    CONTESTANT NAME
                  </th>
                  {criteria.map((crit) => (
                    <th
                      key={crit._id}
                      className="border border-slate-400 p-2 sm:p-2.5 text-center font-bold min-w-[110px]"
                    >
                      <div className="font-black text-slate-900 line-clamp-1" title={crit.name}>
                        {crit.name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-600 font-semibold mt-0.5">
                        {crit.minScore}-{crit.maxScore} pts ({crit.weight}%)
                      </div>
                    </th>
                  ))}
                  <th className="border border-slate-400 p-2 sm:p-2.5 text-center font-black w-24 bg-slate-200/80">
                    TOTAL
                  </th>
                  <th className="border border-slate-400 p-2 sm:p-2.5 text-center font-black w-20">
                    RANK
                  </th>
                  <th className="border border-slate-400 p-2 sm:p-2.5 text-center font-black w-24 print:hidden">
                    STATUS
                  </th>
                  <th className="border border-slate-400 p-2 sm:p-2.5 text-center font-black w-20 print:hidden">
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedContestants.length === 0 ? (
                  <tr>
                    <td
                      colSpan={criteria.length + 5}
                      className="text-center py-10 text-slate-500 font-serif italic"
                    >
                      No contestants found matching your filter criteria.
                    </td>
                  </tr>
                ) : (
                  displayedContestants.map((item, rIdx) => {
                    const sheetId = item.sheet._id;
                    const stats = contestantStats[sheetId];
                    const isImmutable = item.isImmutable;
                    const isFocused = focusedSheetId === sheetId;
                    const isSubmittingRow = activeSubmittingSheetId === sheetId;
                    const rowRank = rankMap[sheetId];

                    return (
                      <tr
                        key={sheetId}
                        id={`row-${sheetId}`}
                        className={cn(
                          "border-b border-slate-300 transition-colors",
                          rIdx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                          isFocused && "ring-2 ring-blue-600 bg-blue-50/50",
                          "hover:bg-amber-50/40",
                        )}
                      >
                        {/* Contestant Number */}
                        <td className="border border-slate-300 p-2 sm:p-2.5 text-center font-mono font-black text-slate-900 text-sm">
                          <span className="inline-block px-1.5 py-0.5 bg-slate-100 border border-slate-400 rounded-xs">
                            #{item.contestant.number}
                          </span>
                        </td>

                        {/* Contestant Name & Details */}
                        <td className="border border-slate-300 p-2 sm:p-2.5 font-serif">
                          <div className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                            {item.contestant.name}
                          </div>
                          {item.category && (
                            <div className="text-[11px] font-sans text-slate-500 font-medium mt-0.5">
                              {item.category.name}
                            </div>
                          )}
                        </td>

                        {/* Criteria Score Cells */}
                        {criteria.map((crit, cIdx) => {
                          const val = gridValues[sheetId]?.[crit._id] ?? "";
                          const error = stats?.errors[crit._id];
                          const cellKey = `cell-${rIdx}-${cIdx}`;

                          return (
                            <td
                              key={crit._id}
                              className={cn(
                                "border border-slate-300 p-1.5 sm:p-2 text-center align-middle",
                                error && "bg-red-50/80",
                              )}
                            >
                              {isImmutable ? (
                                <span
                                  className={cn(
                                    "font-mono font-black text-sm text-slate-900",
                                    privacyMode && "blur-[4px] hover:blur-none select-none transition-all duration-150",
                                  )}
                                >
                                  {val !== "" ? Number(val).toFixed(crit.decimalPrecision ?? 0) : "—"}
                                </span>
                              ) : (
                                <div className="relative">
                                  <input
                                    ref={(el) => {
                                      if (el) inputRefs.current.set(cellKey, el);
                                      else inputRefs.current.delete(cellKey);
                                    }}
                                    type="number"
                                    min={crit.minScore}
                                    max={crit.maxScore}
                                    step={
                                      crit.decimalPrecision === 0
                                        ? 1
                                        : Math.pow(10, -(crit.decimalPrecision ?? 1))
                                    }
                                    value={val}
                                    onChange={(e) =>
                                      handleScoreChange(sheetId, crit._id, e.target.value)
                                    }
                                    onBlur={() => handleCellBlur(sheetId)}
                                    onKeyDown={(e) =>
                                      handleKeyDown(
                                        e,
                                        rIdx,
                                        cIdx,
                                        displayedContestants.length,
                                        criteria.length,
                                      )
                                    }
                                    placeholder={`${crit.minScore}-${crit.maxScore}`}
                                    className={cn(
                                      "w-full text-center font-mono font-bold text-sm h-9 px-1 rounded-xs border transition-colors outline-none",
                                      privacyMode && "blur-[4px] hover:blur-none focus:blur-none select-none transition-all duration-150",
                                      error
                                        ? "border-red-600 bg-red-50 text-red-900 focus:ring-1 focus:ring-red-600"
                                        : "border-slate-300 bg-white text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900",
                                    )}
                                    title={error || `${crit.name} (${crit.minScore}-${crit.maxScore})`}
                                  />
                                  {error && (
                                    <span className="block text-[9px] text-red-600 font-bold font-sans mt-0.5 leading-none">
                                      {error}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Computed Total */}
                        <td
                          className={cn(
                            "border border-slate-300 p-2 sm:p-2.5 text-center font-mono font-black text-base text-slate-900 bg-slate-100/50",
                            privacyMode && "blur-[4px] hover:blur-none select-none transition-all duration-150",
                          )}
                        >
                          {stats?.totalScore !== undefined
                            ? stats.totalScore.toFixed(event.decimalPrecision)
                            : "0.00"}
                        </td>

                        {/* Computed Live Rank */}
                        <td className="border border-slate-300 p-2 sm:p-2.5 text-center font-mono font-black text-xs">
                          {rowRank === null ? (
                            <span className="text-slate-400 font-mono">—</span>
                          ) : rowRank === 1 ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-400 font-bold">
                              <Trophy className="w-3 h-3 text-amber-600" />
                              1st
                            </span>
                          ) : rowRank === 2 ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-400 font-bold">
                              2nd
                            </span>
                          ) : rowRank === 3 ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-bold">
                              3rd
                            </span>
                          ) : (
                            <span className="text-slate-700 font-bold">#{rowRank}</span>
                          )}
                        </td>

                        {/* Status Column */}
                        <td className="border border-slate-300 p-2 sm:p-2.5 text-center print:hidden">
                          {isImmutable ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border-emerald-300 gap-1 px-1.5"
                            >
                              <Lock className="w-3 h-3 text-emerald-600" />
                              Locked
                            </Badge>
                          ) : stats?.isComplete ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold text-blue-800 bg-blue-50 border-blue-300 gap-1 px-1.5"
                            >
                              <CheckCircle2 className="w-3 h-3 text-blue-600" />
                              Ready
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold text-slate-500 bg-slate-50 border-slate-300 px-1.5"
                            >
                              Incomplete
                            </Badge>
                          )}
                        </td>

                        {/* Row Action Column */}
                        <td className="border border-slate-300 p-2 sm:p-2.5 text-center print:hidden">
                          {isImmutable ? (
                            <span className="text-xs text-slate-400 font-mono">Audited</span>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!stats?.isComplete || isSubmittingRow}
                              onClick={() => setSingleSubmitTarget(item)}
                              className="h-7 px-2 text-xs font-bold text-blue-700 hover:text-blue-900 hover:bg-blue-50"
                              title="Submit and lock scores for this contestant"
                            >
                              {isSubmittingRow ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "Lock"
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ----------------------------------------------------------------------- */}
          {/*          OFFICIAL CERTIFICATION & LEGAL SIGNATURE SIGN-OFF BLOCK         */}
          {/* ----------------------------------------------------------------------- */}
          <footer className="mt-10 pt-6 border-t-2 border-slate-900 space-y-6">
            <div className="space-y-1 text-xs text-slate-700 font-serif leading-relaxed">
              <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                Official Judge's Certification Statement:
              </p>
              <p className="italic">
                "I hereby certify on my honor that the ratings given above are my independent, honest,
                and unbiased evaluation of the contestants in accordance with the established competition
                criteria, weights, and official guidelines."
              </p>
            </div>

            {/* Signature Lines Block */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 pt-4">
              {/* Judge Signature */}
              <div className="text-center space-y-2">
                <div className="border-b-2 border-slate-900 h-14 flex items-center justify-center pb-1">
                  {totalCompletedSheets === contestants.length && judge.signatureSpecimen ? (
                    <svg viewBox="0 0 500 180" className="h-12 w-auto max-w-[180px] text-slate-900">
                      <path
                        d={judge.signatureSpecimen}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="font-serif text-lg italic text-slate-800">
                      {totalCompletedSheets === contestants.length ? judge.displayName : ""}
                    </span>
                  )}
                </div>
                <div className="text-xs font-black text-slate-900 font-serif">
                  {judge.displayName}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">
                  Judge's Signature over Printed Name
                </div>
              </div>

              {/* Head Tabulator / Auditor Verification */}
              <div className="text-center space-y-2">
                <div className="border-b-2 border-slate-900 h-14" />
                <div className="text-xs font-bold text-slate-900 font-serif">
                  Board of Tabulators / Auditor
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">
                  Audit Verification & Immutability Check
                </div>
              </div>

              {/* Chairman of Board of Judges */}
              <div className="text-center space-y-2">
                <div className="border-b-2 border-slate-900 h-14" />
                <div className="text-xs font-bold text-slate-900 font-serif">
                  Chairman, Board of Judges
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">
                  Official Confirmation & Acceptance
                </div>
              </div>
            </div>

            {/* Bottom Security Stamp & Date */}
            <div className="pt-4 border-t border-dashed border-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
              <span>DOCUMENT CODE: TAB-{event.eventCode.toUpperCase()}-{round._id.slice(0, 8)}</span>
              <span>VERIFIED TABULATION ENGINE • SECURE BOND PAPER RECORD</span>
              <span>DATE/TIME: {new Date().toLocaleString()}</span>
            </div>
          </footer>
        </div>
      </div>

      {/* ========================================================================= */}
      {/*                       CONFIRMATION DIALOGS                                */}
      {/* ========================================================================= */}

      {/* Submit All Sheets Confirmation Dialog */}
      <Dialog open={confirmSubmitAllOpen} onOpenChange={setConfirmSubmitAllOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-primary" />
              <span>Confirm Official Score Submission</span>
            </DialogTitle>
            <DialogDescription>
              You are about to submit and lock scores for{" "}
              <strong className="text-foreground">{totalSubmittableSheets}</strong> completed contestant sheet(s) in{" "}
              <span className="font-semibold">{round.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 border-y border-border/60 space-y-2 text-xs text-muted-foreground">
            <p className="text-foreground font-medium">
              Important Tabulation Notice:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Once submitted, these score sheets will become official and locked.</li>
              <li>You will no longer be able to modify ratings unless reopened by an administrator.</li>
              <li>Your digital signature and timestamp will be permanently logged in the audit trail.</li>
            </ul>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmSubmitAllOpen(false)}
              disabled={isSubmittingAll}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleBatchSubmit}
              disabled={isSubmittingAll}
              className="gap-1.5 font-bold"
            >
              {isSubmittingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              <span>Confirm & Lock All ({totalSubmittableSheets})</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Contestant Submit Confirmation Dialog */}
      <Dialog
        open={Boolean(singleSubmitTarget)}
        onOpenChange={(open) => !open && setSingleSubmitTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lock Contestant Scores</DialogTitle>
            <DialogDescription>
              Lock scores for #{singleSubmitTarget?.contestant.number} -{" "}
              <span className="font-semibold text-foreground">
                {singleSubmitTarget?.contestant.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          {singleSubmitTarget && (
            <div className="py-3 border-y border-border/60 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Total Computed Score:</span>
                <span className="font-mono font-bold text-base text-primary">
                  {contestantStats[singleSubmitTarget.sheet._id]?.totalScore.toFixed(
                    event.decimalPrecision,
                  )}{" "}
                  pts
                </span>
              </div>
              <p className="text-2xs text-muted-foreground pt-1">
                Submitting this sheet finalizes and immutably records your scores for this contestant.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSingleSubmitTarget(null)}
              disabled={Boolean(activeSubmittingSheetId)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => singleSubmitTarget && handleSingleSubmit(singleSubmitTarget)}
              disabled={Boolean(activeSubmittingSheetId)}
              className="gap-1.5"
            >
              {activeSubmittingSheetId ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              <span>Confirm & Lock</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Official Judge Scorecard Review & Certification Modal */}
      <JudgeRoundSummaryModal
        isOpen={summaryModalOpen}
        onClose={() => setSummaryModalOpen(false)}
        sessionToken={sessionToken}
        roundId={roundId}
        roundName={round.name}
        criteria={criteria}
        judgeName={judge.displayName}
        registeredSignature={judge.signatureSpecimen}
        decimalPrecision={event.decimalPrecision}
        contestants={contestants.map((item) => ({
          contestantId: item.contestant._id,
          number: item.contestant.number,
          name: item.contestant.name,
          categoryName: item.category?.name,
          totalScore: contestantStats[item.sheet._id]?.totalScore ?? 0,
          scoresByCriterion: Object.fromEntries(
            criteria.map((crit) => [
              crit._id,
              typeof gridValues[item.sheet._id]?.[crit._id] === "number"
                ? (gridValues[item.sheet._id][crit._id] as number)
                : 0,
            ]),
          ),
          status: item.sheet.status,
        }))}
      />
    </div>
  );
}
