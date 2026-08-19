"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "convex/react";
import { ArrowLeft, KeyRound, Loader2, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { SentrySessionProvider, useSentrySession } from "@/components/sentry/SentrySession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function SentryLoginPage() {
  return (
    <SentrySessionProvider>
      <LoginForm />
    </SentrySessionProvider>
  );
}

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { signIn } = useSentrySession();
  const router = useRouter();
  const login = useMutation(api.superadmin.auth.login);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const session = await login({ username, password });
      signIn(session.token);
      toast.success("Signed in to the ops console");
      router.replace("/sentry/dashboard");
    } catch {
      toast.error("Invalid superadmin credentials");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-6 overflow-hidden selection:bg-primary/20">
      {/* Background ambient lighting */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-gradient-to-b from-primary/20 via-sky-500/10 to-transparent blur-3xl opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:40px_40px] opacity-25"
      />

      <div className="relative z-10 w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/25 shadow-md shadow-primary/10">
            <ShieldCheck aria-hidden className="size-7" />
          </span>
          <div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <h1 className="font-heading text-2xl font-bold tracking-tight">Ops Console</h1>
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                Restricted
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Superadmin authentication required for platform telemetry & administration.
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-border/70 bg-card/95 p-6 shadow-xl backdrop-blur-md"
        >
          <div className="space-y-1.5">
            <Label htmlFor="sentry-username" className="text-xs font-semibold text-muted-foreground">
              Admin Username
            </Label>
            <Input
              id="sentry-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              required
              className="h-10 text-xs"
              placeholder="e.g. sentry-admin"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sentry-password" className="text-xs font-semibold text-muted-foreground">
              Master Password
            </Label>
            <Input
              id="sentry-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="h-10 text-xs"
              placeholder="••••••••••••"
            />
          </div>

          <Button type="submit" className="w-full h-10 gap-2 font-semibold shadow-sm shadow-primary/20" disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <KeyRound aria-hidden className="size-4" />
            )}
            {busy ? "Authenticating Session…" : "Sign In to Ops Console"}
          </Button>

          <div className="pt-2 text-center">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3" />
              <span>Back to Organization Login</span>
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}