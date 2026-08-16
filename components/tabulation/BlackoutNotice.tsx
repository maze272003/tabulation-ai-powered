import { EyeOff } from "lucide-react";

export function BlackoutNotice() {
  return (
    <div
      role="note"
      className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground"
    >
      <EyeOff aria-hidden className="size-3.5 shrink-0" />
      Results stay hidden to judges and staff until the round is published.
    </div>
  );
}
