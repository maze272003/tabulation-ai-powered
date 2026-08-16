# Phase 3 — Tabulation UI/UX Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 3 tabulation UI (judge scoring, tabulator monitor/review, results, config extensions) to the approved design spec — superseding Tasks 12–14 of `2026-08-16-phase3-tabulation-engine.md`.

**Relationship to existing plans:** This plan **replaces Tasks 12–14** of the Phase 3 engine plan. Execute it **after Phase 3 Tasks 1–11** (backend: schema, core, mutations, queries) are complete. The engine plan's Task 15 (final verification) still runs afterwards.

**Architecture:** Design-spec polish is built directly — status tokens extend `app/globals.css`; shared primitives live in `components/tabulation/`; six screen modules consume the Phase 3 backend APIs (`api.scoring.*`, `api.roundAdmin.*`, `api.results.*`) without changing any query/mutation contract.

**Tech Stack:** Next.js 16.3, React 19, Convex ^1.43 (`useQuery`/`useMutation`), Tailwind v4, shadcn/ui (Base UI), lucide-react, sonner, vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-phase3-ui-ux-design-modules.md` — read it before starting.

> **Status (2026-08-16): COMPLETE.** Tasks 1–10 executed (commits `1e29e84`..`44818df`, Task 10 Step 3 in `3736b57`); whole-branch review in `.superpowers/sdd/reports/final-review.md`; its UI findings (I-1, M-1, M-2, M-7) were fixed in `4e99062`, `6a832ca`, and `f03c167`. Individual checkboxes were left unchecked during execution; this status block is the authoritative record.

## Global Constraints

- **OS:** Windows; PowerShell 5.1. Use `;` and `if ($?) { }` — never `&&`.
- **No code comments. No emojis.** Icons come from lucide-react only.
- **Base UI, not Radix:** `render={<Link …/>}` instead of `asChild`.
- **Tokens only:** status colors come exclusively from the tokens added in Task 1 (`bg-success`, `text-warning`, `bg-warning-muted`, …). Never hardcode status hex values.
- **Error UX:** every mutation catch reads `(err as { data?: { code?: string; message?: string } })?.data` and maps `.data.code` per spec §5.4; toasts via sonner.
- **Numerals:** every score/rank/weight/count renders through `<Num>` (`font-mono tabular-nums`).
- **Async buttons:** `disabled={busy}` + verb-labeled text. Irreversible actions (close/publish/finalize) go through `<ConfirmDialog>`.
- **Page convention:** raw `<table className="w-full text-sm">` with `text-left text-muted-foreground` headers, `border-t` rows, `py-1` cells; `use(params)` for Next 16 async params; Convex `useQuery` returns `Error` instances on failure (branch with `instanceof Error`).
- **Verify every task:** `Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck`, then `npm run lint`, `npm run build`, `npm test`.
- **Commits:** one per task; conventional messages.

**Spec deviations (approved with this plan):**

1. Monitor matrix dots use hover/focus tooltips (`title` + Tooltip) instead of click-popovers; the footer legend covers touch users.
2. Locked-sheet revisit shows the lock notice without the value summary — the server exposes no read of a judge's submitted values; the summary appears only immediately after submit.
3. M1 status filter chips (spec §4.1 "v1.1, optional") are deferred.

---

## File Structure

```
app/globals.css                                             (modified — status tokens + theme wiring)
vitest.config.ts                                            (modified — include components tests)
components/tabulation/status.ts                             (new — status vocabulary + formatScore, pure)
components/tabulation/status.test.ts                        (new — unit tests for status.ts)
components/tabulation/Num.tsx                               (new — numeric cell)
components/tabulation/StatusBadge.tsx                       (new — StatusDot + StatusBadge)
components/tabulation/StateBlock.tsx                        (new — TableSkeleton / EmptyState / ErrorState)
components/tabulation/BlackoutNotice.tsx                    (new)
components/tabulation/VersionBadge.tsx                      (new)
components/tabulation/ConfirmDialog.tsx                     (new)
components/tabulation/SaveIndicator.tsx                     (new — SaveState machine display)
components/tabulation/RoundResultsCard.tsx                  (new — Task 8; round card with version selector)
components/EventShell.tsx                                   (modified — nav gains Scoring + Results)
app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx       (new — M1)
app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx (new — M2)
app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx        (new — M3)
app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/review/page.tsx         (new — M4)
app/app/[orgSlug]/events/[eventSlug]/results/page.tsx       (new — M5)
app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx        (modified — M6a)
app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx      (modified — M6b)
```

Backend APIs consumed (produced by Phase 3 Tasks 8–11 — exact shapes):

- `api.scoring.myAssignments { orgSlug, eventSlug }` → `{ judgeId: Id | null, rounds: { roundId, name, order, status: "open"|"closed"|"published", sheets: { sheetId, contestantId, contestantName, contestantNumber, status: "not_started"|"in_progress"|"submitted"|"locked" }[] }[] }`
- `api.scoring.sheetDetail { orgSlug, eventSlug, roundId, contestantId }` → `{ sheet: Doc<"scoreSheets"> | null, criteria: Doc<"criteria">[], contestant: Doc<"contestants"> | null }` (sheet carries `status`, `draftValues`)
- `api.scoring.saveDraft { orgSlug, eventSlug, sheetId, draftValues: Record<string, number> }`; `api.scoring.submitSheet { …, values: Record<string, number> }`
- `api.roundAdmin.roundMonitor { orgSlug, eventSlug, roundId }` → `{ roundStatus, judges: { judgeId, name }[], contestants: { contestantId, name, number }[], sheets: { judgeId, contestantId, status }[] }`
- `api.roundAdmin.closeRound / reopenRound { orgSlug, eventSlug, roundId }`
- `api.roundAdmin.roundReview { orgSlug, eventSlug, roundId }` → `{ round: Doc<"rounds">, eliminationEnabled: boolean, standings: { contestantId, categoryId, status: "active"|"scratched"|"disqualified", roundScore: number | null, criterionScores: unknown[], rank: number | null, tieResolvedBy: "none"|"criteria_cascade"|"judge_firsts"|"manual", contestantName: string, advancement: boolean | null }[], unresolvedTies: { categoryId, contestantIds: string[], names: string[] }[], tieBreaks: Doc<"tieBreaks">[], overrides: Doc<"advancementOverrides">[] }` (returns Error CONFLICT while round is open)
- `api.roundAdmin.addTieBreak { orgSlug, eventSlug, roundId, tiedContestantIds, orderedIds }`; `removeTieBreak { orgSlug, eventSlug, tieBreakId }`; `addAdvancementOverride { orgSlug, eventSlug, roundId, contestantId, action: "force_advance"|"force_cut" }`; `removeAdvancementOverride { orgSlug, eventSlug, overrideId }`
- `api.roundAdmin.publishRound { orgSlug, eventSlug, roundId }` (throws `TIES_UNRESOLVED`); `api.roundAdmin.correctResults { orgSlug, eventSlug, roundId, reason }`
- `api.results.roundResults { orgSlug, eventSlug, roundId, version? }` → `{ version, reason: string | undefined, createdAt, snapshot }` (snapshot has `categories: { categoryId, standings: { contestantId, rank, roundScore, … }[] }[]`)
- `api.results.listRoundVersions { orgSlug, eventSlug, roundId }` → `{ version, createdAt, reason }[]` desc
- `api.results.eventResults { orgSlug, eventSlug }` → `{ rounds: { roundId, name, order, weight, version, standings: { contestantId, contestantName, rank: number | null, roundScore: number | null }[] }[], final: { contestantId, contestantName, categoryId, totalScore, eliminatedInRoundOrder: number | null, rank }[] }`
- `api.results.finalizeEvent { orgSlug, eventSlug }` (throws VALIDATION_ERROR until every round published)
- Existing: `api.events.get` → `Doc<"events"> | null` (has `status`, `decimalPrecision`, `scoringRules.dropHighLow`, `eliminationEnabled`); `api.categories.list` → `Doc<"categories">[]`; `api.rounds.list` (round docs incl. `weight`, `status`, `advancement`, `qualifiesToNextRound` + joined `criteria`); `api.rounds.add/update/remove`; `api.criteria.add/remove`; `api.events.update`.

---

## Task 1: Status tokens + status vocabulary (TDD)

**Files:**
- Modify: `app/globals.css`
- Create: `components/tabulation/status.ts`
- Test: `components/tabulation/status.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces (`components/tabulation/status.ts`):

```ts
export type SheetStatus = "not_started" | "in_progress" | "submitted" | "locked";
export type RoundStatus = "open" | "closed" | "published";
export type Tone = "muted" | "info" | "success" | "warning" | "secondary";
export const sheetStatusLabel: Record<SheetStatus, string>;
export const roundStatusLabel: Record<RoundStatus, string>;
export const sheetStatusTone: Record<SheetStatus, Tone>;
export const roundStatusTone: Record<RoundStatus, Tone>;
export const tieResolvedByLabel: Record<string, string>;
export function formatScore(value: number | null | undefined, precision: number): string;
```

