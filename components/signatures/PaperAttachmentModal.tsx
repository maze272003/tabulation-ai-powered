"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, ExternalLink, ShieldAlert, Calendar } from "lucide-react";

export interface PaperAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
  storageId: string | null;
  judgeName: string;
  overrideReason?: string | null;
  timestamp?: number | null;
}

export function PaperAttachmentModal({
  isOpen,
  onClose,
  sessionToken,
  storageId,
  judgeName,
  overrideReason,
  timestamp,
}: PaperAttachmentModalProps) {
  const imageUrl = useQuery(
    api.signatures.getAttachmentUrl,
    storageId && isOpen ? { sessionToken, storageId } : "skip",
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-6 pb-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-warning/15 text-warning flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                Emergency Paper Score Sheet
                <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30 font-semibold">
                  Official Floor Override
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Physical score sheet backup on file for <span className="font-semibold text-foreground">{judgeName}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Metadata banner */}
          <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-2 text-xs">
            {overrideReason && (
              <div>
                <span className="font-semibold text-foreground">Recorded Justification:</span>
                <p className="text-muted-foreground mt-0.5 italic font-sans">{overrideReason}</p>
              </div>
            )}
            {timestamp && (
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-primary/70" />
                <span>Recorded on {new Date(timestamp).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Image Display */}
          <div className="border border-border/80 rounded-xl bg-slate-950/5 min-h-[260px] max-h-[480px] flex items-center justify-center overflow-hidden relative group">
            {!storageId ? (
              <div className="text-center p-8 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto opacity-40 mb-2" />
                <p className="text-xs">No image was attached for this override.</p>
              </div>
            ) : imageUrl === undefined ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground p-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Retrieving score sheet image...</span>
              </div>
            ) : imageUrl === null ? (
              <div className="text-center p-8 text-destructive">
                <p className="text-xs font-medium">Failed to load attachment image from storage.</p>
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={`Paper score sheet for ${judgeName}`}
                  className="max-w-full max-h-[460px] object-contain rounded-lg shadow-sm"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-3 sm:p-4 border-t border-border bg-muted/20 flex flex-row items-center justify-between">
          {imageUrl ? (
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open full resolution</span>
            </a>
          ) : (
            <div />
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
