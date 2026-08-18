"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { notFound, usePathname } from "next/navigation";
import Link from "next/link";
import { use, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { UserMenu } from "@/components/UserMenu";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageTransition } from "@/components/PageTransition";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "overview", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "events", label: "Events", icon: CalendarDays },
  { href: "templates", label: "Templates", icon: LayoutTemplate },
  { href: "billing", label: "Billing", icon: CreditCard },
  { href: "settings", label: "Settings", icon: Settings },
];

export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { orgSlug });
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (org === undefined) return <LoadingScreen label="Loading workspace…" />;
  if (org === null) return notFound();

  const base = `/app/${orgSlug}`;

  const nav = (
    <nav className="flex-1 space-y-1" aria-label="Organization">
      {NAV_ITEMS.map((item) => {
        const href = `${base}/${item.href}`;
        const active = item.exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={() => setMobileNavOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon aria-hidden className={cn("size-4", active && "text-primary")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 bg-sidebar p-3 text-sidebar-foreground lg:flex print:hidden">
        <OrgSwitcher currentSlug={orgSlug} />
        {nav}
        <div className="border-t border-sidebar-border pt-3">
          <UserMenu className="w-full" />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50 animate-in fade-in-0 duration-200 motion-reduce:animate-none"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 bg-sidebar p-3 text-sidebar-foreground shadow-xl animate-in slide-in-from-left duration-250 motion-reduce:animate-none">
            <div className="flex items-center justify-between">
              <OrgSwitcher currentSlug={orgSlug} />
              <button
                type="button"
                aria-label="Close navigation"
                className="rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={() => setMobileNavOpen(false)}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            {nav}
            <div className="border-t border-sidebar-border pt-3">
              <UserMenu className="w-full" />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:hidden print:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu aria-hidden className="size-5" />
          </button>
          <span className="min-w-0 truncate text-sm font-semibold">{org.name}</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <PageTransition className="space-y-6">{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
