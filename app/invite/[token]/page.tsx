"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const inv = useQuery(api.invitations.getByToken, { token });
  const accept = useMutation(api.invitations.accept);
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (inv === undefined) return <div className="p-8">Loading…</div>;
  if (inv === null) return <div className="p-8">Invitation not found or already used.</div>;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Join {inv.orgName}</h1>
      <p className="text-muted-foreground">You have been invited as {inv.roleName}.</p>
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await accept({ token });
            router.push("/app");
          } catch (err: unknown) {
            setPending(false);
            const code = (err as { data?: { code?: string } })?.data?.code;
            if (code === "FORBIDDEN") {
              toast.error("This invitation was sent to a different email address.");
            } else if (code === "CONFLICT") {
              toast.error("This invitation has expired.");
            } else if (code === "LIMIT_EXCEEDED") {
              toast.error("The organization has reached its member limit.");
            } else if (code === "NOT_FOUND") {
              toast.error("Invitation not found or already used.");
            } else {
              toast.error("Could not accept invitation.");
            }
          }
        }}
      >
        Accept invitation
      </Button>
    </main>
  );
}
