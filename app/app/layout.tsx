"use client";

import { Authenticated } from "@/components/Authenticated";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Authenticated>
      <AnnouncementBanner />
      {children}
    </Authenticated>
  );
}