- Produces (globals.css): CSS variables `--success`, `--success-foreground`, `--success-muted`, `--warning`, `--warning-foreground`, `--warning-muted`, `--info`, `--info-foreground`, `--info-muted` in `:root` and `.dark`, wired into `@theme inline` so `bg-success`, `text-warning`, `bg-warning-muted`, etc. generate.

- [ ] **Step 1: Write the failing tests** — `components/tabulation/status.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  formatScore,
  roundStatusLabel,
  roundStatusTone,
  sheetStatusLabel,
  sheetStatusTone,
  tieResolvedByLabel,
} from "./status";

describe("formatScore", () => {
  it("keeps trailing zeros at the requested precision", () => {
    expect(formatScore(89.2, 2)).toBe("89.20");
    expect(formatScore(87.5, 1)).toBe("87.5");
    expect(formatScore(100, 0)).toBe("100");
  });

  it("renders an em dash for missing values", () => {
    expect(formatScore(null, 2)).toBe("—");
    expect(formatScore(undefined, 1)).toBe("—");
  });
});

describe("status vocabulary", () => {
  it("labels every sheet status with a tone", () => {
    for (const status of ["not_started", "in_progress", "submitted", "locked"] as const) {
      expect(sheetStatusLabel[status].length).toBeGreaterThan(0);
      expect(sheetStatusTone[status]).toBeDefined();
    }
  });

  it("labels every round status with a tone", () => {
    for (const status of ["open", "closed", "published"] as const) {
      expect(roundStatusLabel[status].length).toBeGreaterThan(0);
      expect(roundStatusTone[status]).toBeDefined();
    }
  });

  it("labels tie resolution sources", () => {
    expect(tieResolvedByLabel.criteria_cascade).toBe("criteria cascade");
    expect(tieResolvedByLabel.judge_firsts).toBe("judge firsts");
    expect(tieResolvedByLabel.manual).toBe("manual");
    expect(tieResolvedByLabel.none).toBe("—");
  });
});
```

- [ ] **Step 2: Include component tests in vitest** — in `vitest.config.ts` replace the include line:

```ts
    include: ["convex-test/**/*.test.ts", "components/**/*.test.ts"],
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run components/tabulation/status.test.ts`
Expected: FAIL — cannot resolve `./status`.

- [ ] **Step 4: Implement `components/tabulation/status.ts`**

```ts
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
```

- [ ] **Step 5: Add status tokens to `app/globals.css`** — inside `@theme inline` (after the `--color-chart-1` line):

```css
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-success-muted: var(--success-muted);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-warning-muted: var(--warning-muted);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
  --color-info-muted: var(--info-muted);
```

At the end of `:root` (after `--sidebar-ring`):

```css
  --success: oklch(0.53 0.14 150);
  --success-foreground: oklch(0.985 0 0);
  --success-muted: oklch(0.95 0.04 150);
  --warning: oklch(0.62 0.16 60);
  --warning-foreground: oklch(0.985 0 0);
  --warning-muted: oklch(0.96 0.05 80);
  --info: oklch(0.55 0.15 250);
  --info-foreground: oklch(0.985 0 0);
  --info-muted: oklch(0.95 0.04 250);
```

At the end of `.dark` (after `--sidebar-ring`):

```css
  --success: oklch(0.68 0.15 150);
  --success-foreground: oklch(0.145 0 0);
  --success-muted: oklch(0.28 0.05 150);
  --warning: oklch(0.75 0.15 70);
  --warning-foreground: oklch(0.145 0 0);
  --warning-muted: oklch(0.3 0.06 70);
  --info: oklch(0.68 0.13 250);
  --info-foreground: oklch(0.145 0 0);
  --info-muted: oklch(0.28 0.05 250);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run components/tabulation/status.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Full gate + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add app/globals.css vitest.config.ts components/tabulation
git commit -m "feat: tabulation status tokens and status vocabulary helpers"
```

---

## Task 2: Display primitives — Num, StatusDot/StatusBadge, StateBlock, BlackoutNotice, VersionBadge

**Files:**
- Create: `components/tabulation/Num.tsx`
- Create: `components/tabulation/StatusBadge.tsx`
- Create: `components/tabulation/StateBlock.tsx`
- Create: `components/tabulation/BlackoutNotice.tsx`
- Create: `components/tabulation/VersionBadge.tsx`

**Interfaces:**
- Consumes: `formatScore`, `sheetStatusLabel`, `roundStatusLabel`, `sheetStatusTone`, `roundStatusTone`, `SheetStatus`, `RoundStatus`, `Tone` from `./status`; `Badge` from `@/components/ui/badge`; `Tooltip/TooltipTrigger/TooltipContent` from `@/components/ui/tooltip`.
- Produces:

```ts
function Num(props: { value: number | null | undefined; precision?: number; tone?: "default" | "success" | "muted"; className?: string }): JSX.Element
function StatusDot(props: { status: SheetStatus; label?: string; className?: string }): JSX.Element
function StatusBadge(props: { status: SheetStatus | RoundStatus; kind: "sheet" | "round" }): JSX.Element
function TableSkeleton(props: { rows?: number; cols?: number; className?: string }): JSX.Element
function EmptyState(props: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode; className?: string }): JSX.Element
function ErrorState(props: { message: string; onRetry?: () => void; className?: string }): JSX.Element
function BlackoutNotice(): JSX.Element
function VersionBadge(props: { version: number; latest?: boolean }): JSX.Element
```

- [ ] **Step 1: Implement `components/tabulation/Num.tsx`**

```tsx
import { cn } from "@/lib/utils";
import { formatScore } from "./status";

export function Num({
  value,
  precision = 0,
  tone = "default",
  className,
}: {
  value: number | null | undefined;
  precision?: number;
  tone?: "default" | "success" | "muted";
  className?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <span aria-label="no value" className={cn("font-mono tabular-nums", className)}>
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        tone === "success" && "text-success",
        tone === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {formatScore(value, precision)}
    </span>
  );
}
```

- [ ] **Step 2: Implement `components/tabulation/StatusBadge.tsx`**

```tsx
import { BadgeCheck, Circle, CirclePause, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  roundStatusLabel,
  roundStatusTone,
  sheetStatusLabel,
  sheetStatusTone,
  type RoundStatus,
  type SheetStatus,
  type Tone,
} from "./status";

const toneClasses: Record<Tone, string> = {
  muted: "bg-muted text-muted-foreground",
  info: "bg-info-muted text-info",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  secondary: "bg-secondary text-secondary-foreground",
};

const dotClasses: Record<SheetStatus, string> = {
  not_started: "rounded-full border border-muted-foreground/60 bg-transparent",
  in_progress:
    "rounded-full ring-1 ring-info bg-[linear-gradient(to_right,var(--info)_50%,transparent_50%)]",
  submitted: "rounded-full bg-success ring-2 ring-success/30",
  locked: "rounded-[2px] bg-muted-foreground",
};

export function StatusDot({
  status,
  label,
  className,
}: {
  status: SheetStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block size-2 shrink-0", dotClasses[status], className)}
    />
  );
}

const roundIcons: Record<RoundStatus, typeof Circle> = {
  open: Circle,
  closed: CirclePause,
  published: BadgeCheck,
};

export function StatusBadge({
  status,
  kind,
}: {
  status: SheetStatus | RoundStatus;
  kind: "sheet" | "round";
}) {
  if (status === "locked") {
    return (
      <Badge variant="secondary">
        <Lock aria-hidden />
        {sheetStatusLabel.locked}
      </Badge>
    );
  }
  if (kind === "round") {
    const roundStatus = status as RoundStatus;
    const Icon = roundIcons[roundStatus];
    return (
      <Badge className={cn("border-transparent", toneClasses[roundStatusTone[roundStatus]])}>
        <Icon aria-hidden />
        {roundStatusLabel[roundStatus]}
      </Badge>
    );
  }
  const sheetStatus = status as SheetStatus;
  return (
    <Badge className={cn("border-transparent", toneClasses[sheetStatusTone[sheetStatus]])}>
      {sheetStatusLabel[sheetStatus]}
    </Badge>
  );
}
```

- [ ] **Step 3: Implement `components/tabulation/StateBlock.tsx`**

```tsx
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TableSkeleton({
  rows = 5,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-label="Loading" className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border border-dashed p-8 text-center",
        className,
      )}
    >
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("rounded-lg border border-destructive/40 p-4 text-sm text-destructive", className)}
    >
      <p>{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement `components/tabulation/BlackoutNotice.tsx`**

```tsx
import { EyeOff } from "lucide-react";

