import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Play,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InteractiveTabulatorDemo } from "@/components/landing/InteractiveTabulatorDemo";
import { LandingComparisonSection } from "@/components/landing/LandingComparisonSection";
import { LandingFeatureBento } from "@/components/landing/LandingFeatureBento";
import { LandingRoiCalculator } from "@/components/landing/LandingRoiCalculator";
import { LandingTestimonialsSection } from "@/components/landing/LandingTestimonialsSection";
import { LandingPricingSection } from "@/components/landing/LandingPricingSection";
import { LandingFaqSection } from "@/components/landing/LandingFaqSection";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Sticky Glassmorphism Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20 group-hover:scale-105 transition-transform">
              <Trophy aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col">
              <span className="font-heading text-lg font-bold tracking-tight leading-none">
                Tabulation
              </span>
              <span className="text-[10px] text-primary font-mono font-semibold tracking-wider">
                AI ENGINE
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#demo" className="hover:text-foreground transition-colors">
              Live Demo
            </a>
            <a href="#roi-calculator" className="hover:text-foreground transition-colors">
              Impact Calculator
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </a>
          </nav>

          {/* Header Action CTAs */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Judge Fast-Track Portal Shortcut */}
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/sign-in?tab=judge" />}
              className="h-9 px-3 text-xs font-semibold border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 gap-1.5 hidden sm:flex"
            >
              <KeyRound className="size-3.5" />
              <span>Judge Portal</span>
            </Button>

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
              className="h-9 px-4 text-xs font-bold shadow-md shadow-primary/20"
            >
              <span>Start Free</span>
              <ArrowRight aria-hidden="true" className="size-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section: High-Stakes Positioning & Immediate Clarity */}
        <section className="relative overflow-hidden border-b border-border/60 py-20 md:py-28">
          {/* Subtle Ambient Background Lighting */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_20%,black_50%,transparent)] opacity-40"
          />

          <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 text-center sm:px-6">
            {/* Live Social Proof Badge */}
            <Badge
              variant="outline"
              className="gap-2 bg-card/80 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold shadow-xs ring-1 ring-border/80"
            >
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Zero-Error Tabulation Engine for High-Stakes Live Events</span>
            </Badge>

            {/* Dominant Headline */}
            <h1 className="max-w-4xl font-heading text-4xl font-black tracking-tight sm:text-5xl md:text-6xl text-balance">
              Never sweat coronation night again.{" "}
              <span className="bg-gradient-to-r from-primary via-sky-500 to-indigo-500 bg-clip-text text-transparent">
                Zero spreadsheet errors.
              </span>
            </h1>

            {/* High-Converting Subtitle */}
            <p className="max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg leading-relaxed">
              Eliminate clipboards, manual runners, and awkward 45-minute stage delays.
              Tabulation gives pageant directors, sports coordinators, and CPA auditors
              sub-second judge syncing, tamper-proof mathematical precision, and instant stage podium reveals.
            </p>

            {/* Dual High-Intent CTAs */}
            <div className="flex flex-col sm:flex-row items-center gap-3.5 pt-2 w-full sm:w-auto">
              <Button
                size="lg"
                render={<Link href="/sign-in" />}
                className="w-full sm:w-auto h-12 px-8 font-bold text-sm shadow-lg shadow-primary/25 cursor-pointer"
              >
                Launch Your Free Workspace
                <ArrowRight aria-hidden="true" className="size-4 ml-1.5" />
              </Button>

              <Button
                variant="outline"
                size="lg"
                render={<Link href="/sign-in?tab=judge" />}
                className="w-full sm:w-auto h-12 px-6 font-semibold bg-background/80 backdrop-blur-sm border-amber-500/30 text-foreground hover:border-amber-500 cursor-pointer"
              >
                <KeyRound className="size-4 text-amber-500 mr-2" />
                Enter as Judge with Code
              </Button>
            </div>

            {/* Micro-Reassurance Trust Row */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" /> Free Forever Tier (No Card Required)
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" /> GCash & Maya Instant Checkout
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" /> 100% CPA Cryptographic Audit Trail
              </span>
            </div>
          </div>

          {/* Interactive Live Simulation Demo */}
          <div id="demo" className="mt-16 px-4 sm:px-6">
            <div className="text-center mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Interactive Tabulation Preview • Click Sliders or Switch Modes
              </span>
            </div>
            <InteractiveTabulatorDemo />
          </div>
        </section>

        {/* The Contrast: Old Frustrating Way vs Modern Tabulation AI */}
        <LandingComparisonSection />

        {/* Persona-Driven Feature Bento Grid */}
        <LandingFeatureBento />

        {/* Interactive ROI & Time Saved Calculator */}
        <LandingRoiCalculator />

        {/* Social Proof & Verified Testimonials */}
        <LandingTestimonialsSection />

        {/* Dynamic Pricing Section */}
        <LandingPricingSection />

        {/* Objection-Busting FAQ Accordion */}
        <LandingFaqSection />

        {/* Final High-Impact CTA Banner */}
        <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground py-24 md:py-32">
          {/* Subtle glowing accent */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-[700px] rounded-full bg-primary/20 blur-3xl opacity-50"
          />

          <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 text-center sm:px-6">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 shadow-lg">
              <Trophy className="size-7 text-primary" />
            </span>

            <h2 className="max-w-3xl font-heading text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl text-sidebar-accent-foreground text-balance">
              Your next competition deserves flawless, zero-error scoring.
            </h2>

            <p className="max-w-xl text-base text-sidebar-foreground/80 sm:text-lg leading-relaxed">
              Create your organization in seconds, set up criteria weights, and issue
              judge passkeys immediately. No credit card required.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
              <Button
                size="lg"
                render={<Link href="/sign-in" />}
                className="h-12 px-8 font-bold text-sm shadow-xl shadow-primary/30 cursor-pointer"
              >
                Create Free Event in 60s
                <ArrowRight className="size-4 ml-1.5" />
              </Button>

              <Button
                variant="outline"
                size="lg"
                render={<Link href="/sign-in?tab=judge" />}
                className="h-12 px-6 font-semibold bg-white/10 hover:bg-white/20 text-white border-white/20 cursor-pointer"
              >
                <KeyRound className="size-4 mr-2 text-amber-400" />
                Access Judge Portal
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Modern Footer */}
      <footer className="border-t border-border/60 bg-card py-12">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Trophy className="size-4" />
              </span>
              <span className="font-heading font-bold text-base tracking-tight">
                Tabulation AI
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground font-medium">
              <a href="#features" className="hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#demo" className="hover:text-foreground transition-colors">
                Simulation Demo
              </a>
              <a href="#roi-calculator" className="hover:text-foreground transition-colors">
                ROI Calculator
              </a>
              <a href="#pricing" className="hover:text-foreground transition-colors">
                Pricing
              </a>
              <a href="#faq" className="hover:text-foreground transition-colors">
                FAQ
              </a>
              <Link href="/sign-in?tab=judge" className="text-amber-600 dark:text-amber-400 hover:underline">
                Judge Portal
              </Link>
              <Link href="/sentry/login" className="hover:text-foreground transition-colors">
                Sentry Ops
              </Link>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Tabulation Cloud Engine — 100% Operational</span>
            </div>
            <p>© 2026 Tabulation Platform Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
