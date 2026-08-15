# Task 6 Report: Criteria

## Status: DONE

## Summary

Implemented `convex/criteria.ts` (`api.criteria.{add,update,remove}`) and appended a `describe("criteria")` block with 2 tests to `convex-test/config.test.ts`, following strict TDD (RED → implement → GREEN). Edit-time validation enforces `weight` integer 1–100, `minScore < maxScore`, `decimalPrecision` integer 0–4, and a cross-event IDOR guard (round must belong to the resolved event → NOT_FOUND). Weight-sum-to-100 is deferred to publish (Task 10), per brief.

## TDD Evidence

### Step 1 — Tests appended (with NOTE correction)

Appended the brief's `describe("criteria")` block to `convex-test/config.test.ts`. Per the brief's NOTE, the flawed line:

```ts
await t.withIdentity(aliceIdentity).mutation(api.organizations.changePlanGuard ?? api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" } as never).catch(() => {});
```

was replaced with the corrected version, placed immediately after `createOrgAndEvent`:

```ts
await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
```

(`.catch(() => {})` and `as never` dropped; `api.subscriptions.changePlan` exists in Phase 1; Alice as Org Owner holds `subscription.manage`; "Pro" plan is seeded via `api.seed.seedReferenceData`.)

### Step 2 — RED (`npm test`)

```
 ❯ convex-test/config.test.ts (5 tests | 2 failed) 1477ms
     × adds criteria and validates ranges and weight bounds 120ms
     × refuses criteria for a round belonging to a different event (IDOR) 243ms

      Test Files  1 failed | 8 passed (9)
           Tests  2 failed | 42 passed (44)

 Error: Could not find module for: "criteria"
```

Exactly the expected RED: `api.criteria` undefined, prior 42 tests pass.

### Step 3 — Implementation

`convex/criteria.ts` written verbatim from the brief (zero deviations):
- `validateCriterion` helper: weight integer 1–100, minScore < maxScore, decimalPrecision integer 0–4 → `VALIDATION_ERROR`.
- `requireRoundOfEvent` helper: round missing OR `round.eventId !== eventId` → `NOT_FOUND` (cross-event IDOR guard).
- `add`: `requireDraftEvent(..., "event.update")` → `requireRoundOfEvent` → validate → insert with `order: existing.length` (via `by_round_id` index) → audit `criterion.added`.
- `update`: `requireDraftEvent` → fetch criterion (NOT_FOUND if missing) → `requireRoundOfEvent(criterion.roundId, ...)` → merge `args ?? existing` into `next` → `validateCriterion(next)` on MERGED values → patch only provided fields → no-op return when patch empty → audit `criterion.updated`.
- `remove`: `requireDraftEvent` → fetch criterion → `requireRoundOfEvent` → delete → audit `criterion.removed`.

### Step 4 — GREEN + gate

`npm test`:

```
 Test Files  9 passed (9)
      Tests  44 passed (44)
```

`npx convex codegen` — regenerated `convex/_generated/api.d.ts` (+2 lines: `import type * as criteria from "../criteria.js";` and `criteria: typeof criteria;`), included in commit per repo convention.

```
Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck  → exit 0
```

## Commit

- `6f9a242` — `feat: criteria with range validation and cross-event IDOR guard`
  - `convex/criteria.ts` (new, 103 lines)
  - `convex-test/config.test.ts` (+38 lines, tests only appended)
  - `convex/_generated/api.d.ts` (+2 lines, codegen)

Single commit; pre-existing dirty files (`.gitignore`, `.superpowers/sdd/*`) were left untouched and unstaged.

## Self-Review Checklist

- [x] Endpoints match the brief verbatim (`add`, `update`, `remove`; object-form syntax; validators on every function).
- [x] `update` validates MERGED values (`args.weight ?? criterion.weight`, etc.) — a partial update that would produce an invalid combination is rejected.
- [x] `remove` (and `update`) check round ownership via `requireRoundOfEvent` — cross-event criterion ID yields NOT_FOUND.
- [x] No code comments in `convex/criteria.ts` (verified `git show HEAD:convex/criteria.ts` contains no `//`).
- [x] No `any`, no `as never`, no `.catch(() => {})` in tests.
- [x] Weight-sum-to-100 NOT enforced here (Task 10, publish-time).
- [x] 44/44 tests pass; typecheck exit 0.

## Deviations from Brief

None in `convex/criteria.ts`. One intentional test edit, which the brief itself mandates (the NOTE): replaced the flawed `changePlanGuard ?? ...` line with the corrected `api.subscriptions.changePlan` call as specified.
