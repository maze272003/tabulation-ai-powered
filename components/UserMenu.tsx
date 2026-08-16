"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ className }: { className?: string }) {
  const router = useRouter();
  const me = useQuery(api.auth.getCurrentUser, {});

  const displayName = me?.name || me?.email || "Account";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-9 justify-start gap-2 px-2 text-sm font-normal text-muted-foreground hover:text-foreground",
              className,
            )}
            aria-label="Account menu"
          />
        }
      >
        <Avatar size="sm" className="size-6">
          {me?.image ? <AvatarImage src={me.image} alt="" /> : null}
          <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-left">{displayName}</span>
        <ChevronsUpDown aria-hidden className="ml-auto size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        <DropdownMenuLabel className="truncate">
          {me?.email || displayName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await signOut();
            router.push("/sign-in");
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
