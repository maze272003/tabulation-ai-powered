"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function EventSettingsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const update = useMutation(api.events.update);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [prevKey, setPrevKey] = useState<string | null>(null);

  if (ev !== undefined && ev !== null && prevKey !== ev._id) {
    setPrevKey(ev._id);
    setName(ev.name);
    setVenue(ev.venue ?? "");
  }

  if (ev === undefined) return <div>Loading…</div>;
  if (ev === null) return <div>Event not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          disabled={ev.status !== "draft" || !name || name === ev.name}
          onClick={async () => {
            try {
              await update({ orgSlug, eventSlug, name, venue });
              toast.success("Saved.");
            } catch (err: unknown) {
              const data = (err as { data?: { code?: string; message?: string } })?.data;
              toast.error(data?.code === "CONFLICT" ? "Configuration is locked." : data?.message ?? "Could not save.");
            }
          }}
        >
          Save
        </Button>
      </div>
      <div className="flex gap-2">
        <Input value={venue} placeholder="Venue" onChange={(e) => setVenue(e.target.value)} />
      </div>
      <p className="text-sm text-muted-foreground">Slug: {ev.slug} - Status: {ev.status}</p>
    </div>
  );
}
