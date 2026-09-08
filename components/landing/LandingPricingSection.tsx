"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const pesoFormat = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
});

function formatPeso(cents?: number): string {
  if (!cents || cents === 0) return "₱0";
  return pesoFormat.format(cents / 100);
}

// Fallback plans if database is initializing
const FALLBACK_PLANS = [
  {
    _id: "plan-free",
    name: "Free",
    sortOrder: 0,
    priceCents: 0,
    currency: "PHP",
    billingInterval: "monthly",
    limits: { maxEvents: 1, maxJudges: 5, maxContestants: 20, maxMembers: 5 },
    features: {
      canCreateEvent: true,
      canExportReports: false,
      canUseCustomBranding: false,
      canUseAuditLogs: false,
      canCreateTemplates: false,
      canUseAdvancedAnalytics: false,
      canUseApi: false,
    },
  },
  {
    _id: "plan-starter",
    name: "Starter",
    sortOrder: 1,
    priceCents: 49900,
    currency: "PHP",
    billingInterval: "monthly",
    limits: { maxEvents: 5, maxJudges: 20, maxContestants: 100, maxMembers: 15 },
    features: {
      canCreateEvent: true,
      canExportReports: true,
      canUseCustomBranding: false,
      canUseAuditLogs: false,
      canCreateTemplates: false,
      canUseAdvancedAnalytics: false,
      canUseApi: false,
    },
  },
  {
    _id: "plan-pro",
    name: "Pro",
    sortOrder: 2,
    priceCents: 149900,
    currency: "PHP",
    billingInterval: "monthly",
    limits: { maxEvents: 25, maxJudges: 100, maxContestants: 500, maxMembers: 50 },
    features: {
      canCreateEvent: true,
      canExportReports: true,
      canUseCustomBranding: true,
      canUseAuditLogs: true,
      canCreateTemplates: true,
      canUseAdvancedAnalytics: true,
      canUseApi: false,
    },
  },
];

const PLAN_DESCRIPTIONS: Record<string, string> = {
  Free: "Essential tools for school contests, trial rounds, and small community pageants.",
  Starter: "Ideal for growing organizations, annual festivals, and multi-category tournaments.",
  Pro: "Full-scale power for major pageants, production agencies, and professional tabulation.",
};

