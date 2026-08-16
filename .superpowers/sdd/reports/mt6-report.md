# MT6 Report — M3 Monitor Grid

## STATUS: DONE_WITH_CONCERNS

## Files Changed

- Created: `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx` (new directories `[roundId]/monitor/` created)

## Implementation

Plan Task 6 code block written verbatim with the single sanctioned adaptation (see Deviations). The page provides:

- Judges x contestants status matrix using `StatusDot` inside Base UI `Tooltip` triggers (`render={<button/>}`) with descriptive labels (`judge - #number - status`)
- Sticky first column (`sticky left-0 bg-background`) on header and body cells
- Progress bar (`role="progressbar"`, full ARIA, `bg-success` fill, zero-division guard)
- Close round via `ConfirmDialog` (unsubmitted count in description); Reopen with audit-log hint title
- Review & publish link when round is closed; `BlackoutNotice` when open
- Footer legend of all four sheet statuses
- Loading (`TableSkeleton 6x6`) and error (`EmptyState` with Radar icon, FORBIDDEN code hint) branches via `instanceof Error`

## Verification Performed

- All consumed primitives read and prop-checked against actual source: `StatusDot`/`StatusBadge`, `EmptyState`/`TableSkeleton`, `ConfirmDialog` (onConfirm `() => void` accepts async fn), `Num`, `BlackoutNotice`, `sheetStatusLabel`/`SheetStatus`, `Tooltip` family (Base UI, `render` prop confirmed in `components/ui/tooltip.tsx`), `Button` (`variant="outline"` confirmed).
- Backend verified: `convex/roundAdmin.ts` — all three functions take `{ orgSlug, eventSlug, roundId: v.id("rounds") }`. Schema `rounds.status` = `"open" | "closed" | "published"` and `scoreSheets.status` = the four-value `SheetStatus` union, so `StatusBadge kind="round"` and `sheetMap` typings line up exactly.
- Id-cast pattern matches the established convention in `scoring/[roundId]/[contestantId]/page.tsx`.
- No comments, no emojis, lucide-react icon only, status colors from tokens only (`bg-success`, `bg-muted`, `ring-ring/50`).

## Deviations

- Added `import type { Id } from "@/convex/_generated/dataModel";` and cast `roundId: roundId as Id<"rounds">` at the three API boundaries (roundMonitor, reopenRound, closeRound). This is the adaptation explicitly sanctioned in the task briefing because the backend args use `v.id("rounds")` while the route param is a plain string.

## Concerns

1. ConfirmDialog close-on-error mismatch: the plan's note (line 1453) states the dialog "stays open on error", but since `run` catches the mutation error internally and returns normally, `setCloseOpen(false)` executes unconditionally — the dialog also closes when closeRound fails (error still toasted). Code kept verbatim per task rules; flagging the note/behavior discrepancy for the controller.
2. The "Review & publish" CTA nests `Button` (Base UI renders a native `<button>`) inside `Link` (an `<a>`). Technically invalid interactive-content nesting per HTML spec, though widely used and renders/behaves fine. Kept verbatim; sibling pages use plain `Link` instead.

## Not Run (per task rules)

- typecheck / lint / build / tests, git commit — controller runs gates and commits centrally.
