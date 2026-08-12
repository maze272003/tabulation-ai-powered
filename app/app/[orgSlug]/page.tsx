import { redirect } from "next/navigation";

export default async function OrgRoot({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/app/${orgSlug}/overview`);
}
