"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Megaphone, Wrench, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

/**
 * App-shell banner: live platform announcements plus a maintenance-mode
 * notice. Announcements are dismissible per session; the maintenance notice
 * is always visible while the mode is on.
 */
export function AnnouncementBanner() {
  const announcements = useQuery(api.announcements.listActive);
  const settings = useQuery(api.superadmin.settings.getPublic);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visible = (announcements ?? []).filter(
    (announcement) => !dismissedIds.has(announcement._id),
  );

  if (visible.length === 0 && settings?.maintenanceMode !== true) {
    return null;
  }

  return (
    <div className="space-y-2 px-4 pt-2 sm:px-6">
      {settings?.maintenanceMode === true && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-sm"
        >
          <Wrench aria-hidden className="size-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-semibold">Maintenance in progress.</span>{" "}
            <span className="text-muted-foreground">
              Some features may be temporarily unavailable.
            </span>
          </p>
        </div>
      )}
      {visible.map((announcement) => (
        <div
          key={announcement._id}
          role="status"
          className="flex items-start gap-2.5 rounded-lg border bg-card px-3.5 py-2.5 text-sm"
        >
          <Megaphone aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{announcement.title}</p>
            <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{announcement.body}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Dismiss announcement: ${announcement.title}`}
            onClick={() => setDismissedIds((ids) => new Set(ids).add(announcement._id))}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}