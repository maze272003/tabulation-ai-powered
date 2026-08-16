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
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  // The Convex functions remain the authoritative gate; this check only
  // prevents rendering an admin shell to an unauthorized visitor.
  if (me === null || me.platformRole !== "platform_owner") {
    return <PlatformDenied />;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col gap-4 border-r p-4">
        <div className="flex items-center gap-2 px-2 py-1">
          <ShieldCheck aria-hidden className="size-4 text-primary" />
          <span className="text-sm font-semibold">Platform admin</span>
        </div>
        <nav className="flex-1 space-y-1 text-sm" aria-label="Platform administration">
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
                  "flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-accent",
                  active && "bg-accent font-medium",
                )}
              >
                <item.icon aria-hidden className="size-4 text-muted-foreground" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t pt-4">
          <Link
            href="/app"
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to app
          </Link>
          <UserMenu />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}

function PlatformDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
        <ShieldAlert aria-hidden className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">Platform owners only</p>
        <p className="text-xs text-muted-foreground">
          Your account does not have platform administration access.
        </p>
        <Link
          href="/app"
          className="mt-2 text-sm text-primary underline-offset-4 hover:underline"
        >
          Go to your organizations
        </Link>
      </div>
    </main>
  );
}
