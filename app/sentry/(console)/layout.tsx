"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Building2,
  CreditCard,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SentrySessionProvider, useSentrySession } from "@/components/sentry/SentrySession";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/sentry/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/sentry/support", label: "Support & Tickets", icon: LifeBuoy },
  { href: "/sentry/users", label: "Users", icon: Users },
  { href: "/sentry/organizations", label: "Organizations", icon: Building2 },
  { href: "/sentry/billing", label: "Billing", icon: CreditCard },
  { href: "/sentry/crm", label: "CRM", icon: Handshake },
  { href: "/sentry/announcements", label: "Announcements", icon: Megaphone },
  { href: "/sentry/audit", label: "Audit log", icon: ScrollText },
  { href: "/sentry/settings", label: "Settings", icon: Settings },
];

export default function SentryConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <SentrySessionProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </SentrySessionProvider>
  );
}

function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { status, signOut } = useSentrySession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "signed-out") {
      router.replace("/sentry/login");
    }
  }, [status, router]);

  if (status !== "signed-in") {
    return <LoadingScreen label="Checking console session…" />;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-4 bg-sidebar p-3 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
            <ShieldCheck aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sidebar-accent-foreground">Ops console</p>
            <p className="truncate text-xs text-sidebar-foreground/60">Superadmin</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1" aria-label="Superadmin console">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
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
        <div className="space-y-1 border-t border-sidebar-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start gap-2.5 px-2.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut aria-hidden className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur md:hidden">
          <div className="flex h-14 items-center gap-3 px-4">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck aria-hidden className="size-4" />
            </span>
            <span className="text-sm font-semibold">Ops console</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="ml-auto gap-1.5 text-muted-foreground"
            >
              <LogOut aria-hidden className="size-3.5" />
              Sign out
            </Button>
          </div>
          <nav aria-label="Superadmin console" className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV_ITEMS.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon aria-hidden className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <PageTransition className="space-y-6">{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}