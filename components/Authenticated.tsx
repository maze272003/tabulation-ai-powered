"use client";

import { useSession } from "@/lib/auth-client";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/LoadingScreen";

export function Authenticated({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: isSessionPending } = useSession();
  const { isAuthenticated: isConvexAuth, isLoading: isConvexLoading } = useConvexAuth();
  const ensureProfile = useMutation(api.auth.ensureUserProfile);
  const currentUser = useQuery(api.auth.getCurrentUser);
  const [isProvisioned, setIsProvisioned] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isSessionPending && !session) {
      router.push("/sign-in");
    }
  }, [isSessionPending, session, router]);

  useEffect(() => {
    if (session && isConvexAuth) {
      let isMounted = true;
      ensureProfile({})
        .then(() => {
          if (isMounted) {
            setIsProvisioned(true);
            setProvisionError(null);
          }
        })
        .catch((err: unknown) => {
          if (isMounted) {
            console.error("Failed to provision user profile", err);
            const msg = err instanceof Error ? err.message : "Failed to provision profile";
            setProvisionError(msg);
            toast.error("Failed to prepare your profile. Please retry.");
          }
        });
      return () => {
        isMounted = false;
      };
    }
  }, [session, isConvexAuth, ensureProfile]);

  if (isSessionPending || isConvexLoading) {
    return <LoadingScreen label="Loading your workspace…" />;
  }

  if (!session) {
    return null;
  }

  if (provisionError && !currentUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-destructive text-sm font-medium">{provisionError}</p>
        <button
          type="button"
          className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-muted"
          onClick={() => {
            setProvisionError(null);
            ensureProfile({})
              .then(() => setIsProvisioned(true))
              .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : "Failed to provision profile";
                setProvisionError(msg);
                toast.error("Failed to prepare your profile. Please retry.");
              });
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const isReady = (currentUser !== null && currentUser !== undefined) || isProvisioned;

  if (!isReady) {
    return <LoadingScreen label="Preparing your profile…" />;
  }

  return <>{children}</>;
}
