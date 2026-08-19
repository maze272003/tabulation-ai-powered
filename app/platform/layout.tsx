"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Authenticated } from "@/components/Authenticated";
import { UserMenu } from "@/components/UserMenu";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/platform", label: "Platform Overview", icon: LayoutDashboard, exact: true },
  { href: "/platform/organizations", label: "Organizations", icon: Building2 },
  { href: "/platform/users", label: "Global Users", icon: Users },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/platform/audit", label: "System Audit Log", icon: ScrollText },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <Authenticated>
      <PlatformShell>{children}</PlatformShell>
    </Authenticated>
  );
}

function PlatformShell({ children }: { children: React.ReactNode }) {
  const me = useQuery(api.auth.getCurrentUser, {});
  const pathname = usePathname();

  if (me === undefined) {
    return <LoadingScreen label="Loading platform administration…" />;
  }
  if (me === null || me.platformRole !== "platform_owner") {
    return <PlatformDenied />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Platform Command Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 bg-sidebar p-3.5 text-sidebar-foreground md:flex border-r border-sidebar-border/40">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/50 p-2.5 ring-1 ring-white/10">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary ring-1 ring-primary/30">
            <ShieldCheck aria-hidden className="size-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold text-sidebar-accent-foreground leading-tight">Platform Admin</p>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] px-1 py-0">
                OWNER
              </Badge>
            </div>
            <p className="truncate text-[10px] text-sidebar-foreground/60 font-mono">{me.email}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1" aria-label="Platform administration">
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

        <div className="space-y-1.5 border-t border-sidebar-border/50 pt-3">
          <Link
            href="/app"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            <span>Return to Workspace</span>
          </Link>
          <UserMenu className="w-full" />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck aria-hidden className="size-4" />
              </span>
              <span className="text-xs font-bold">Platform Admin</span>
            </div>
            <Link
              href="/app"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft aria-hidden className="size-3.5" />
              <span>Workspace</span>
            </Link>
          </div>
          <nav
            aria-label="Platform administration"
            className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none"
          >
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

function PlatformDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8 bg-background">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl bg-card p-10 text-center border border-border/70 shadow-lg">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert aria-hidden className="size-7" />
        </span>
        <h2 className="font-heading text-xl font-bold tracking-tight">Platform Owner Access Required</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your active account does not have platform administration privileges. Please sign in with an authorized platform owner profile.
        </p>
        <div className="pt-2">
          <Button render={<Link href="/app" />}>
            Return to App Workspace
          </Button>
        </div>
      </div>
    </main>
  );
}
