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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/sentry/dashboard", label: "Ops Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/sentry/support", label: "Support & Tickets", icon: LifeBuoy },
  { href: "/sentry/users", label: "User Accounts", icon: Users },
  { href: "/sentry/organizations", label: "Organizations", icon: Building2 },
  { href: "/sentry/billing", label: "Billing Operations", icon: CreditCard },
  { href: "/sentry/crm", label: "CRM Pipeline", icon: Handshake },
  { href: "/sentry/announcements", label: "Announcements", icon: Megaphone },
  { href: "/sentry/audit", label: "System Audit Log", icon: ScrollText },
  { href: "/sentry/settings", label: "Console Settings", icon: Settings },
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
    <div className="flex min-h-screen bg-background">
      {/* Desktop Superadmin Command Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 bg-sidebar p-3.5 text-sidebar-foreground md:flex border-r border-sidebar-border/40">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/50 p-2.5 ring-1 ring-white/10">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary ring-1 ring-primary/30">
            <ShieldCheck aria-hidden className="size-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold text-sidebar-accent-foreground leading-tight">Ops Console</p>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] px-1 py-0">
                LIVE
              </Badge>
            </div>
            <p className="truncate text-[10px] text-sidebar-foreground/60 font-mono">superadmin</p>
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
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-sidebar-border/50 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start gap-2.5 px-3 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-destructive transition-colors"
          >
            <LogOut aria-hidden className="size-4" />
            <span>End Ops Session</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header Bar */}
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck aria-hidden className="size-4" />
              </span>
              <span className="text-xs font-bold">Ops Console</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            >
              <LogOut aria-hidden className="size-3.5" />
              <span>Exit</span>
            </Button>
          </div>
          <nav aria-label="Superadmin console" className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none">
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
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon aria-hidden className="size-3.5" />
                  <span>{item.label}</span>
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