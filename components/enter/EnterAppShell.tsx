"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, KeyRound, LogOut, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

export type EventSessionData = {
  account: {
    _id: string;
    kind: "judge" | "staff";
    displayName: string;
    username: string;
  };
  event: {
    _id: string;
    name: string;
    slug: string;
    eventCode: string;
    status: string;
    resultVisibility: string;
    eliminationEnabled: boolean;
  };
};

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
      await fetch("/api/auth/judge-logout", { method: "POST" });
    } finally {
      router.push("/sign-in");
      router.refresh();
    }
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

  const { account, event } = sessionInfo as unknown as EventSessionData;

  return (
    <EnterContext.Provider value={{ sessionToken, session: sessionInfo as unknown as EventSessionData }}>
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
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs">
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
                  className={`capitalize text-xs font-semibold px-2 py-0.5 shadow-none ${
                    account.kind === "staff"
                      ? "bg-amber-600/90 hover:bg-amber-600 text-white"
                      : "bg-blue-600/90 hover:bg-blue-600 text-white"
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
          {children}
        </main>
      </div>
    </EnterContext.Provider>
  );
}
