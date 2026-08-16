import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function VersionBadge({ version, latest }: { version: number; latest?: boolean }) {
  const badge = (
    <Badge variant="outline" className={cn(version >= 2 && "border-warning/50 text-warning")}>
      <History aria-hidden />v{version}
      {latest && " · current"}
    </Badge>
  );
  if (version < 2) return badge;
  return (
    <Tooltip>
      <TooltipTrigger render={badge} />
      <TooltipContent>Corrected version — earlier versions are kept</TooltipContent>
    </Tooltip>
  );
}
