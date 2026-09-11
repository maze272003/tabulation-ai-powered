"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Award,
  Calendar,
  Lock,
  Loader2,
  Sparkles,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function PublicVerificationPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const resolvedParams = use(params);
  const hash = decodeURIComponent(resolvedParams.hash);

  const [copied, setCopied] = useState(false);

  const record = useQuery(api.signatures.getPublicVerificationRecord, {
    verificationHash: hash,
  });

  function handleCopyHash() {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    toast.success("Verification hash copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  if (record === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <p className="text-sm text-slate-400 animate-pulse">
            Verifying cryptographic proof against official ledger...
          </p>
        </div>
      </div>
    );
  }

  if (record === null) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="max-w-md w-full border-rose-900/50 bg-slate-900 shadow-2xl text-center">
          <CardHeader className="pb-3">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <CardTitle className="text-xl font-bold text-slate-100">
              Verification Failed
            </CardTitle>
            <CardDescription className="text-xs text-slate-400 mt-1">
              No authentic certified tabulation record matches this verification hash.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3 font-mono text-[11px] text-slate-400 break-all select-all">
              {hash}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              This document or QR code may be counterfeit, invalid, or belongs to a round that has
              not yet been officially published and countersigned by the Chief Scrutineer.
            </p>

            <Link href="/" className="inline-block pt-2">
              <Button variant="outline" size="sm" className="text-xs border-slate-800 hover:bg-slate-800">
                Return to Tabulation AI
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    eventName,
    roundName,
    publishedAt,
    decimalPrecision,
    standings,
    certifications,
    verificationHash,
  } = record;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Verification Shield Header */}
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 to-slate-900/60 p-6 sm:p-8 backdrop-blur-md shadow-2xl space-y-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] uppercase font-bold tracking-wider">
                    Officially Certified
                  </Badge>
                  <span className="text-[11px] text-slate-400 font-mono">
                    SHA-256 Proven
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
                  Authentic Tabulation Record
                </h1>
              </div>
            </div>

            <div className="text-center sm:text-right text-xs text-slate-400">
              <div>Certified on</div>
              <div className="font-semibold text-slate-200">
                {new Date(publishedAt).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Competition Event:</span>
              <span className="font-bold text-slate-100 text-sm">{eventName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Segment / Round:</span>
              <span className="font-bold text-slate-100 text-sm">{roundName}</span>
            </div>
          </div>
        </div>

        {/* Cryptographic Digest Card */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardHeader className="py-3 px-5 border-b border-slate-800/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Cryptographic Verification Digest
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyHash}
              className="h-7 px-2 text-[11px] gap-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy Hash"}</span>
            </Button>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-2">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-400 break-all select-all leading-relaxed">
              {verificationHash}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              This tamper-proof digest was generated directly from the canonical sorted score matrix,
              individual judge affidavits, and the Chief Scrutineer countersignature. If even one score
              were modified, this hash would fail to verify.
            </p>
          </CardContent>
        </Card>

        {/* Official Standings Table */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-md overflow-hidden">
          <CardHeader className="py-3 px-5 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Certified Round Standings
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-4 w-16 text-center">Rank</th>
                  <th className="py-2.5 px-4">Contestant Name</th>
                  <th className="py-2.5 px-4 text-right w-32">Official Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {standings.map((row) => (
                  <tr key={`${row.rank}-${row.contestantName}`} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 text-center font-bold text-slate-200 font-serif">
                      #{row.rank ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-white">
                      {row.contestantName}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {(row.roundScore ?? 0).toFixed(decimalPrecision)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Affixed Signatures & Affidavits */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardHeader className="py-3 px-5 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Affixed Adjudicator Signatures & Scrutineer Seal
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {certifications.map((cert) => (
                <div
                  key={`${cert.displayName}-${cert.role}`}
                  className={cn(
                    "p-4 rounded-xl border flex flex-col justify-between min-h-[140px]",
                    cert.role === "scrutineer"
                      ? "border-emerald-500/40 bg-emerald-950/20 sm:col-span-2"
                      : "border-slate-800 bg-slate-950/60",
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-300">
                      {cert.displayName}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] uppercase font-bold",
                        cert.role === "scrutineer"
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                          : cert.isOverride
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                            : "bg-slate-800 text-slate-300 border-slate-700",
                      )}
                    >
                      {cert.role === "scrutineer"
                        ? "Chief Scrutineer"
                        : cert.isOverride
                          ? "Emergency Override"
                          : "Adjudicator"}
                    </Badge>
                  </div>

                  {/* SVG Signature Vector Rendering */}
                  <div className="h-14 flex items-center justify-center bg-white/95 rounded-lg p-2 my-2 border border-slate-700/50">
                    {cert.svgPath ? (
                      <svg viewBox="0 0 500 180" className="h-10 w-auto max-w-[180px] text-slate-950">
                        <path
                          d={cert.svgPath}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span className="text-xs italic text-slate-500 font-serif">
                        {cert.isOverride ? "Paper Sheet Floor Override" : "Digital Signature on File"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <span>{cert.titleOrAffiliation || "Official Committee"}</span>
                    <span className="font-mono">
                      {new Date(cert.signedAt).toLocaleDateString()} {new Date(cert.signedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-400 py-6 space-y-1">
          <p>This verification portal is powered by Tabulation AI Cryptographic Certification Suite.</p>
          <p className="text-[10px]">All rights reserved. Digital signatures comply with international electronic record standards.</p>
        </div>
      </div>
    </div>
  );
}
