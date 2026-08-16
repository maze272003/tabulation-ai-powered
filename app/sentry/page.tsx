"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SentrySessionProvider, useSentrySession } from "@/components/sentry/SentrySession";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function SentryRootPage() {
  return (
    <SentrySessionProvider>
      <Redirector />
    </SentrySessionProvider>
  );
}

function Redirector() {
  const { status } = useSentrySession();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-in") {
      router.replace("/sentry/dashboard");
    } else if (status === "signed-out") {
      router.replace("/sentry/login");
    }
  }, [status, router]);

  return <LoadingScreen label="Opening ops console…" />;
}