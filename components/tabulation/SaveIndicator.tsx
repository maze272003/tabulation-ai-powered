"use client";

import { Check, LoaderCircle, Pencil, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function SaveIndicator({
  state,
  savedAt,
  onRetry,
}: {
  state: SaveState;
  savedAt?: number | null;
  onRetry?: () => void;
}) {
  if (state === "idle") return null;
  return (
    <div aria-live="polite" className="flex items-center gap-1.5 text-xs">
      {state === "dirty" && (
        <>
          <Pencil aria-hidden className="size-3.5 text-warning" />
          <span className="text-muted-foreground">Unsaved changes</span>
        </>
      )}
      {state === "saving" && (
        <>
          <LoaderCircle
            aria-hidden
            className="size-3.5 animate-spin text-info motion-reduce:animate-none"
          />
          <span className="text-muted-foreground">Saving…</span>
        </>
      )}
      {state === "saved" && (
        <>
          <Check aria-hidden className="size-3.5 text-success" />
          <span className="text-muted-foreground">
            Saved
            {savedAt
              ? ` ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
        </>
      )}
      {state === "error" && (
        <>
          <TriangleAlert aria-hidden className="size-3.5 text-destructive" />
          <span className="text-destructive">Save failed</span>
          {onRetry && (
            <Button variant="outline" size="xs" onClick={onRetry}>
              Retry
            </Button>
          )}
        </>
      )}
    </div>
  );
}
