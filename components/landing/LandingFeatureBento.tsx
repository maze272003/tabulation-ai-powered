import * as React from "react";
import {
  Award,
  CheckCircle2,
  Cpu,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lock,
  Monitor,
  Printer,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function LandingFeatureBento() {
  return (
    <section id="features" className="relative border-b border-border/60 bg-background py-24 md:py-32">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <Badge
            variant="outline"
            className="mb-4 gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary"
          >
            <Cpu className="size-3.5" />
            Engineered for the Entire Production Team
          </Badge>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl text-balance">
            Every role empowered. Zero friction on stage.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg leading-relaxed text-pretty">
            From the lead producer in the control room to the celebrity judge on their iPad,
            Tabulation delivers a tailored, mission-critical interface for each stakeholder.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-12">
          {/* Card 1: Event Directors & Producers (Large 7-col) */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card p-6 sm:p-8 lg:col-span-7 transition-all hover:border-primary/50 hover:shadow-lg">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:scale-105 transition-transform">
                  <LayoutDashboard className="size-6" />
                </span>
                <Badge variant="outline" className="text-xs font-semibold">
                  For Event Directors
                </Badge>
              </div>

              <h3 className="font-heading text-xl font-bold text-foreground sm:text-2xl">
                Unified Competition Command Center
              </h3>
              <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">
                Launch your competition in under 2 minutes. Configure preliminary, semifinal,
                and final rounds with customizable criteria weights, contestant quotas, and
                automated pre-flight readiness checks before showtime.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <CheckCircle2 className="size-4 text-primary shrink-0" />
                  <span className="font-medium">Multi-Round Criteria Blueprints</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <CheckCircle2 className="size-4 text-primary shrink-0" />
                  <span className="font-medium">Live Judge Progress Tracking</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <CheckCircle2 className="size-4 text-primary shrink-0" />
                  <span className="font-medium">1-Click Round Locking</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <CheckCircle2 className="size-4 text-primary shrink-0" />
                  <span className="font-medium">Automated Tie-Breaking Rules</span>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border/50 pt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono text-primary font-semibold">0 Prep Headaches</span>
              <span>Setup time: &lt; 120s</span>
            </div>
          </div>

          {/* Card 2: Judges & Adjudicators (5-col) */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card p-6 sm:p-8 lg:col-span-5 transition-all hover:border-primary/50 hover:shadow-lg">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20 group-hover:scale-105 transition-transform">
                  <KeyRound className="size-6" />
                </span>
                <Badge variant="outline" className="text-xs font-semibold">
                  For Judges
                </Badge>
              </div>

              <h3 className="font-heading text-xl font-bold text-foreground">
                Frictionless 6-Digit Judge Portal
              </h3>
              <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">
                Judges shouldn&apos;t waste time making accounts or downloading apps. They simply
                enter the event code, provide their assigned passkey, and begin scoring instantly.
              </p>

              <div className="mt-5 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <Smartphone className="size-4 text-amber-500 shrink-0" />
                  <span className="font-medium">Mobile & Tablet Optimized Interface</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <Zap className="size-4 text-amber-500 shrink-0" />
                  <span className="font-medium">Instant Real-Time Auto-Save</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <Lock className="size-4 text-amber-500 shrink-0" />
                  <span className="font-medium">Score Confidentiality Between Judges</span>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border/50 pt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono text-amber-600 font-semibold">Zero App Installs</span>
              <span>100% Touch Friendly</span>
            </div>
          </div>

          {/* Card 3: CPAs, Head Tabulators & Auditors (5-col) */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card p-6 sm:p-8 lg:col-span-5 transition-all hover:border-primary/50 hover:shadow-lg">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="size-6" />
                </span>
                <Badge variant="outline" className="text-xs font-semibold">
                  For Auditors & CPAs
                </Badge>
              </div>

              <h3 className="font-heading text-xl font-bold text-foreground">
                Tamper-Proof Tabulation Engine
              </h3>
              <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">
                Full mathematical transparency. Supports complex decimal criteria weights,
                Olympic drop-highest/lowest rules, and instant statistical outlier detection.
              </p>

              <div className="mt-5 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <Layers className="size-4 text-emerald-500 shrink-0" />
                  <span className="font-medium">Drop-Highest & Lowest Olympic Schemes</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
                  <span className="font-medium">Cryptographic Timestamped Audit Logs</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <Printer className="size-4 text-emerald-500 shrink-0" />
                  <span className="font-medium">Official Certified PDF Score Sheets</span>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border/50 pt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono text-emerald-600 font-semibold">100% CPA Compliant</span>
              <span>Zero Human Math</span>
            </div>
          </div>

          {/* Card 4: Audience & Stage Production (Large 7-col) */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card p-6 sm:p-8 lg:col-span-7 transition-all hover:border-primary/50 hover:shadow-lg">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="flex size-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/20 group-hover:scale-105 transition-transform">
                  <Monitor className="size-6" />
                </span>
                <Badge variant="outline" className="text-xs font-semibold">
                  For Audience & Stage Media
                </Badge>
              </div>

              <h3 className="font-heading text-xl font-bold text-foreground sm:text-2xl">
                Stage Projector Overlay & Instant Diplomas
              </h3>
              <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">
                Connect your stage LED wall or live stream to our real-time Stage Overlay mode.
                Display thrilling countdowns, podium placements, and category winners with professional
                broadcast animations.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <Trophy className="size-4 text-sky-500 shrink-0" />
                  <span className="font-medium">Live Podium & Placement Reveals</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <Award className="size-4 text-sky-500 shrink-0" />
                  <span className="font-medium">Visual Certificate Designer</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <Monitor className="size-4 text-sky-500 shrink-0" />
                  <span className="font-medium">Clean Stream & LED Wall Output</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 border border-border/50">
                  <Printer className="size-4 text-sky-500 shrink-0" />
                  <span className="font-medium">1-Click Batch PDF Certificate Export</span>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border/50 pt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono text-sky-600 font-semibold">Broadcast Ready</span>
              <span>Instant Stage Reveal</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
