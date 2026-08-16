export type SheetStatus = "not_started" | "in_progress" | "submitted" | "locked";
export type RoundStatus = "open" | "closed" | "published";
export type Tone = "muted" | "info" | "success" | "warning" | "secondary";

export const sheetStatusLabel: Record<SheetStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  locked: "Locked",
};

export const roundStatusLabel: Record<RoundStatus, string> = {
  open: "Open",
  closed: "Closed — in review",
  published: "Published",
};

export const sheetStatusTone: Record<SheetStatus, Tone> = {
  not_started: "muted",
  in_progress: "info",
  submitted: "success",
  locked: "secondary",
};

export const roundStatusTone: Record<RoundStatus, Tone> = {
  open: "info",
  closed: "warning",
  published: "success",
};

export const tieResolvedByLabel: Record<string, string> = {
  none: "—",
  criteria_cascade: "criteria cascade",
  judge_firsts: "judge firsts",
  manual: "manual",
};

export function formatScore(value: number | null | undefined, precision: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(precision);
}
