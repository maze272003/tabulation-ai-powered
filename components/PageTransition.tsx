"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Remounts its subtree when the pathname changes so each page plays the
 * shared entrance animation. Query-string navigation is unaffected because
 * usePathname excludes search params.
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={cn("animate-page-in", className)}>
      {children}
    </div>
  );
}
