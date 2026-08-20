"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, Trophy, Users, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export interface ContestantPlacardItem {
  _id: string;
  number: number;
  name: string;
  categoryName?: string;
  group?: string;
}

export function PrintContestantPlacardsDialog({
  open,
  onOpenChange,
  eventName,
  eventCode,
  contestants,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventName: string;
  eventCode: string;
  contestants: ContestantPlacardItem[];
}) {
  const [publicQr, setPublicQr] = useState<string>("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    const baseOrigin = origin || (typeof window !== "undefined" ? window.location.origin : "");
    const publicUrl = `${baseOrigin}/public/${encodeURIComponent(eventCode)}`;

    async function generateQr() {
      try {
        const dataUrl = await QRCode.toDataURL(publicUrl, {
          margin: 1,
          width: 140,
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        });
        if (isMounted) {
          setPublicQr(dataUrl);
        }
      } catch {
        // Fallback
      }
    }

    void generateQr();
    return () => {
      isMounted = false;
    };
  }, [open, eventCode, origin]);

  function handlePrint() {
    window.print();
  }

  const sorted = [...contestants].sort((a, b) => a.number - b.number);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Trophy className="size-5 text-primary" />
                Print-Ready Contestant Stage Placards
              </DialogTitle>
              <DialogDescription>
                Print high-visibility table cards and stage numbers for all {sorted.length} contestants.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Placards Grid / Print Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <span>
                Formatted for standard Letter / A4 paper with bold numbers visible from stage and audience.
              </span>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {sorted.length} Placard{sorted.length === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="printable-placards-grid grid grid-cols-1 md:grid-cols-2 gap-6">
            {sorted.map((c) => (
              <div
                key={c._id}
                className="placard-card relative flex flex-col justify-between p-6 rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-card text-card-foreground shadow-xs page-break-inside-avoid text-center"
              >
                {/* Event Name */}
                <div className="border-b border-border/60 pb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {eventName}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Code: {eventCode}
                  </Badge>
                </div>

                {/* Giant Contestant Number */}
                <div className="py-6 space-y-1">
                  <div className="text-6xl sm:text-7xl font-black font-heading tracking-tighter text-foreground">
                    #{c.number}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground line-clamp-1">
                    {c.name}
                  </h3>
                  {c.categoryName && (
                    <p className="text-sm font-semibold text-primary">{c.categoryName}</p>
                  )}
                  {c.group && <p className="text-xs text-muted-foreground">{c.group}</p>}
                </div>

                {/* Footer with Public QR */}
                <div className="border-t border-dashed border-border/60 pt-3 flex items-center justify-between text-left">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Live Standings
                    </span>
                    <span className="text-[11px] text-foreground font-medium">
                      Scan to view scores & ranks
                    </span>
                  </div>
                  {publicQr && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={publicQr}
                      alt="Event Public Results QR"
                      className="size-14 object-contain bg-white p-1 rounded border border-slate-200"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border/60 bg-background flex flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handlePrint} className="gap-2 shadow-xs">
            <Printer className="size-4" />
            Print Placards
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
