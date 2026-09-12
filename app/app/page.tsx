"use client";

import { Suspense, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Building2, Loader2, Sparkles, Trophy } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { LoadingScreen } from "@/components/LoadingScreen";

function AppHomeContent() {
  const mine = useQuery(api.organizations.listMine, {});
  const create = useMutation(api.organizations.create);
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const isExplicitNew = searchParams.get("new") === "true" || searchParams.get("new") === "1";

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  // If the user already has organizations and is not explicitly creating a new one,
  // automatically redirect straight to their workspace overview.
  useEffect(() => {
    if (!mine || mine.length === 0 || isExplicitNew) {
      return;
    }

    if (planParam && planParam.toLowerCase() !== "free") {
      router.replace(`/app/billing?plan=${encodeURIComponent(planParam.toLowerCase())}`);
      return;
    }

    const lastSlug = typeof window !== "undefined" ? localStorage.getItem("last_org_slug") : null;
    const targetOrg = mine.find((m) => m.org?.slug === lastSlug)?.org?.slug ?? mine[0]?.org?.slug;

    if (targetOrg) {
      router.replace(`/app/${targetOrg}/overview`);
    }
  }, [mine, planParam, isExplicitNew, router]);

  // Loading state while checking organizations
  if (mine === undefined) {
    return <LoadingScreen label="Loading workspace…" />;
  }

  // If the user has organizations and is being forwarded to overview
  if (mine.length > 0 && !isExplicitNew) {
    return <LoadingScreen label="Opening your workspace…" />;
  }

  // Get Started / Create First Organization onboarding state
  const isFirstOrg = mine.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Clean Onboarding Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/85 px-4 sm:px-8 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-xs">
            <Trophy className="size-4" />
          </span>
          <span className="font-heading font-bold text-sm tracking-tight text-foreground">
            Tabulation
          </span>
        </div>

        <div className="flex items-center gap-3">
          {!isFirstOrg && (
            <Link href="/app">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-3.5" />
                Back to Workspace
              </Button>
            </Link>
          )}
          <UserMenu />
        </div>
      </header>

      {/* Centered Onboarding Prompt */}
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md space-y-6">
          <Card className="border-border/70 shadow-xl ring-1 ring-foreground/5 backdrop-blur-sm">
            <CardHeader className="text-center pb-4 pt-8 space-y-3">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-8 ring-primary/5">
                <Building2 aria-hidden className="size-7" />
              </div>

              {planParam ? (
                <div className="flex justify-center">
                  <Badge className="bg-primary/15 text-primary border-primary/30 text-xs font-semibold gap-1.5 px-3 py-1 uppercase tracking-wide">
                    <Sparkles className="size-3.5" />
                    {planParam} Plan Selected
                  </Badge>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <CardTitle className="text-2xl font-bold tracking-tight">
                  {isFirstOrg ? "Get started with Tabulation" : "Create an organization"}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                  {isFirstOrg
                    ? "Create your first organization to start managing competitions, scoring rubrics, and real-time tabulation."
                    : "Organizations group your events, team members, and scoring rubrics."}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pb-8 px-6">
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const trimmed = name.trim();
                  if (!trimmed) return;
                  setCreating(true);
                  try {
                    const slug = await create({ name: trimmed });
                    try {
                      localStorage.setItem("last_org_slug", slug);
                    } catch {
                      // ignore storage errors
                    }
                    toast.success("Organization created!");
                    if (planParam && planParam.toLowerCase() !== "free") {
                      router.push(`/app/billing?plan=${encodeURIComponent(planParam.toLowerCase())}`);
                    } else {
                      router.push(`/app/${slug}/overview`);
                    }
                  } catch (err: unknown) {
                    const code = (err as { data?: { code?: string } })?.data?.code;
                    if (code === "CONFLICT") {
                      toast.error("An organization with that name already exists. Try a different name.");
                    } else {
                      toast.error("Could not create organization.");
                    }
                    setCreating(false);
                  }
                }}
              >
                <div className="space-y-2 text-left">
                  <Label htmlFor="org-name" className="text-xs font-semibold text-foreground">
                    Organization name
                  </Label>
                  <Input
                    id="org-name"
                    placeholder="e.g. National Debate Federation"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={creating}
                    className="h-11 text-sm shadow-xs"
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This will be the workspace name and unique URL for your organization.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="w-full h-11 font-semibold text-sm shadow-sm gap-2"
                >
                  {creating ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight aria-hidden className="size-4" />
                  )}
                  {planParam && planParam.toLowerCase() !== "free"
                    ? "Create & Continue"
                    : isFirstOrg
                    ? "Create & Get Started"
                    : "Create Organization"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function AppHome() {
  return (
    <Suspense fallback={<LoadingScreen label="Loading workspace…" />}>
      <AppHomeContent />
    </Suspense>
  );
}
