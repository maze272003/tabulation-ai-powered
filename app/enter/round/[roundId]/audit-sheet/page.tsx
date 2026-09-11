"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEnterSession } from "@/components/enter/EnterAppShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Printer,
  ShieldCheck,
  Award,
  Calendar,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  AlertTriangle,
  QrCode as QrCodeIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function RoundAuditSheetPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const resolvedParams = use(params);
  const roundId = resolvedParams.roundId as Id<"rounds">;
  const { sessionToken } = useEnterSession();

  const data = useQuery(api.signatures.getRoundAuditSheetData, {
    sessionToken,
    roundId,
  });

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  useEffect(() => {
    if (!data) return;

    const baseOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const verificationUrl = data.verificationHash
      ? `${baseOrigin}/verify/${encodeURIComponent(data.verificationHash)}`
      : `${baseOrigin}/enter/round/${roundId}`;

    QRCode.toDataURL(verificationUrl, {
      margin: 1,
      width: 140,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then(setQrCodeDataUrl)
      .catch((err) => console.error("Failed to generate QR code", err));
  }, [data, roundId]);

  if (data === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Generating Tabulation Audit Sheet...
        </p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold">Round Not Found</h2>
        <p className="text-sm text-muted-foreground">
          The requested audit record is not available or you do not have permission to view it.
        </p>
        <Link href="/enter" className={cn(buttonVariants({ variant: "outline" }))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const {
    eventName,
    orgName,
    roundName,
    roundStatus,
    decimalPrecision,
    publishedAt,
    verificationHash,
    standings,
    criteria,
    judges,
    scrutineer,
  } = data;

  const isPublished = roundStatus === "published";

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950/40 p-4 sm:p-8 print:p-0 print:bg-white text-slate-900">
      {/* Print Controls Bar - Hidden during print */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link
          href={`/enter/staff/rounds/${roundId}/review`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Round Review</span>
        </Link>

        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-xs",
              isPublished
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-600 border-amber-500/30",
            )}
          >
            {isPublished ? "Official Sealed Record" : "Draft Preview — Not Sealed"}
          </Badge>
          <Button
            onClick={() => window.print()}
            className="gap-2 font-semibold shadow-sm bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Printer className="w-4 h-4" />
            <span>Print Audit Sheet</span>
          </Button>
        </div>
      </div>

      {/* Official Audit Document Sheet Container */}
      <div className="max-w-4xl mx-auto bg-white text-slate-900 border border-slate-300 shadow-xl rounded-xl p-8 sm:p-12 print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none">
        {/* Document Header */}
        <header className="border-b-2 border-slate-900 pb-6 mb-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 font-sans">
                {orgName}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-serif text-slate-950 uppercase">
                {eventName}
              </h1>
              <div className="text-sm sm:text-base font-bold text-slate-700 font-serif">
                Official Tabulation Audit & Certification Sheet
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-1 font-mono">
                <span>Segment: <strong>{roundName}</strong></span>
                <span>•</span>
                <span>Status: <strong>{roundStatus.toUpperCase()}</strong></span>
                {publishedAt && (
                  <>
                    <span>•</span>
                    <span>Sealed: {new Date(publishedAt).toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>

            {/* Verification QR Code Box */}
            <div className="text-center shrink-0 flex flex-col items-center p-2 rounded-lg border border-slate-200 bg-slate-50">
              {qrCodeDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrCodeDataUrl}
                  alt="Scan to verify document"
                  className="w-24 h-24 object-contain"
                />
              ) : (
                <div className="w-24 h-24 flex items-center justify-center text-slate-400">
                  <QrCodeIcon className="w-8 h-8 opacity-40" />
                </div>
              )}
              <span className="text-[9px] font-mono font-bold tracking-wider text-slate-600 uppercase mt-1">
                Scan to Verify
              </span>
            </div>
          </div>

          {/* Verification Hash Stamp */}
          {verificationHash ? (
            <div className="mt-4 p-2.5 rounded bg-slate-100 border border-slate-200 flex items-center justify-between gap-4 font-mono text-[10px]">
              <div className="flex items-center gap-2 text-slate-700">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>CRYPTOGRAPHIC VERIFICATION DIGEST:</span>
                <span className="font-bold text-slate-900 select-all">{verificationHash}</span>
              </div>
              <span className="text-emerald-700 font-bold uppercase tracking-wider shrink-0">
                ✓ Valid & Tamper-Proof
              </span>
            </div>
          ) : (
            <div className="mt-4 p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Pre-publication draft audit preview. Root cryptographic hash is computed upon official publication.
              </span>
            </div>
          )}
        </header>

        {/* Master Standings Table */}
        <section className="mb-8">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 font-sans">
            Official Round Standings & Placements
          </h2>
          <table className="w-full text-left border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold font-serif">
                <th className="py-2.5 px-3 border-r border-slate-300 text-center w-14">Rank</th>
                <th className="py-2.5 px-3 border-r border-slate-300 text-center w-16">No.</th>
                <th className="py-2.5 px-4 border-r border-slate-300">Contestant Name</th>
                {standings.some((s) => s.categoryName) && (
                  <th className="py-2.5 px-3 border-r border-slate-300">Category</th>
                )}
                <th className="py-2.5 px-4 text-right w-28">Round Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-sans">
              {standings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No contestants tabulated for this round.
                  </td>
                </tr>
              ) : (
                standings.map((row) => (
                  <tr key={`${row.rank}-${row.contestantNumber}`} className="even:bg-slate-50/50">
                    <td className="py-2 px-3 border-r border-slate-300 text-center font-bold font-serif text-sm">
                      {row.rank}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-300 text-center font-mono font-semibold">
                      #{row.contestantNumber}
                    </td>
                    <td className="py-2 px-4 border-r border-slate-300 font-semibold text-slate-950">
                      {row.contestantName}
                    </td>
                    {standings.some((s) => s.categoryName) && (
                      <td className="py-2 px-3 border-r border-slate-300 text-slate-600">
                        {row.categoryName || "—"}
                      </td>
                    )}
                    <td className="py-2 px-4 text-right font-mono font-bold text-slate-950">
                      {row.roundScore.toFixed(decimalPrecision)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Criteria Summary */}
        {criteria.length > 0 && (
          <section className="mb-8 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <span className="font-bold text-slate-700 block mb-1">Evaluated Criteria:</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
              {criteria.map((c) => (
                <span key={c.id}>
                  <strong>{c.name}</strong> ({c.weight}%, max {c.maxScore} pts)
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Adjudicators Signatures Grid */}
        <section className="mb-8">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 font-sans">
            Adjudicator Affidavits & Digital Signatures
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {judges.map((judge) => (
              <div
                key={judge.judgeId}
                className="border border-slate-300 rounded-lg p-3 bg-white flex flex-col justify-between min-h-[140px]"
              >
                {/* Signature Vector Render */}
                <div className="h-16 flex items-center justify-center border-b border-slate-200 mb-2">
                  {judge.isOverride ? (
                    <div className="text-center">
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded uppercase">
                        Emergency Override
                      </span>
                      <p className="text-[9px] text-slate-500 mt-1 line-clamp-1">
                        {judge.overrideReason}
                      </p>
                    </div>
                  ) : judge.svgPath ? (
                    <svg viewBox="0 0 500 180" className="h-12 w-auto max-w-[180px] text-slate-950">
                      <path
                        d={judge.svgPath}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="text-xs italic text-slate-400 font-serif">
                      Awaiting Signature
                    </span>
                  )}
                </div>

                {/* Judge Info */}
                <div className="text-center">
                  <div className="font-bold font-serif text-xs text-slate-900">
                    {judge.name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {judge.titleOrAffiliation || "Official Adjudicator"}
                  </div>
                  {judge.signedAt && (
                    <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                      {new Date(judge.signedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Chief Scrutineer Countersignature Seal */}
        <section className="border-t-2 border-slate-900 pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-4 rounded-xl border-2 border-slate-900 bg-slate-50">
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center gap-1.5 justify-center sm:justify-start text-xs font-black uppercase tracking-wider text-slate-900 font-serif">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Audited & Certified by Chief Scrutineer</span>
              </div>
              <p className="text-xs text-slate-600 max-w-md">
                "I hereby attest that all scores for this round have been tabulated with mathematical
                rigor and validated against the competition rules."
              </p>
              {scrutineer?.signedAt && (
                <div className="text-[10px] font-mono text-slate-500">
                  Countersigned on {new Date(scrutineer.signedAt).toLocaleString()}
                </div>
              )}
            </div>

            {/* Scrutineer Signature Box */}
            <div className="text-center shrink-0 flex flex-col items-center">
              <div className="border-b-2 border-slate-900 w-48 h-16 flex items-center justify-center pb-1">
                {scrutineer?.svgPath ? (
                  <svg viewBox="0 0 500 180" className="h-12 w-auto max-w-[180px] text-slate-950">
                    <path
                      d={scrutineer.svgPath}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span className="text-xs italic text-slate-400 font-serif">
                    Pending Countersignature
                  </span>
                )}
              </div>
              <div className="text-xs font-bold font-serif text-slate-900 mt-1">
                {scrutineer?.name || "Chief Scrutineer"}
              </div>
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                {scrutineer?.titleOrAffiliation || "Official Tabulator"}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
