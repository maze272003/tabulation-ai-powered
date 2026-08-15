"use client";

import { Authenticated } from "@/components/Authenticated";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <Authenticated>{children}</Authenticated>;
}
