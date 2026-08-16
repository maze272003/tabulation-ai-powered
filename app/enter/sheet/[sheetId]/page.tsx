"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { useEnterSession } from "@/components/enter/EnterAppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/tabulation/StatusBadge";
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
  Save,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Loader2,
  Info,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface SheetDetailData {
  sheet: Doc<"scoreSheets">;
  round: Doc<"rounds">;
  contestant: Doc<"contestants"> | null;
  category: Doc<"categories"> | null;
  criteria: Doc<"criteria">[];
  scores?: Doc<"scores">[];
  isImmutable: boolean;
}

export default function ScoreSheetPage({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  const resolvedParams = use(params);
  const sheetId = resolvedParams.sheetId as Id<"scoreSheets">;
  const { sessionToken } = useEnterSession();

  const data = useQuery(api.enter.scoring.sheetDetail, { sessionToken, sheetId });

  if (data === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading score sheet...</p>
      </div>
    );
  }

  if (data === null || !data.sheet || !data.round) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold">Score Sheet Not Found</h2>
        <p className="text-sm text-muted-foreground">This score sheet does not exist or you do not have permission to access it.</p>
        <Link href="/enter" className={cn(buttonVariants({ variant: "outline" }))}>
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <ScoreSheetForm
      key={sheetId}
      sessionToken={sessionToken}
      sheetId={sheetId}
      data={data as SheetDetailData}
    />
  );
}

