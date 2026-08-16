# ET10 Report — Review & Decisions (Task 10)

## STATUS: DONE

## Files Changed

| File | Action | Notes |
|---|---|---|
| `convex/lib/errors.ts` | Modified | Added `TIES_UNRESOLVED: "TIES_UNRESOLVED"` to `ErrorCode` (for Task 11's publishRound; added now per task interface). |
| `convex/lib/roundCompute.ts` | Created | `loadRoundCompute` (loads round/criteria/contestants/sheets/scores/judges/tieBreaks/overrides via indexes, runs `computeRoundStandings` + `applyAdvancement`, builds judgeParticipation) and `buildSnapshot` (resultVersions snapshot literal). Verbatim per plan. |
| `convex/roundAdmin.ts` | Appended | `roundReview` query (closed rounds only, else CONFLICT), `addTieBreak`, `removeTieBreak`, `addAdvancementOverride`, `removeAdvancementOverride` mutations. `loadRoundCompute` import merged into existing import block. Verbatim per plan. |
| `convex-test/reviewDecisions.test.ts` | Created | 6 tests, verbatim per plan. |
| `convex-test/setup.ts` | Modified | Added `eliminationEnabled?: boolean` to `ScoredEventOpts`; wired into the `events.update` patch as `eventPatch.eliminationEnabled = opts.eliminationEnabled` (conditional, consistent with existing dropHighLow/resultVisibility pattern). |
| `convex/_generated/api.d.ts` | Codegen | `npx convex codegen` run exactly once after appending public functions; registers `lib/roundCompute` module (new roundAdmin exports flow through the existing roundAdmin module entry). |

Untouched: `convex/lib/tabulation.ts` (adjudicated semantics preserved — strict judge firsts, applyAdvancement unchanged), all other files. Working-tree modifications to `AGENTS.md`, `.superpowers/sdd/progress.md`, and `app/...` belong to the sibling agent/controller.

## Test Commands + Output

TDD sequence:

1. Pre-implementation (Step 2): `npx vitest run convex-test/reviewDecisions.test.ts`
   -> FAIL, 6/6 — `Expected a Convex function exported from module "roundAdmin" as 'addAdvancementOverride'...` (functions absent). Expected failure mode.
2. Post-implementation (Step 4): `npx vitest run convex-test/reviewDecisions.test.ts`
   -> PASS: `Test Files  1 passed (1)`, `Tests  6 passed (6)` (Duration 1.51s)

Coverage: open-round review refusal (CONFLICT) + closed review with exact scores (Maria 77/rank 1, Nina 50/rank 2); score.manage gate (FORBIDDEN); unresolved-tie surfacing, manual break resolution, and removal reversion; tie-break window (CONFLICT on open) + permutation validation (VALIDATION_ERROR); top_count advancement preview + force_advance override + removal reversion; override refusals for allowOverride=false and eliminationEnabled=false (both VALIDATION_ERROR).

## Deviations

- setup.ts wiring uses the file's existing conditional-patch pattern (`if (opts.eliminationEnabled !== undefined) eventPatch.eliminationEnabled = ...`) rather than literally spreading `eliminationEnabled: opts.eliminationEnabled` into the args object. This avoids passing an explicit `undefined` arg to the mutation while achieving the specified behavior; matches the sibling dropHighLow/resultVisibility lines.
- No other deviations. All plan code blocks written verbatim (no comments added; none were in the plan).

## Concerns

- None blocking. `Date.now()` appears only in mutations (allowed); `roundReview` query contains no wall-clock reads. All five functions enforce `score.manage` via `requireReadyEvent`; ID-arg mutations verify event ownership (NOT_FOUND pattern); tie break / override rows are scoped by `eventId` before delete; all four mutations audited. Codegen was run exactly once as authorized.
