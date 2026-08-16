# MT7 Report — M4 Review & Publish

## Status: DONE_WITH_CONCERNS

## Files changed

- Created: `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/review/page.tsx` (423 lines) — the only file touched.

## Implementation

Plan Task 7 code block transcribed verbatim (lines 1479-1913 of the modules plan) with the briefed boundary-cast convention applied. No other deviations.

### Deviations from plan code (briefed, matches monitor/page.tsx convention)

1. Added `import type { Id } from "@/convex/_generated/dataModel";`
2. `roundId: roundId as Id<"rounds">` at all five API boundaries that pass roundId:
   - `useQuery(api.roundAdmin.roundReview, ...)` (line 35)
   - `publishRound(...)` (line 122)
   - `addOverride(...)` force_advance (line 276) and force_cut (line 296)
   - `addTieBreak(...)` (line 373)
   - `removeOverride` / `removeTieBreak` take no roundId (matches server args: `overrideId` / `tieBreakId` only)

## Verification performed (no gates run per instructions)

- Primitives match plan usage exactly: `ConfirmDialog` (open/onOpenChange/title/description/confirmLabel/busy/onConfirm), `EmptyState` (icon/title/hint/action), `TableSkeleton` (rows/cols), `Num` (value), `BlackoutNotice` (no props), `tieResolvedByLabel` (status.ts:31).
- Backend signatures verified against `convex/roundAdmin.ts` and `convex/categories.ts`: roundReview / addTieBreak / removeTieBreak / addAdvancementOverride / removeAdvancementOverride / categories.list all accept exactly the args the page passes.
- Consumed `roundReview` fields all exist in the query return: standings (contestantId/Name/categoryId/status/roundScore/rank/tieResolvedBy/advancement), unresolvedTies (contestantIds/names), tieBreaks (Doc<"tieBreaks"> with _id/orderedIds), overrides (Doc with _id/contestantId/action), round.advancement (mode union of exactly none/top_count/top_percent/manual; optional count/percent — `?? 0` safe), qualifiesToNextRound, eliminationEnabled.
- Contestant status union (active/scratched/disqualified) matches `contestantStatusLabel` keys (schema.ts:220).
- Button supports sizes `xs`/`sm` and variant `ghost`; `Input` exists at components/ui/input.tsx.
- Tokens only for status colors (bg-warning-muted, text-warning, text-success, text-destructive, bg-destructive/10, border-warning/50, border-destructive).
- No comments, no emojis, lucide-react icons only, `use(params)`, `instanceof Error` branching, raw-table convention, error-hint cast pattern per global constraints.

## Concerns

1. **`api.roundAdmin.publishRound` does not exist in the working tree at implementation time.** The generated api re-exports `typeof roundAdmin` and roundAdmin.ts (263 lines, commit 3d0b0e6) has no publishRound. Engine plan Task 11 (line 2680) appends `publishRound { orgSlug, eventSlug, roundId }` — same wave, sibling file (convex/roundAdmin.ts), signature exactly matching this page's call. I proceeded because the controller briefing asserts it exists and the file sets are disjoint, but the wave typecheck gate will fail if the Engine Task 11 sibling does not land.
2. Plan-inherited minor behavior (verbatim, not changed): `tieError` destructive tint never resets after a successful tie-break save (only ever set true on TIES_UNRESOLVED); requires a fresh page load to return to warning tint.
3. Plan-inherited minor behavior: `positions` state is shared across tie groups keyed by contestant id; it is cleared on successful save, but a partially edited other group's inputs revert to defaults at that point. Acceptable at 1-group-per-category scale.
