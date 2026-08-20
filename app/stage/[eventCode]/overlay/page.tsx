"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { Crown, Radio, Trophy } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { formatScore } from "@/components/tabulation/status";

export default function ObsBroadcastOverlayPage({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = use(params);
  const result = useQuery(api.publicResults.get, { eventCode });

  if (result === undefined || result === null || result instanceof Error) {
    return (
      <div className="min-h-screen bg-transparent p-6 flex flex-col justify-end">
        <div className="max-w-md bg-slate-950/80 backdrop-blur-md text-white p-4 rounded-xl border border-slate-800 shadow-2xl flex items-center gap-3">
          <Radio className="size-4 text-emerald-400 animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wider uppercase text-slate-300">
            OBS Overlay Active • Code: {eventCode.toUpperCase()}
          </span>
        </div>
      </div>
    );
  }

  const latestRound = result.rounds[0];
  const champion = latestRound?.categories
    .flatMap((c) => c.standings)
    .find((s) => s.rank === 1);

  const precision = result.event.decimalPrecision ?? 2;

  return (
    <div className="min-h-screen bg-transparent p-6 sm:p-10 flex flex-col justify-end pointer-events-none select-none">
      {/* Lower Third Broadcast Container */}
      <div className="max-w-xl animate-in slide-in-from-bottom duration-500 space-y-2">
        {/* Main Graphic Bar */}
        <div className="bg-slate-950/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-5 shadow-2xl text-white flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              {champion ? <Crown className="size-6 text-amber-400" /> : <Trophy className="size-6 text-amber-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] font-bold">
                  ● LIVE BROADCAST
                </Badge>
                {latestRound && (
                  <span className="text-xs font-semibold text-slate-400">
                    {latestRound.name}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-extrabold font-heading text-white tracking-tight mt-0.5">
                {result.event.name}
              </h2>
            </div>
          </div>

          {/* If 1st place champion is published */}
          {champion && (
            <div className="text-right border-l border-slate-800 pl-4 shrink-0">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Leader / 1st Place
              </span>
              <div className="text-base font-bold text-white line-clamp-1">
                {champion.name}
              </div>
              <div className="text-xs font-mono font-bold text-amber-300">
                Score: {formatScore(champion.roundScore, precision)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
