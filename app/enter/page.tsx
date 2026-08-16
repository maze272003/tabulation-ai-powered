"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEnterSession } from "@/components/enter/EnterAppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/tabulation/StatusBadge";
import { cn } from "@/lib/utils";
import { Sparkles, Trophy, ClipboardList, Eye, CheckCircle2, Lock, ArrowRight, Loader2, Calendar, Layers, Activity, Award } from "lucide-react";
import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";

interface JudgeSheetItem {
  sheetId: Id<"scoreSheets">;
  contestantId: Id<"contestants">;
  contestantName: string;
  contestantNumber: number;
  status: "not_started" | "in_progress" | "submitted" | "locked";
}

interface JudgeRoundItem {
  roundId: Id<"rounds">;
  name: string;
  order: number;
  status: string;
  sheets: JudgeSheetItem[];
}

interface StaffRoundItem {
  _id: Id<"rounds">;
  name: string;
  order: number;
  weight: number;
  status: string;
  criteriaCount: number;
}

export default function EnterDashboardPage() {
  const { sessionToken, session } = useEnterSession();
  const { account, event } = session;

  if (account.kind === "judge") {
    return <JudgeDashboard sessionToken={sessionToken} account={account} event={event} />;
  }

  return <StaffDashboard sessionToken={sessionToken} event={event} />;
}

/* -------------------------------------------------------------------------- */
/*                              JUDGE DASHBOARD                               */
/* -------------------------------------------------------------------------- */

