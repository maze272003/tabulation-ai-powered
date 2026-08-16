import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Centered full-height loading state used by authenticated shells
 * while session and profile data resolve.
 */
export function LoadingScreen({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground",
        className,
      )}
    >
      <Loader2 aria-hidden className="size-6 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
