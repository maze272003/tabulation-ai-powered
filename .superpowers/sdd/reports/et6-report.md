# Task 6 Report — Core: ranking & tie cascade

## STATUS: DONE (re-applied with controller adjudications — see Resolution)

The plan's Task 6 is internally inconsistent: the verbatim implementation from plan lines
1047-1223 fails 3 of the 8 verbatim tests from plan lines 937-1041. Both code blocks were
applied exactly as written (verified: only whitespace/position changes none — byte-for-byte
verbatim). Step 2 (RED) behaved as predicted; Step 4 (GREEN) did not.

## Files changed

- `convex/lib/tabulation.ts` — appended Task 6 implementation verbatim, then **reverted**
  (see Workspace State).
- `convex-test/tabulationCore.test.ts` — appended Task 6 tests verbatim, then **reverted**.

No other files touched. No commit made (controller commits centrally).

## Test commands and output summary

Command (only verification permitted): `npx vitest run convex-test/tabulationCore.test.ts`

1. After Step 1 (tests appended, no implementation):
   `8 failed | 7 passed (15)` — all failures `TypeError: computeRoundStandings is not a function`.
   Matches plan Step 2 expectation.
2. After Step 3 (implementation appended verbatim):
   `3 failed | 12 passed (15)` — **plan Step 4 expects PASS; mismatch → BLOCKED.**
   - `flags fully tied contestants as unresolved without a manual break`:
     `AssertionError: expected +0 to be 1` (unresolvedTies.length)
   - `judge firsts resolve ties before manual breaks`:
     `AssertionError: expected 'none' to be 'judge_firsts'`
   - `manual tie breaks resolve identical totals`:
     `AssertionError: expected 2 to be 1` (k2 rank)
3. After revert (Task 5 baseline): `7 passed (7)` — workspace left green.

## Root-cause specifics

### Failure 1 — "flags fully tied contestants as unresolved" (and Failure 3)

Data: single judge j1, k1=[8,8], k2=[8,8] → both roundScore 80 → tie group of 2.

`judgeFirsts` (plan lines 1072-1099) iterates `[...tied].sort()` per judge with
`best === null || total > bestTotal`. On an exact per-judge total tie (16 vs 16) the first
contestant in id order (k1) seeds `best` and is never displaced, so k1 is awarded j1's
"first": firsts = {k1: 1, k2: 0}. The separation classifier (plan lines 1178-1186) then sees
`a.firsts !== b.firsts` → tier `judge_firsts` → `anySeparation = true` → the tie is RESOLVED
(k1 rank 1, k2 rank 2) instead of being reported unresolved.

- Test 4 expects `unresolvedTies.length === 1` and all ranks 1 → fails (0 unresolved).
- Test 6 (same data + manualTieBreaks orderedIds [k2, k1]): the group comparator checks
  `firsts` BEFORE `manualRank` (plan lines 1169-1170), so k1 wins by "judge_firsts",
  k2 gets rank 2. Test expects k2 rank 1 with `tieResolvedBy === "manual"` → fails.

### Failure 2 — "judge firsts resolve ties before manual breaks" (NOT fixable by implementation)

The appended j2 scores (k1: cr1=9, cr2=7; k2: cr1=7, cr2=9) produce, under Task 5's committed
math: k1 roundScore = 51 + 30 = **81**, k2 = 45 + 34 = **79**. Not equal → the tie grouping
(plan line 1153, exact `roundScore` equality) never forms a group → no cascade runs →
`tieResolvedBy === "none"` for both. Expected `"judge_firsts"`.

Additionally, both judges' raw per-judge totals are identical (j1: 16 vs 16, j2: 16 vs 16),
so even a corrected `judgeFirsts` that awards no first on exact ties could not separate this
pair. **No implementation that (a) groups ties by exact roundScore equality per the plan and
(b) derives judge firsts from per-judge raw totals can ever make this test pass — the test
data contradicts its stated purpose.** Constructing a valid judge-firsts case requires e.g.
3+ judges where roundScores tie but a majority of judges strictly prefer one contestant.

### What a semantic fix would and would not accomplish

