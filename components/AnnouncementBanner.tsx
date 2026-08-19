"use client";

import { useQuery } from "convex/react";
import { Wrench } from "lucide-react";
import { api } from "@/convex/_generated/api";

/**
 * App-shell emergency maintenance banner.
 * Regular announcements are displayed inside the Notification Bell.
 */
export function AnnouncementBanner() {
  const settings = useQuery(api.superadmin.settings.getPublic);

  if (settings?.maintenanceMode !== true) {
    return null;
  }

  return (
    <div className="space-y-2 px-4 pt-2 sm:px-6">
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-lg border border-warning/30 bg-warning-muted px-3.5 py-2 text-sm"
      >
        <Wrench aria-hidden className="size-4 shrink-0 text-warning" />
        <p>
          <span className="font-semibold">Maintenance in progress.</span>{" "}
          <span className="text-muted-foreground">
            Some features may be temporarily unavailable.
          </span>
        </p>
      </div>
    </div>
  );
}