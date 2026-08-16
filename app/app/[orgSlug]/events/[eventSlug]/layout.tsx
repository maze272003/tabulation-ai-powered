"use client";

import { use } from "react";
import { EventShell } from "@/components/EventShell";

export default function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  return <EventShell orgSlug={orgSlug} eventSlug={eventSlug}>{children}</EventShell>;
}
