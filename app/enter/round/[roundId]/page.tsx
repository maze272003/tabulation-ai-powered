"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEnterSession } from "@/components/enter/EnterAppShell";
import { BondPaperScoreSheet } from "@/components/enter/BondPaperScoreSheet";
import { ClassicRoundScoring } from "@/components/enter/ClassicRoundScoring";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RoundScoringPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const resolvedParams = use(params);
  const roundId = resolvedParams.roundId as Id<"rounds">;
  const { sessionToken } = useEnterSession();

  const [viewMode, setViewMode] = useState<"bond_paper" | "classic">("bond_paper");

  useEffect(() => {
    const saved = localStorage.getItem("judge_scoring_view_preference");
    if (saved === "bond_paper" || saved === "classic") {
      setViewMode(saved);
    }
  }, []);

  const handleToggleView = (mode: "bond_paper" | "classic") => {
    setViewMode(mode);
    localStorage.setItem("judge_scoring_view_preference", mode);
  };

  const data = useQuery(api.enter.scoring.roundScoringSheet, {
    sessionToken,
    roundId,
  });

  if (data === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading score sheet...
        </p>
      </div>
    );
  }

  if (data === null || !data.round) {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold">Round Not Found</h2>
        <p className="text-sm text-muted-foreground">
          This round does not exist or you are not authorized to score this event segment.
        </p>
        <Link href="/enter" className={cn(buttonVariants({ variant: "outline" }))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return viewMode === "bond_paper" ? (
    <BondPaperScoreSheet
      sessionToken={sessionToken}
      roundId={roundId}
      onSwitchToClassic={() => handleToggleView("classic")}
      data={data}
    />
  ) : (
    <ClassicRoundScoring
      sessionToken={sessionToken}
      roundId={roundId}
      data={data}
      onSwitchToBondPaper={() => handleToggleView("bond_paper")}
    />
  );
}

