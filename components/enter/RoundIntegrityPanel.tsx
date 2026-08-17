"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEnterSession } from "@/components/enter/EnterAppShell";

const MIN_PANEL_NOTE = 3;

const LEVEL_TONE: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-warning-muted text-warning",
  critical: "bg-destructive/10 text-destructive",
};

function metricBar(label: string, value: string | null) {
  return (
    <div className="min-w-28">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value ?? "—"}</div>
    </div>
  );
}

export function RoundIntegrityPanel({ roundId }: { roundId: Id<"rounds"> }) {
  const { sessionToken } = useEnterSession();
  const report = useQuery(api.enter.rounds.integrityReport, { sessionToken, roundId });

  if (report === undefined) return null;
  const flagged = report.judges.filter((judge) => judge.flags.length > 0);

  return (
    <Card className="border-border/60 shadow-sm" aria-label="Judge integrity">
      <CardHeader className="py-3 px-6 border-b border-border/40 bg-muted/20">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" aria-hidden />
          <span>Judge Integrity</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Advisory signals from panel statistics — they never change scores or rankings automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {report.judges.length === 0 && (
          <p className="text-xs text-muted-foreground">No judges assigned yet.</p>
        )}
        {report.judges.map((judge) => (
          <div key={judge.judgeId} className="rounded-lg border border-border/50 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{judge.name}</span>
              <div className="flex flex-wrap gap-1">
                {judge.flags.length === 0 ? (
                  <Badge className="border-transparent bg-success-muted text-success">clear</Badge>
                ) : (
                  judge.flags.map((flag) => (
                    <Badge key={flag.metric} className={`border-transparent capitalize ${LEVEL_TONE[flag.level] ?? ""}`}>
                      {flag.metric.replace("_", " ")}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {metricBar("Bias z", judge.biasZ === null ? null : judge.biasZ.toFixed(2))}
              {metricBar("Differentiation", judge.differentiationRatio === null ? null : judge.differentiationRatio.toFixed(2))}
              {metricBar("Agreement ρ", judge.agreement === null ? null : judge.agreement.toFixed(2))}
              {metricBar("Sheets", `${Math.round(judge.completion * 100)}%`)}
            </div>
            {judge.flags.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {judge.flags.map((flag) => (
                  <li key={flag.metric}>{flag.explanation}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {flagged.length === 0 && report.judges.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No integrity signals on this panel. Statistics activate with {MIN_PANEL_NOTE}+ judges scoring.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
