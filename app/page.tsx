import Link from "next/link";
import {
  ArrowRight,
  Award,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  HelpCircle,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lock,
  Monitor,
  Receipt,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
import { InteractiveTabulatorDemo } from "@/components/landing/InteractiveTabulatorDemo";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Event Command Center",
    description:
      "Configure accounts, rounds, criteria, and contestants from a unified workspace with automated pre-flight readiness checks.",
    badge: "Real-Time Sync",
  },
  {
    icon: KeyRound,
    title: "Secure Judge Passcodes",
    description:
      "Issue event-scoped passcodes in seconds. Judges enter the event code and score instantly without needing personal accounts.",
    badge: "Instant Access",
  },
  {
    icon: Layers,
    title: "Weighted Scoring Engine",
    description:
      "Configure complex decimal weights, drop-lowest rules, and multi-round advancement with 100% mathematical precision.",
    badge: "Accurate Math",
  },
  {
    icon: Monitor,
    title: "Live Round Telemetry",
    description:
      "Track submission progress in real-time. Identify lagging sheets, spot outlier scores, and review before locking results.",
    badge: "Live Telemetry",
  },
  {
    icon: Trophy,
    title: "Instant Tabulation & Podium",
    description:
      "Ranked results computed instantly the moment sheets lock. Publish interactive leaderboards and printable scorecards.",
    badge: "Zero Latency",
  },
  {
    icon: ShieldCheck,
    title: "Tamper-Proof Audit Trail",
    description:
      "Every single score submission, adjustment, and configuration change is immutably logged with actor timestamps.",
    badge: "Enterprise Security",
  },
];

const STEPS = [
  {
    icon: ClipboardCheck,
    step: "01",
    title: "Configure Event & Categories",
    description:
      "Define scoring rounds, set percentage criteria weights, add contestants, and let AI generate standard competition templates.",
  },
  {
    icon: Users,
    step: "02",
    title: "Issue Judge Codes",
    description:
      "Generate disposable judge passkeys or QR codes. Judges score on mobile, tablet, or desktop with real-time auto-saving.",
  },
  {
    icon: Trophy,
    step: "03",
    title: "Instant Tabulation & Export",
    description:
      "Monitor judge submissions live, lock rounds with confidence, and publish verified podium standings and certificates.",
  },
];

const PRICING_TIERS = [
  {
    name: "Starter Pack",
    units: 50,
    price: "₱999",
    description: "Ideal for single-category contests and school pageants.",
    features: [
      "50 Tabulation Units",
      "Up to 3 Active Rounds",
      "Unlimited Judges & Staff",
      "Standard Real-time Sync",
      "Printable PDF Summaries",
    ],
    featured: false,
    cta: "Purchase Pack",
  },
  {
    name: "Growth Organizer",
    units: 250,
    price: "₱3,999",
    savings: "Save 20%",
    description: "Most popular for multi-day festivals, pageants, and regional championships.",
    features: [
      "250 Tabulation Units",
      "Unlimited Rounds & Categories",
      "AI Criteria & Template Wizard",
      "Live Outlier Detection",
      "Public Live Results Hub",
      "Priority Support Desk",
    ],
    featured: true,
    cta: "Get Growth Pack",
  },
  {
    name: "Scale Enterprise",
    units: 1000,
    price: "₱12,999",
    savings: "Save 35%",
    description: "Built for production agencies, universities, and high-volume competition organizers.",
    features: [
      "1,000 Tabulation Units",
      "Dedicated Sentry Support SLA",
      "Custom Branding & Watermarks",
      "Multi-Organization Switcher",
      "Audit Trail CSV Exports",
      "Direct PayMongo Invoicing",
    ],
    featured: false,
    cta: "Contact Sales",
  },
];

