# Task 13 — Remove test-only authz scaffolding

## Outcome

Removed the Task 7 scaffolding (`convex/__test__.ts` `whoAmI` wrapper + `convex-test/authz.test.ts`)
now that Task 10's `organizations.test.ts` covers the anonymous/UNAUTHENTICATED case against a real
endpoint.

## Changes

- Deleted `convex/__test__.ts` (temporary `whoAmI` query wrapping `requireIdentity`).
- Deleted `convex-test/authz.test.ts` (single weak `toThrow()` identity test).
- Regenerated `convex/_generated/api.d.ts` via `npx convex codegen` — drops the `__test__` module
  import/declaration.
- Left `convex-test/entitlements.test.ts` untouched (pure-function `hasFeature`/`hasLimit` tests).

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` (fresh, after deleting `tsconfig.tsbuildinfo`) | PASS (no errors) |
| `npm test` | PASS — 28/28 tests, 7 files |
| Code references to `api.__test__*` (`.ts` files) | None |
| UNAUTHENTICATED coverage | Present in `convex-test/organizations.test.ts:46` |

## Note

The regenerated `api.d.ts` also carried forward previously-uncommitted module additions
(`audit`, `plans`, `platform`, `roles`, `subscriptions`) from earlier tasks that had not been
re-committed; these are accurate reflections of the current `convex/` tree and were committed
together with the `__test__` removal.

## Commit

`8462fd6` — refactor: remove test-only authz scaffolding
