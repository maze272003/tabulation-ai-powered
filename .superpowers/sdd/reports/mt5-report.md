# MT5 Report — M2 Score Entry Form

## Status: DONE

## Files changed

- Created `app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx` — the plan's Task 5 code block (plan lines 903-1217) written verbatim, including directories. Nothing else touched. No commit (controller commits centrally). No typecheck/lint/build/test run (forbidden for this task).

## Verification performed (all passed)

- `components/tabulation/Num.tsx` — `value: number | null | undefined`, `precision?: number`: compatible with all call sites (`summary[c._id]` may be undefined; `filledCount`, `criteria.length` are numbers).
- `components/tabulation/StatusBadge.tsx` — exports `StatusBadge({ status, kind })`: structurally as the plan assumes.
- `components/tabulation/StateBlock.tsx` — `TableSkeleton({ rows, cols })`, `EmptyState({ icon, title, hint?, action? })`: compatible.
- `components/tabulation/SaveIndicator.tsx` — exports `SaveState` (`"idle" | "dirty" | "saving" | "saved" | "error"`) and `SaveIndicator({ state, savedAt, onRetry })`: compatible.
- `components/ui/{button,input,label}.tsx` exist; `Input` forwards native input props (`id`, `type`, `inputMode`, `min`, `max`, `step`, `aria-*`, `value`, `onBlur`, `onChange`); `Label` accepts `htmlFor`; `Button` accepts `onClick`/`disabled`.
- `convex/_generated/api.d.ts` exposes `api.scoring.{myAssignments,sheetDetail,saveDraft,submitSheet}`; `convex/_generated/dataModel.d.ts` exports `Doc`.
- `sonner` (^2.0.8) and `lucide-react` in package.json; `@/convex/_generated/api` import convention matches 18 existing pages.
- Backend arg/return shapes otherwise match the plan: `sheetDetail` returns `{ sheet, criteria, contestant }`; `saveDraft`/`submitSheet` take `{ orgSlug, eventSlug, sheetId, draftValues|values }`; `sheetId` from `detail.sheet._id` is a proper `Id<"scoreSheets">`.

## Blockers (verbatim code will not typecheck; per task rules I stopped rather than deviate)

### Blocker 1 — `string` route params passed to `v.id()` args of `sheetDetail`

- Page (my file lines 42-48): `use(params)` yields `roundId: string`, `contestantId: string` (plan types the params promise as plain strings, lines 937-942).
- `convex/scoring.ts:92` — `sheetDetail` args: `roundId: v.id("rounds")`, `contestantId: v.id("contestants")` → inferred `Id<"rounds">` / `Id<"contestants">`.
- `Id` is `GenericId` (branded `string & { [brand]: … }`, convex/values) — plain `string` is NOT assignable → TS2345 at the `useQuery(api.scoring.sheetDetail, …)` call.
- Note: the plan's M3 (`roundAdmin.roundMonitor`, plan line 1270) and M4 (`roundAdmin.roundReview`, plan line 1510) make the same assumption, so this is systemic, not Task-5-specific.

### Blocker 2 — `myAssignments` returns `status: string`; `StatusBadge` requires literal unions

- `convex/scoring.ts:62` (and :63 for sheets) — the `out` annotation types `status: string`, so the generated return type widens the schema's literal union to `string`.
- `components/tabulation/StatusBadge.tsx:59-62` — prop is `status: SheetStatus | RoundStatus` where `RoundStatus = "open" | "closed" | "published"` (`components/tabulation/status.ts:1-2`).
- The verbatim code passes `round.status` (type `string`) at three sites (my file lines 156, 204, 259) → TS2326.
- Note: sibling Task 4 (M1) has the same failure class (plan lines 829, 847-849, 864: `StatusBadge`/`StatusDot` with string statuses, plus `sheetStatusLabel[sheet.status]` indexing a `Record<SheetStatus, string>` with `string` → TS7053). A coordinated fix is needed.

## Suggested resolutions (controller decision; all outside my permitted file scope or verbatim mandate)

1. Page-side casts (smallest change): `roundId as Id<"rounds">`, `contestantId as Id<"contestants">` at the `sheetDetail` call, and `round.status as RoundStatus` at the three `StatusBadge` sites. `as Id<...>` assertions are explicitly allowed by the Phase 3 engine plan conventions. Requires plan amendment since Task 5's block is "verbatim".
2. Backend-side typing fix (fixes M1 too): in `convex/scoring.ts`, type the `out`/`sheets` annotations with the schema's literal unions (e.g. `status: RoundStatus` / `SheetStatus` equivalents derived from the schema, or `Doc<"rounds">["status"]` / `Doc<"scoreSheets">["status"]`) so the generated return type carries the unions. `round.status` then satisfies `StatusBadge` with no page changes. Blocker 1 still needs page-side casts either way (weakening `v.id` to `v.string` args is not acceptable).
3. Recommended: 1 + 2 combined — backend returns literal unions (cleanest for all consumers), pages cast route params to branded Ids.

## Secondary concerns (non-blocking, verbatim as planned)

- No `instanceof Error` branch for `useQuery` results (Global Constraints line 24 says to branch). Consequences with the verbatim code: a failed `sheetDetail` degrades to the "Contestant not found" `EmptyState`; a failed `myAssignments` (Error instance passes the `=== undefined` check) reaches `mine.rounds.find(...)` at line 140 and throws a TypeError. Flagging for the controller; did not deviate from verbatim.
- `criteria` memo dependencies: `criteria` is a new array identity each render (`detail?.criteria ?? []`), so `errors`/`validValues` memos recompute every render. Harmless at this scale; verbatim.

## Conclusion

File is written verbatim and complete, but the task cannot be considered DONE: the plan's code assumptions conflict with the committed `StatusBadge` prop types and `sheetDetail` arg types. Stopped and escalated per instructions.

## Fix notes (post-adjudication, 2026-08-16)

- Controller adjudication: Blocker 2 resolved backend-side — `convex/scoring.ts` now returns literal status unions, so `round.status` satisfies `StatusBadge` at all three sites with no page change.
- Blocker 1 resolved page-side in `app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx` only:
  - `useQuery(api.scoring.sheetDetail, …)` now passes `roundId: roundId as Id<"rounds">` and `contestantId: contestantId as Id<"contestants">` (Next route params are plain strings; branded Id casts are the standard route→Convex bridge, per plan conventions allowing `as Id<...>`).
  - Import updated to `import type { Doc, Id } from "@/convex/_generated/dataModel";`.
- Nothing else changed; server-side `v.id()` validators remain the real gate. No typecheck/lint/build/test run and no commit, per task rules.
