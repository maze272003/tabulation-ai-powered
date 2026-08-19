"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { useSession, signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Shield,
  ShieldCheck,
  Trophy,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Only pathnames the auth middleware bounces users for are accepted as
 * post-login destinations. Anything else falls back to the default workspace.
 */
const ALLOWED_NEXT_PREFIXES = ["/app", "/platform"];
const DEFAULT_NEXT = "/app";

function resolveNextParam(rawNext: string | null): string {
  if (!rawNext) return DEFAULT_NEXT;
  return ALLOWED_NEXT_PREFIXES.some((prefix) => rawNext.startsWith(prefix))
    ? rawNext
    : DEFAULT_NEXT;
}

export function SignInForm({
  eventSessionToken,
}: {
  eventSessionToken: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next");
  const initialTab = params.get("tab") === "judge" ? "judge" : "owner";
  const next = resolveNextParam(rawNext);

  const { data: session, isPending: isSessionPending } = useSession();
  const eventSession = useQuery(
    api.eventAuth.sessionInfo,
    eventSessionToken ? { sessionToken: eventSessionToken } : "skip"
  );

  const hasOwnerSession = !isSessionPending && session !== null;
  const hasEventSession =
    rawNext === null && eventSession !== null && eventSession !== undefined;

  useEffect(() => {
    if (hasOwnerSession) {
      router.replace(next);
    } else if (hasEventSession) {
      router.replace("/enter");
    }
  }, [hasOwnerSession, hasEventSession, next, router]);

  const isCheckingSessions =
    isSessionPending ||
    (eventSessionToken !== null && eventSession === undefined);

  const [activeTab, setActiveTab] = useState<"owner" | "judge">(initialTab);
  const [ownerPending, setOwnerPending] = useState(false);

  // Judge / Staff Form state
  const [eventCode, setEventCode] = useState(params.get("code") ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [judgePending, setJudgePending] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);

  async function handleJudgeLogin(e: React.FormEvent) {
    e.preventDefault();
    setJudgeError(null);
    setJudgePending(true);

    try {
      const res = await fetch("/api/auth/judge-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventCode: eventCode.trim().toUpperCase(),
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setJudgeError(
          data.error || "Authentication failed. Please verify your credentials."
        );
        return;
      }

      router.push("/enter");
      router.refresh();
    } catch {
      setJudgeError("Network communication error. Please try again.");
    } finally {
      setJudgePending(false);
    }
  }

  if (isCheckingSessions) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <LoadingScreen label="Checking active sessions…" className="min-h-screen" />
      </main>
    );
  }

  return (
    <main className="min-h-screen relative flex items-center justify-center p-4 bg-background overflow-hidden selection:bg-primary/20">
      {/* Subtle background ambient gradients */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-primary/15 via-sky-500/10 to-transparent blur-3xl opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black_40%,transparent)] opacity-30"
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 group mb-2">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/25 group-hover:scale-105 transition-transform">
              <Trophy className="size-5.5" />
            </div>
          </Link>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Sign In to Tabulation
          </h1>
          <p className="text-xs text-muted-foreground">
            Access your organization workspace or enter your assigned event
          </p>
        </div>

        {/* Dual Tab Navigation */}
        <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border/60 text-xs font-semibold">
          <button
            type="button"
            id="tab-owner-login"
            onClick={() => {
              setActiveTab("owner");
              setJudgeError(null);
            }}
            className={cn(
              "flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all",
              activeTab === "owner"
                ? "bg-card text-foreground shadow-xs ring-1 ring-border/80 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Building2 className="size-4 text-primary" />
            <span>Organization</span>
          </button>
          <button
            type="button"
            id="tab-event-login"
            onClick={() => {
              setActiveTab("judge");
              setJudgeError(null);
            }}
            className={cn(
              "flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all",
              activeTab === "judge"
                ? "bg-card text-foreground shadow-xs ring-1 ring-border/80 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <KeyRound className="size-4 text-primary" />
            <span>Judge & Staff</span>
          </button>
        </div>

        {/* Tab 1: Organization Owner Sign-In */}
        {activeTab === "owner" && (
          <Card className="border-border/70 shadow-lg bg-card/95 backdrop-blur-md">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-base font-bold">Organization Sign In</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Sign in with your organization account to create competitions, manage judges, templates, and billing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                id="btn-google-signin"
                variant="outline"
                className="w-full h-11 relative flex items-center justify-center gap-3 font-semibold hover:bg-muted/60 transition-colors shadow-xs"
                disabled={ownerPending}
                onClick={async () => {
                  setOwnerPending(true);
                  try {
                    await signIn.social({ provider: "google", callbackURL: next });
                  } catch {
                    toast.error("Could not start Google sign-in. Please try again.");
                    setOwnerPending(false);
                  }
                }}
              >
                {ownerPending ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <svg className="size-4.5" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.7 1 4 3.5 2.2 7.1l3.7 2.8C6.8 6.9 9.2 5 12 5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.3h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.1-2 3.7-4.9 3.7-8.6z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.9 14.1c-.2-.7-.3-1.4-.3-2.1s.1-1.4.3-2.1L2.2 7.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.2 4.9l3.7-2.8z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-2.8 0-5.2-1.9-6.1-4.5L2.2 16.9C4 20.5 7.7 23 12 23z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </Button>

              <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground flex items-center gap-2 border border-border/40">
                <ShieldCheck className="size-4 shrink-0 text-success" />
                <span>Protected by single sign-on authentication.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 2: Judges and Staff Event Access */}
        {activeTab === "judge" && (
          <Card className="border-border/70 shadow-lg bg-card/95 backdrop-blur-md">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-base font-bold">Judge & Staff Portal</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Enter the 6 to 8-character event code and the credentials provided by your event administrator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJudgeLogin} className="space-y-4">
                {judgeError && (
                  <div
                    id="judge-login-error"
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2 animate-in fade-in-50"
                  >
                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                    <span>{judgeError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label
                    htmlFor="eventCode"
                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Event Code
                  </Label>
                  <Input
                    id="eventCode"
                    name="eventCode"
                    type="text"
                    placeholder="e.g. GRAND26"
                    value={eventCode}
                    onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                    required
                    autoComplete="off"
                    maxLength={10}
                    className="font-mono text-center tracking-widest uppercase h-11 text-base font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="username"
                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Username
                  </Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="e.g. judge1 or staff_review"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    className="h-10 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Password / Passcode
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-10 text-xs"
                  />
                </div>

                <Button
                  id="btn-event-login-submit"
                  type="submit"
                  className="w-full h-11 font-semibold flex items-center justify-center gap-2 mt-2 shadow-sm shadow-primary/20"
                  disabled={judgePending}
                >
                  {judgePending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="size-4" />
                      <span>Enter Judging Console</span>
                      <ArrowRight className="size-4 ml-1" />
                    </>
                  )}
                </Button>

                <p className="text-center text-[11px] text-muted-foreground pt-1">
                  Credentials are securely generated and provided by your competition organizer.
                </p>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Link
            href="/sentry/login"
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <Lock className="size-3" />
            <span>Superadmin Ops Console</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