export function BlackoutNotice() {
  return (
    <div
      role="note"
      className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground"
    >
      <EyeOff aria-hidden className="size-3.5 shrink-0" />
      Results stay hidden to judges and staff until the round is published.
    </div>
  );
}
```

- [ ] **Step 5: Implement `components/tabulation/VersionBadge.tsx`**

```tsx
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function VersionBadge({ version, latest }: { version: number; latest?: boolean }) {
  const badge = (
    <Badge variant="outline" className={cn(version >= 2 && "border-warning/50 text-warning")}>
      <History aria-hidden />v{version}
      {latest && " · current"}
    </Badge>
  );
  if (version < 2) return badge;
  return (
    <Tooltip>
      <TooltipTrigger render={badge} />
      <TooltipContent>Corrected version — earlier versions are kept</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 6: Full gate + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add components/tabulation
git commit -m "feat: tabulation display primitives"
```

---

## Task 3: Interaction primitives — ConfirmDialog, SaveIndicator

**Files:**
- Create: `components/tabulation/ConfirmDialog.tsx`
- Create: `components/tabulation/SaveIndicator.tsx`

**Interfaces:**
- Consumes: `Dialog/DialogContent/DialogDescription/DialogFooter/DialogHeader/DialogTitle` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`.
- Produces:

```ts
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}): JSX.Element
function SaveIndicator(props: { state: SaveState; savedAt?: number | null; onRetry?: () => void }): JSX.Element | null
```

- [ ] **Step 1: Implement `components/tabulation/ConfirmDialog.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy = false,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            autoFocus={destructive}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={onConfirm}
            autoFocus={!destructive}
          >
            {busy && (
              <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
            )}
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Implement `components/tabulation/SaveIndicator.tsx`**

```tsx
"use client";

import { Check, LoaderCircle, Pencil, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function SaveIndicator({
  state,
  savedAt,
  onRetry,
}: {
  state: SaveState;
  savedAt?: number | null;
  onRetry?: () => void;
}) {
  if (state === "idle") return null;
  return (
    <div aria-live="polite" className="flex items-center gap-1.5 text-xs">
      {state === "dirty" && (
        <>
          <Pencil aria-hidden className="size-3.5 text-warning" />
          <span className="text-muted-foreground">Unsaved changes</span>
        </>
      )}
      {state === "saving" && (
        <>
          <LoaderCircle
            aria-hidden
            className="size-3.5 animate-spin text-info motion-reduce:animate-none"
          />
          <span className="text-muted-foreground">Saving…</span>
        </>
      )}
      {state === "saved" && (
        <>
          <Check aria-hidden className="size-3.5 text-success" />
          <span className="text-muted-foreground">
            Saved
            {savedAt
              ? ` ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
        </>
      )}
      {state === "error" && (
        <>
          <TriangleAlert aria-hidden className="size-3.5 text-destructive" />
          <span className="text-destructive">Save failed</span>
          {onRetry && (
            <Button variant="outline" size="xs" onClick={onRetry}>
              Retry
            </Button>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Full gate + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add components/tabulation
git commit -m "feat: confirm dialog and save indicator primitives"
```

---

## Task 4: EventShell nav + M1 judge scoring home

**Files:**
- Modify: `components/EventShell.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx`

**Interfaces:**
- Consumes: `api.scoring.myAssignments`; `StatusDot`/`StatusBadge`, `Num`, `TableSkeleton`, `EmptyState`, `sheetStatusLabel`.
- Produces: the judge scoring home; nav links `Scoring` (after Judges) and `Results` (after Settings).

- [ ] **Step 1: Extend the EventShell nav** — in `components/EventShell.tsx`, replace the `nav` array with:

```tsx
  const nav = [
    ["Overview", `${base}/overview`],
    ["Rounds", `${base}/rounds`],
    ["Categories", `${base}/categories`],
    ["Contestants", `${base}/contestants`],
    ["Judges", `${base}/judges`],
    ["Scoring", `${base}/scoring`],
    ["Readiness", `${base}/readiness`],
    ["Settings", `${base}/settings`],
    ["Results", `${base}/results`],
  ] as const;
```

- [ ] **Step 2: Implement `app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx`**

```tsx
"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ClipboardList } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Num } from "@/components/tabulation/Num";
import { StatusBadge, StatusDot } from "@/components/tabulation/StatusBadge";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { sheetStatusLabel } from "@/components/tabulation/status";

export default function ScoringPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const mine = useQuery(api.scoring.myAssignments, { orgSlug, eventSlug });

  if (mine === undefined) return <TableSkeleton rows={4} cols={3} />;
  if (mine.judgeId === null) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="You are not a judge for this event"
        hint="Judges see their score sheets here once the event is published."
      />
    );
  }
  if (mine.rounds.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No score sheets assigned yet"
        hint="Sheets appear when the event is published and judges are assigned."
      />
    );
  }

  return (
    <div className="space-y-6">
      {mine.rounds.map((round) => {
        const submitted = round.sheets.filter(
          (s) => s.status === "submitted" || s.status === "locked",
        ).length;
        return (
          <section
            key={round.roundId}
            className="space-y-2 rounded-lg border p-4"
            aria-label={round.name}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{round.name}</h2>
                <StatusBadge kind="round" status={round.status} />
              </div>
              <span className="text-xs text-muted-foreground">
                <Num value={submitted} /> / <Num value={round.sheets.length} /> submitted
              </span>
            </div>
            <ul className="divide-y">
              {round.sheets.map((sheet) => {
                const actionable =
                  round.status === "open" &&
                  sheet.status !== "submitted" &&
                  sheet.status !== "locked";
                return (
                  <li
                    key={sheet.sheetId}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <StatusDot
                        status={sheet.status}
                        label={`${sheet.contestantName}: ${sheetStatusLabel[sheet.status]}`}
                      />
                      <span className="font-mono tabular-nums text-muted-foreground">
                        #{sheet.contestantNumber}
                      </span>
                      {sheet.contestantName}
                    </span>
                    {actionable ? (
                      <Link
                        className="underline underline-offset-4"
                        href={`/app/${orgSlug}/events/${eventSlug}/scoring/${round.roundId}/${sheet.contestantId}`}
                      >
                        {sheet.status === "in_progress" ? "Continue" : "Score"}
                      </Link>
                    ) : (
                      <StatusBadge kind="sheet" status={sheet.status} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Full gate + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add components/EventShell.tsx "app/app/[orgSlug]/events/[eventSlug]/scoring"
git commit -m "feat: event shell nav and judge scoring home"
```

---

## Task 5: M2 score entry form

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx`

**Interfaces:**
- Consumes: `api.scoring.{myAssignments,sheetDetail,saveDraft,submitSheet}`; `SaveIndicator`/`SaveState`, `StatusBadge`, `Num`, `EmptyState`, `TableSkeleton`; `Input`, `Label`, `Button`, sonner.
- Produces: score entry with blur validation, 800ms debounced autosave state machine (`dirty → saving → saved | error`), progress count, disabled-until-valid submit, locked post-submit state, `beforeunload` guard.

- [ ] **Step 1: Implement the page**

```tsx
"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, ClipboardList, Lock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Num } from "@/components/tabulation/Num";
import { SaveIndicator, type SaveState } from "@/components/tabulation/SaveIndicator";
import { StatusBadge } from "@/components/tabulation/StatusBadge";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";

function validateRaw(raw: string, c: Doc<"criteria">): string | null {
  if (raw.trim() === "") return null;
  const num = Number(raw);
  if (Number.isNaN(num)) return "Enter a number";
  if (num < c.minScore || num > c.maxScore) {
    return `Enter a value between ${c.minScore} and ${c.maxScore}`;
  }
  const scale = 10 ** c.decimalPrecision;
  if (Math.abs(num * scale - Math.round(num * scale)) > 1e-9) {
    return `Use at most ${c.decimalPrecision} decimal${c.decimalPrecision === 1 ? "" : "s"}`;
  }
  return null;
}

export default function ScoreEntryPage({
  params,
}: {
  params: Promise<{
    orgSlug: string;
    eventSlug: string;
    roundId: string;
    contestantId: string;
  }>;
}) {
  const { orgSlug, eventSlug, roundId, contestantId } = use(params);
  const detail = useQuery(api.scoring.sheetDetail, {
    orgSlug,
    eventSlug,
    roundId,
    contestantId,
  });
  const mine = useQuery(api.scoring.myAssignments, { orgSlug, eventSlug });
  const saveDraft = useMutation(api.scoring.saveDraft);
  const submitSheet = useMutation(api.scoring.submitSheet);

  const [raw, setRaw] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState<Record<string, number> | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (detail && !hydrated.current) {
      hydrated.current = true;
      const drafts = detail.sheet?.draftValues ?? {};
      setRaw(Object.fromEntries(Object.entries(drafts).map(([k, v]) => [k, String(v)])));
    }
  }, [detail]);

  const sheetId = detail?.sheet?._id;

  useEffect(() => {
    if (!hydrated.current || !sheetId || saveState !== "dirty") return;
    const timer = setTimeout(() => {
      const payload: Record<string, number> = {};
      for (const [id, value] of Object.entries(raw)) {
        const criterion = detail?.criteria.find((c) => c._id === id);
        if (criterion && value.trim() !== "" && validateRaw(value, criterion) === null) {
          payload[id] = Number(value);
        }
      }
      setSaveState("saving");
      saveDraft({ orgSlug, eventSlug, sheetId, draftValues: payload })
        .then(() => {
          setSavedAt(Date.now());
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 800);
    return () => clearTimeout(timer);
  }, [saveState, raw, sheetId, orgSlug, eventSlug, saveDraft, detail]);

  useEffect(() => {
    if (saveState !== "dirty" && saveState !== "error") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  const criteria = detail?.criteria ?? [];
  const errors = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const c of criteria) {
      map[c._id] = touched[c._id] ? validateRaw(raw[c._id] ?? "", c) : null;
    }
    return map;
  }, [criteria, raw, touched]);

  const validValues = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of criteria) {
      const value = raw[c._id];
      if (value !== undefined && value.trim() !== "" && validateRaw(value, c) === null) {
        out[c._id] = Number(value);
      }
    }
    return out;
  }, [criteria, raw]);

  if (detail === undefined || mine === undefined) return <TableSkeleton rows={4} cols={2} />;
  if (!detail.contestant) {
    return <EmptyState icon={ClipboardList} title="Contestant not found" />;
  }
  if (!detail.sheet) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="You have no score sheet for this contestant"
        action={
          <Link
            className="text-sm underline underline-offset-4"
            href={`/app/${orgSlug}/events/${eventSlug}/scoring`}
          >
            Back to scoring
          </Link>
        }
      />
    );
  }

  const round = mine.rounds.find((r) => r.roundId === roundId);
  const sheet = detail.sheet;
  const locked =
    justSubmitted !== null || sheet.status === "submitted" || sheet.status === "locked";
  const backHref = `/app/${orgSlug}/events/${eventSlug}/scoring`;
  const filledCount = criteria.filter((c) => validValues[c._id] !== undefined).length;
  const allValid =
    filledCount === criteria.length && criteria.every((c) => errors[c._id] === null);

  if (locked) {
    const summary = justSubmitted ?? null;
    return (
      <div className="max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            #{detail.contestant.number} {detail.contestant.name}
            {round && <StatusBadge kind="round" status={round.status} />}
          </h2>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock aria-hidden className="size-3.5" />
            Locked
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Scores submitted{summary ? " — see the summary below" : ""}. Submitted scores
          cannot be changed.
        </p>
        {summary && (
          <table className="w-full text-sm">
            <caption className="sr-only">Submitted scores</caption>
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1">Criterion</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c) => (
                <tr key={c._id} className="border-t">
                  <td className="py-1">{c.name}</td>
                  <td>
                    <Num value={summary[c._id]} precision={c.decimalPrecision} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link
          className="flex items-center gap-1 text-sm underline underline-offset-4"
          href={backHref}
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          Back to scoring
        </Link>
      </div>
    );
  }

  if (round && round.status !== "open") {
    return (
      <div className="max-w-md space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          #{detail.contestant.number} {detail.contestant.name}
          <StatusBadge kind="round" status={round.status} />
        </h2>
        <p className="text-sm text-muted-foreground">
          This round is closed — scoring is finished. Your draft is kept but cannot be
          submitted.
        </p>
        <Link
          className="flex items-center gap-1 text-sm underline underline-offset-4"
          href={backHref}
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          Back to scoring
        </Link>
      </div>
    );
  }

  const setValue = (id: string, value: string) => {
    setRaw((prev) => ({ ...prev, [id]: value }));
    setSaveState("dirty");
  };

  const onBlurField = (id: string) => setTouched((prev) => ({ ...prev, [id]: true }));

  const onSubmit = async () => {
    const invalid = criteria.find((c) => {
      const value = raw[c._id];
      return value === undefined || value.trim() === "" || validateRaw(value, c) !== null;
    });
    if (invalid) {
      setTouched((prev) => ({ ...prev, [invalid._id]: true }));
      document.getElementById(invalid._id)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await submitSheet({ orgSlug, eventSlug, sheetId: sheet._id, values: validValues });
      setJustSubmitted(validValues);
      setSaveState("idle");
      toast.success("Scores submitted.");
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      if (data?.code === "CONFLICT") toast.error("This round is closed — scoring is finished.");
      else if (data?.code === "VALIDATION_ERROR") {
        toast.error(data.message ?? "Some scores are invalid.");
      } else toast.error(data?.message ?? "Could not submit.");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          #{detail.contestant.number} {detail.contestant.name}
          {round && <StatusBadge kind="round" status={round.status} />}
        </h2>
        <SaveIndicator
          state={saveState}
          savedAt={savedAt}
          onRetry={saveState === "error" ? () => setSaveState("dirty") : undefined}
        />
      </div>
      {criteria.map((criterion) => {
        const error = errors[criterion._id];
        return (
          <div key={criterion._id} className="space-y-1">
            <Label htmlFor={criterion._id}>
              {criterion.name}
              <span className="ml-1 font-normal text-muted-foreground">
                weight {criterion.weight}% · {criterion.minScore}–{criterion.maxScore} ·{" "}
                {criterion.decimalPrecision} decimal
                {criterion.decimalPrecision === 1 ? "" : "s"}
              </span>
            </Label>
            <Input
              id={criterion._id}
              type="number"
              inputMode="decimal"
              min={criterion.minScore}
              max={criterion.maxScore}
              step={10 ** -criterion.decimalPrecision}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${criterion._id}-error` : undefined}
              value={raw[criterion._id] ?? ""}
              onBlur={() => onBlurField(criterion._id)}
              onChange={(e) => setValue(criterion._id, e.target.value)}
            />
            {error && (
              <p id={`${criterion._id}-error`} className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          <Num value={filledCount} /> / <Num value={criteria.length} /> scored
        </span>
        <div className="flex gap-2">
          <Button onClick={onSubmit} disabled={submitting || !allValid}>
            {submitting ? "Submitting…" : "Submit scores"}
          </Button>
          <Link className="self-center text-sm underline underline-offset-4" href={backHref}>
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Full gate + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add "app/app/[orgSlug]/events/[eventSlug]/scoring"
git commit -m "feat: judge score entry form with autosave and locked state"
```

---

## Task 6: M3 monitor grid

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx`

**Interfaces:**
- Consumes: `api.roundAdmin.{roundMonitor,closeRound,reopenRound}`; `StatusDot`, `StatusBadge`, `BlackoutNotice`, `ConfirmDialog`, `Num`, `EmptyState`, `TableSkeleton`; `Tooltip` family; `sheetStatusLabel`, `SheetStatus`.
- Produces: judges × contestants status matrix (statuses only — never score values), progress bar, close/reopen with confirm, review link.

- [ ] **Step 1: Implement the page**

```tsx
"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Radar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { BlackoutNotice } from "@/components/tabulation/BlackoutNotice";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
import { Num } from "@/components/tabulation/Num";
import { StatusBadge, StatusDot } from "@/components/tabulation/StatusBadge";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { sheetStatusLabel, type SheetStatus } from "@/components/tabulation/status";

const legend: SheetStatus[] = ["submitted", "in_progress", "not_started", "locked"];

export default function MonitorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string; roundId: string }>;
}) {
  const { orgSlug, eventSlug, roundId } = use(params);
  const monitor = useQuery(api.roundAdmin.roundMonitor, { orgSlug, eventSlug, roundId });
  const closeRound = useMutation(api.roundAdmin.closeRound);
  const reopenRound = useMutation(api.roundAdmin.reopenRound);
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const sheetMap = useMemo(() => {
    const map = new Map<string, SheetStatus>();
    if (!monitor || monitor instanceof Error) return map;
    for (const s of monitor.sheets) map.set(`${s.judgeId}:${s.contestantId}`, s.status);
    return map;
  }, [monitor]);

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    toast.error(data?.message ?? "Action failed.");
  };

  if (monitor === undefined) return <TableSkeleton rows={6} cols={6} />;
  if (monitor instanceof Error) {
    return (
      <EmptyState
        icon={Radar}
        title="Monitor unavailable"
        hint={
          (monitor.data as { code?: string } | undefined)?.code === "FORBIDDEN"
            ? "You need scoring permission to view this."
            : undefined
        }
      />
    );
  }

  const total = monitor.sheets.length;
  const submitted = monitor.sheets.filter(
    (s) => s.status === "submitted" || s.status === "locked",
  ).length;
  const unsubmitted = total - submitted;

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Submission progress
            <StatusBadge kind="round" status={monitor.roundStatus} />
          </h2>
          <span className="text-sm text-muted-foreground">
            <Num value={submitted} /> / <Num value={total} /> submitted
          </span>
          <div
            className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={submitted}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Sheets submitted"
          >
            <div
              className="h-full bg-success transition-all duration-200"
              style={{ width: total === 0 ? "0%" : `${(submitted / total) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {monitor.roundStatus === "open" && (
            <>
              <BlackoutNotice />
              <Button disabled={busy} onClick={() => setCloseOpen(true)}>
                Close round
              </Button>
            </>
          )}
          {monitor.roundStatus === "closed" && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                title="Reopening is recorded in the audit log"
                onClick={() =>
                  run(async () => {
                    await reopenRound({ orgSlug, eventSlug, roundId });
                  }, "Round reopened.")
                }
              >
                Reopen
              </Button>
              <Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${roundId}/review`}>
                <Button>Review &amp; publish</Button>
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Judge submission progress per contestant</caption>
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="sticky left-0 bg-background py-1 pr-4">Judge</th>
              {monitor.contestants.map((k) => (
                <th key={k.contestantId} className="min-w-11 py-1 text-center">
                  <span className="font-mono tabular-nums">#{k.number}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monitor.judges.map((judge) => (
              <tr key={judge.judgeId} className="border-t">
                <td className="sticky left-0 bg-background py-1 pr-4">{judge.name}</td>
                {monitor.contestants.map((k) => {
                  const status = sheetMap.get(`${judge.judgeId}:${k.contestantId}`);
                  const label = `${judge.name} · #${k.number} · ${
                    status ? sheetStatusLabel[status] : "no sheet"
                  }`;
                  return (
                    <td key={k.contestantId} className="py-1 text-center">
                      {status ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                aria-label={label}
                                className="flex size-10 items-center justify-center rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                              />
                            }
                          >
                            <StatusDot status={status} />
                          </TooltipTrigger>
                          <TooltipContent>{label}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span aria-label="no sheet">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {legend.map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <StatusDot status={status} />
            {sheetStatusLabel[status]}
          </span>
        ))}
      </p>
      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close round"
        description={`${unsubmitted} sheet${unsubmitted === 1 ? " is" : "s are"} unsubmitted and will be excluded from results. Unsubmitted judges can no longer submit.`}
        confirmLabel="Close round"
        busy={busy}
        onConfirm={async () => {
          await run(async () => {
            await closeRound({ orgSlug, eventSlug, roundId });
          }, "Round closed.");
          setCloseOpen(false);
        }}
      />
    </div>
  );
}
```

Note: `run` sets `busy` so the dialog buttons disable during the mutation; the dialog closes after completion and stays open on error (the error is toasted).

- [ ] **Step 2: Full gate + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add "app/app/[orgSlug]/events/[eventSlug]/rounds"
git commit -m "feat: tabulator submission monitor grid"
```

---

## Task 7: M4 review & publish

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/review/page.tsx`

**Interfaces:**
- Consumes: `api.roundAdmin.{roundReview,addTieBreak,removeTieBreak,addAdvancementOverride,removeAdvancementOverride,publishRound}`; `api.categories.list`; `BlackoutNotice`, `ConfirmDialog`, `Num`, `EmptyState`, `TableSkeleton`, `tieResolvedByLabel`.
- Produces: category-grouped standings with tie groups (warning tint + ordering inputs + save/remove), advancement cut line, override badges + force buttons, publish with confirm and `TIES_UNRESOLVED` handling (groups tint destructive + scroll into view).

- [ ] **Step 1: Implement the page**

```tsx
"use client";

import { Fragment, use, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowDownRight, ArrowUpRight, CirclePause, Equal, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BlackoutNotice } from "@/components/tabulation/BlackoutNotice";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
import { Num } from "@/components/tabulation/Num";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { tieResolvedByLabel } from "@/components/tabulation/status";

const contestantStatusLabel: Record<string, string> = {
  active: "",
  scratched: "Scratched",
  disqualified: "Disqualified",
};

export default function ReviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string; roundId: string }>;
}) {
  const { orgSlug, eventSlug, roundId } = use(params);
  const router = useRouter();
  const review = useQuery(api.roundAdmin.roundReview, { orgSlug, eventSlug, roundId });
  const categories = useQuery(api.categories.list, { orgSlug, eventSlug });
  const publishRound = useMutation(api.roundAdmin.publishRound);
  const addTieBreak = useMutation(api.roundAdmin.addTieBreak);
  const removeTieBreak = useMutation(api.roundAdmin.removeTieBreak);
  const addOverride = useMutation(api.roundAdmin.addAdvancementOverride);
  const removeOverride = useMutation(api.roundAdmin.removeAdvancementOverride);
  const [positions, setPositions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [tieError, setTieError] = useState(false);
  const tiesRef = useRef<HTMLDivElement>(null);

  const tiedIds = useMemo(
    () =>
      new Set(
        review && !(review instanceof Error)
          ? review.unresolvedTies.flatMap((t) => t.contestantIds)
          : [],
      ),
    [review],
  );
  const overrideByContestant = useMemo(
    () =>
      new Map(
        review && !(review instanceof Error)
          ? review.overrides.map((o) => [o.contestantId, o] as const)
          : [],
      ),
    [review],
  );
  const standingsByCategory = useMemo(() => {
    if (!review || review instanceof Error) return [];
    const groups = new Map<string, typeof review.standings>();
    for (const row of review.standings) {
      const list = groups.get(row.categoryId) ?? [];
      list.push(row);
      groups.set(row.categoryId, list);
    }
    return [...groups.entries()].map(([categoryId, rows]) => ({
      categoryId,
      name: categories?.find((c) => c._id === categoryId)?.name ?? "Category",
      rows: [...rows].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)),
    }));
  }, [review, categories]);

  if (review === undefined) return <TableSkeleton rows={6} cols={5} />;
  if (review instanceof Error) {
    return (
      <EmptyState
        icon={CirclePause}
        title="Close the round before review"
        hint="Review and publish become available once the round is closed."
        action={
          <Link
            className="text-sm underline underline-offset-4"
            href={`/app/${orgSlug}/events/${eventSlug}/rounds/${roundId}/monitor`}
          >
            Go to monitor
          </Link>
        }
      />
    );
  }

  const advancementActive =
    review.eliminationEnabled &&
    review.round.qualifiesToNextRound &&
    review.round.advancement.mode !== "none";
  const allowOverride = advancementActive && review.round.advancement.allowOverride;
  const unresolvedCount = review.unresolvedTies.length;

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    toast.error(data?.message ?? "Action failed.");
  };

  const orderValid = (ids: string[]) => {
    const nums = ids.map((id, i) => Number(positions[id] ?? String(i + 1)));
    const sorted = [...nums].sort((a, b) => a - b);
    return sorted.every((n, i) => n === i + 1);
  };

  const publish = async () => {
    setBusy(true);
    try {
      await publishRound({ orgSlug, eventSlug, roundId });
      toast.success("Results published.");
      router.push(`/app/${orgSlug}/events/${eventSlug}/results`);
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      if (data?.code === "TIES_UNRESOLVED") {
        toast.error("Resolve the highlighted tie groups first.");
        setTieError(true);
        tiesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        toast.error(data?.message ?? "Could not publish.");
      }
      setBusy(false);
      setPublishOpen(false);
    }
  };

  const cutDescription = !advancementActive
    ? "no cut"
    : {
        none: "no cut",
        top_count: `top ${review.round.advancement.count ?? 0}`,
        top_percent: `top ${review.round.advancement.percent ?? 0}%`,
        manual: "manual",
      }[review.round.advancement.mode];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{review.round.name} — review</h2>
        <div className="flex items-center gap-2">
          {unresolvedCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-lg bg-warning-muted px-2 py-1 text-xs font-medium text-warning">
              <Equal aria-hidden className="size-3.5" />
              <Num value={unresolvedCount} /> unresolved tie{unresolvedCount === 1 ? "" : "s"}
            </span>
          )}
          <Button onClick={() => setPublishOpen(true)} disabled={busy || unresolvedCount > 0}>
            Publish results
          </Button>
        </div>
      </div>

      <BlackoutNotice />

      {standingsByCategory.map((group) => (
        <section key={group.categoryId} className="space-y-2" aria-label={group.name}>
          <h3 className="text-sm font-medium">{group.name}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{group.name} standings</caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1">Rank</th>
                  <th>Contestant</th>
                  <th>Score</th>
                  <th>Resolved by</th>
                  {advancementActive && <th>Advances</th>}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, i) => {
                  const next = group.rows[i + 1];
                  const showCutLine =
                    advancementActive &&
                    row.advancement === true &&
                    next !== undefined &&
                    next.advancement === false;
                  const override = overrideByContestant.get(row.contestantId);
                  return (
                    <Fragment key={row.contestantId}>
                      <tr
                        className={
                          tiedIds.has(row.contestantId)
                            ? tieError
                              ? "border-t bg-destructive/10"
                              : "border-t bg-warning-muted"
                            : "border-t"
                        }
                      >
                        <td className="py-1">
                          <Num value={row.rank} />
                        </td>
                        <td>
                          {row.contestantName}
                          {row.status !== "active" && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {contestantStatusLabel[row.status]}
                            </span>
                          )}
                          {override && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded border border-warning/50 px-1.5 py-0.5 text-xs text-warning">
                              Override: {override.action === "force_advance" ? "advance" : "cut"}
                              <button
                                type="button"
                                aria-label={`Remove override for ${row.contestantName}`}
                                disabled={busy}
                                onClick={async () => {
                                  try {
                                    await removeOverride({
                                      orgSlug,
                                      eventSlug,
                                      overrideId: override._id,
                                    });
                                  } catch (err) {
                                    onError(err);
                                  }
                                }}
                              >
                                <X aria-hidden className="size-3" />
                              </button>
                            </span>
                          )}
                        </td>
                        <td>
                          <Num value={row.roundScore} />
                        </td>
                        <td className="text-muted-foreground">
                          {tieResolvedByLabel[row.tieResolvedBy] ?? "—"}
                        </td>
                        {advancementActive && (
                          <td>
                            <span
                              className={
                                row.advancement === true
                                  ? "flex items-center gap-1 font-medium text-success"
                                  : "flex items-center gap-1 text-muted-foreground"
                              }
                            >
                              {row.advancement === null ? (
                                "—"
                              ) : row.advancement ? (
                                <>
                                  <ArrowUpRight aria-hidden className="size-3.5" />
                                  Advances
                                </>
                              ) : (
                                <>
                                  <ArrowDownRight aria-hidden className="size-3.5" />
                                  Cut
                                </>
                              )}
                            </span>
                            {allowOverride && !override && (
                              <span className="ml-2 flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  disabled={busy}
                                  onClick={async () => {
                                    try {
                                      await addOverride({
                                        orgSlug,
                                        eventSlug,
                                        roundId,
                                        contestantId: row.contestantId,
                                        action: "force_advance",
                                      });
                                    } catch (err) {
                                      onError(err);
                                    }
                                  }}
                                >
                                  Force advance
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  disabled={busy}
                                  onClick={async () => {
                                    try {
                                      await addOverride({
                                        orgSlug,
                                        eventSlug,
                                        roundId,
                                        contestantId: row.contestantId,
                                        action: "force_cut",
                                      });
                                    } catch (err) {
                                      onError(err);
                                    }
                                  }}
                                >
                                  Force cut
                                </Button>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                      {showCutLine && (
                        <tr className="border-t">
                          <td colSpan={advancementActive ? 5 : 4} className="py-1">
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span aria-hidden className="h-px flex-1 bg-border" />
                              advances: {cutDescription}
                              <span aria-hidden className="h-px flex-1 bg-border" />
                            </span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <div ref={tiesRef} className="space-y-4">
        {review.unresolvedTies.length > 0 && (
          <div
            className={`space-y-3 rounded-lg border p-4 ${
              tieError ? "border-destructive" : "border-warning/50"
            }`}
          >
            <h3 className={`font-medium ${tieError ? "text-destructive" : "text-warning"}`}>
              Unresolved ties — set the final order (1 = first)
            </h3>
            {review.unresolvedTies.map((tie) => (
              <div key={tie.contestantIds.join()} className="space-y-2">
                <div className="flex flex-wrap gap-3">
                  {tie.contestantIds.map((id, i) => (
                    <label key={id} className="flex items-center gap-1 text-sm">
                      <Input
                        className="w-16"
                        type="number"
                        min={1}
                        max={tie.contestantIds.length}
                        aria-label={`Position of ${tie.names[i]}`}
                        value={positions[id] ?? String(i + 1)}
                        onChange={(e) => setPositions({ ...positions, [id]: e.target.value })}
                      />
                      {tie.names[i]}
                    </label>
                  ))}
                </div>
                <Button
                  size="sm"
                  disabled={busy || !orderValid(tie.contestantIds)}
                  onClick={async () => {
                    const ordered = [...tie.contestantIds].sort(
                      (a, b) =>
                        Number(positions[a] ?? String(tie.contestantIds.indexOf(a) + 1)) -
                        Number(positions[b] ?? String(tie.contestantIds.indexOf(b) + 1)),
                    );
                    try {
                      await addTieBreak({
                        orgSlug,
                        eventSlug,
                        roundId,
                        tiedContestantIds: tie.contestantIds,
                        orderedIds: ordered,
                      });
                      setPositions({});
                    } catch (err) {
                      onError(err);
                    }
                  }}
                >
                  Save tie break
                </Button>
              </div>
            ))}
          </div>
        )}

        {review.tieBreaks.length > 0 && (
          <div className="space-y-2 rounded-lg border p-4">
            <h3 className="font-medium">Manual tie breaks</h3>
            <ul className="space-y-1 text-sm">
              {review.tieBreaks.map((tb) => (
                <li key={tb._id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {tb.orderedIds
                      .map(
                        (id) =>
                          review.standings.find((s) => s.contestantId === id)
                            ?.contestantName ?? "—",
                      )
                      .join(" › ")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await removeTieBreak({ orgSlug, eventSlug, tieBreakId: tb._id });
                      } catch (err) {
                        onError(err);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={`Publish results for ${review.round.name}`}
        description={`${standingsByCategory.length} categories · ${review.standings.length} contestants · ${review.tieBreaks.length} manual tie breaks · cut: ${cutDescription}${
          review.overrides.length > 0 ? ` · ${review.overrides.length} override(s)` : ""
        }. Scores become permanent.`}
        confirmLabel="Publish results"
        busy={busy}
        onConfirm={publish}
      />
    </div>
  );
}
```

- [ ] **Step 2: Full gate + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add "app/app/[orgSlug]/events/[eventSlug]/rounds"
git commit -m "feat: tabulator review and publish screen"
```

---

## Task 8: M5 results + RoundResultsCard

**Files:**
- Create: `components/tabulation/RoundResultsCard.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/results/page.tsx`

**Interfaces:**
- Consumes: `api.results.{eventResults,listRoundVersions,roundResults,finalizeEvent}`; `api.roundAdmin.correctResults`; `api.events.get`; `VersionBadge`, `ConfirmDialog`, `Num`, `EmptyState`, `ErrorState`, `TableSkeleton`.
- Produces: published results page — per-round cards with version selector (when > 1 version; historical versions read-only via `roundResults { version }`), correct dialog (reason required), final standings, finalize with confirm.

- [ ] **Step 1: Implement `components/tabulation/RoundResultsCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Num } from "@/components/tabulation/Num";
import { VersionBadge } from "@/components/tabulation/VersionBadge";

type RoundSummary = {
  roundId: string;
  name: string;
  order: number;
  weight: number;
  version: number;
  standings: {
    contestantId: string;
    contestantName: string;
    rank: number | null;
    roundScore: number | null;
  }[];
};

export function RoundResultsCard({
  orgSlug,
  eventSlug,
  round,
  decimalPrecision,
  nameMap,
}: {
  orgSlug: string;
  eventSlug: string;
  round: RoundSummary;
  decimalPrecision: number;
  nameMap: Map<string, string>;
}) {
  const versions = useQuery(api.results.listRoundVersions, {
    orgSlug,
    eventSlug,
    roundId: round.roundId,
  });
  const [picked, setPicked] = useState<number | null>(null);
  const historicalQuery = useQuery(
    api.results.roundResults,
    picked === null || picked === round.version
      ? "skip"
      : { orgSlug, eventSlug, roundId: round.roundId, version: picked },
  );

  const historical =
    picked === null || picked === round.version ? undefined : historicalQuery;
  const rows =
    historical !== undefined
      ? historical.snapshot.categories.flatMap((category) =>
          category.standings.map((s) => ({
            contestantId: s.contestantId as string,
            contestantName: nameMap.get(s.contestantId as string) ?? "—",
            rank: s.rank as number | null,
            roundScore: s.roundScore as number | null,
          })),
        )
      : round.standings;

  return (
    <section className="space-y-2 rounded-lg border p-4" aria-label={round.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{round.name}</span>
          <VersionBadge version={round.version} latest />
          <span className="text-xs text-muted-foreground">
            weight <Num value={round.weight} />%
          </span>
        </div>
        {round.version > 1 && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Version
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={picked ?? round.version}
              onChange={(e) => setPicked(Number(e.target.value))}
            >
              {(versions ?? []).map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                  {v.version === round.version ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {picked !== null && picked !== round.version && (
        <p className="text-xs text-warning">
          Viewing v{picked} — current is v{round.version}.{" "}
          <Button variant="link" size="xs" onClick={() => setPicked(null)}>
            Back to current
          </Button>
        </p>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">{round.name} standings</caption>
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Rank</th>
            <th>Contestant</th>
            <th>Round score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.contestantId} className="border-t">
              <td className="py-1">
                <Num value={row.rank} />
              </td>
              <td>{row.contestantName}</td>
              <td>
                <Num value={row.roundScore} precision={decimalPrecision} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Implement `app/app/[orgSlug]/events/[eventSlug]/results/page.tsx`**

```tsx
"use client";

import { use, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { EyeOff, Flag, History } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
import { Num } from "@/components/tabulation/Num";
import { RoundResultsCard } from "@/components/tabulation/RoundResultsCard";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/tabulation/StateBlock";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const results = useQuery(api.results.eventResults, { orgSlug, eventSlug });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const finalize = useMutation(api.results.finalizeEvent);
  const correct = useMutation(api.roundAdmin.correctResults);
  const [correctFor, setCorrectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!results || results instanceof Error) return map;
    for (const round of results.rounds) {
      for (const s of round.standings) map.set(s.contestantId, s.contestantName);
    }
    for (const f of results.final) map.set(f.contestantId, f.contestantName);
    return map;
  }, [results]);

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    toast.error(data?.message ?? "Action failed.");
  };

  if (results === undefined || ev === undefined) return <TableSkeleton rows={6} cols={4} />;
  if (results instanceof Error) {
    return <ErrorState message="Results are not available." />;
  }
  if (ev === null) return <EmptyState icon={EyeOff} title="Event not found" />;

  const canManage = ev.status === "ready";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Results</h2>
        {canManage && (
          <Button
            disabled={busy || results.rounds.length === 0}
            onClick={() => setFinalizeOpen(true)}
          >
            <Flag aria-hidden />
            Finalize event
          </Button>
        )}
      </div>

      {results.rounds.length === 0 && (
        <EmptyState
          icon={EyeOff}
          title="No published rounds yet"
          hint="Publish from a round's review screen — results appear here exactly at publish."
        />
      )}
      {results.rounds.map((round) => (
        <div key={round.roundId} className="space-y-2">
          <RoundResultsCard
            orgSlug={orgSlug}
            eventSlug={eventSlug}
            round={round}
            decimalPrecision={ev.decimalPrecision}
            nameMap={nameMap}
          />
          {canManage && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCorrectFor(round.roundId);
                  setReason("");
                }}
              >
                <History aria-hidden />
                Correct
              </Button>
            </div>
          )}
        </div>
      ))}

      {results.rounds.length > 0 && (
        <section className="space-y-2 rounded-lg border p-4" aria-label="Final standings">
          <h3 className="font-medium">Final standings</h3>
          <table className="w-full text-sm">
            <caption className="sr-only">Event final standings</caption>
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1">Rank</th>
                <th>Contestant</th>
                <th>Total</th>
                <th>Eliminated in round</th>
              </tr>
            </thead>
            <tbody>
              {results.final.map((row) => (
                <tr key={row.contestantId} className="border-t">
                  <td className="py-1">
                    <Num value={row.rank} />
                  </td>
                  <td>{row.contestantName}</td>
                  <td>
                    <Num value={row.totalScore} precision={ev.decimalPrecision} />
                  </td>
                  <td className="text-muted-foreground">
                    {row.eliminatedInRoundOrder === null
                      ? "—"
                      : `round ${row.eliminatedInRoundOrder}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <ConfirmDialog
        open={correctFor !== null}
        onOpenChange={(open) => {
          if (!open) setCorrectFor(null);
        }}
        title="Record a correction"
        description="A new result version will supersede the current one. Submitted scores are never edited."
        confirmLabel="Record correction"
        busy={busy}
        onConfirm={async () => {
          if (correctFor === null) return;
          setBusy(true);
          try {
            await correct({ orgSlug, eventSlug, roundId: correctFor, reason });
            setCorrectFor(null);
            toast.success("Correction recorded.");
          } catch (err) {
            onError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm">
          Correction reason (required)
          <textarea
            className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        title="Finalize event"
        description="Finalizing locks all results and corrections permanently. Every round must already be published."
        confirmLabel="Finalize event"
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await finalize({ orgSlug, eventSlug });
            toast.success("Event finalized.");
            setFinalizeOpen(false);
          } catch (err) {
            const data = (err as { data?: { code?: string; message?: string } })?.data;
            toast.error(
              data?.code === "VALIDATION_ERROR"
                ? "Every round must be published before finalizing."
                : data?.message ?? "Could not finalize.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Full gate + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add components/tabulation "app/app/[orgSlug]/events/[eventSlug]/results"
git commit -m "feat: published results with versions, corrections, finalize"
```

---

## Task 9: M6 config editor extensions

**Files:**
- Modify: `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx` (full replacement)
- Modify: `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx` (full replacement)

**Interfaces:**
- Consumes: `api.rounds.{list,add,update,remove}`; `api.criteria.{add,remove}`; `api.events.{get,update}`; `Num`, sonner. `rounds.update` accepts `{ orgSlug, eventSlug, roundId, name?, weight?, qualifiesToNextRound?, advancement? }`; `rounds.add` accepts optional `weight`.
- Produces: rounds editor with round-weight display/edit, weights-sum line, elimination-gated advancement panel (only when `eliminationEnabled`; shown only for draft events), monitor/review links when the event is `ready`; settings page with a Scoring card (drop-hi/lo + elimination toggles, draft-only).

- [ ] **Step 1: Replace `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Num } from "@/components/tabulation/Num";

const ADVANCEMENT_MODES = ["none", "top_count", "top_percent", "manual"] as const;

export default function RoundsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const rounds = useQuery(api.rounds.list, { orgSlug, eventSlug });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const addRound = useMutation(api.rounds.add);
  const updateRound = useMutation(api.rounds.update);
  const removeRound = useMutation(api.rounds.remove);
  const addCriterion = useMutation(api.criteria.add);
  const removeCriterion = useMutation(api.criteria.remove);
  const [roundName, setRoundName] = useState("");
  const [roundWeight, setRoundWeight] = useState("");
  const [weightEdit, setWeightEdit] = useState<Record<string, string>>({});
  const [advForm, setAdvForm] = useState<
    Record<string, { mode: string; count: string; percent: string; allowOverride: boolean }>
  >({});
  const [form, setForm] = useState<Record<string, { name: string; weight: string; min: string; max: string }>>({});

  const locked = ev !== undefined && ev !== null && ev.status !== "draft";
  const eliminationOn = ev?.eliminationEnabled ?? true;
  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "CONFLICT") toast.error("Configuration is locked.");
    else if (data?.code === "LIMIT_EXCEEDED") toast.error("Limit reached — upgrade your plan.");
    else toast.error(data?.message ?? "Action failed.");
  };

  const weightsSum = (rounds ?? []).reduce((s, r) => s + r.weight, 0);

  const advancementPatch = (roundId: string) => {
    const f = advForm[roundId];
    return {
      mode: f.mode as (typeof ADVANCEMENT_MODES)[number],
      count: f.mode === "top_count" && f.count ? Number(f.count) : undefined,
      percent: f.mode === "top_percent" && f.percent ? Number(f.percent) : undefined,
      allowOverride: f.allowOverride,
    };
  };

  return (
    <div className="space-y-6">
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-48"
            placeholder="New round name"
            aria-label="New round name"
            value={roundName}
            onChange={(e) => setRoundName(e.target.value)}
          />
          <Input
            className="w-24"
            placeholder="Weight %"
            aria-label="Round weight percent"
            value={roundWeight}
            onChange={(e) => setRoundWeight(e.target.value)}
          />
          <Button
            onClick={async () => {
              try {
                await addRound({
                  orgSlug,
                  eventSlug,
                  name: roundName,
                  weight: roundWeight ? Number(roundWeight) : undefined,
                });
                setRoundName("");
                setRoundWeight("");
              } catch (e) {
                onError(e);
              }
            }}
          >
            Add round
          </Button>
        </div>
      )}
      {rounds?.map((r) => {
        const f = form[r._id] ?? { name: "", weight: "", min: "0", max: "100" };
        const a = advForm[r._id] ?? {
          mode: r.advancement.mode,
          count: String(r.advancement.count ?? ""),
          percent: String(r.advancement.percent ?? ""),
          allowOverride: r.advancement.allowOverride,
        };
        const sum = r.criteria.reduce((s, c) => s + c.weight, 0);
        return (
          <div key={r._id} className="space-y-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{r.name}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  round weight: <Num value={r.weight} />%
                </span>
                {!locked && (
                  <>
                    <Input
                      className="w-20"
                      aria-label={`New weight for ${r.name}`}
                      placeholder="Weight"
                      value={weightEdit[r._id] ?? ""}
                      onChange={(e) =>
                        setWeightEdit({ ...weightEdit, [r._id]: e.target.value })
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={weightEdit[r._id] === undefined || weightEdit[r._id] === ""}
                      onClick={async () => {
                        try {
                          await updateRound({
                            orgSlug,
                            eventSlug,
                            roundId: r._id,
                            weight: Number(weightEdit[r._id]),
                          });
                          setWeightEdit({ ...weightEdit, [r._id]: "" });
                          toast.success("Weight saved.");
                        } catch (e) {
                          onError(e);
                        }
                      }}
                    >
                      Save weight
                    </Button>
                  </>
                )}
                <span className={sum === 100 ? "text-muted-foreground" : "text-destructive"}>
                  criterion weights: <Num value={sum} />%
                </span>
                {ev?.status === "ready" && (
                  <>
                    <Link
                      className="underline underline-offset-4"
                      href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/monitor`}
                    >
                      Monitor
                    </Link>
                    <Link
                      className="underline underline-offset-4"
                      href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/review`}
                    >
                      Review
                    </Link>
                  </>
                )}
                {!locked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await removeRound({ orgSlug, eventSlug, roundId: r._id });
                      } catch (e) {
                        onError(e);
                      }
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {!locked && eliminationOn && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2 text-sm">
                <Label htmlFor={`adv-mode-${r._id}`} className="text-muted-foreground">
                  Advances
                </Label>
                <select
                  id={`adv-mode-${r._id}`}
                  className="rounded border bg-background px-2 py-1"
                  value={a.mode}
                  onChange={(e) =>
                    setAdvForm({ ...advForm, [r._id]: { ...a, mode: e.target.value } })
                  }
                >
                  {ADVANCEMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {a.mode === "top_count" && (
                  <Input
                    className="w-24"
                    placeholder="Top N"
                    aria-label="Top count"
                    value={a.count}
                    onChange={(e) =>
                      setAdvForm({ ...advForm, [r._id]: { ...a, count: e.target.value } })
                    }
                  />
                )}
                {a.mode === "top_percent" && (
                  <Input
                    className="w-24"
                    placeholder="Top %"
                    aria-label="Top percent"
                    value={a.percent}
                    onChange={(e) =>
                      setAdvForm({ ...advForm, [r._id]: { ...a, percent: e.target.value } })
                    }
                  />
                )}
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={a.allowOverride}
                    onChange={(e) =>
                      setAdvForm({
                        ...advForm,
                        [r._id]: { ...a, allowOverride: e.target.checked },
                      })
                    }
                  />
                  allow override
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await updateRound({
                        orgSlug,
                        eventSlug,
                        roundId: r._id,
                        qualifiesToNextRound: r.qualifiesToNextRound,
                        advancement: advancementPatch(r._id),
                      });
                      toast.success("Advancement saved.");
                    } catch (e) {
                      onError(e);
                    }
                  }}
                >
                  Save advancement
                </Button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1">Criterion</th>
                  <th>Weight %</th>
                  <th>Range</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {r.criteria.map((c) => (
                  <tr key={c._id} className="border-t">
                    <td className="py-1">{c.name}</td>
                    <td>
                      <Num value={c.weight} />
                    </td>
                    <td>
                      {c.minScore} - {c.maxScore}
                    </td>
                    <td className="text-right">
                      {!locked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await removeCriterion({
                                orgSlug,
                                eventSlug,
                                criterionId: c._id,
                              });
                            } catch (e) {
                              onError(e);
                            }
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!locked && (
              <div className="flex flex-wrap gap-2">
                <Input
                  className="w-40"
                  placeholder="Criterion"
                  aria-label={`New criterion for ${r.name}`}
                  value={f.name}
                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, name: e.target.value } })}
                />
                <Input
                  className="w-24"
                  placeholder="Weight"
                  aria-label="Criterion weight"
                  value={f.weight}
                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, weight: e.target.value } })}
                />
                <Input
                  className="w-20"
                  placeholder="Min"
                  aria-label="Criterion minimum"
                  value={f.min}
                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, min: e.target.value } })}
                />
                <Input
                  className="w-20"
                  placeholder="Max"
                  aria-label="Criterion maximum"
                  value={f.max}
                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, max: e.target.value } })}
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await addCriterion({
                        orgSlug,
                        eventSlug,
                        roundId: r._id,
                        name: f.name,
                        weight: Number(f.weight),
                        minScore: Number(f.min),
                        maxScore: Number(f.max),
                        decimalPrecision: 0,
                      });
                      setForm({ ...form, [r._id]: { ...f, name: "", weight: "" } });
                    } catch (e) {
                      onError(e);
                    }
                  }}
                >
                  Add criterion
                </Button>
              </div>
            )}
          </div>
        );
      })}
      <p
        className={
          weightsSum === 100 ? "text-xs text-muted-foreground" : "text-xs text-warning"
        }
      >
        Round weights: <Num value={weightsSum} />% of 100% — must total 100% before
        publishing.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function EventSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const update = useMutation(api.events.update);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [dropHighLow, setDropHighLow] = useState(false);
  const [elimination, setElimination] = useState(true);
  const [prevKey, setPrevKey] = useState<string | null>(null);

  if (ev !== undefined && ev !== null && prevKey !== ev._id) {
    setPrevKey(ev._id);
    setName(ev.name);
    setVenue(ev.venue ?? "");
    setDropHighLow(ev.scoringRules.dropHighLow);
    setElimination(ev.eliminationEnabled);
  }

  if (ev === undefined) return <div>Loading…</div>;
  if (ev === null) return <div>Event not found.</div>;

  const save = async (patch: Record<string, unknown>) => {
    try {
      await update({ orgSlug, eventSlug, ...patch });
      toast.success("Saved.");
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      toast.error(
        data?.code === "CONFLICT" ? "Configuration is locked." : data?.message ?? "Could not save.",
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          aria-label="Event name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={ev.status !== "draft" || !name || name === ev.name}
          onClick={() => save({ name, venue })}
        >
          Save
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Venue"
          value={venue}
          placeholder="Venue"
          onChange={(e) => setVenue(e.target.value)}
        />
      </div>
      {ev.status === "draft" && (
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Scoring</h3>
          <div className="space-y-2">
            <Label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                checked={dropHighLow}
                onChange={(e) => setDropHighLow(e.target.checked)}
              />
              Drop highest and lowest judge scores
              <span className="text-xs text-muted-foreground">
                (applies when 3+ judges scored a contestant-criterion)
              </span>
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                checked={elimination}
                onChange={(e) => setElimination(e.target.checked)}
              />
              Elimination rounds enabled
              <span className="text-xs text-muted-foreground">
                (shows advancement controls on the Rounds page)
              </span>
            </Label>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={
              dropHighLow === ev.scoringRules.dropHighLow &&
              elimination === ev.eliminationEnabled
            }
            onClick={() => save({ scoringRules: { dropHighLow }, eliminationEnabled: elimination })}
          >
            Save scoring settings
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Slug: {ev.slug} - Status: {ev.status}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Full gate + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add "app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx" "app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx"
git commit -m "feat: config editor extensions for round weight, advancement, scoring rules"
```

---

## Task 10: Final verification

**Files:**
- None (verification only).

- [ ] **Step 1: Full gate**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
```

Expected: all green.

- [ ] **Step 2: Spec acceptance checklist** — verify each item from spec §7 (UI):

1. Status tokens exist in `:root` and `.dark`; `grep` the new pages for hardcoded status hex values — expect none.
2. Every screen (M1–M6) renders a loading skeleton, empty state, error state, and success path.
3. Score entry: blur validation, "N/M scored" progress, submit disabled until valid, locked post-submit state, all four SaveIndicator states.
4. Monitor renders statuses only — no score value appears in any pre-publish payload or the DOM.
5. Publish button disabled while ties unresolved; ConfirmDialog present on close/publish/finalize; correction reason required.
6. Keyboard-only pass over scoring → submit → monitor → review → publish → results; check 375px width and `prefers-reduced-motion`.
7. Light and dark mode both checked for status contrast.

- [ ] **Step 3: Mark the superseded engine-plan tasks** — in `docs/superpowers/plans/2026-08-16-phase3-tabulation-engine.md`, prepend to Tasks 12, 13, and 14 headings:

```markdown
> **SUPERSEDED** by `2026-08-16-phase3-ui-ux-modules.md` Tasks 4–9 — do not execute.
```

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/plans/2026-08-16-phase3-tabulation-engine.md
git commit -m "docs: mark engine plan UI tasks superseded by ui-ux modules plan"
```
