"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, Shield, QrCode } from "lucide-react";
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

export interface JudgeBadgeAccount {
  _id: string;
  displayName: string;
  username: string;
  kind: "judge" | "staff";
  password?: string;
}

export function PrintJudgeBadgesDialog({
  open,
  onOpenChange,
  eventName,
  eventCode,
  venue,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventName: string;
  eventCode: string;
  venue?: string;
  accounts: JudgeBadgeAccount[];
}) {
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const judges = accounts.filter((a) => a.kind === "judge");

  useEffect(() => {
    if (!open || judges.length === 0) return;

    let isMounted = true;
    const baseOrigin = origin || (typeof window !== "undefined" ? window.location.origin : "");

    async function generateQrs() {
      const qrs: Record<string, string> = {};
      for (const judge of judges) {
        const loginUrl = `${baseOrigin}/sign-in?tab=judge&code=${encodeURIComponent(
          eventCode
        )}&u=${encodeURIComponent(judge.username)}${
          judge.password ? `&p=${encodeURIComponent(judge.password)}` : ""
        }`;
        try {
          const dataUrl = await QRCode.toDataURL(loginUrl, {
            margin: 1,
            width: 160,
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
          });
          qrs[judge._id] = dataUrl;
        } catch {
          // Fallback if QR fails
        }
      }
      if (isMounted) {
        setQrCodes(qrs);
      }
    }

    void generateQrs();
    return () => {
      isMounted = false;
    };
  }, [open, judges, eventCode, origin]);

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Shield className="size-5 text-primary" />
                Print-Ready Judge Badges
              </DialogTitle>
              <DialogDescription>
                Print badges with individual auto-login QR codes for all {judges.length} judges.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Badges Container / Print Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2">
              <QrCode className="size-4 text-primary" />
              <span>
                Judges can scan their QR code with their mobile device camera to log in instantly.
              </span>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {judges.length} Badge{judges.length === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="printable-badges-grid grid grid-cols-1 md:grid-cols-2 gap-4">
            {judges.map((judge, idx) => (
              <div
                key={judge._id}
                className="badge-card relative flex flex-col justify-between p-5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-card text-card-foreground shadow-xs page-break-inside-avoid"
              >
                {/* Badge Header */}
                <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-primary uppercase">
                      <Shield className="size-3" />
                      Official Judge Pass
                    </div>
                    <h3 className="font-heading font-bold text-base line-clamp-1">{eventName}</h3>
                    {venue && <p className="text-[11px] text-muted-foreground">{venue}</p>}
                  </div>
                  <Badge variant="secondary" className="font-mono text-[10px] shrink-0">
                    Seat #{idx + 1}
                  </Badge>
                </div>

                {/* Badge Body */}
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-muted-foreground">Assigned Judge:</span>
                    <h4 className="text-lg font-extrabold tracking-tight text-foreground">
                      {judge.displayName}
                    </h4>
                    <div className="space-y-0.5 text-xs text-muted-foreground font-mono">
                      <div>
                        Event Code: <span className="font-bold text-foreground">{eventCode}</span>
                      </div>
                      <div>
                        Username: <span className="font-bold text-foreground">{judge.username}</span>
                      </div>
                      {judge.password && (
                        <div>
                          Passcode: <span className="font-bold text-foreground">{judge.password}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-1 shrink-0 bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                    {qrCodes[judge._id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrCodes[judge._id]}
                        alt={`Login QR for ${judge.displayName}`}
                        className="size-24 object-contain"
                      />
                    ) : (
                      <div className="size-24 flex items-center justify-center bg-slate-100 text-slate-400 text-xs">
                        Loading QR…
                      </div>
                    )}
                    <span className="text-[9px] font-semibold text-slate-700 tracking-tight">
                      Scan to Enter
                    </span>
                  </div>
                </div>

                {/* Badge Footer */}
                <div className="border-t border-dashed border-border/60 pt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Tabulation AI Platform</span>
                  <span className="font-mono text-[9px]">✂ Cut along dashed line</span>
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
            Print All Badges
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
