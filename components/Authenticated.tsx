"use client";

import { useSession } from "@/lib/auth-client";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect } from "react";

export function Authenticated({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const ensureProfile = useMutation(api.auth.ensureUserProfile);

  useEffect(() => {
    if (session) {
      void ensureProfile({});
    }
  }, [session, ensureProfile]);

  if (isPending) return null;
  if (!session) return null;
  return <>{children}</>;
}
