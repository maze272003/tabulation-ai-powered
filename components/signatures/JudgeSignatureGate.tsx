"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/signatures/SignaturePad";
import { ShieldCheck, Loader2, Sparkles, BellRing } from "lucide-react";
import { toast } from "sonner";

export interface JudgeSignatureAccount {
  _id: any;
  kind: "staff" | "judge";
  displayName: string;
  username: string;
  signatureSpecimen?: string;
  signatureType?: "drawn" | "typed" | "uploaded";
  signatureRegisteredAt?: number;
  titleOrAffiliation?: string;
  lastNudgeAt?: number;
  lastNudgeMessage?: string;
}

export interface JudgeSignatureGateProps {
  sessionToken: string;
  account: JudgeSignatureAccount;
  eventName: string;
}

/**
 * Synthesizes a subtle, pleasant chime using browser Web Audio API
 * without requiring external sound asset files.
 */
function playNudgeChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Audio playback not allowed or supported
  }
}

export function JudgeSignatureGate({
  sessionToken,
  account,
  eventName,
}: JudgeSignatureGateProps) {
  const registerMutation = useMutation(api.signatures.registerSignatureSpecimen);

  const needsSignature =
    account.kind === "judge" && (!account.signatureSpecimen || account.signatureSpecimen.length === 0);

  const [isOpen, setIsOpen] = useState(needsSignature);
  const [svgPath, setSvgPath] = useState("");
  const [signatureType, setSignatureType] = useState<"drawn" | "typed" | "uploaded">("drawn");
  const [legalName, setLegalName] = useState(account.displayName);
  const [titleOrAffiliation, setTitleOrAffiliation] = useState(account.titleOrAffiliation || "");
  const [oathAccepted, setOathAccepted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Synchronize modal state if account changes
  useEffect(() => {
    if (needsSignature) {
      setIsOpen(true);
    }
  }, [needsSignature]);

  // Live Scrutineer Nudge Listener
  const lastNudgeHandledRef = useRef<number>(account.lastNudgeAt || 0);
  useEffect(() => {
    if (account.lastNudgeAt && account.lastNudgeAt > lastNudgeHandledRef.current) {
      lastNudgeHandledRef.current = account.lastNudgeAt;
      playNudgeChime();
      toast.info(account.lastNudgeMessage || "Staff request: Please review and sign your scorecard.", {
        icon: <BellRing className="w-4 h-4 text-primary animate-bounce" />,
        duration: 8000,
      });
    }
  }, [account.lastNudgeAt, account.lastNudgeMessage]);

  const handleSave = async () => {
    if (!svgPath.trim()) {
      toast.error("Please provide your signature before proceeding.");
      return;
    }
    if (!oathAccepted) {
      toast.error("You must affirm the Oath of Impartiality to begin judging.");
      return;
    }

    setIsSaving(true);
    try {
      await registerMutation({
        sessionToken,
        svgPath,
        signatureType,
        titleOrAffiliation: titleOrAffiliation.trim() || undefined,
      });
      toast.success("Signature specimen registered successfully. You may now score rounds.");
      setIsOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to register signature. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Only allow closing if a signature is already on file
        if (!needsSignature) {
          setIsOpen(open);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">
            Official Judge Signature Onboarding
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Welcome to <strong className="text-foreground">{eventName}</strong>. Prior to scoring, competition regulations require adjudicators to register an official digital signature specimen and affirm impartiality.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Legal Name & Affiliation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="judge-legal-name" className="text-xs font-semibold">
                Official Adjudicator Name
              </Label>
              <Input
                id="judge-legal-name"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Full Legal Name"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="judge-title" className="text-xs font-semibold">
                Title / Affiliation <span className="text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                id="judge-title"
                value={titleOrAffiliation}
                onChange={(e) => setTitleOrAffiliation(e.target.value)}
                placeholder="e.g. Certified Adjudicator, Guest Judge"
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Signature Pad */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span>Official Signature Specimen</span>
              <span className="text-[10px] text-muted-foreground font-normal">
                Used to authorize official round scorecards
              </span>
            </Label>
            <SignaturePad
              value={svgPath}
              onChange={(svg, type) => {
                setSvgPath(svg);
                setSignatureType(type);
              }}
              onClear={() => setSvgPath("")}
              defaultName={legalName}
              height={160}
            />
          </div>

          {/* Oath of Impartiality Checkbox */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-primary/20 bg-primary/5 text-xs">
            <input
              type="checkbox"
              id="oath-checkbox"
              checked={oathAccepted}
              onChange={(e) => setOathAccepted(e.target.checked)}
              className="mt-0.5 rounded-sm border-primary text-primary focus:ring-primary h-4 w-4 shrink-0 cursor-pointer"
            />
            <Label htmlFor="oath-checkbox" className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 cursor-pointer font-serif italic">
              "I solemnly swear on my honor to evaluate all contestants independently, honestly, and without bias in accordance with the established competition criteria, weights, and official guidelines."
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !svgPath || !oathAccepted}
            className="w-full sm:w-auto font-bold gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>Register Signature & Enter Workspace</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
