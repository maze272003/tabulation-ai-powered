import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/components/tabulation/StatusBadge";
import type { Tone } from "@/components/tabulation/status";

export function PlatformBadge({
  label,
  tone,
  icon: Icon,
}: {
  label: string;
  tone: Tone;
  icon?: LucideIcon;
}) {
  return (
    <Badge className={cn("border-transparent", toneClasses[tone])}>
      {Icon && <Icon aria-hidden />}
      {label}
    </Badge>
  );
}
