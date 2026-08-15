"use client";

import { Authenticated } from "@/components/Authenticated";

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <Authenticated>{children}</Authenticated>;
}
