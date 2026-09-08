import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Lock,
  Monitor,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const TRADITIONAL_PAINS = [
  {
    icon: Clock,
    title: "30–60 Minute Stage Dead Air",
    description:
      "Physical runners collecting paper sheets while the audience and judges sit through awkward, momentum-killing delays.",
  },
  {
    icon: FileSpreadsheet,
    title: "Fragile Excel Formula Errors",
    description:
      "A single misplaced parenthesis or copy-paste glitch under live stage pressure can corrupt results and crown the wrong winner.",
  },
  {
    icon: AlertTriangle,
    title: "Zero Cryptographic Audit Trail",
    description:
      "Disputes cannot be resolved with proof. Accusations of altered scores or organizer bias ruin credibility and sponsor trust.",
  },
  {
    icon: FileText,
    title: "Manual Certificate Scramble",
    description:
      "Staff furiously typing names into PowerPoint templates backstage at midnight to hand-print awards before crowning.",
  },
];

const TABULATION_ADVANTAGES = [
  {
    icon: Zap,
    title: "Sub-Second Live Synchronization",
    description:
      "Scores calculate concurrently as judges input marks on their mobile phones, tablets, or laptops. Standings ready the second the last judge clicks submit.",
  },
  {
    icon: ShieldCheck,
    title: "100% Mathematical Precision",
    description:
      "Pre-configured weighted criteria, drop-highest/lowest rules, and multi-round advancement calculated with zero manual intervention.",
  },
  {
    icon: Lock,
    title: "Cryptographic Tamper-Proof Audit Trail",
    description:
      "Every mark, update, and lock action is permanently logged with timestamps and judge signatures, providing CPA-level verification.",
  },
  {
    icon: Monitor,
    title: "1-Click Stage Reveal & Batch Certificates",
    description:
      "Broadcast instant podium graphics to stage LED walls while generating customized, print-ready PDF award certificates in 1 click.",
  },
];

export function LandingComparisonSection() {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-muted/10 py-24 md:py-32">
      {/* Background visual accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-48 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-destructive/5 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-48 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <Badge
            variant="outline"
            className="mb-4 gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary"
          >
            <Sparkles className="size-3.5" />
            The High-Stakes Difference
          </Badge>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl text-balance">
            Why live competitions are retiring{" "}
            <span className="text-muted-foreground/70 line-through decoration-destructive decoration-2">
              clipboards & spreadsheets
            </span>
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg leading-relaxed text-pretty">
            Live events have zero margin for error. Discover why leading pageants, dance tournaments,
            and university leagues switched to Tabulation AI.
          </p>
        </div>

        {/* Side-by-Side Comparison Grid */}
        <div className="grid gap-8 lg:grid-cols-2 items-stretch">
          {/* Traditional Method Card */}
          <div className="relative flex flex-col justify-between rounded-2xl border border-destructive/20 bg-destructive/[0.02] p-6 sm:p-8 backdrop-blur-sm transition-all hover:border-destructive/30">
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-destructive/15">
                <div>
                  <Badge
                    variant="outline"
                    className="border-destructive/30 bg-destructive/10 text-destructive text-xs font-bold"
                  >
                    The Old Frustrating Way
                  </Badge>
                  <h3 className="mt-2 font-heading text-xl font-bold text-foreground">
                    Paper Ballots & Fragile Spreadsheets
                  </h3>
                </div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <XCircle className="size-6" />
                </div>
              </div>

              <div className="mt-6 space-y-5">
                {TRADITIONAL_PAINS.map((pain) => (
                  <div key={pain.title} className="flex gap-3.5 group">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                      <pain.icon className="size-4" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        {pain.title}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {pain.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-xl bg-destructive/10 p-4 border border-destructive/20">
              <p className="text-xs font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                Result: High stress, stage delays, and damaged event reputation.
              </p>
            </div>
          </div>

          {/* Modern Tabulation Engine Card */}
          <div className="relative flex flex-col justify-between rounded-2xl border-2 border-primary/40 bg-card p-6 sm:p-8 shadow-xl shadow-primary/5 transition-all hover:border-primary/60">
            {/* Subtle glow highlight */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-primary/20 blur-2xl"
            />

            <div>
              <div className="flex items-center justify-between pb-6 border-b border-border/80">
                <div>
                  <Badge className="bg-primary text-primary-foreground text-xs font-bold shadow-xs">
                    The Tabulation AI Engine
                  </Badge>
                  <h3 className="mt-2 font-heading text-xl font-bold text-foreground">
                    Real-Time, Audit-Grade Automation
                  </h3>
                </div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CheckCircle2 className="size-6" />
                </div>
              </div>

              <div className="mt-6 space-y-5">
                {TABULATION_ADVANTAGES.map((adv) => (
                  <div key={adv.title} className="flex gap-3.5 group">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <adv.icon className="size-4" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        {adv.title}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {adv.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl bg-primary/5 p-4 border border-primary/20">
              <p className="text-xs font-semibold text-primary flex items-center gap-2">
                <Sparkles className="size-4 shrink-0" />
                Result: Flawless coronation, 100% CPA trust, and zero delays.
              </p>
              <Button
                size="sm"
                render={<Link href="/sign-in" />}
                className="w-full sm:w-auto h-8 px-3.5 text-xs font-bold shrink-0 shadow-sm"
              >
                Experience Live
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
