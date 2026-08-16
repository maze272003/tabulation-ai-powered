"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const STORAGE_KEY = "tabulation:sentry-token";

type SessionStatus = "loading" | "signed-in" | "signed-out";

type SentrySessionValue = {
  token: string | null;
  status: SessionStatus;
  signIn: (token: string) => void;
  signOut: () => void;
};

const SentrySessionContext = createContext<SentrySessionValue | null>(null);

const tokenListeners = new Set<() => void>();

function subscribeToToken(listener: () => void): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(nextToken: string | null): void {
  try {
    if (nextToken === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, nextToken);
    }
  } catch {
    // Storage unavailable (private mode); the token stays in memory only.
  }
  tokenListeners.forEach((listener) => listener());
}

export function SentrySessionProvider({ children }: { children: React.ReactNode }) {
  const token = useSyncExternalStore(subscribeToToken, readStoredToken, () => null);

  const session = useQuery(api.superadmin.auth.me, token ? { token } : "skip");

  const logoutMutation = useMutation(api.superadmin.auth.logout);

  const signIn = useCallback((nextToken: string) => {
    writeStoredToken(nextToken);
  }, []);

  const signOut = useCallback(() => {
    if (token) {
      void logoutMutation({ token }).catch(() => undefined);
    }
    writeStoredToken(null);
  }, [token, logoutMutation]);

  const status: SessionStatus =
    session === undefined ? "loading" : session !== null ? "signed-in" : "signed-out";

  const value = useMemo(
    () => ({ token, status, signIn, signOut }),
    [token, status, signIn, signOut],
  );

  return (
    <SentrySessionContext.Provider value={value}>{children}</SentrySessionContext.Provider>
  );
}

export function useSentrySession(): SentrySessionValue {
  const value = useContext(SentrySessionContext);
  if (!value) {
    throw new Error("useSentrySession must be used within SentrySessionProvider");
  }
  return value;
}