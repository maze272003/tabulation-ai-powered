# ET7 Report — Core: advancement & event final

## Status

DONE

## Files Changed

- `convex/lib/tabulation.ts` (appended only, +103 lines): `AdvancementConfig`, `AdvancementOverrideRow`, `applyAdvancement`, `RoundStandingSummary`, `FinalStandingRow`, `computeEventFinal` — verbatim from plan Task 7 Step 3 (lines 1365-1468).
- `convex-test/tabulationCore.test.ts` (appended only, +105 lines): `standingRow`/`rd` helpers, `describe("advancement")` (5 tests), `describe("event final")` (3 tests) — verbatim from plan Task 7 Step 1 (lines 1254-1359), including the plan's own import statement appended mid-file (valid hoisted ESM import; matches the plan's exact code).

No other files touched. No commit made (controller commits centrally).

## TDD Sequence

1. Appended failing tests.
2. `npx vitest run convex-test/tabulationCore.test.ts`
   - Result: 8 failed | 15 passed (23) — all 8 new tests failed with `TypeError: applyAdvancement is not a function` / `TypeError: computeEventFinal is not a function`; pre-existing tests unaffected. Expected FAIL confirmed.
3. Appended implementation.
4. `npx vitest run convex-test/tabulationCore.test.ts`
   - Result: Test Files 1 passed (1); Tests 23 passed (23). PASS confirmed.

## Verification Commands

- `npx vitest run convex-test/tabulationCore.test.ts` (only permitted verify command; run twice as above)
- Per task rules: did NOT run typecheck/lint/build/full npm test/codegen; did NOT commit/push.

## Self-Review Notes

- Both appended blocks match the plan code character-for-character (verified via `git diff` review); no comments, no emojis.
- Determinism preserved: `applyAdvancement` ranks via `sort((a, b) => a.rank! - b.rank!)` on a filtered copy (does not mutate caller input); `computeEventFinal` sorts contestants by id before grouping/ranking.
- No interaction with Task 6's `computeRoundStandings`/judge-firsts semantics — Task 7 tests do not exercise judge-firsts, and nothing in the appended code reads or modifies that logic. No contradiction with the prior legitimate judge-firsts adjustment.
- `applyAdvancement` ignores `config.allowOverride` (applies overrides unconditionally) — this matches the plan verbatim; allowOverride is presumably enforced at the roundAdmin layer (Task 9+), and no Task 7 test covers it. Noted as an observation, not a deviation.
- Untracked in-repo changes to `.superpowers/sdd/progress.md`, `AGENTS.md`, `convex/_generated/api.d.ts` belong to sibling agents/controller; untouched by this task.

## Deviations

None. Implementation and tests are verbatim from the plan.

## Concerns

None blocking. Minor observations:

1. `allowOverride` is not consulted inside `applyAdvancement` (per plan design; higher layer's responsibility).
2. The appended test block's import statement sits mid-file (verbatim per plan instructions); hoisting makes this valid, and vitest/esbuild handle it, though style-wise a top-of-file import would be conventional.
