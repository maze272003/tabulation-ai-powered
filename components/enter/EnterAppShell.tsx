"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import { Shield, KeyRound, LogOut, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export type EventSessionData = NonNullable<FunctionReturnType<typeof api.eventAuth.sessionInfo>>;

interface EnterContextValue {
  sessionToken: string;
  session: EventSessionData;
}

const EnterContext = createContext<EnterContextValue | null>(null);

export function useEnterSession() {
  const ctx = useContext(EnterContext);
  if (!ctx) {
    throw new Error("useEnterSession must be used within an EnterAppShell");
  }
  return ctx;
}

export function EnterAppShell({
  sessionToken,
  children,
}: {
  sessionToken: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const sessionInfo = useQuery(
    api.eventAuth.sessionInfo,
    sessionToken ? { sessionToken } : "skip",
  );

  useEffect(() => {
    if (!sessionToken || sessionInfo === null) {
      router.push("/sign-in");
    }
  }, [sessionToken, sessionInfo, router]);

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/judge-logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Logout request failed");
      }
    } catch {
      // The event session cookie is still active; navigating would bounce the
      // user straight back, so surface the failure instead.
      toast.error("Could not log out. Please try again.");
      return;
    }
    router.push("/sign-in");
    router.refresh();
  }

  if (!sessionToken || sessionInfo === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading event workspace...</p>
      </div>
    );
  }

  if (sessionInfo === null) {
    return null;
  }

  const { account, event } = sessionInfo;

  return (
    <EnterContext.Provider value={{ sessionToken, session: sessionInfo }}>
      <div className="min-h-screen flex flex-col bg-background selection:bg-primary/10">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-xs">
          <div className="container max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
            {/* Left: Event Brand & Code */}
            <div className="flex items-center gap-3">
              <Link
                href="/enter"
                className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground shadow-xs">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold tracking-tight text-foreground sm:text-base text-sm">
                      {event.name}
                    </span>
                    <Badge
                      variant="secondary"
                      className="font-mono text-xs tracking-wider uppercase px-2 py-0.5 bg-muted font-semibold text-muted-foreground"
                    >
                      {event.eventCode}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground hidden sm:block">Tabulation Workspace</p>
                </div>
              </Link>
            </div>

            {/* Right: User Profile & Actions */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full border border-border/40">
                <span className="text-xs sm:text-sm font-medium text-foreground">
                  {account.displayName}
                </span>
                <Badge
                  variant="default"
                  className={`capitalize text-xs font-semibold px-2 py-0.5 shadow-none border-transparent ${
                    account.kind === "staff"
                      ? "bg-warning text-warning-foreground hover:bg-warning"
                      : "bg-info text-info-foreground hover:bg-info"
                  }`}
                >
                  {account.kind === "staff" ? (
                    <Sparkles className="w-3 h-3 mr-1" />
                  ) : (
                    <KeyRound className="w-3 h-3 mr-1" />
                  )}
                  {account.kind}
                </Badge>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors h-9 px-2.5"
                title="Log out of event"
              >
                <LogOut className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline text-xs font-medium">Log out</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </EnterContext.Provider>
  );
}
