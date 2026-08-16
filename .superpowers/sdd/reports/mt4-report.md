# Task 4 Report: EventShell nav + M1 judge scoring home

## Status: DONE_WITH_CONCERNS

## Files changed

1. `components/EventShell.tsx` — nav array only: added `Scoring` (after Judges) and `Results` (after Settings). Verbatim per plan Step 1. No other lines touched.
2. `app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx` — created (directory created). Verbatim per plan Step 2 code block.

## Pre-implementation verification performed

- Read plan Global Constraints (lines 15-33) and Task 4 (lines 745-890).
- Confirmed all consumed primitives exist with matching exports/signatures:
  - `components/tabulation/status.ts` — `SheetStatus`, `sheetStatusLabel`
  - `components/tabulation/Num.tsx` — `Num` (accepts `number | null | undefined`)
  - `components/tabulation/StatusBadge.tsx` — `StatusDot` (`status: SheetStatus`, `label?`), `StatusBadge` (`status: SheetStatus | RoundStatus`, `kind`)
  - `components/tabulation/StateBlock.tsx` — `TableSkeleton` (`rows`/`cols`), `EmptyState` (`icon`/`title`/`hint`)
- Confirmed backend: `convex/scoring.ts:39` `myAssignments` returns `{ judgeId: Id<"judges"> | null, rounds: [{ roundId, name, order, status, sheets: [{ sheetId, contestantId, contestantName, contestantNumber, status }] }] }` — field names match the page code exactly.
- Confirmed the page is wrapped by the shell via the existing `app/app/[orgSlug]/events/[eventSlug]/layout.tsx` (EventShell), consistent with sibling pages (e.g., judges/page.tsx does not wrap itself).
- Self-review: both files match the plan code blocks character-for-character; no comments; no emojis; icons lucide-react only; numerals render through `Num` (submitted count, sheets length) plus the plan-specified mono span for `#contestantNumber`.

## Deviations from task

- None. Both code blocks were applied verbatim. No commands from Step 3 were run (typecheck/lint/build/test/commit are excluded per controller instructions).

## Concerns

1. **Possible typecheck friction on `status: string` (page code is verbatim, backend typing is the root cause).** `convex/scoring.ts` explicitly annotates its return shape with `status: string` (lines 58-64, both round and sheet status). The verbatim page code passes `round.status` / `sheet.status` to `StatusBadge`/`StatusDot`, which expect `SheetStatus | RoundStatus` / `SheetStatus`, and indexes `sheetStatusLabel[sheet.status]` (`Record<SheetStatus, string>`). If the Convex-generated return type infers `status: string`, TypeScript may reject these three usages. Per instructions I wrote the plan code verbatim and touched nothing else; if the central gate fails here, the cleanest fix is narrowing the return annotation in `convex/scoring.ts` (out of scope for this task's file allowlist) or the controller may already have a planned remedy. Note sibling tasks (M2-M5) consume the same query fields and will hit the same issue if unaddressed.
2. Minor observation (not a blocker): `useQuery` returning an `Error` instance on failure is not branched in the verbatim code (Global Constraints line 24 mentions the convention). `mine.judgeId` access would throw on an Error instance. This matches the plan text exactly, so it is flagged for the controller rather than changed.

## Verification gate

Not run per controller instructions (no typecheck/lint/build/test, no git operations).
