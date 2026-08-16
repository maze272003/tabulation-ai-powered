# Task 3 Report — Readiness & lifecycle gating

## STATUS: RESOLVED (controller adjudicated Option A; all 9 tests green)

## Controller adjudication fix (applied)

Per controller decision, `bad advancement config fails readiness` was fixed as a TEST-ONLY change (Option A from below), leaving Task 2's `validateAdvancement` write-path validation intact. The public `rounds.add` seeding (rejected with `VALIDATION_ERROR` before readiness could run) was replaced with a direct DB patch, exactly matching the pattern the adjacent reopen tests in the same file use for forcing sheet/round states:

```ts
await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
await t.run(async (q) => {
  const rounds = await q.db.query("rounds").collect();
  await q.db.patch(rounds[0]._id, { advancement: { mode: "top_percent", percent: 150, allowOverride: true } });
});
```

Assertion unchanged (`rounds.advancement` readiness item fails). Files touched: `convex-test/phase3Schema.test.ts` only.

Verification (only command run, per rules): `npx vitest run convex-test/phase3Schema.test.ts` — `Test Files 1 passed (1)`, `Tests 9 passed (9)`. No typecheck/lint/build/full-suite run. No commit.

## Original blocking issue (historical, resolved by the fix above)

## Files changed

1. `convex/events.ts` — `computeReadiness`: added `weightSum` / `badAdvancement` computations after the `badRanges` line and appended the `rounds.weightsSum` and `rounds.advancement` checks to the returned array. Verbatim per plan lines 577-591.
2. `convex/eventLifecycle.ts` —
   - `reopen`: added rounds guard (`status !== "open"` → `CONFLICT "Round scoring has started"`) after the status guard, and sheets guard (`submitted`/`locked` → `CONFLICT "Scores have been submitted"`) after the sheets query. Verbatim per plan lines 596-611.
   - `archive`: status guard now accepts `ready` and `finalized`; audit `before` uses `eactx.event.status`. Verbatim per plan lines 616-621.
3. `convex-test/phase3Schema.test.ts` — appended `configureMinimalEvent` helper (copy of `configureValidEvent` from `convex-test/lifecycle.test.ts:5-21`, with the inline dynamic import replaced by a top-level `bobIdentity` import exactly as instructed by plan line 569) and the `describe("readiness & lifecycle gating")` block with 4 tests, verbatim per plan lines 515-566.

No other files touched. No comments. No emojis. No commit (controller commits centrally).

## Test commands and output

Command (only verification run, per rules):

```
npx vitest run convex-test/phase3Schema.test.ts
```

- TDD Step 2 (before implementation): `Tests 4 failed | 5 passed (9)` — the 4 new tests failed as expected.
- TDD Step 4 (after implementation): `Tests 1 failed | 8 passed (9)`.

Per-test results after implementation:

| Test | Result |
|---|---|
| multi-round weights must sum to 100 | PASS |
| bad advancement config fails readiness | **FAIL** → PASS after adjudicated test-only fix |
| reopen is blocked once a sheet is submitted | PASS |
| reopen is blocked once a round is closed | PASS |
| (5 pre-existing Task 2 tests) | PASS |

## Blocking issue (specifics)

`bad advancement config fails readiness` (plan lines 528-537) seeds invalid config via the public mutation:

```ts
await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
  orgSlug: "acme", eventSlug: "gala", name: "R",
  advancement: { mode: "top_percent", percent: 150, allowOverride: true },
});
```

But Task 2 (committed, and mandated by this same plan at lines 415-425) made `rounds.add` call `validateAdvancement`, which rejects `percent: 150` with `VALIDATION_ERROR` (`convex/rounds.ts:33`, `:18-20`). Empirically confirmed — the test fails with:

```
ConvexError: top_percent advancement requires percent 1-100
```

The rejection happens at the `rounds.add` call itself; the test never reaches `events.readiness`. The invalid state is unreachable through the public API, so the test cannot pass without changing code outside this task's allowed files or deviating from the plan's verbatim test code. Per task rules ("plan step's expected result mismatches → STOP and report BLOCKED"), I made no unauthorized workaround.

The readiness `rounds.advancement` check itself is implemented and correct — it is a backstop for pre-existing/direct-DB data (consistent with the plan's dev-data note), which is exactly why the test cannot drive it through `rounds.add`.

### Suggested resolutions for the controller (one-line decision)

- Option A (recommended, test-only change): seed the bad config via direct DB patch — the same pattern the plan's adjacent reopen tests use:
  ```ts
  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
  await t.run(async (q) => {
    const rounds = await q.db.query("rounds").collect();
    await q.db.patch(rounds[0]._id, { advancement: { mode: "top_percent", percent: 150, allowOverride: true } });
  });
  ```
- Option B: relax `validateAdvancement` in `convex/rounds.ts` for `add` only — NOT recommended: contradicts plan Task 2 spec and weakens write-path validation.

## Deviations

- None to implementation code — all plan code applied verbatim.
- Test file: the plan's `configureMinimalEvent` contained `const { bobIdentity } = await import("./setup");`; replaced with a top-level import per the plan's own instruction at line 569. This is the only test-file modification beyond verbatim.

## Concerns

1. The blocking issue above — needs controller decision (Option A is a 3-line test change; everything else is done and green).
2. `rounds.weightsSum` readiness now gates `eventLifecycle.publish` (publish runs `computeReadiness` and fails on any unpassed check). Existing `lifecycle.test.ts` events use a single round defaulting to weight 100, so they remain green (verified indirectly: all 5 pre-existing tests in the run file pass; full-suite run is outside this task's allowed verification).
3. Untouched sibling-shared surfaces: schema, rounds.ts, templates.ts — not modified, as required.
