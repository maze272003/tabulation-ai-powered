"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-warning-muted text-warning",
  ready: "bg-success-muted text-success",
  archived: "bg-muted text-muted-foreground",
  finalized: "bg-info-muted text-info",
};

export default function EventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const create = useMutation(api.events.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleQuickCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const slug = await create({ orgSlug, name });
      router.push(`/app/${orgSlug}/events/${slug}/overview`);
    } catch (err: unknown) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "LIMIT_EXCEEDED") toast.error("Event limit reached — upgrade your plan.");
      else if (code === "CONFLICT") toast.error("An event with that slug already exists.");
      else toast.error("Could not create event.");
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Create and manage competitions. Each event has its own accounts, rounds, and results."
        actions={
          <Button onClick={() => router.push(`/app/${orgSlug}/events/new`)}>
            <Plus aria-hidden />
            New event
          </Button>
        }
      />

      <form onSubmit={handleQuickCreate} className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="flex-1"
          placeholder="Quick create a blank event by name…"
          aria-label="Quick create event name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={creating}
        />
        <Button type="submit" variant="outline" disabled={creating || !name.trim()} className="sm:w-auto">
          {creating ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />}
          Create
        </Button>
      </form>

      {events === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="space-y-3">
                <div className="h-5 w-2/3 rounded bg-muted" />
                <div className="h-4 w-1/2 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarDays aria-hidden className="size-6 text-muted-foreground" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">No events yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first event to start configuring rounds and contestants.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push(`/app/${orgSlug}/events/new`)}>
            <Plus aria-hidden />
            New event
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((ev) => (
            <Link key={ev._id} href={`/app/${orgSlug}/events/${ev.slug}/overview`} className="group">
              <Card className="h-full transition-all group-hover:ring-primary/30 group-hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 font-medium text-foreground">{ev.name}</div>
                    <Badge
                      className={cn(
                        "shrink-0 border-transparent capitalize",
                        STATUS_TONE[ev.status] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {ev.status}
                    </Badge>
                  </div>
                  <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate font-mono">{ev.slug}</span>
                    <span className="shrink-0 font-mono tracking-wider uppercase">{ev.eventCode}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
