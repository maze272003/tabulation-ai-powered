import { redirect } from "next/navigation";

export default async function EventRoot({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  redirect(`/app/${orgSlug}/events/${eventSlug}/overview`);
}
