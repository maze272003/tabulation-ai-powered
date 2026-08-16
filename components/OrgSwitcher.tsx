"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function OrgSwitcher({ currentSlug }: { currentSlug: string }) {
  const mine = useQuery(api.organizations.listMine, {});
  const current = mine?.find((m) => m.org?.slug === currentSlug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-10 w-full justify-start gap-2.5 px-2 text-sidebar-accent-foreground hover:bg-sidebar-accent"
            aria-label="Switch organization"
          />
        }
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
          <Building2 aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
          {current?.org?.name ?? "Organizations"}
        </span>
        <ChevronsUpDown aria-hidden className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mine?.map((m) => {
          const active = m.org?.slug === currentSlug;
          return (
            <DropdownMenuItem
              key={m.membership._id}
              render={<Link href={`/app/${m.org?.slug}`} />}
            >
              <span className="min-w-0 flex-1 truncate">{m.org?.name}</span>
              {active ? <Check aria-hidden className="size-4 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/app" />}>
          <Plus />
          New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
