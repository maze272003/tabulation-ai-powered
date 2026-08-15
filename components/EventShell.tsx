"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";

export function EventShell({
  orgSlug,
  eventSlug,
  children,
}: {
  orgSlug: string;
  eventSlug: string;
  children: React.ReactNode;
}) {
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  if (ev === undefined) return <div className="p-8">Loading…</div>;
  if (ev === null) return notFound();

  const base = `/app/${orgSlug}/events/${eventSlug}`;
  const nav = [
    ["Overview", `${base}/overview`],
    ["Rounds", `${base}/rounds`],
    ["Categories", `${base}/categories`],
    ["Contestants", `${base}/contestants`],
    ["Judges", `${base}/judges`],
    ["Readiness", `${base}/readiness`],
    ["Settings", `${base}/settings`],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{ev.name}</h1>
        <Badge variant={ev.status === "draft" ? "outline" : "secondary"}>{ev.status}</Badge>
        {ev.status !== "draft" && (
          <Link href={`${base}/publish`} className="text-sm text-muted-foreground underline">
            Locked - manage
          </Link>
        )}
      </div>
      {ev.status === "draft" && (
        <div className="rounded border border-dashed p-2 text-sm text-muted-foreground">
          Draft - configuration is editable. <Link href={`${base}/publish`} className="underline">Publish when ready.</Link>
        </div>
      )}
      <nav className="flex flex-wrap gap-1 text-sm">
        {nav.map(([label, href]) => (
          <Link key={href} href={href} className="rounded px-2 py-1 hover:bg-accent">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