export function LandingPricingSection() {
  const router = useRouter();
  const rawPlans = useQuery(api.plans.list, {});
  const { data: session, isPending: sessionPending } = useSession();

  const plans = rawPlans && rawPlans.length > 0 ? rawPlans : rawPlans === undefined ? undefined : FALLBACK_PLANS;

  function handleChoosePlan(planName: string) {
    const slug = planName.toLowerCase();
    if (!session && !sessionPending) {
      // Unauthenticated visitor -> Redirect to Sign-In with plan intent
      const nextUrl = `/app?plan=${encodeURIComponent(slug)}`;
      router.push(`/sign-in?plan=${encodeURIComponent(slug)}&next=${encodeURIComponent(nextUrl)}`);
    } else {
      // Authenticated user -> Go straight to /app with plan intent
      router.push(`/app?plan=${encodeURIComponent(slug)}`);
    }
  }

  return (
    <section id="pricing" className="border-b border-border/60 bg-muted/20 py-20 relative overflow-hidden">
      {/* Background ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-primary/10 via-sky-500/5 to-transparent blur-3xl opacity-50"
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 relative z-10">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Badge variant="outline" className="mb-3 border-primary/30 text-primary bg-primary/5 font-semibold">
            Subscription Plans
          </Badge>
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Predictable, transparent competition plans
          </h2>
          <p className="mt-2.5 text-sm text-muted-foreground sm:text-base">
            Empower your organization with real-time scoring, custom certificate generation, and verified audit trails.
          </p>
        </div>

        {plans === undefined ? (
          <div className="grid gap-6 lg:grid-cols-3 items-stretch">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-border/60 bg-card/60 p-7 flex flex-col justify-between animate-pulse"
              >
                <div className="space-y-4">
                  <div className="h-6 w-1/3 bg-muted rounded" />
                  <div className="h-4 w-2/3 bg-muted rounded" />
                  <div className="h-10 w-1/2 bg-muted rounded" />
                  <div className="space-y-2 pt-4">
                    <div className="h-4 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded" />
                  </div>
                </div>
                <div className="h-11 bg-muted rounded mt-8" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3 items-stretch">
            {plans.map((plan) => {
              const isFree = plan.priceCents === 0 || !plan.priceCents;
              const isStarter = plan.name.toLowerCase() === "starter";
              const isPro = plan.name.toLowerCase() === "pro";
              const isFeatured = isStarter; // Starter is the highlighted popular tier

              const planDescription =
                PLAN_DESCRIPTIONS[plan.name] ??
                "Comprehensive tabulation and competition management features.";

              const planContent = (
                <div className="flex flex-col justify-between h-full">
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-heading font-bold text-xl">{plan.name}</h3>
                      {isFeatured ? (
                        <Badge className="bg-primary text-primary-foreground text-[10px] font-bold shadow-xs">
                          Most Popular
                        </Badge>
                      ) : isPro ? (
                        <Badge variant="outline" className="border-primary/40 text-primary text-[10px] font-bold">
                          All Features
                        </Badge>
                      ) : null}
                    </div>

                    <p className="text-xs text-muted-foreground min-h-8 mb-4 leading-relaxed">
                      {planDescription}
                    </p>

                    {/* Price */}
                    <div className="flex items-baseline gap-1.5 mb-6">
                      <span className="font-heading text-4xl font-extrabold tracking-tight">
                        {formatPeso(plan.priceCents)}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">
                        {isFree ? "/ forever" : `/${plan.billingInterval ?? "month"}`}
                      </span>
                    </div>

                    {/* Capacity Limits */}
                    <div className="p-3.5 bg-muted/40 rounded-xl border border-border/50 space-y-2 mb-6 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="size-3.5 text-primary shrink-0" />
                          Active Competitions
                        </span>
                        <span className="font-bold">{plan.limits?.maxEvents ?? 1}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Users className="size-3.5 text-primary shrink-0" />
                          Judges Capacity
                        </span>
                        <span className="font-bold">{plan.limits?.maxJudges ?? 5}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Trophy className="size-3.5 text-primary shrink-0" />
                          Contestants Limit
                        </span>
                        <span className="font-bold">{plan.limits?.maxContestants ?? 20}</span>
                      </div>
                    </div>

                    {/* Features checklist */}
                    <div className="space-y-2.5 mb-8 text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-primary shrink-0" />
                        <span>Real-Time Tabulation & Judge Portal</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-primary shrink-0" />
                        <span>Public Live Results & Print Summaries</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {plan.features?.canExportReports ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0" />
                        ) : (
                          <X className="size-4 text-muted-foreground/50 shrink-0" />
                        )}
                        <span className={!plan.features?.canExportReports ? "text-muted-foreground line-through opacity-70" : ""}>
                          Standings & Scorecards CSV Exports
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {plan.features?.canUseCustomBranding ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0" />
                        ) : (
                          <X className="size-4 text-muted-foreground/50 shrink-0" />
                        )}
                        <span className={!plan.features?.canUseCustomBranding ? "text-muted-foreground line-through opacity-70" : ""}>
                          Certificate Studio & Custom Branding
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {plan.features?.canCreateTemplates ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0" />
                        ) : (
                          <X className="size-4 text-muted-foreground/50 shrink-0" />
                        )}
                        <span className={!plan.features?.canCreateTemplates ? "text-muted-foreground line-through opacity-70" : ""}>
                          Reusable Competition Blueprints
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {plan.features?.canUseAuditLogs ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0" />
                        ) : (
                          <X className="size-4 text-muted-foreground/50 shrink-0" />
                        )}
                        <span className={!plan.features?.canUseAuditLogs ? "text-muted-foreground line-through opacity-70" : ""}>
                          Audit Logs & Integrity Telemetry
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CTA Button */}
                  <Button
                    size="lg"
                    variant={isFeatured ? "default" : "outline"}
                    className={cn(
                      "w-full font-semibold gap-2 transition-all cursor-pointer",
                      isFeatured && "shadow-md shadow-primary/20 hover:shadow-primary/30"
                    )}
                    onClick={() => handleChoosePlan(plan.name)}
                  >
                    <span>
                      {isFree
                        ? "Get Started Free"
                        : isFeatured
                        ? "Start with Starter"
                        : `Get ${plan.name}`}
                    </span>
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              );

              if (isFeatured) {
                return (
                  <BorderBeamPanel
                    key={plan._id}
                    glow
                    className="p-7 flex flex-col justify-between h-full bg-card/95 backdrop-blur-sm"
                    containerClassName="h-full"
                  >
                    {planContent}
                  </BorderBeamPanel>
                );
              }

              return (
                <div
                  key={plan._id}
                  className="rounded-xl border border-border/70 bg-card/90 backdrop-blur-sm p-7 flex flex-col justify-between shadow-xs hover:border-border transition-colors"
                >
                  {planContent}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