const FAQS = [
  {
    q: "How does the judge scoring interface work?",
    a: "Judges simply navigate to the Judge Portal, enter the 6-character event code and their assigned passkey. No personal logins or email registrations are required.",
  },
  {
    q: "How are Tabulation Units consumed?",
    a: "Units are consumed based on event scale (rounds and scoring sheets created). You only pay for what you use with zero recurring monthly subscription fees.",
  },
  {
    q: "What payment methods are supported in the Philippines?",
    a: "We support GCash, Maya, GrabPay, Credit/Debit Cards (Visa/Mastercard), and Online Bank Transfers via our integrated PayMongo checkout gateway.",
  },
  {
    q: "Can we review and adjust judge scores before publishing?",
    a: "Yes. The organizer command center includes a Live Round Review mode where staff can inspect each judge's submission and resolve discrepancies before locking the round.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20 group-hover:scale-105 transition-transform">
              <Trophy aria-hidden className="size-5" />
            </span>
            <div className="flex flex-col">
              <span className="font-heading text-lg font-bold tracking-tight leading-none">
                Tabulation
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                AI-POWERED
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#demo" className="hover:text-foreground transition-colors">
              Live Demo
            </a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/sign-in" />}
              className="h-9 px-3.5 text-xs font-semibold"
            >
              Sign in
            </Button>
            <Button
              size="sm"
              render={<Link href="/sign-in" />}
              className="h-9 px-4 text-xs font-semibold shadow-sm shadow-primary/20"
            >
              Get started
              <ArrowRight data-icon="inline-end" aria-hidden className="size-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border/60 py-20 md:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,color-mix(in_oklch,var(--primary)_15%,transparent),transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_20%,black_50%,transparent)] opacity-40"
          />

          <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 text-center sm:px-6">
            <Badge
              variant="outline"
              className="gap-2 bg-card/80 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold shadow-xs ring-1 ring-border/80"
            >
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Next-Gen Event Scoring & Live Tabulation</span>
            </Badge>

            <h1 className="max-w-4xl font-heading text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl text-balance">
              Fair, tamper-proof scoring for every{" "}
              <span className="bg-gradient-to-r from-primary via-sky-500 to-indigo-500 bg-clip-text text-transparent">
                live competition
              </span>
            </h1>

            <p className="max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg leading-relaxed">
              Eliminate paper scorecards and spreadsheet errors. Tabulation gives
              organizers, judges, and auditors a unified platform to configure
              events, collect weighted scores securely, and publish instant
              podiums in real time.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3.5 pt-2">
              <Button
                size="lg"
                render={<Link href="/sign-in" />}
                className="h-11 px-6 font-semibold shadow-md shadow-primary/20"
              >
                Launch Your Workspace
                <ArrowRight data-icon="inline-end" aria-hidden className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                render={<Link href="/sign-in?tab=judge" />}
                className="h-11 px-6 font-semibold bg-background/80 backdrop-blur-sm"
              >
                <KeyRound className="size-4 text-primary" />
                Judge Portal Access
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-success" /> Zero Monthly Subscription
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-success" /> GCash & Maya Direct Checkout
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-success" /> Audit-Grade Integrity
              </span>
            </div>
          </div>

          {/* Interactive Simulation Demo */}
          <div id="demo" className="mt-14 px-4 sm:px-6">
            <div className="text-center mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Interactive Tabulation Preview
              </span>
            </div>
            <InteractiveTabulatorDemo />
          </div>
        </section>

        {/* Feature Grid */}
        <section id="features" className="border-b border-border/60 bg-muted/20 py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <Badge variant="outline" className="mb-3">
                Built for High-Stakes Events
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Everything your tabulation team needs
              </h2>
              <p className="mt-2.5 text-sm text-muted-foreground sm:text-base">
                Engineered for speed, accuracy, and reliability under live-stage
                pressure.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="group relative rounded-xl border border-border/70 bg-card p-6 shadow-xs hover:shadow-md hover:border-primary/40 transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:scale-105 transition-transform">
                      <feature.icon aria-hidden className="size-5" />
                    </span>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {feature.badge}
                    </Badge>
                  </div>
                  <h3 className="font-heading text-base font-bold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="border-b border-border/60 py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <Badge variant="outline" className="mb-3">
                Workflow Simplicity
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                From draft to verified results in three steps
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3 relative">
              {STEPS.map((item, idx) => (
                <div
                  key={item.step}
                  className="relative flex flex-col gap-4 rounded-xl border border-border/60 bg-card/60 p-6 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                      <item.icon aria-hidden className="size-5" />
                    </span>
                    <span className="font-mono text-xl font-extrabold text-muted-foreground/40">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="font-heading text-base font-bold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing & Units Packs */}
        <section id="pricing" className="border-b border-border/60 bg-muted/20 py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <Badge variant="outline" className="mb-3">
                Pay-Per-Event Units
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Transparent pricing with zero lock-in
              </h2>
              <p className="mt-2.5 text-sm text-muted-foreground sm:text-base">
                Purchase unit packages when you need them. Units never expire.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3 items-stretch">
              {PRICING_TIERS.map((tier) => {
                if (tier.featured) {
                  return (
                    <BorderBeamPanel
                      key={tier.name}
                      glow
                      className="p-7 flex flex-col justify-between h-full bg-card"
                      containerClassName="h-full"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-heading font-bold text-lg">{tier.name}</h3>
                          <Badge className="bg-primary text-primary-foreground text-[10px] font-bold">
                            Most Popular
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">{tier.description}</p>
                        <div className="flex items-baseline gap-2 mb-6">
                          <span className="font-heading text-4xl font-extrabold">{tier.price}</span>
                          <span className="text-xs text-muted-foreground">/ {tier.units} units</span>
                          {tier.savings && (
                            <Badge className="bg-success-muted text-success border-success/30 text-[10px]">
                              {tier.savings}
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-2.5 mb-8">
                          {tier.features.map((feat) => (
                            <div key={feat} className="flex items-center gap-2 text-xs font-medium">
                              <CheckCircle2 className="size-4 text-primary shrink-0" />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Button
                        size="lg"
                        render={<Link href="/sign-in" />}
                        className="w-full font-semibold shadow-md shadow-primary/20"
                      >
                        {tier.cta}
                        <ArrowRight className="size-4" />
                      </Button>
                    </BorderBeamPanel>
                  );
                }

                return (
                  <div
                    key={tier.name}
                    className="rounded-xl border border-border/70 bg-card p-7 flex flex-col justify-between shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-heading font-bold text-lg">{tier.name}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4">{tier.description}</p>
                      <div className="flex items-baseline gap-2 mb-6">
                        <span className="font-heading text-4xl font-extrabold">{tier.price}</span>
                        <span className="text-xs text-muted-foreground">/ {tier.units} units</span>
                        {tier.savings && (
                          <Badge className="bg-success-muted text-success border-success/30 text-[10px]">
                            {tier.savings}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2.5 mb-8">
                        {tier.features.map((feat) => (
                          <div key={feat} className="flex items-center gap-2 text-xs font-medium">
                            <Check className="size-4 text-muted-foreground shrink-0" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="lg"
                      render={<Link href="/sign-in" />}
                      className="w-full font-semibold"
                    >
                      {tier.cta}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section id="faq" className="border-b border-border/60 py-20">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <div className="mx-auto mb-12 text-center">
              <Badge variant="outline" className="mb-3">
                Frequently Asked Questions
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight">
                Everything you need to know
              </h2>
            </div>

            <div className="space-y-4">
              {FAQS.map((faq) => (
                <div
                  key={faq.q}
                  className="rounded-xl border border-border/60 bg-card p-6 shadow-xs"
                >
                  <h3 className="font-heading text-base font-semibold flex items-center gap-2.5">
                    <HelpCircle className="size-4 text-primary shrink-0" />
                    {faq.q}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground pl-6.5">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Banner */}
        <section className="bg-sidebar text-sidebar-foreground py-20">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 text-center sm:px-6">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20">
              <Trophy className="size-6 text-primary" />
            </span>
            <h2 className="max-w-2xl font-heading text-3xl font-extrabold tracking-tight sm:text-4xl text-sidebar-accent-foreground">
              Ready to automate your next competition?
            </h2>
            <p className="max-w-xl text-sm text-sidebar-foreground/75 sm:text-base leading-relaxed">
              Create your organization in seconds, configure rounds, and issue
              judge credentials immediately.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Button
                size="lg"
                render={<Link href="/sign-in" />}
                className="h-11 px-7 font-semibold"
              >
                Get Started Free
                <ArrowRight data-icon="inline-end" className="size-4" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500" />
            <span>Tabulation Platform — All Systems Operational</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/sign-in" className="hover:text-foreground transition-colors">
              Judge Portal
            </Link>
            <Link href="/sentry/login" className="hover:text-foreground transition-colors">
              Sentry Ops
            </Link>
            <span>© 2026 Tabulation Inc.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
