import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  KeyRound,
  Layers,
  LayoutDashboard,
  Monitor,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Event command center",
    description:
      "Configure accounts, rounds, categories, and contestants from one organized workspace with readiness checks before you go live.",
  },
  {
    icon: KeyRound,
    title: "Secure judge access",
    description:
      "Issue per-event credentials with generated passwords. Judges sign in with an event code — no personal accounts required.",
  },
  {
    icon: Layers,
    title: "Rounds & weighted criteria",
    description:
      "Define scoring criteria with weights, control round advancement, and let the platform handle the math consistently.",
  },
  {
    icon: Monitor,
    title: "Live round monitoring",
    description:
      "Track scoring progress in real time. See which judges have submitted and review sheets before locking results.",
  },
  {
    icon: Trophy,
    title: "Instant tabulation",
    description:
      "Ranked results computed the moment sheets are locked. Publish standings with configurable visibility.",
  },
  {
    icon: ShieldCheck,
    title: "Audit-grade integrity",
    description:
      "Every configuration change and scoring action is recorded in an audit log for full accountability.",
  },
];

const STEPS = [
  {
    icon: ClipboardCheck,
    step: "01",
    title: "Set up your event",
    description: "Create rounds, criteria, categories, and contestants. The readiness checklist confirms nothing is missing.",
  },
  {
    icon: Users,
    step: "02",
    title: "Invite judges & staff",
    description: "Generate secure accounts and hand out credentials. Judges start scoring immediately after publish.",
  },
  {
    icon: Trophy,
    step: "03",
    title: "Publish results",
    description: "Monitor progress live, review submissions, and lock in final rankings with confidence.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Trophy aria-hidden className="size-4.5" />
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight">Tabulation</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" render={<Link href="/sign-in" />} className="h-9 px-4">
              Sign in
            </Button>
            <Button size="sm" render={<Link href="/sign-in" />} className="h-9 px-4">
              Get started
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_40%,transparent)] opacity-50"
          />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 sm:py-28">
            <Badge variant="outline" className="gap-1.5 bg-background px-3 py-1 text-xs font-medium">
              <ShieldCheck aria-hidden className="size-3.5 text-primary" />
              Competition management, done right
            </Badge>
            <h1 className="max-w-3xl font-heading text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
              Run fair, transparent scoring for every competition
            </h1>
            <p className="max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
              Tabulation gives organizers, judges, and staff a single platform to
              configure events, collect scores securely, and publish ranked
              results — all in real time.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button size="lg" render={<Link href="/sign-in" />} className="h-11 px-6">
                Start your event
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
              <Button variant="outline" size="lg" render={<Link href="/sign-in" />} className="h-11 px-6">
                Judge sign in
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Organizers sign in with Google — judges use an event code provided by the organizer.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="border-b bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                Everything a tabulation team needs
              </h2>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                From setup to final rankings — each module is designed for
                accuracy under live-event pressure.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="group rounded-xl bg-card p-6 ring-1 ring-foreground/5 transition-shadow hover:shadow-md"
                >
                  <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="font-heading text-base font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-b">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                From draft to results in three steps
              </h2>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {STEPS.map((item) => (
                <div key={item.step} className="relative flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <item.icon aria-hidden className="size-5" />
                    </span>
                    <span className="font-mono text-sm font-semibold text-muted-foreground/60">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="font-heading text-base font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-sidebar">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center sm:px-6 sm:py-20">
            <h2 className="max-w-xl font-heading text-2xl font-semibold tracking-tight text-sidebar-accent-foreground sm:text-3xl">
              Ready to tabulate your next event?
            </h2>
            <p className="max-w-md text-sm text-sidebar-foreground/70 sm:text-base">
              Create an organization, set up your first event, and publish
              results the same day.
            </p>
            <Button size="lg" render={<Link href="/sign-in" />} className="h-11 px-6">
              Get started
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span>Tabulation — Competition management platform</span>
          <span>Accurate. Transparent. Accountable.</span>
        </div>
      </footer>
    </div>
  );
}
