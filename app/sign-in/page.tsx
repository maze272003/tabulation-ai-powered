"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn } from "@/lib/auth-client";
import { Shield, KeyRound, Building2, UserCheck, AlertCircle, Loader2, ArrowRight } from "lucide-react";

function SignInContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";

  const [activeTab, setActiveTab] = useState<"owner" | "judge">("owner");
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
        if (data.code === "FORBIDDEN") {
          setJudgeError("Account is locked or disabled. Please contact the event administrator.");
        } else if (data.code === "UNAUTHENTICATED") {
          setJudgeError("Invalid event code, username, or password.");
        } else {
          setJudgeError(data.error || "Authentication failed.");
        }
        return;
      }

      router.push("/enter");
      router.refresh();
    } catch {
      setJudgeError("Network error. Please try again.");
    } finally {
      setJudgePending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-2 ring-1 ring-primary/20 shadow-sm">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Tabulation Platform</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your organization or enter your assigned event
          </p>
        </div>

        {/* Dual Tab Navigation */}
        <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border/50 text-sm font-medium">
          <button
            type="button"
            id="tab-owner-login"
            onClick={() => setActiveTab("owner")}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all ${
              activeTab === "owner"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Organization</span>
          </button>
          <button
            type="button"
            id="tab-event-login"
            onClick={() => setActiveTab("judge")}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all ${
              activeTab === "judge"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Event Access</span>
          </button>
        </div>

        {/* Tab 1: Organization Owner Sign-In */}
        {activeTab === "owner" && (
          <Card className="border-border/60 shadow-lg backdrop-blur-sm bg-card/95">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg">Organization Sign In</CardTitle>
              <CardDescription>
                Sign in with your organization account to create and manage events, templates, and billing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                id="btn-google-signin"
                variant="outline"
                className="w-full h-11 relative flex items-center justify-center gap-3 font-medium hover:bg-muted/50 transition-colors"
                disabled={ownerPending}
                onClick={async () => {
                  setOwnerPending(true);
                  await signIn.social({ provider: "google", callbackURL: next });
                }}
              >
                {ownerPending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </Button>
              <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 shrink-0 text-primary/70" />
                <span>Organization accounts use verified single sign-on security.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 2: Judges and Staff Event Access */}
        {activeTab === "judge" && (
          <Card className="border-border/60 shadow-lg backdrop-blur-sm bg-card/95">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg">Event Access</CardTitle>
              <CardDescription>
                Enter your 8-character event code and the credentials provided by the organizer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJudgeLogin} className="space-y-4">
                {judgeError && (
                  <div
                    id="judge-login-error"
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2.5 animate-in fade-in-50 duration-200"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{judgeError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="eventCode" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Event Code
                  </Label>
                  <Input
                    id="eventCode"
                    name="eventCode"
                    type="text"
                    placeholder="e.g. K7M9-2P4X"
                    value={eventCode}
                    onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                    required
                    autoComplete="off"
                    maxLength={10}
                    className="font-mono text-center tracking-widest uppercase h-11 text-base font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Username
                  </Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="e.g. judge1 or staff1"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Password
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
                    className="h-10"
                  />
                </div>

                <Button
                  id="btn-event-login-submit"
                  type="submit"
                  className="w-full h-11 font-medium flex items-center justify-center gap-2 mt-2"
                  disabled={judgePending}
                >
                  {judgePending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Enter Event</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground pt-1">
                  Credentials are generated and provided by your event organizer.
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}
