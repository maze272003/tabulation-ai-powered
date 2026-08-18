"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { CalendarDays, CreditCard, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";

export default function OverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { orgSlug });
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const sub = useQuery(api.subscriptions.getForOrg, { orgSlug });

  const activeEvents = events?.filter((e) => e.status !== "archived").length ?? 0;

  const stats = [
    {
      label: "Active events",
      value: events === undefined ? "…" : String(activeEvents),
      icon: CalendarDays,
      href: `/app/${orgSlug}/events`,
    },
    {
      label: "Plan",
      value: sub?.plan?.name ?? "Free",
      icon: CreditCard,
      href: `/app/${orgSlug}/billing`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Overview"
        description={`Welcome${org?.name ? ` to ${org.name}` : ""}. Here is the state of your organization.`}
      />
      <div className="stagger-fade grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group">
            <Card className="h-full transition-all group-hover:ring-primary/30 group-hover:shadow-md">
              <CardContent className="flex items-center gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <stat.icon aria-hidden className="size-5" />
                </span>
                <div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                  <div className="font-heading text-2xl font-semibold tracking-tight">{stat.value}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        <Card className="h-full border-dashed bg-transparent ring-foreground/10">
          <CardContent className="flex items-center gap-4 text-muted-foreground">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Users aria-hidden className="size-5" />
            </span>
            <div>
              <div className="text-sm">Members</div>
              <div className="font-heading text-2xl font-semibold tracking-tight">—</div>
            </div>
          </CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        Competition features arrive in Phase 2. Create your first event to get started.
      </p>
    </div>
  );
}
