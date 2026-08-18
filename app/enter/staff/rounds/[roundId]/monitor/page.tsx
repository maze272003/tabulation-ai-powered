"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEnterSession } from "@/components/enter/EnterAppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/tabulation/StatusBadge";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Activity,
  Lock,
  Unlock,
  CheckCircle2,
  Loader2,
  Users,
  Award,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function StaffRoundMonitorPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const resolvedParams = use(params);
  const roundId = resolvedParams.roundId as Id<"rounds">;
  const { sessionToken } = useEnterSession();

  const monitorData = useQuery(api.enter.rounds.roundMonitor, { sessionToken, roundId });
  const closeRoundMutation = useMutation(api.enter.rounds.closeRound);
  const reopenRoundMutation = useMutation(api.enter.rounds.reopenRound);

  const [isActing, setIsActing] = useState(false);

  if (monitorData === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Connecting to live round monitor...</p>
      </div>
    );
  }

  const { roundStatus, judges, contestants, sheets } = monitorData;

  const totalSheets = judges.length * contestants.length;
  const submittedCount = sheets.filter(
    (s: { status: string }) => s.status === "submitted" || s.status === "locked",
  ).length;
  const inProgressCount = sheets.filter((s: { status: string }) => s.status === "in_progress").length;
  const notStartedCount = sheets.filter((s: { status: string }) => s.status === "not_started").length;
  const progressPercent = totalSheets > 0 ? Math.round((submittedCount / totalSheets) * 100) : 0;

  async function handleCloseRound() {
    setIsActing(true);
    try {
      await closeRoundMutation({ sessionToken, roundId });
      toast.success("Round closed. Scoring is now locked.");
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to close round.");
    } finally {
      setIsActing(false);
    }
  }

  async function handleReopenRound() {
    setIsActing(true);
    try {
      await reopenRoundMutation({ sessionToken, roundId });
      toast.success("Round reopened for judge scoring.");
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to reopen round.");
    } finally {
      setIsActing(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/enter"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground hover:text-foreground w-fit")}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Staff Dashboard</span>
        </Link>

        <div className="flex items-center gap-2">
          {roundStatus === "open" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseRound}
              disabled={isActing}
              className="gap-1.5 h-9"
            >
              {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>Close Round</span>
            </Button>
          )}

          {roundStatus === "closed" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReopenRound}
                disabled={isActing}
                className="gap-1.5 h-9"
              >
                {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                <span>Reopen Round</span>
              </Button>

              <Link
                href={`/enter/staff/rounds/${roundId}/review`}
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5 h-9 font-semibold")}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Proceed to Review</span>
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </Link>
            </>
          )}

          {roundStatus === "published" && (
            <Link
              href="/enter/results"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5 h-9")}
            >
              <Award className="w-4 h-4" />
              <span>View Published Results</span>
            </Link>
          )}
        </div>
      </div>

      {/* Header Banner */}
      <Card className="border-border/60 shadow-sm bg-gradient-to-r from-card via-card to-muted/30">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-info-muted text-info flex items-center justify-center">
                  <Activity className="w-4 h-4 animate-pulse" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Live Round Monitor</h1>
                <Badge
                  variant={
                    roundStatus === "published"
                      ? "default"
                      : roundStatus === "closed"
                      ? "secondary"
                      : "outline"
                  }
                  className="capitalize text-xs font-semibold"
                >
                  {roundStatus}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Real-time reactive grid of judge sheet statuses. Changes sync instantaneously across all devices.
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-4 bg-background/80 border border-border/60 p-3.5 rounded-xl text-xs">
              <div>
                <span className="text-muted-foreground block">Submitted</span>
                <span className="font-bold text-base text-foreground">{submittedCount}</span>
              </div>
              <div className="w-px h-8 bg-border/60" />
              <div>
                <span className="text-muted-foreground block">In Progress</span>
                <span className="font-bold text-base text-warning">{inProgressCount}</span>
              </div>
              <div className="w-px h-8 bg-border/60" />
              <div>
                <span className="text-muted-foreground block">Not Started</span>
                <span className="font-bold text-base text-muted-foreground">{notStartedCount}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border/40">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5 font-medium">
              <span>Overall Completion</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reactive Submission Matrix Table */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/20">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span>Judge Submission Matrix</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Rows represent contestants and columns represent assigned judges.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground font-semibold">
                <th className="text-left py-3 px-4 min-w-48">Contestant</th>
                {judges.map((judge: { judgeId: Id<"eventAccounts">; name: string }) => (
                  <th key={judge.judgeId} className="text-center py-3 px-4 min-w-36">
                    {judge.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {contestants.map((k: { contestantId: Id<"contestants">; name: string; number: number }) => (
                <tr key={k.contestantId} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs px-1.5 py-0.5">
                        #{k.number}
                      </Badge>
                      <span className="truncate max-w-44">{k.name}</span>
                    </div>
                  </td>
                  {judges.map((judge: { judgeId: Id<"eventAccounts">; name: string }) => {
                    const sheet = sheets.find(
                      (s: { contestantId: Id<"contestants">; judgeId: Id<"eventAccounts">; status: string }) =>
                        s.contestantId === k.contestantId && s.judgeId === judge.judgeId,
                    );
                    const status = (sheet?.status ?? "not_started") as "not_started" | "in_progress" | "submitted" | "locked";

                    return (
                      <td key={judge.judgeId} className="text-center py-3 px-4">
                        <StatusBadge kind="sheet" status={status} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
