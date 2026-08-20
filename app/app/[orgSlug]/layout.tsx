"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { notFound, usePathname } from "next/navigation";
import Link from "next/link";
import { use, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  Menu,
  Settings,
  Trophy,
  X,
} from "lucide-react";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { UserMenu } from "@/components/UserMenu";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageTransition } from "@/components/PageTransition";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "overview", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "events", label: "Events & Competitions", icon: CalendarDays },
  { href: "templates", label: "Scoring Templates", icon: LayoutTemplate },
  { href: "documents", label: "Documents & Certificates", icon: Award },
  { href: "billing", label: "Billing & Units", icon: CreditCard },
  { href: "support", label: "Support & Help Desk", icon: LifeBuoy },
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
  const supportBadge = useQuery(api.support.tickets.getOrgSupportBadge, { orgSlug });
  const unreadSupportCount = supportBadge?.unreadCount ?? 0;
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (org === undefined) return <LoadingScreen label="Loading workspace…" />;
  if (org === null) return notFound();

  const base = `/app/${orgSlug}`;

  const nav = (
    <nav className="flex-1 space-y-1" aria-label="Organization Workspace">
      {NAV_ITEMS.map((item) => {
        const href = `${base}/${item.href}`;
        const active = item.exact ? pathname === href : pathname.startsWith(href);
        const hasUnread = item.href === "support" && unreadSupportCount > 0;
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={() => setMobileNavOpen(false)}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary"
              />
            )}
            <item.icon
              aria-hidden
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
              )}
            />
            <span className="flex-1 truncate">{item.label}</span>
            {hasUnread ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground animate-in zoom-in-50 shadow-xs">
                {unreadSupportCount > 99 ? "99+" : unreadSupportCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Command Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 bg-sidebar p-3.5 text-sidebar-foreground lg:flex border-r border-sidebar-border/40 print:hidden">
        <OrgSwitcher currentSlug={orgSlug} />
        {nav}
        <div className="border-t border-sidebar-border/50 pt-3">
          <UserMenu className="w-full" />
        </div>
      </aside>

      {/* Mobile Drawer Sheet */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-200"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 bg-sidebar p-4 text-sidebar-foreground shadow-2xl animate-in slide-in-from-left duration-250">
            <div className="flex items-center justify-between border-b border-sidebar-border/50 pb-3">
              <OrgSwitcher currentSlug={orgSlug} />
              <button
                type="button"
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={() => setMobileNavOpen(false)}
              >
                <X aria-hidden className="size-4.5" />
              </button>
            </div>
            {nav}
            <div className="border-t border-sidebar-border/50 pt-3">
              <UserMenu className="w-full" />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar with Notification Bell */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/85 px-4 sm:px-6 backdrop-blur-md print:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu aria-hidden className="size-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="min-w-0 truncate text-xs sm:text-sm font-bold text-foreground">
                {org.name}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded-md hidden sm:inline-block">
                /{orgSlug}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <NotificationBell />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <PageTransition className="space-y-6">{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
