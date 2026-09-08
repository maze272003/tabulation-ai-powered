import * as React from "react";
import { Award, CheckCircle2, MessageSquareQuote, ShieldCheck, Star, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TESTIMONIALS = [
  {
    quote:
      "In previous years, we were sweating backstage checking Excel formulas and chasing physical judge signatures while the audience waited 45 minutes. With Tabulation, our audit committee certified the final coronation standings in under 30 seconds with 100% legal confidence.",
    name: "Maria Theresa Santos, CPA",
    role: "Lead Tabulation Auditor",
    event: "Miss Province Queen Pageant 2025",
    initials: "MS",
    badge: "CPA Certified Audit",
  },
  {
    quote:
      "With 45 dance crews and 7 judges scoring continuously, running paper ballots was a nightmare waiting to happen. Tabulation gave our judges a dead-simple iPad interface. The live Stage LED Wall reveal brought the crowd to its feet.",
    name: "Coach Jerome Alcantara",
    role: "Tournament Executive Director",
    event: "National Cheer & Dance Open",
    initials: "JA",
    badge: "Stage LED Wall Mode",
  },
  {
    quote:
      "The transparency is unmatched. When team managers or coaches ask about ranking calculations, we can immediately print official certified PDF score sheets with cryptographic timestamp logs. Zero disputes, zero drama.",
    name: "Atty. Roland Gomez",
    role: "Chairman of the Board of Judges",
    event: "Inter-Collegiate Speech & Debate Cup",
    initials: "RG",
    badge: "Zero Disputes",
  },
];

const TRUST_STATS = [
  { value: "250+", label: "High-Stakes Competitions Tabulated" },
  { value: "15,000+", label: "Certified Scores Recorded" },
  { value: "0", label: "Calculation or Formula Errors" },
  { value: "< 0.5s", label: "Real-Time Sync Latency" },
];

export function LandingTestimonialsSection() {
  return (
    <section className="relative border-b border-border/60 bg-background py-24 md:py-32">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge
            variant="outline"
            className="mb-4 gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary"
          >
            <MessageSquareQuote className="size-3.5" />
            Endorsed by Tabulators & Directors
          </Badge>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl text-balance">
            Trusted when the spotlight is on and the stakes are highest
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base leading-relaxed">
            Read how professional pageant producers, CPAs, and tournament directors eliminated
            stage delays and crowned winners with absolute confidence.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="group relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-6 sm:p-7 shadow-xs transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div>
                {/* Header with stars & badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-0.5 text-amber-500">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="size-4 fill-amber-500 text-amber-500" />
                    ))}
                  </div>
                  <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">
                    {t.badge}
                  </Badge>
                </div>

                {/* Quote */}
                <p className="text-sm text-muted-foreground leading-relaxed italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
              </div>

              {/* Author info */}
              <div className="mt-6 pt-5 border-t border-border/60 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs ring-1 ring-primary/20">
                  {t.initials}
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-foreground truncate">{t.name}</h4>
                  <p className="text-xs text-muted-foreground truncate">{t.role}</p>
                  <p className="text-[10px] text-primary/80 font-medium truncate">{t.event}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Numerical Trust Proof Ribbon */}
        <div className="mt-16 rounded-2xl border border-border/70 bg-muted/30 p-6 sm:p-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center divide-y lg:divide-y-0 lg:divide-x divide-border/60">
            {TRUST_STATS.map((stat, idx) => (
              <div key={stat.label} className={idx > 0 ? "pt-4 lg:pt-0" : ""}>
                <span className="font-heading text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                  {stat.value}
                </span>
                <p className="mt-1 text-xs text-muted-foreground font-medium">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
