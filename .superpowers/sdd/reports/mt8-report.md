# MT8 Report — Task 8: M5 results + RoundResultsCard

## STATUS: DONE_WITH_CONCERNS

## Files changed

1. **Created** `components/tabulation/RoundResultsCard.tsx` — round card with version selector (`listRoundVersions` + historical `roundResults { version }` with "skip"), VersionBadge, standings table.
2. **Created** `app/app/[orgSlug]/events/[eventSlug]/results/page.tsx` — results page: per-round cards, Correct dialog (reason required), final standings, Finalize via ConfirmDialog.

Both files follow the plan's code blocks verbatim except the documented Id casts below.

## Deviations from plan code (all justified)

Three `Id<"rounds">` casts added, per controller instruction ("cast as Id only where TS requires"), because the plan's local types hold `roundId` as plain `string` while the backend validators (engine plan Task 11 / Task 10, confirmed against project convention `roundId: v.id("rounds")` in every existing convex module) require branded `Id<"rounds">`:

- `RoundResultsCard.tsx`: `roundId: round.roundId as Id<"rounds">` in both the `listRoundVersions` and `roundResults` `useQuery` calls, plus `import type { Id } from "@/convex/_generated/dataModel"` (same pattern as the committed review page).
- `results/page.tsx`: `roundId: correctFor as Id<"rounds">` in the `correct` mutation call (`correctFor` is `string` state after the null guard), plus the same `Id` type import.

Values that were already correctly typed (e.g., `round={round}` into `RoundSummary` — backend `Id<"rounds">` is assignable to `string`; `setCorrectFor(round.roundId)`) were passed straight through with no casts.

## Verification performed (read-only — no typecheck/lint/build run per rules)

- Primitives' actual APIs match the plan's assumptions: `Num {value, precision}`, `VersionBadge {version, latest}`, `EmptyState {icon, title, hint}`, `ErrorState {message}`, `TableSkeleton {rows, cols}`, `ConfirmDialog {open, onOpenChange, title, description, confirmLabel, busy, onConfirm, children}` (async `onConfirm` assignable to `() => void` — same as review page), `Button` supports `variant="link"|"outline"` and `size="xs"|"sm"`.
- `api.events.get` returns `Doc<"events"> | null` — `ev === null`, `ev.status`, `ev.decimalPrecision` usage typechecks.
- `resultVersions.snapshot.categories[].standings[]` fields (`contestantId`, `rank`, `roundScore`) exist in schema; the plan's `as string` / `as number | null` casts are no-ops but kept verbatim.
- convex 1.43 `useQuery` declared return is `T | undefined` (runtime may yield `Error`), so `historical.snapshot` access typechecks and the page's `instanceof Error` branches compile (true-branch narrows to `never`, which is legal).

## Concerns

1. **`api.results.*` and `api.roundAdmin.correctResults` do not exist yet** — the sibling backend agent was still writing `convex/results.ts` at implementation time (file absent). Typecheck will fail on these imports until that agent lands; expected per controller ("the generated api will exist by the controller's gate").
2. **Correct dialog confirm is not disabled when the reason textarea is empty** — the plan's UX relies on the server's `VALIDATION_ERROR` ("A correction reason is required") surfaced via toast. Kept verbatim.
3. **Historical version query runtime failure**: if `roundResults { version }` returns a runtime `Error` instance (e.g., version deleted between listing and fetch), `historical.snapshot` would throw at runtime; the declared type (`T | undefined`) hides this from TS. Plan-authored behavior, kept verbatim — low likelihood since versions are append-only.
4. `RoundSummary` is card-local (plan's design); no shared export was created.
