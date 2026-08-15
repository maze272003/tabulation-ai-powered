# Task 9 Report: Readiness checklist

**Status:** DONE
**Commit:** `c724a36` — `feat: readiness checklist query` (branch `phase2-competition-config`)

## What was implemented

Appended to `convex/events.ts` (verbatim from the brief):

- Extended type imports at top: `import type { Doc, Id } from "./_generated/dataModel";` and `import type { QueryCtx } from "./_generated/server";` (existing value import `import { mutation, query } from "./_generated/server";` kept as-is).
- `export type ReadinessCheck = { item: string; passed: boolean; detail: string };`
- `export async function computeReadiness(ctx: QueryCtx, eventId: Id<"events">): Promise<ReadinessCheck[]>` — Task 10 will import this from `./events`.
- `export const readiness = query({ args: { orgSlug: v.string(), eventSlug: v.string() }, ... })` — guarded by `requireEventMember`.

Appended `describe("readiness")` block with the brief's 2 tests to `convex-test/config.test.ts`.

## TDD evidence

### Step 1-2: RED (`npm test` after appending tests, before implementation)

```
 ❯ convex-test/config.test.ts (7 tests | 2 failed) 1760ms
     × fails an empty event with specific items 69ms
     × flags weights that do not sum to 100 123ms

 Test Files  1 failed | 10 passed (11)
      Tests  2 failed | 50 passed (52)

Error: Expected a Convex function exported from module "events" as `readiness`, but there is no such export.
```

Exactly the expected RED: `api.events.readiness` undefined; the prior 50 tests passed.

### Step 3-4: GREEN (`npm test` after implementing)

```
 Test Files  11 passed (11)
      Tests  52 passed (52)
   Duration  4.63s
```

52/52 as expected.

## Gate results

| Gate | Result |
|---|---|
| `npm test` | 52/52 passed (11 files) |
| `Remove-Item tsconfig.tsbuildinfo; npm run typecheck` | exit 0 |
| `npx convex codegen` | exit 0 |

### api.d.ts note (no deviation)

`npx convex codegen` ran successfully but produced **no diff** to `convex/_generated/api.d.ts`. This is expected: the generated file uses the module-passthrough form (`import type * as events from "../events.js"; ... events: typeof events;`), so `api.events.readiness` is typed automatically via `typeof events` without enumerating individual functions. The file is tracked, not ignored, and already current — I staged it in the commit per repo convention (`git add convex/events.ts convex-test/config.test.ts convex/_generated/api.d.ts`); git recorded 2 files changed since api.d.ts was byte-identical. No manual edits were made to generated files.

## Self-review

- 7 check items with exact ids, in order: `rounds.exist`, `rounds.criteria`, `rounds.weights`, `criteria.ranges`, `categories.exist`, `contestants.exist`, `judges.exist` — verified in `computeReadiness` return array.
- `judges.exist` requires judges WITH assignments: `judges.filter((j) => assignments.some((a) => a.judgeId === j._id))` — a judge row without a matching `judgeAssignments` row does not satisfy the check.
- `contestants.exist` counts ACTIVE only: `contestants.filter((c) => c.status === "active")` — scratched/disqualified contestants excluded.
- `categories.exist` passes on a fresh event because `events.create` seeds an "Open" category (test 1 asserts `not.toContain("categories.exist")`).
- Schema/index cross-check before implementing: `by_event_id` on `rounds`, `categories`, `contestants`, `judges`, `judgeAssignments`; `by_round_id` on `criteria`; fields `weight`/`minScore`/`maxScore` (criteria), `status` (contestants), `judgeId` (judgeAssignments) — all match schema.ts.

## Constraints compliance

- Object-form function syntax: yes (`query({ args, handler })`).
- Validators on every function: yes (`v.string()` for `orgSlug`, `eventSlug`).
- No `Date.now()` in queries: yes.
- No `any` / `as never`: yes.
- No code comments: yes (appended code is comment-free).
- One commit: yes — `c724a36` contains exactly `convex/events.ts` + `convex-test/config.test.ts` (72 insertions, 1 deletion — the 1 deletion is the extended import line).
- Brief's code used verbatim; zero TypeScript/Convex failures; no deviations.

## Concerns

None.
