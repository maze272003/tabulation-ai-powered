"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export function OrgSwitcher({ currentSlug }: { currentSlug: string }) {
  const mine = useQuery(api.organizations.listMine, {});
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase text-muted-foreground">Organization</div>
      {mine?.map((m) => (
        <Link
          key={m.membership._id}
          href={`/app/${m.org?.slug}`}
          className={`block rounded px-2 py-1 text-sm ${m.org?.slug === currentSlug ? "bg-accent font-medium" : "hover:bg-accent"}`}
        >
          {m.org?.name}
        </Link>
      ))}
    </div>
  );
}
