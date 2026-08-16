# Task 9 Report: M6 config editor extensions

## STATUS: DONE_WITH_CONCERNS

## Files changed

- `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx` — full replacement per plan Step 1
- `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx` — full replacement per plan Step 2

No other files touched.

## Verification performed

- Both written files were diffed line-for-line against the plan's code blocks
  (plan lines 2296-2664 and 2670-2784) via `Compare-Object`: **0 differences** each.
- Existing pre-replacement pages matched the documented Phase 2 baseline (no material
  deviation), so verbatim replacement was safe — no BLOCKED condition.
- Backend contract verified against source (backend Task 2, committed):
  - `rounds.add` accepts optional `weight` (convex/rounds.ts:27,40)
  - `rounds.update` accepts `qualifiesToNextRound`, `weight`, `advancement` (convex/rounds.ts:55-79)
  - `rounds.list` spreads full round docs, so `weight`/`advancement`/`qualifiesToNextRound` present (convex/rounds.ts:106-118, schema.ts:185-195)
  - `events.get` returns full event doc incl. `eliminationEnabled`, `scoringRules`, `status`, `venue` (convex/events.ts:57-67)
  - `events.update` accepts `scoringRules: { dropHighLow }` and `eliminationEnabled` (convex/events.ts:93-94,117-118)
- `Num` import written exactly as plan specifies (`@/components/tabulation/Num`); plan's
  Num definition confirms the `value` prop signature (plan lines 301-311). File is being
  created by a concurrent sibling agent.
- No typecheck/lint/build/test run, no git operations — per task rules (controller gates centrally).

## Deviations from plan

None. Both pages written verbatim.

## Concerns (all inherent to the plan's verbatim code, not introduced by me)

1. **`advancementPatch` has no fallback to the round's stored advancement.** It reads
   `advForm[roundId]` directly (rounds/page.tsx `advancementPatch`). If the user clicks
   "Save advancement" without first touching any control in that round's advancement
   panel, `f` is `undefined` and `f.mode` throws a TypeError inside the try block,
   surfacing as the generic "Action failed." toast. The rendered form state `a` does have
   a fallback, so the mismatch is only in the patch builder. Suggested follow-up fix:
   `const f = advForm[roundId] ?? a`-equivalent (seed from the round), or disable the
   button until `advForm[roundId]` exists.
2. **Global Constraints line 24 (instanceof Error branching) is not applied in the
   plan's M6 code.** Both pages use `=== undefined` / `=== null` checks only; a failed
   Convex query (returned `Error` instance) renders as "Event not found." (settings) or
   an empty list (rounds). This is the plan's own code; flagging for controller
   awareness, not fixed to keep the replacement verbatim.
3. **Weights-sum footer renders while `rounds` is still loading** (`rounds ?? []` → sum 0,
   warning-colored "0% of 100%"). Cosmetic, per plan.
4. **`ev === null` (not found / no access) on the rounds page leaves `locked = false`**,
   briefly exposing editing UI that will fail server-side. Same as the Phase 2 baseline
   behavior; not a regression.

## Follow-up fix: Concern 1 (controller-approved)

- `advancementPatch` in `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx` now takes
  `(roundId: string, r: (typeof rounds.value)[number])` and falls back to the round's
  stored advancement when `advForm[roundId]` is absent, mirroring the render-side `a`
  fallback (mode/count/percent/allowOverride seeded from `r.advancement`).
- Single call site updated to `advancementPatch(r._id, r)`. No other changes in the file.
- "Save advancement" no longer throws a TypeError (generic "Action failed." toast) when
  clicked before any control in that round's advancement panel is touched; it now resaves
  the round's current stored values.
- No typecheck/lint/build/test run, no git operations — per task rules (controller gates
  centrally).
