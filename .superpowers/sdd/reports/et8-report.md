# ET8 Report — Task 8: Score entry (authz helpers + mutations)

## STATUS: DONE

## Files Changed

| File | Action | Notes |
|---|---|---|
| `convex-test/setup.ts` | Modified | Added `carolIdentity` (after `bobIdentity`) and appended `ScoredEventOpts` type + `prepareScoredEvent` helper, verbatim from plan Step 1. |
| `convex-test/scoringEntry.test.ts` | Created | Verbatim from plan Step 2 (7 tests). |
| `convex/lib/eventAuthz.ts` | Modified | Added `Id` to dataModel import; appended `requireReadyEvent`, `requireJudgeRow`, `loadRound`, verbatim from plan Step 4. |
| `convex/scoring.ts` | Created | Verbatim from plan Step 5: `checkValue`, `loadOwnSheet`, `myAssignments`, `sheetDetail`, `saveDraft`, `submitSheet`. |
| `convex/_generated/*` | Codegen only | Ran `npx convex codegen` once after creating `convex/scoring.ts`; `api.d.ts` now includes `scoring` module (import + fullApi entry). |

## TDD Sequence

1. Red: after writing setup helper + test file, ran `npx vitest run convex-test/scoringEntry.test.ts`
   - Result: `Test Files 1 failed (1)`, `Tests 7 failed (7)` — `Error: Could not find module for: "scoring"` (expected failure; `api.scoring` did not exist yet).
2. Implemented `eventAuthz.ts` additions + `convex/scoring.ts`.
3. Ran `npx convex codegen` (sole authorized agent in this wave).
4. Green: re-ran `npx vitest run convex-test/scoringEntry.test.ts`
   - Result: `Test Files 1 passed (1)`, `Tests 7 passed (7)` (Duration 7.59s).

## Verification Commands (exact)

```powershell
npx vitest run convex-test/scoringEntry.test.ts   # red: 7 failed / 7
npx convex codegen                                 # generated api.scoring
npx vitest run convex-test/scoringEntry.test.ts   # green: 7 passed / 7
```

Per task rules, typecheck/lint/build/full `npm test` were NOT run (controller gate); no git commit/push performed.

## Pre-implementation Verification Performed

- Schema indexes used by scoring module all exist: `judges.by_event_id_and_user_id`, `rounds.by_event_id`, `contestants.by_event_id`, `scoreSheets.by_judge_id_and_round_id`, `scoreSheets.by_event_id_and_round_id_and_contestant_id`, `criteria.by_round_id`, `judgeAssignments.by_judge_id`, `scores.by_sheet_id`.
- `events.update` accepts `scoringRules`/`resultVisibility`; `rounds.add` accepts `qualifiesToNextRound`/`advancement`; `eventLifecycle.publish` generates scoreSheets (judge x round x active contestant) and sets status `ready`; Judge role has `score.enter` (constants.ts line 39); `events.create` seeds default "Open" category (satisfies readiness).
- Setup helper matched actual `setup.ts` structure — no material deviation.

## Deviations

None. All code blocks written verbatim from the plan.

## Concerns

- `submitSheet` in scoring.ts uses `Date.now()` — permitted (mutation context, per Global Constraints which only prohibit it in queries).
- The `eventPatch: Record<string, unknown>` spread into `api.events.update` args in `prepareScoredEvent` is type-loose but is verbatim plan code in test-only setup; not production code.
- Working tree contains concurrent sibling-agent changes (AGENTS.md, app pages, tabulation.ts, etc.); confirmed via `git status`/`git diff` that my diff touches only the five authorized files. Codegen regenerated `_generated/api.d.ts` (+2 lines, scoring module only).
