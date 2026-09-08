"use client";

import type { ReactNode } from "react";

/** Shared compact input styling for editor side panels. */
export const PANEL_INPUT_CLASS = "h-8 text-xs";

export interface PanelRowProps {
  label: ReactNode;
  children: ReactNode;
}

export function PanelRow({ label, children }: PanelRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-1 items-center justify-end">{children}</div>
    </div>
  );
}
