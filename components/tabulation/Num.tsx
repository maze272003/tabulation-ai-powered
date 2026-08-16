import { cn } from "@/lib/utils";
import { formatScore } from "./status";

export function Num({
  value,
  precision = 0,
  tone = "default",
  className,
}: {
  value: number | null | undefined;
  precision?: number;
  tone?: "default" | "success" | "muted";
  className?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <span aria-label="no value" className={cn("font-mono tabular-nums", className)}>
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        tone === "success" && "text-success",
        tone === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {formatScore(value, precision)}
    </span>
  );
}
