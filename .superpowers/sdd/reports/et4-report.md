# Task 4 Report — Permissions & role wiring

## Status

DONE

## Files Changed

1. `convex-test/permissions3.test.ts` (new) — written verbatim from plan Task 4 Step 1.
2. `convex/lib/constants.ts` (modified):
   - Appended `score.enter`, `score.manage`, `result.view` to `SYSTEM_PERMISSIONS` (verbatim from plan Step 3).
   - Replaced `ROLE_PERMISSIONS` with the plan's exact block: Org Owner / Org Admin / Event Admin / Tabulator gain `score.manage` + `result.view`; Judge gains `score.enter` + `result.view`; Staff / Viewer gain `result.view`. All pre-existing role permissions preserved unchanged (widen-only).

## TDD Sequence

1. Wrote failing test `convex-test/permissions3.test.ts`.
2. Ran `npx vitest run convex-test/permissions3.test.ts` → FAIL as expected:
   `AssertionError: expected [] to deeply equal [ 'result.view', 'score.manage' ]` (permissions absent).
3. Implemented `SYSTEM_PERMISSIONS` + `ROLE_PERMISSIONS` changes in `convex/lib/constants.ts`.
4. Ran `npx vitest run convex-test/permissions3.test.ts` → PASS:
   `Test Files 1 passed (1)` / `Tests 1 passed (1)`.

## Verification Commands

- `npx vitest run convex-test/permissions3.test.ts` (only permitted command; run twice — fail then pass).
- Per task rules: typecheck/lint/build/full test suite/codegen NOT run; no git commit/push.

## Preconditions Verified

- `convex-test/setup.ts` exports `aliceIdentity`, `seedAndProvision`, `setupTest` as the test imports.
- `convex-test` harness supports `t.run(async (q) => ...)` (existing usage in lifecycle/members/reads/seed tests).
- `rolePermissions` table has `by_role_id` index (schema.ts:62); `convex/seed.ts` iterates `SYSTEM_PERMISSIONS` / `ROLE_PERMISSIONS` generically — no seed change needed, as the plan states.
- Pre-edit `constants.ts` matched the plan's assumed baseline exactly.

## Deviations

None. Code blocks were applied verbatim; no comments or emojis added.

## Concerns

None. Working tree contains unrelated modified/untracked files from concurrent sibling agents (e.g. `convex/lib/tabulation.ts`, `convex-test/tabulationCore.test.ts`, `vitest.config.ts`, `app/globals.css`); none were touched by this task.
