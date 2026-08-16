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
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/platform", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/platform/organizations", label: "Organizations", icon: Building2 },
  { href: "/platform/users", label: "Users", icon: Users },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/platform/audit", label: "Audit log", icon: ScrollText },
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
    return <LoadingScreen label="Loading platform…" />;
  }
  // The Convex functions remain the authoritative gate; this check only
  // prevents rendering an admin shell to an unauthorized visitor.
  if (me === null || me.platformRole !== "platform_owner") {
    return <PlatformDenied />;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-4 bg-sidebar p-3 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
            <ShieldCheck aria-hidden className="size-4" />
          </span>
          <span className="text-sm font-semibold text-sidebar-accent-foreground">
            Platform admin
          </span>
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
          <Link
            href="/app"
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to app
          </Link>
          <UserMenu className="w-full" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur md:hidden">
          <div className="flex h-14 items-center gap-3 px-4">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck aria-hidden className="size-4" />
            </span>
            <span className="text-sm font-semibold">Platform admin</span>
            <Link
              href="/app"
              className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft aria-hidden className="size-3.5" />
              Back to app
            </Link>
          </div>
          <nav
            aria-label="Platform administration"
            className="flex gap-1 overflow-x-auto px-3 pb-2"
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
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function PlatformDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-xl bg-card p-10 text-center ring-1 ring-foreground/10">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <ShieldAlert aria-hidden className="size-6 text-muted-foreground" />
        </span>
        <p className="font-heading text-lg font-semibold">Platform owners only</p>
        <p className="text-sm text-muted-foreground">
          Your account does not have platform administration access.
        </p>
        <Link
          href="/app"
          className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to your organizations
        </Link>
      </div>
    </main>
  );
}
