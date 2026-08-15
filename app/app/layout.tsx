"use client";

import { Authenticated } from "@/components/Authenticated";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Authenticated>{children}</Authenticated>;
}