function JudgeDashboard({
  sessionToken,
  account,
  event,
}: {
  sessionToken: string;
  account: { displayName: string };
  event: { name: string; resultVisibility: string };
}) {
  const data = useQuery(api.enter.scoring.myAssignments, { sessionToken });

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const rounds = (data?.rounds ?? []) as JudgeRoundItem[];
  const totalSheets = rounds.reduce((acc: number, r: JudgeRoundItem) => acc + r.sheets.length, 0);
  const submittedSheets = rounds.reduce(
    (acc: number, r: JudgeRoundItem) =>
      acc + r.sheets.filter((s: JudgeSheetItem) => s.status === "submitted" || s.status === "locked").length,
    0,
  );
  const progressPercent = totalSheets > 0 ? Math.round((submittedSheets / totalSheets) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-muted border border-border/60 p-6 sm:p-8 shadow-xs">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Judge Workspace</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Welcome, {account.displayName}
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              You are assigned to evaluate contestants for <span className="font-semibold text-foreground">{event.name}</span>. Please complete all scores carefully.
            </p>
          </div>

          {/* Overall Progress Card */}
          <div className="flex flex-col items-center sm:items-end justify-center bg-card/80 backdrop-blur-xs border border-border/60 p-4 rounded-xl shadow-xs min-w-44">
            <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
              Scoring Progress
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-foreground">{submittedSheets}</span>
              <span className="text-sm text-muted-foreground">/ {totalSheets} submitted</span>
            </div>
            <div className="w-full bg-muted/60 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Assigned Rounds */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Your Assigned Rounds</h2>
            <p className="text-xs text-muted-foreground">Select a contestant sheet below to enter or review scores.</p>
          </div>
          {event.resultVisibility !== "private" && (
            <Link
              href="/enter/results"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
            >
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>View Results</span>
            </Link>
          )}
        </div>

        {rounds.length === 0 ? (
          <Card className="border-dashed p-10 text-center">
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <ClipboardList className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-base">No Assigned Rounds</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                You do not have any score sheets assigned for this event yet. Please check back when the organizer opens scoring.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-8">
            {rounds.map((round: JudgeRoundItem) => {
              const roundSubmitted = round.sheets.filter(
                (s: JudgeSheetItem) => s.status === "submitted" || s.status === "locked",
              ).length;
              const roundTotal = round.sheets.length;
              const isRoundClosed = round.status === "closed" || round.status === "published";

              return (
                <Card key={round.roundId} className="border-border/60 shadow-sm overflow-hidden">
                  <CardHeader className="bg-muted/30 border-b border-border/40 py-4 px-6 flex flex-row items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <CardTitle className="text-base font-semibold">{round.name}</CardTitle>
                        <Badge
                          variant={round.status === "open" ? "default" : "secondary"}
                          className="capitalize text-xs font-semibold"
                        >
                          {round.status}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs mt-0.5">
                        {roundSubmitted} of {roundTotal} sheets submitted
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {isRoundClosed && (
                        <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
                          <Lock className="w-3 h-3" />
                          <span>Round Closed</span>
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {round.sheets.map((sheet: JudgeSheetItem) => {
                        const isSubmitted = sheet.status === "submitted" || sheet.status === "locked";

                        return (
                          <div
                            key={sheet.sheetId}
                            className={`flex flex-col justify-between p-4 rounded-xl border transition-all ${
                              isSubmitted
                                ? "bg-muted/20 border-border/50"
                                : "bg-card border-border/70 hover:border-primary/50 hover:shadow-xs"
                            }`}
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-muted text-foreground">
                                      #{sheet.contestantNumber}
                                    </span>
                                    <h4 className="font-semibold text-sm text-foreground line-clamp-1">
                                      {sheet.contestantName}
                                    </h4>
                                  </div>
                                </div>
                                <StatusBadge kind="sheet" status={sheet.status} />
                              </div>
                            </div>

                            <div className="pt-4 mt-2 border-t border-border/30 flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {isSubmitted ? "Immutable" : "Editable"}
                              </span>
                              <Link
                                href={`/enter/sheet/${sheet.sheetId}`}
                                className={cn(
                                  buttonVariants({
                                    variant: isSubmitted ? "outline" : "default",
                                    size: "sm",
                                  }),
                                  "h-8 gap-1.5 font-medium text-xs",
                                )}
                              >
                                {isSubmitted ? (
                                  <>
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>View Sheet</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Score Sheet</span>
                                    <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                                  </>
                                )}
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              STAFF DASHBOARD                               */
/* -------------------------------------------------------------------------- */

function StaffDashboard({
  sessionToken,
  event,
}: {
  sessionToken: string;
  event: { name: string; status: string };
}) {
  const rounds = useQuery(api.enter.rounds.list, { sessionToken });

  if (rounds === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-muted border border-border/60 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-semibold">
              <Award className="w-3.5 h-3.5" />
              <span>Event Staff Command Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Staff Portal: {event.name}
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Monitor live judge scoring in real-time, close rounds, review standings, resolve ties, and publish official results.
            </p>
          </div>

          <Link
            href="/enter/results"
            className={cn(buttonVariants({ variant: "default", size: "lg" }), "gap-2 shrink-0 shadow-xs")}
          >
            <Trophy className="w-4 h-4" />
            <span>Event Standings & Results</span>
          </Link>
        </div>
      </div>

      {/* Rounds Overview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Rounds Control</h2>
            <p className="text-xs text-muted-foreground">Manage and monitor scoring progress for each round.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rounds.map((round: StaffRoundItem) => (
            <Card key={round._id} className="border-border/60 shadow-sm flex flex-col justify-between">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    Round {round.order}
                  </Badge>
                  <Badge
                    variant={
                      round.status === "published"
                        ? "default"
                        : round.status === "closed"
                        ? "secondary"
                        : "outline"
                    }
                    className="capitalize text-xs font-semibold"
                  >
                    {round.status}
                  </Badge>
                </div>
                <CardTitle className="text-lg font-bold">{round.name}</CardTitle>
                <CardDescription className="text-xs flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                    {round.criteriaCount} Criteria
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    Weight: {round.weight}%
                  </span>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/enter/staff/rounds/${round._id}/monitor`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full gap-1.5 h-9 text-xs")}
                  >
                    <Activity className="w-3.5 h-3.5 text-blue-500" />
                    <span>Live Monitor</span>
                  </Link>
                  <Link
                    href={`/enter/staff/rounds/${round._id}/review`}
                    className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-full gap-1.5 h-9 text-xs")}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Review / Publish</span>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

