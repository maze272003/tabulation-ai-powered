"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function EventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const create = useMutation(api.events.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Button onClick={() => router.push(`/app/${orgSlug}/events/new`)}>New event</Button>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Quick create (blank event)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          variant="outline"
          disabled={creating || !name}
          onClick={async () => {
            setCreating(true);
            try {
              const slug = await create({ orgSlug, name });
              router.push(`/app/${orgSlug}/events/${slug}/overview`);
            } catch (err: unknown) {
              const code = (err as { data?: { code?: string } })?.data?.code;
              if (code === "LIMIT_EXCEEDED") toast.error("Event limit reached - upgrade your plan.");
              else if (code === "CONFLICT") toast.error("An event with that slug already exists.");
              else toast.error("Could not create event.");
              setCreating(false);
            }
          }}
        >
          Create
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {events?.map((ev) => (
          <Link key={ev._id} href={`/app/${orgSlug}/events/${ev.slug}/overview`} className="block">
            <div className="rounded-lg border p-4 hover:bg-accent">
              <div className="font-medium">{ev.name}</div>
              <div className="text-sm text-muted-foreground">{ev.slug} - {ev.status}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
