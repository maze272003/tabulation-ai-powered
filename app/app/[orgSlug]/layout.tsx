"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { notFound } from "next/navigation";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { UserMenu } from "@/components/UserMenu";
import Link from "next/link";
import { use } from "react";

export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { orgSlug });
  if (org === undefined) return <div className="p-8">Loading…</div>;
  if (org === null) return notFound();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 border-r p-4 space-y-4">
        <OrgSwitcher currentSlug={orgSlug} />
        <nav className="space-y-1 text-sm">
          <Link href={`/app/${orgSlug}/overview`} className="block rounded px-2 py-1 hover:bg-accent">Overview</Link>
          <Link href={`/app/${orgSlug}/members`} className="block rounded px-2 py-1 hover:bg-accent">Members</Link>
          <Link href={`/app/${orgSlug}/settings`} className="block rounded px-2 py-1 hover:bg-accent">Settings</Link>
          <Link href={`/app/${orgSlug}/billing`} className="block rounded px-2 py-1 hover:bg-accent">Billing</Link>
        </nav>
        <div className="pt-4 border-t"><UserMenu /></div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
