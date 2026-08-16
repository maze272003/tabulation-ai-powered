import { cookies } from "next/headers";
import { EnterAppShell } from "@/components/enter/EnterAppShell";

export const metadata = {
  title: "Event Workspace | Tabulation",
  description: "Score entry and round monitoring for judges and event staff.",
};

export default async function EnterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("event_session_token")?.value ?? null;

  return (
    <EnterAppShell sessionToken={sessionToken}>
      {children}
    </EnterAppShell>
  );
}