Changing `judgeFirsts` to award a first only when a judge's totals strictly differ (no first
on exact per-judge ties) fixes tests 4 and 6 by analysis (firsts 0/0 → test 4 falls through
to unresolved; test 6 falls through to manualRank → k2 first, "manual"). Test 5 still fails
('none' ≠ 'judge_firsts') because its data never creates a roundScore tie. Test 5's data or
expectation must change at the plan level — this requires a plan decision, hence BLOCKED
rather than an unauthorized deviation from the verbatim code blocks.

## Deviations

- None from the plan's code. One procedural deviation: per "If a plan step's expected result
  mismatches, STOP", I stopped after Step 4 and **reverted both files to the committed Task 5
  state** (`git checkout --` on exactly those two paths) so the shared workspace and the
  controller's central commit gate remain green. Sibling agents' uncommitted files were not
  touched.

## Concerns

1. Test 5's fixture data cannot exercise the judge_firsts tier under any consistent
   implementation; it needs redesign (e.g., 3 judges, 2 preferring one contestant by raw
   total while weighted roundScores tie) or removal.
2. The judgeFirsts equal-total behavior (award first to lowest id) silently resolves
   genuine dead-heats as "judge_firsts", which also masks manual tie breaks (test 6). The
   plan author should decide intended semantics: no-first-on-tie is required for tests 4
   and 6 to pass.
3. Downstream tasks (7+: roundCompute.ts, publish/review flows) consume
   `computeRoundStandings` and its `tieResolvedBy`/`unresolvedTies` contract — Task 6's
   resolution will ripple; recommend resolving before dispatching dependents.
4. `separatedBy` assigns a single tier label to the whole group even when different adjacent
   pairs separated at different tiers (e.g., pair 1 by cascade, pair 2 by manual → all
   labeled by the LAST pair's tier). Not covered by tests; flagging for the plan author.

## Resolution (re-application, controller-adjudicated)

Controller adjudications (design spec section 5, tie cascade step b) applied on top of the
plan's verbatim Task 6 blocks. TDD order followed: tests appended first, implementation second.

### Change 1 � judgeFirsts strict-first semantics (adjudication 1)

`convex/lib/tabulation.ts` `judgeFirsts`: replaced the plan's running-best loop (which awarded
a first to the id-first contestant on exact per-judge total ties) with: per judge, compute the
best total across the tied group (max for winner "highest", min for "lowest"), then award the
first ONLY if exactly one contestant holds that best total. Exact per-judge-total ties award no
first to anyone. Winner-direction handling and id-sorted iteration (determinism) preserved.

### Change 2 � test 5 data replacement (adjudication 2)

`convex-test/tabulationCore.test.ts` "judge firsts resolve ties before manual breaks": replaced
the 2-judge appended scores (which could never form a roundScore tie) with the controller's
verified 3-judge construction (k1: j1/j2 (10,0), j3 (0,0); k2: j1/j2 (5,0), j3 (10,0)). Both
roundScores equal 40.0 (avg cr1 = 20/3 both, cr2 = 0 both); per-judge totals give firsts
k1=2, k2=1. Assertions unchanged: unresolvedTies empty, k1 rank 1, tieResolvedBy
"judge_firsts". Fixture extended inline via `input.scores` replacement for this test only.

### Verification (only permitted command: `npx vitest run convex-test/tabulationCore.test.ts`)

1. After tests only (RED): `8 failed | 7 passed (15)` � all `TypeError: computeRoundStandings
   is not a function`. Matches plan Step 2.
2. After implementation (GREEN): `15 passed (15)`. Tests 4 and 6 pass via the adjudicated
   semantics exactly as the report predicted (firsts 0-0 -> test 4 unresolved; test 6 falls
   through to manualRank).

### Deviations from plan code

- judgeFirsts award loop (adjudication 1) � see Change 1.
- Test 5 score data (adjudication 2) � see Change 2. Test name and assertions kept verbatim.
- No other deviations. The plan's mid-file `import { computeRoundStandings }` statement in the
  test block was kept verbatim (valid ESM, hoisted); noted for the eventual lint pass.

### Self-review notes

- Concern 4 from the original report (whole-group `separatedBy` labels by the LAST separated
  pair's tier) remains present in the verbatim plan code; outside the adjudications' scope and
  untested, left as-is and still flagged for the plan author.
- No sibling-agent files touched; no commit made.
