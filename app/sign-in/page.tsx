import { Suspense } from "react";
import { cookies } from "next/headers";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata = {
  title: "Sign In | Tabulation",
  description: "Sign in to manage your organization or enter your assigned event.",
};

export default async function SignInPage() {
  const cookieStore = await cookies();
  const eventSessionToken = cookieStore.get("event_session_token")?.value ?? null;

  return (
    <Suspense fallback={null}>
      <SignInForm eventSessionToken={eventSessionToken} />
    </Suspense>
  );
}
