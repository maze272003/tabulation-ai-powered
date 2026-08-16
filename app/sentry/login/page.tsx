"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { SentrySessionProvider, useSentrySession } from "@/components/sentry/SentrySession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      toast.error("Invalid credentials");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <ShieldCheck aria-hidden className="size-6" />
          </span>
          <div>
            <h1 className="font-heading text-xl font-semibold">Ops console</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Restricted area — superadmin credentials required.
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
        >
          <div className="space-y-2">
            <Label htmlFor="sentry-username">Username</Label>
            <Input
              id="sentry-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sentry-password">Password</Label>
            <Input
              id="sentry-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <KeyRound aria-hidden className="size-4" />
            )}
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}