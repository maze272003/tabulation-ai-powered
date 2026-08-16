"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { notFound } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ClipboardCheck,
  LayoutDashboard,
  Layers,
  Lock,
  Settings,
  Tags,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/LoadingScreen";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-warning-muted text-warning",
  ready: "bg-success-muted text-success",
  archived: "bg-muted text-muted-foreground",
};

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
  const pathname = usePathname();
  if (ev === undefined) return <LoadingScreen label="Loading event…" />;
  if (ev === null) return notFound();

  const base = `/app/${orgSlug}/events/${eventSlug}`;
  const nav: { label: string; href: string; icon: LucideIcon }[] = [
    { label: "Overview", href: `${base}/overview`, icon: LayoutDashboard },
    { label: "Accounts", href: `${base}/accounts`, icon: Users },
    { label: "Rounds", href: `${base}/rounds`, icon: Layers },
    { label: "Categories", href: `${base}/categories`, icon: Tags },
    { label: "Contestants", href: `${base}/contestants`, icon: UserRound },
    { label: "Readiness", href: `${base}/readiness`, icon: ClipboardCheck },
    { label: "Results", href: `${base}/results`, icon: Trophy },
    { label: "Settings", href: `${base}/settings`, icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href={`/app/${orgSlug}/events`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          All events
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{ev.name}</h1>
          <Badge className={cn("border-transparent capitalize", STATUS_TONE[ev.status] ?? "bg-muted text-muted-foreground")}>
            {ev.status}
          </Badge>
          <Badge variant="outline" className="font-mono tracking-wider uppercase">
            {ev.eventCode}
          </Badge>
          {ev.status !== "draft" ? (
            <Link
              href={`${base}/publish`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <Lock aria-hidden className="size-3" />
              Locked — manage
            </Link>
          ) : null}
        </div>
        {ev.status === "draft" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-warning/40 bg-warning-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <span>
              Draft — configuration is editable.{" "}
              <Link href={`${base}/publish`} className="font-medium text-foreground underline underline-offset-4">
                Publish when ready.
              </Link>
            </span>
          </div>
        ) : null}
      </div>

      <nav aria-label="Event sections" className="flex flex-wrap gap-1 border-b">
        {nav.map((item) => {
          const active =
            pathname === item.href ||
            (item.label === "Rounds" && pathname.startsWith(`${base}/rounds/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <item.icon aria-hidden className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