function ScoreSheetForm({
  sessionToken,
  sheetId,
  data,
}: {
  sessionToken: string;
  sheetId: Id<"scoreSheets">;
  data: SheetDetailData;
}) {
  const router = useRouter();
  const saveDraftMutation = useMutation(api.enter.scoring.saveDraft);
  const submitSheetMutation = useMutation(api.enter.scoring.submitSheet);

  const { sheet, round, contestant, category, criteria, isImmutable, scores } = data;

  const [values, setValues] = useState<Record<string, number | "">>(() => {
    const initial: Record<string, number | ""> = {};
    if (isImmutable && scores) {
      for (const s of scores) {
        initial[s.criterionId] = s.value;
      }
    } else if (sheet.draftValues) {
      for (const [k, v] of Object.entries(sheet.draftValues)) {
        initial[k] = v as number;
      }
    }
    return initial;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Validation & Calculations
  const validationErrors: Record<string, string> = {};
  let totalScore = 0;
  let allComplete = true;

  for (const c of criteria) {
    const val = values[c._id];
    if (val === undefined || val === "") {
      allComplete = false;
      continue;
    }

    const num = Number(val);
    if (isNaN(num)) {
      validationErrors[c._id] = "Must be a valid number";
      allComplete = false;
    } else if (num < c.minScore) {
      validationErrors[c._id] = `Score cannot be less than ${c.minScore}`;
      allComplete = false;
    } else if (num > c.maxScore) {
      validationErrors[c._id] = `Score cannot exceed ${c.maxScore}`;
      allComplete = false;
    } else {
      const factor = 10 ** (c.decimalPrecision ?? 0);
      if (Math.abs(num * factor - Math.round(num * factor)) > 1e-6) {
        validationErrors[c._id] =
          c.decimalPrecision === 0
            ? "Must be a whole number (no decimals)"
            : `Allows at most ${c.decimalPrecision} decimal place${c.decimalPrecision === 1 ? "" : "s"}`;
        allComplete = false;
      } else {
        totalScore += num;
      }
    }
  }

  function handleScoreChange(criterionId: string, valStr: string) {
    if (isImmutable) return;

    if (valStr === "") {
      setValues((prev) => ({ ...prev, [criterionId]: "" }));
      return;
    }

    const num = parseFloat(valStr);
    setValues((prev) => ({ ...prev, [criterionId]: isNaN(num) ? "" : num }));
  }

  async function handleSaveDraft() {
    if (isImmutable) return;
    setIsSaving(true);

    try {
      const payload: Record<string, number> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v !== "" && typeof v === "number" && !isNaN(v)) {
          payload[k] = v;
        }
      }

      await saveDraftMutation({ sessionToken, sheetId, draftValues: payload });
      toast.success("Draft scores saved successfully.");
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to save draft.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFinalSubmit() {
    if (isImmutable) return;
    setIsSubmitting(true);

    try {
      const payload: Record<string, number> = {};
      for (const c of criteria) {
        const val = values[c._id];
        if (val === undefined || val === "" || typeof val !== "number") {
          toast.error(`Please provide a score for ${c.name}.`);
          setIsSubmitting(false);
          return;
        }
        payload[c._id] = val;
      }

      await submitSheetMutation({ sessionToken, sheetId, values: payload });
      toast.success("Scores submitted successfully and locked.");
      setConfirmOpen(false);
      router.push("/enter");
      router.refresh();
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to submit scores.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
      {/* Top Breadcrumb & Status */}
      <div className="flex items-center justify-between">
        <Link
          href="/enter"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground hover:text-foreground")}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
        <StatusBadge kind="sheet" status={sheet?.status ?? "not_started"} />
      </div>

      {/* Contestant Header Card */}
      <Card className="border-border/60 shadow-sm bg-gradient-to-r from-card via-card to-muted/30">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-sm px-2.5 py-0.5 font-bold">
                  #{contestant?.number}
                </Badge>
                {category && (
                  <Badge variant="secondary" className="text-xs">
                    {category.name}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{contestant?.name}</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span>{round?.name}</span>
                <span>•</span>
                <span>Order: Round {round?.order}</span>
              </p>
            </div>

            {/* Total Score Summary Pill */}
            <div className="flex flex-col items-center sm:items-end justify-center bg-background/90 border border-border/60 px-5 py-3 rounded-xl shadow-2xs">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Total Score
              </span>
              <span className="text-2xl font-extrabold text-primary">{totalScore.toFixed(2)}</span>
            </div>
          </div>

          {isImmutable && (
            <div className="mt-4 p-3 rounded-lg bg-muted/60 border border-border/50 text-xs text-muted-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>This sheet is submitted and locked for official tabulation. Scores cannot be edited.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criteria Scoring Form */}
      <div className="space-y-4">
        {criteria.map((criterion: Doc<"criteria">, idx: number) => {
          const val = values[criterion._id] ?? "";
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
                    {criterion.minScore} - {criterion.maxScore} pts · {criterion.decimalPrecision === 0 ? "integers" : `${criterion.decimalPrecision} dec`}
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
                        step={criterion.decimalPrecision === 0 ? 1 : Math.pow(10, -criterion.decimalPrecision)}
                        value={val}
                        onChange={(e) => handleScoreChange(criterion._id, e.target.value)}
                        disabled={isImmutable}
                        placeholder={`Enter score (${criterion.minScore} - ${criterion.maxScore}${criterion.decimalPrecision > 0 ? `, up to ${criterion.decimalPrecision} dec` : ""})`}
                        className={`font-mono text-base font-semibold h-11 ${
                          error ? "border-destructive focus-visible:ring-destructive" : ""
                        }`}
                      />
                    </div>
                    {val !== "" && !error && (
                      <div className="text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
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

      {/* Sticky Bottom Actions Bar */}
      {!isImmutable && (
        <div className="sticky bottom-4 z-20 p-4 rounded-2xl bg-card/90 backdrop-blur-md border border-border/80 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4 text-primary" />
            <span>
              {allComplete
                ? "All criteria scored. Ready to submit."
                : "Enter scores for all criteria above to enable submission."}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isSaving || isSubmitting}
              className="gap-1.5 h-10 w-full sm:w-auto font-medium"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Draft</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={!allComplete || isSaving || isSubmitting}
              className="gap-1.5 h-10 w-full sm:w-auto font-bold shadow-xs"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Submit & Lock</span>
            </Button>
          </div>
        </div>
      )}

      {/* Submit Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Score Submission</DialogTitle>
            <DialogDescription>
              Are you sure you want to lock and submit your scores for{" "}
              <span className="font-semibold text-foreground">{contestant?.name}</span>?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 border-y border-border/50">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Contestant:</span>
              <span className="font-semibold">{contestant?.name} (#{contestant?.number})</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Computed Score:</span>
              <span className="font-mono font-bold text-primary text-base">
                {totalScore.toFixed(2)} pts
              </span>
            </div>
            <p className="text-2xs text-muted-foreground pt-1">
              Once submitted, this score sheet becomes immutable. Only event administrators can unlock it for corrections.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>Confirm & Lock</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
