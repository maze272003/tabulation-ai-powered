"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Building2, CalendarDays, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
import { formatDateTime } from "@/components/platform/format";
import {
  orgStatusLabel,
  orgStatusTone,
  userStatusLabel,
  userStatusTone,
} from "@/components/platform/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export default function SentryUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const { token } = useSentrySession();
  const detail = useQuery(
    api.superadmin.users.detail,
    token ? { token, userId: userId as Id<"userProfiles"> } : "skip",
  );

  if (detail === undefined) {
    return <PageHeader title="User" description="Loading user details…" />;
  }

  const { user, orgs, createdEvents } = detail;

  return (
    <div className="space-y-6">
      <Link
        href="/sentry/users"
        className="-mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to users
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar size="lg">
          {user.image ? <AvatarImage src={user.image} /> : null}
          <AvatarFallback>{(user.name || user.email).charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-xl font-semibold">{user.name || user.email}</h1>
            <PlatformBadge label={userStatusLabel[user.status]} tone={userStatusTone[user.status]} />
            {user.platformRole === "platform_owner" && (
              <PlatformBadge label="Platform owner" tone="info" icon={ShieldCheck} />
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Joined</p>
            <p className="mt-0.5 font-medium">{formatDateTime(user._creationTime)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last sign-in</p>
            <p className="mt-0.5 font-medium">{formatDateTime(user.lastLoginAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-0.5 font-medium capitalize">{user.status}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 aria-hidden className="size-4 text-muted-foreground" />
            Organizations ({orgs.length})
          </CardTitle>
          <CardDescription>Memberships across the platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not a member of any organization.</p>
          ) : (
            orgs.map(({ membership, org, roleName }) => (
              <div key={membership._id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  {org ? (
                    <Link
                      href={`/sentry/organizations/${org._id}`}
                      className="block truncate font-medium underline-offset-4 hover:underline"
                    >
                      {org.name}
                    </Link>
                  ) : (
                    <p className="truncate font-medium">Deleted organization</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {roleName ?? "Unknown role"} · joined {formatDateTime(membership.joinedAt)}
                  </p>
                </div>
                {org && (
                  <PlatformBadge label={orgStatusLabel[org.status]} tone={orgStatusTone[org.status]} />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
            Events created ({createdEvents.length})
          </CardTitle>
          <CardDescription>Most recent events this user set up.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {createdEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events created.</p>
          ) : (
            createdEvents.map((event) => (
              <div key={event._id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{event.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{event.eventCode}</p>
                </div>
                <PlatformBadge label={event.status} tone="info" />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}