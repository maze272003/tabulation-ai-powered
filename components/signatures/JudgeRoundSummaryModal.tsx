"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SignaturePad } from "@/components/signatures/SignaturePad";
import { CheckCircle2, FileCheck2, Loader2, PenTool, Sparkles, Trophy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface JudgeRoundContestantSummary {
  contestantId: Id<"contestants">;
  number: number;
  name: string;
  categoryName?: string;
  totalScore: number;
  scoresByCriterion: Record<string, number>;
  status: "not_started" | "in_progress" | "submitted" | "locked";
}

export interface JudgeRoundSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
  roundId: Id<"rounds">;
  roundName: string;
  criteria: Doc<"criteria">[];
  contestants: JudgeRoundContestantSummary[];
  registeredSignature?: string;
  judgeName: string;
  decimalPrecision?: number;
  onCertifiedSuccess?: () => void;
}

export function JudgeRoundSummaryModal({
  isOpen,
  onClose,
  sessionToken,
  roundId,
  roundName,
  criteria,
  contestants,
  registeredSignature,
  judgeName,
  decimalPrecision = 2,
  onCertifiedSuccess,
}: JudgeRoundSummaryModalProps) {
  const authorizeMutation = useMutation(api.signatures.authorizeRound);

  const [useCustomSignature, setUseCustomSignature] = useState(false);
  const [customSvg, setCustomSvg] = useState("");
  const [signatureType, setSignatureType] = useState<"drawn" | "typed" | "uploaded">("drawn");
  const [judgeNotes, setJudgeNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute ranking among this judge's scored contestants
  const sortedContestants = [...contestants].sort((a, b) => b.totalScore - a.totalScore);
  const unsubmittedCount = contestants.filter(
    (c) => c.status !== "submitted" && c.status !== "locked",
  ).length;

  const activeSvg = useCustomSignature ? customSvg : registeredSignature || "";

  const handleAuthorize = async () => {
    if (!activeSvg.trim()) {
      toast.error("A signature is required to certify your round scorecard.");
      return;
    }
    if (unsubmittedCount > 0) {
      toast.error(`Please submit all score sheets first (${unsubmittedCount} pending).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authorizeMutation({
        sessionToken,
        roundId,
        svgPath: activeSvg,
        signatureType: useCustomSignature ? signatureType : "drawn",
        judgeNotes: judgeNotes.trim() || undefined,
      });

      toast.success("Round successfully certified! Verification hash generated.", {
        description: `Security Hash: ${result.scoresHash.slice(0, 16).toUpperCase()}`,
      });
      onCertifiedSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to certify round scores.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="p-5 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  Round Scorecard Review & Certification
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {roundName} • Official Adjudication by{" "}
                  <strong className="text-foreground">{judgeName}</strong>
                </DialogDescription>
              </div>
            </div>
            {unsubmittedCount === 0 ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>All Sheets Complete</span>
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{unsubmittedCount} Pending Sheet(s)</span>
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Scrollable Summary Table */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="rounded-xl border border-border overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/60 text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">Rank</th>
                  <th className="py-2.5 px-3 w-14 text-center">#</th>
                  <th className="py-2.5 px-3">Contestant</th>
                  {criteria.map((c) => (
                    <th key={c._id} className="py-2.5 px-2 text-right hidden sm:table-cell">
                      {c.name}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right font-bold text-foreground">Total</th>
                  <th className="py-2.5 px-3 text-center w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sortedContestants.map((c, index) => {
                  const rank = index + 1;
                  return (
                    <tr
                      key={c.contestantId}
                      className={cn(
                        "hover:bg-muted/30 transition-colors",
                        rank <= 3 && "bg-primary/2",
                      )}
                    >
                      <td className="py-2.5 px-3 text-center font-bold">
                        {rank === 1 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 font-black text-xs">
                            1
                          </span>
                        ) : rank === 2 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-700 font-bold text-xs">
                            2
                          </span>
                        ) : rank === 3 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-700 font-bold text-xs">
                            3
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{rank}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold">
                        #{c.number}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">{c.name}</div>
                        {c.categoryName && (
                          <div className="text-[10px] text-muted-foreground">
                            {c.categoryName}
                          </div>
                        )}
                      </td>
                      {criteria.map((crit) => (
                        <td
                          key={crit._id}
                          className="py-2.5 px-2 text-right font-mono text-muted-foreground hidden sm:table-cell"
                        >
                          {c.scoresByCriterion[crit._id] !== undefined
                            ? c.scoresByCriterion[crit._id].toFixed(decimalPrecision)
                            : "—"}
                        </td>
                      ))}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground text-sm">
                        {c.totalScore.toFixed(decimalPrecision)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {c.status === "submitted" || c.status === "locked" ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-50/50">
                            Locked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30">
                            Draft
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Remarks & Deductions Note */}
          <div className="space-y-1.5">
            <Label htmlFor="judge-round-notes" className="text-xs font-semibold">
              Adjudicator Remarks & Penalty Notes <span className="text-muted-foreground font-normal">(Optional)</span>
            </Label>
            <Textarea
              id="judge-round-notes"
              value={judgeNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJudgeNotes(e.target.value)}
              placeholder="e.g. Contestant #4 time deduction -0.5 applied in accordance with rule 4.2."
              className="text-xs resize-none h-16"
            />
          </div>

          {/* Signature Certification Block */}
          <div className="rounded-xl border border-primary/30 bg-primary/3 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Digital Certification Signature</span>
              </span>
              <button
                type="button"
                onClick={() => setUseCustomSignature(!useCustomSignature)}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                {useCustomSignature ? "Use registered specimen" : "Draw new signature"}
              </button>
            </div>

            {useCustomSignature ? (
              <SignaturePad
                value={customSvg}
                onChange={(svg, type) => {
                  setCustomSvg(svg);
                  setSignatureType(type);
                }}
                height={140}
              />
            ) : registeredSignature ? (
              <div className="border border-border/80 bg-white rounded-lg p-3 flex flex-col items-center justify-center">
                <svg viewBox="0 0 500 180" className="h-14 w-auto max-w-[240px] text-slate-900">
                  <path
                    d={registeredSignature}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-[10px] text-slate-400 font-mono mt-1">
                  OFFICIAL SIGNATURE SPECIMEN ON FILE
                </span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-2">
                No signature on file. Please draw your signature.
              </div>
            )}

            <p className="text-[11px] text-slate-600 dark:text-slate-400 italic font-serif leading-relaxed">
              "I hereby certify on my honor that the ratings given above represent my independent, honest, and final evaluation of the contestants in {roundName}."
            </p>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/20 flex flex-row items-center justify-between sm:justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleAuthorize}
            disabled={isSubmitting || unsubmittedCount > 0 || !activeSvg}
            className="font-bold gap-1.5"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>Affirm & Certify Round</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
