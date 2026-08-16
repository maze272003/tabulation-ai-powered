# Task 2 Report — Display primitives

## STATUS: DONE

## Files changed (all creates, verbatim from plan lines 295-554)

- `components/tabulation/Num.tsx`
- `components/tabulation/StatusBadge.tsx` (StatusDot + StatusBadge)
- `components/tabulation/StateBlock.tsx` (TableSkeleton / EmptyState / ErrorState)
- `components/tabulation/BlackoutNotice.tsx`
- `components/tabulation/VersionBadge.tsx`

## Pre-flight dependency verification

- `components/tabulation/status.ts` exists with exact exports consumed: `formatScore`, `sheetStatusLabel`, `roundStatusLabel`, `sheetStatusTone`, `roundStatusTone`, types `SheetStatus`/`RoundStatus`/`Tone`. No drift.
- `@/components/ui/badge` supports `variant="secondary"`, `variant="outline"`, `className`, children (Base UI `useRender` component). Matches plan usage.
- `@/components/ui/button` supports `variant="outline"`, `size="sm"`, `onClick`. Matches plan usage.
- `@/components/ui/tooltip` `TooltipTrigger` forwards props to Base UI `TooltipPrimitive.Trigger`; `render={<element />}` is the correct Base UI pattern. Matches plan usage.
- Design tokens confirmed in `app/globals.css` (`@theme inline` lines 26-34, `:root`/`.dark` values lines 93-100/136-144): `text-success`, `bg-success-muted`, `text-info`, `bg-info-muted`, `text-warning`, `bg-warning-muted`, `border-warning/50` (opacity modifier on token), and `var(--info)` used by the StatusDot half-fill gradient. No hardcoded status hex values anywhere.
- lucide-react exports verified at runtime: `CirclePause`, `BadgeCheck`, `Circle`, `Lock`, `EyeOff`, `History` all present.
- Target files did not previously exist (pure creates). Sibling Task 3 files (`ConfirmDialog.tsx`, `SaveIndicator.tsx`) were present and untouched.

## Deviations

None. Code is verbatim from the plan. Per task rules, did NOT run typecheck/lint/build/tests and did NOT commit (controller commits centrally).

## Concerns

None blocking. Two informational notes for the controller:

1. `StatusBadge` narrows `status as RoundStatus` / `as SheetStatus` via casts after the `locked` early return — acceptable because `kind` discriminates at call sites; typed per plan interface.
2. `Num`'s null/undefined branch renders an em dash with `aria-label="no value"`; the branch is technically unreachable-dead-safe with `formatScore`'s own null guard, but it exists to wrap the dash in the aria label — intentional per plan.
