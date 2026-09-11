"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signatures/SignaturePad";
import { PaperAttachmentModal } from "@/components/signatures/PaperAttachmentModal";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Bell,
  Camera,
  FileText,
  Loader2,
  Lock,
  PenTool,
  ShieldAlert,
  Sparkles,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ScrutineerSignOffCardProps {
  sessionToken: string;
  roundId: Id<"rounds">;
  roundName: string;
  onCanPublishChange?: (canPublish: boolean) => void;
}

export function ScrutineerSignOffCard({
  sessionToken,
  roundId,
  roundName,
  onCanPublishChange,
}: ScrutineerSignOffCardProps) {
  const data = useQuery(api.signatures.getRoundCertificationStatus, {
    sessionToken,
    roundId,
  });

  const nudgeJudgeMutation = useMutation(api.signatures.nudgeJudge);
  const overrideJudgeMutation = useMutation(api.signatures.overrideJudgeSignature);
  const generateUploadUrlMutation = useMutation(api.signatures.generateAttachmentUploadUrl);
  const countersignMutation = useMutation(api.signatures.scrutineerCountersign);

  // Nudge loading per judge
  const [nudgingJudgeId, setNudgingJudgeId] = useState<string | null>(null);

  // Emergency override state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedJudge, setSelectedJudge] = useState<{
    judgeId: Id<"eventAccounts">;
    name: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideFile, setOverrideFile] = useState<File | null>(null);
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);

  // Paper attachment modal state
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<{
    storageId: string;
    judgeName: string;
    reason: string | null;
    timestamp: number | null;
  } | null>(null);

  // Scrutineer countersign modal state
  const [countersignModalOpen, setCountersignModalOpen] = useState(false);
  const [countersignSvg, setCountersignSvg] = useState("");
  const [countersignType, setCountersignType] = useState<"drawn" | "typed" | "uploaded">("drawn");
  const [isSubmittingCountersign, setIsSubmittingCountersign] = useState(false);

  useEffect(() => {
    if (data && onCanPublishChange) {
      onCanPublishChange(data.canPublish);
    }
  }, [data, onCanPublishChange]);

  if (data === undefined) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="py-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground animate-pulse">
            Loading certification matrix...
          </p>
        </CardContent>
      </Card>
    );
  }

  const judges = data.judges;
  const activeJudges = judges.filter((j) => j.sheetsTotal > 0);
  const certifiedCount = activeJudges.filter(
    (j) => j.status === "signed" || j.status === "overridden",
  ).length;
  const totalCount = activeJudges.length;
  const isAllCertified = data.allJudgesCertified;
  const isCountersigned = Boolean(data.scrutineerSignature);

  async function handleNudge(judgeId: Id<"eventAccounts">, judgeName: string) {
    setNudgingJudgeId(judgeId);
    try {
      await nudgeJudgeMutation({
        sessionToken,
        roundId,
        judgeId,
        message: `Please review and digitally certify your scorecards for ${roundName}.`,
      });
      toast.success(`Nudge alert sent to ${judgeName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send nudge";
      toast.error(msg);
    } finally {
      setNudgingJudgeId(null);
    }
  }

  function openOverrideModal(judgeId: Id<"eventAccounts">, judgeName: string) {
    setSelectedJudge({ judgeId, name: judgeName });
    setOverrideReason("");
    setOverrideFile(null);
    setOverrideModalOpen(true);
  }

  async function handleConfirmOverride() {
    if (!selectedJudge) return;
    if (overrideReason.trim().length < 10) {
      toast.error("Please enter a detailed override reason (at least 10 characters).");
      return;
    }

    setIsSubmittingOverride(true);
    try {
      let attachmentStorageId: string | undefined = undefined;

      // Upload paper attachment if provided
      if (overrideFile) {
        const uploadUrl = await generateUploadUrlMutation({ sessionToken });
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": overrideFile.type },
          body: overrideFile,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload paper score sheet photo.");
        }

        const { storageId } = (await uploadRes.json()) as { storageId: string };
        attachmentStorageId = storageId;
      }

      await overrideJudgeMutation({
        sessionToken,
        roundId,
        judgeId: selectedJudge.judgeId,
        reason: overrideReason.trim(),
        attachmentStorageId,
      });

      toast.success(`Emergency override applied for ${selectedJudge.name}.`);
      setOverrideModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to apply emergency override";
      toast.error(msg);
    } finally {
      setIsSubmittingOverride(false);
    }
  }

  async function handleCountersign() {
    if (!countersignSvg) {
      toast.error("Please provide your signature before certifying.");
      return;
    }

    setIsSubmittingCountersign(true);
    try {
      await countersignMutation({
        sessionToken,
        roundId,
        svgPath: countersignSvg,
        signatureType: countersignType,
      });
      toast.success("Round successfully countersigned as Chief Scrutineer!");
      setCountersignModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to countersign round";
      toast.error(msg);
    } finally {
      setIsSubmittingCountersign(false);
    }
  }

  return (
    <Card className="border-border/70 shadow-sm overflow-hidden">
      <CardHeader className="p-4 sm:p-6 pb-4 bg-muted/20 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <CardTitle className="text-base font-bold tracking-tight flex items-center gap-2">
                Scrutineer Certification Matrix
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold",
                    data.canPublish
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                      : isAllCertified
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {data.canPublish
                    ? "Ready to Publish"
                    : isAllCertified
                      ? "Awaiting Scrutineer Sign-Off"
                      : `${certifiedCount}/${totalCount} Certified`}
                </Badge>
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              All assigned adjudicators must affirm their scorecards with digital signatures or have
              an authorized emergency override before the round results can be certified and published.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {isAllCertified && !isCountersigned && (
              <Button
                size="sm"
                onClick={() => setCountersignModalOpen(true)}
                className="gap-1.5 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Countersign as Scrutineer</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Judge Status Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-2.5 px-4">Adjudicator</th>
                <th className="py-2.5 px-4">Progress</th>
                <th className="py-2.5 px-4">Digital Certification</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {activeJudges.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No adjudicators assigned to this round.
                  </td>
                </tr>
              ) : (
                activeJudges.map((judge) => {
                  return (
                    <tr key={judge.judgeId} className="hover:bg-muted/20 transition-colors">
                      {/* Name & Role */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">{judge.name}</div>
                        {judge.titleOrAffiliation && (
                          <div className="text-[11px] text-muted-foreground">
                            {judge.titleOrAffiliation}
                          </div>
                        )}
                      </td>

                      {/* Sheets Progress */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {judge.sheetsSubmitted} / {judge.sheetsTotal}
                          </span>
                          <span className="text-[11px] text-muted-foreground">sheets</span>
                        </div>
                      </td>

                      {/* Status Chip */}
                      <td className="py-3 px-4">
                        {judge.status === "signed" ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Signed & Verified</span>
                            {judge.signedAt && (
                              <span className="text-[10px] opacity-75 font-mono ml-0.5">
                                ({new Date(judge.signedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                              </span>
                            )}
                          </div>
                        ) : judge.status === "overridden" ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:text-amber-400">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Emergency Override</span>
                          </div>
                        ) : judge.status === "stale" ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 border border-rose-500/20 dark:text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Scores Edited (Stale)</span>
                          </div>
                        ) : judge.status === "pending" ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 border border-sky-500/20 dark:text-sky-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Awaiting Signature</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Scoring Incomplete</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Nudge button */}
                          {(judge.status === "pending" || judge.status === "stale") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleNudge(judge.judgeId, judge.name)}
                              disabled={nudgingJudgeId === judge.judgeId}
                              className="h-7 px-2 text-[11px] gap-1 font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                              title="Send real-time chime alert to judge"
                            >
                              {nudgingJudgeId === judge.judgeId ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Bell className="w-3 h-3" />
                              )}
                              <span>Nudge</span>
                            </Button>
                          )}

                          {/* Paper sheet button if override attachment exists */}
                          {judge.overrideAttachmentStorageId && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedAttachment({
                                  storageId: judge.overrideAttachmentStorageId!,
                                  judgeName: judge.name,
                                  reason: judge.overrideReason,
                                  timestamp: judge.signedAt,
                                });
                                setAttachmentModalOpen(true);
                              }}
                              className="h-7 px-2 text-[11px] gap-1 font-medium text-warning hover:text-warning hover:bg-warning/10 border-warning/30"
                              title="Inspect attached paper score sheet"
                            >
                              <FileText className="w-3 h-3" />
                              <span>View Paper Backup</span>
                            </Button>
                          )}

                          {/* Emergency override button */}
                          {judge.status !== "signed" && judge.status !== "overridden" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openOverrideModal(judge.judgeId, judge.name)}
                              className="h-7 px-2 text-[11px] gap-1 font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Record emergency staff override with paper backup"
                            >
                              <ShieldAlert className="w-3 h-3" />
                              <span>Override</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Scrutineer Countersignature Status Banner */}
        <div className="p-4 sm:p-6 border-t border-border bg-muted/10">
          {isCountersigned ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                    Officially Countersigned by Chief Scrutineer
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground ml-9">
                  {data.scrutineerSignature?.displayName} countersigned on{" "}
                  {data.scrutineerSignature?.signedAt
                    ? new Date(data.scrutineerSignature.signedAt).toLocaleString()
                    : ""}
                </p>
              </div>

              {data.scrutineerSignature?.svgPath && (
                <div className="bg-white border border-border/80 rounded-lg p-2 max-w-[200px] flex flex-col items-center">
                  <svg viewBox="0 0 500 180" className="h-10 w-auto text-slate-900">
                    <path
                      d={data.scrutineerSignature.svgPath}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                    SCRUTINEER SEAL
                  </span>
                </div>
              )}
            </div>
          ) : !isAllCertified ? (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-muted/40 text-xs text-muted-foreground">
              <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>
                Publishing and Scrutineer countersignature are locked. All assigned adjudicators must
                certify their scorecards or be granted an audited emergency override first.
              </span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                    All Adjudicators Certified — Scrutineer Sign-Off Required
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The round scorecards have been certified by all judges. Please countersign below to unlock publication.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setCountersignModalOpen(true)}
                className="gap-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Countersign Round</span>
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      {/* Emergency Override Dialog */}
      <Dialog open={overrideModalOpen} onOpenChange={(open) => !open && setOverrideModalOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mb-2">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold">Emergency Floor Override</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Apply an audited staff override for adjudicator{" "}
              <span className="font-semibold text-foreground">{selectedJudge?.name}</span>. This
              action is logged with an immutable audit record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="override-reason" className="text-xs font-semibold">
                Mandatory Justification <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="override-reason"
                value={overrideReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setOverrideReason(e.target.value)
                }
                placeholder="e.g. Adjudicator tablet experienced hardware battery failure; scores confirmed via verified physical score sheet."
                className="text-xs resize-none h-20"
              />
              <p className="text-[11px] text-muted-foreground">Minimum 10 characters required.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="paper-photo-upload" className="text-xs font-semibold">
                Paper Score Sheet Photo <span className="text-muted-foreground font-normal">(Optional Camera / File)</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="paper-photo-upload"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setOverrideFile(file);
                  }}
                  className="text-xs file:text-xs"
                />
              </div>
              {overrideFile && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Photo selected: {overrideFile.name} ({(overrideFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOverrideModalOpen(false)}
              disabled={isSubmittingOverride}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmOverride}
              disabled={isSubmittingOverride || overrideReason.trim().length < 10}
              className="font-bold gap-1.5"
            >
              {isSubmittingOverride ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldAlert className="w-4 h-4" />
              )}
              <span>Apply Emergency Override</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scrutineer Countersign Modal */}
      <Dialog
        open={countersignModalOpen}
        onOpenChange={(open) => !open && setCountersignModalOpen(false)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
              <PenTool className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold">Chief Scrutineer Certification</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Sign below to countersign and certify the tabulations for{" "}
              <span className="font-semibold text-foreground">{roundName}</span>. This cryptographically
              authorizes publishing results to the public board.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <SignaturePad
              value={countersignSvg}
              onChange={(svg, type) => {
                setCountersignSvg(svg);
                setCountersignType(type);
              }}
              height={160}
            />

            <p className="text-[11px] text-muted-foreground italic font-serif leading-relaxed">
              "I hereby attest as Chief Scrutineer that all adjudicator scores for {roundName} have
              been mathematically verified, properly audited, and certified in accordance with official competition rules."
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCountersignModalOpen(false)}
              disabled={isSubmittingCountersign}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCountersign}
              disabled={isSubmittingCountersign || !countersignSvg}
              className="font-bold gap-1.5"
            >
              {isSubmittingCountersign ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Certify & Affix Seal</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paper Attachment Lightbox Modal */}
      {selectedAttachment && (
        <PaperAttachmentModal
          isOpen={attachmentModalOpen}
          onClose={() => {
            setAttachmentModalOpen(false);
            setSelectedAttachment(null);
          }}
          sessionToken={sessionToken}
          storageId={selectedAttachment.storageId}
          judgeName={selectedAttachment.judgeName}
          overrideReason={selectedAttachment.reason}
          timestamp={selectedAttachment.timestamp}
        />
      )}
    </Card>
  );
}
