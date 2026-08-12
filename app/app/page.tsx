"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AppHome() {
  const mine = useQuery(api.organizations.listMine, {});
  const create = useMutation(api.organizations.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Your organizations</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {mine?.map((m) => (
          <Link key={m.membership._id} href={`/app/${m.org?.slug}`} className="block">
            <Card className="p-4 hover:bg-accent">
              <div className="font-medium">{m.org?.name}</div>
              <div className="text-sm text-muted-foreground">{m.role?.name}</div>
            </Card>
          </Link>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="rounded border px-3 py-2"
          placeholder="New organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={creating || !name}
          onClick={async () => {
            setCreating(true);
            try {
              const slug = await create({ name });
              router.push(`/app/${slug}`);
            } catch (err: unknown) {
              const code = (err as { data?: { code?: string } })?.data?.code;
              if (code === "CONFLICT") {
                toast.error("An organization with that name already exists. Try a different name.");
              } else {
                toast.error("Could not create organization.");
              }
            } finally {
              setCreating(false);
            }
          }}
        >
          Create
        </Button>
      </div>
    </main>
  );
}
