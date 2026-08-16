import { BadgeCheck, Circle, CirclePause, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  roundStatusLabel,
  roundStatusTone,
  sheetStatusLabel,
  sheetStatusTone,
  type RoundStatus,
  type SheetStatus,
  type Tone,
} from "./status";

const toneClasses: Record<Tone, string> = {
  muted: "bg-muted text-muted-foreground",
  info: "bg-info-muted text-info",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  secondary: "bg-secondary text-secondary-foreground",
};

const dotClasses: Record<SheetStatus, string> = {
  not_started: "rounded-full border border-muted-foreground/60 bg-transparent",
  in_progress:
    "rounded-full ring-1 ring-info bg-[linear-gradient(to_right,var(--info)_50%,transparent_50%)]",
  submitted: "rounded-full bg-success ring-2 ring-success/30",
  locked: "rounded-[2px] bg-muted-foreground",
};

export function StatusDot({
  status,
  label,
  className,
}: {
  status: SheetStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block size-2 shrink-0", dotClasses[status], className)}
    />
  );
}

const roundIcons: Record<RoundStatus, typeof Circle> = {
  open: Circle,
  closed: CirclePause,
  published: BadgeCheck,
};

export function StatusBadge({
  status,
  kind,
}: {
  status: SheetStatus | RoundStatus;
  kind: "sheet" | "round";
}) {
  if (status === "locked") {
    return (
      <Badge variant="secondary">
        <Lock aria-hidden />
        {sheetStatusLabel.locked}
      </Badge>
    );
  }
  if (kind === "round") {
    const roundStatus = status as RoundStatus;
    const Icon = roundIcons[roundStatus];
    return (
      <Badge className={cn("border-transparent", toneClasses[roundStatusTone[roundStatus]])}>
        <Icon aria-hidden />
        {roundStatusLabel[roundStatus]}
      </Badge>
    );
  }
  const sheetStatus = status as SheetStatus;
  return (
    <Badge className={cn("border-transparent", toneClasses[sheetStatusTone[sheetStatus]])}>
      {sheetStatusLabel[sheetStatus]}
    </Badge>
  );
}
