import type { LucideIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card size="sm" className={cn("bg-card/90 border-border/70 shadow-xs hover:border-border transition-all", className)}>
      <CardHeader className="p-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs font-medium text-muted-foreground">
            {label}
          </CardDescription>
          {Icon && (
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Icon aria-hidden className="size-3.5" />
            </span>
          )}
        </div>
        <CardTitle className="font-heading text-2xl font-bold tabular-nums text-foreground">
          {value}
        </CardTitle>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}
