"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";

function SignInContent() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";
  const [pending, setPending] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Sign in to Tabulation</h1>
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await signIn.social({ provider: "google", callbackURL: next });
        }}
      >
        Continue with Google
      </Button>
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
