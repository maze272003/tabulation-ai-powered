# Task 4 Report: Events CRUD (Phase 2 — Competition Config Engine)

**Status:** DONE_WITH_CONCERNS (one minimal, flagged deviation from the brief's verbatim code — see Deviation 1)
**Commit:** `27a82e3` — `feat: events create/get/listByOrg/update with limits and audit`
**Branch:** `phase2-competition-config`

## Files

- **Created** `convex/events.ts` — `create` / `get` / `listByOrg` / `update` mutations & queries
- **Created** `convex-test/events.test.ts` — 7 tests, verbatim from the brief
- **Modified** `convex-test/setup.ts` — appended `createOrgAndEvent` (existing exports untouched, verbatim from brief)
- **Modified** `convex/_generated/api.d.ts` — regenerated via `npx convex codegen` (see Deviation 2)

## TDD Evidence

### Step 2 — RED (`npm test` after writing only the test file)

```
 ❯ convex-test/events.test.ts (7 tests | 7 failed) 1275ms
     × creates an event in draft with default settings 447ms
     × rejects duplicate slug within the org with CONFLICT 217ms
     × refuses event.create for a Viewer member 211ms
     × get returns null for a non-member (cross-org) 102ms
     × enforces maxEvents limit (Free plan = 1) 88ms
     × updates name while draft 109ms
     × eventAuthz: unknown slug NOT_FOUND; non-member get null 93ms
 Test Files  1 failed | 7 passed (8)
      Tests  7 failed | 32 passed (39)
```

All 7 failures were `Error: Could not find module for: "events"` (i.e. `api.events` undefined), and the prior 32 tests passed — exactly the RED state the brief predicted.

### Intermediate — first GREEN attempt after implementing brief-verbatim code

```
 ❯ convex-test/events.test.ts (7 tests | 1 failed) 1262ms
     × rejects duplicate slug within the org with CONFLICT 220ms
 Test Files  1 failed | 7 passed (8)
      Tests  1 failed | 38 passed (39)
```

Failure detail: `expected ConvexError: Limit reached: events ... "code": "LIMIT_EXCEEDED"` — this exposed the latent ordering bug in the brief's verbatim `create` (Deviation 1 below).

### Step 5 — GREEN (after the minimal fix)

```
 Test Files  8 passed (8)
      Tests  39 passed (39)
   Start at  23:27:34
```

Final gate re-run (post-codegen, both in one shell):

```
 Test Files  8 passed (8)
      Tests  39 passed (39)
TEST_EXIT=0
... (Remove-Item tsconfig.tsbuildinfo; npm run typecheck → no output)
TSC_EXIT=0
```

- `npm test`: **39/39 passed**, exit 0
- `Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck`: **exit 0**, no errors

## Deviations from the brief (flagged, minimal)

### Deviation 1 (required — brief's verbatim code could not pass its own tests)

`convex/events.ts` `create`: the brief ordered the checks as `requirePermission → requireLimit → slugify → duplicate-slug check`. With the Free plan's `maxEvents = 1` (the same fact the brief's own limit test asserts), any *second* event creation in an org — including a duplicate-slug attempt — trips `LIMIT_EXCEEDED` before the duplicate check ever runs. The brief's verbatim test "rejects duplicate slug within the org with CONFLICT" is therefore unpassable with the brief's verbatim implementation (observed: 38/39, that test failing with `LIMIT_EXCEEDED`).

**Minimal fix:** moved the duplicate-slug (`CONFLICT`) check before `requireLimit`. Net ordering: `requirePermission → slugify/validate → duplicate check → requireLimit → insert`. No other logic changed. Both affected tests pass:
- duplicate-slug test: `CONFLICT` (duplicate found before limit check)
- limit test: distinct slug `"two"` clears the duplicate check, then `requireLimit` throws `LIMIT_EXCEEDED` (usage=1, max=1)

### Deviation 2 (required — regenerated codegen committed alongside)

The brief's commit step lists only `convex/events.ts convex-test/events.test.ts convex-test/setup.ts`, but `npm run typecheck` failed with `TS2339: Property 'events' does not exist` (14 errors) until `npx convex codegen` regenerated `convex/_generated/api.d.ts`. The repo's own convention (commit `8462fd6`) commits regenerated `_generated/api.d.ts` with the functions that changed it; omitting it leaves a dirty tree and breaks typecheck on fresh checkout. I included it in the single commit. Everything else staged matched the brief exactly.

## Self-review checklist

- Endpoints match the brief verbatim (args validators, handlers, return types) — sole exception is Deviation 1's reordering, which preserves every error code and behavior except which code wins when both a duplicate slug and a limit would apply (CONFLICT now takes precedence, which the brief's own test demands).
- Tests are the brief's verbatim and genuinely assert behavior (draft status, precision default, error codes, null-on-non-member, rename round-trip).
- Constraints honored: object-form `{ args, handler }` syntax; validators on every function; identity always derived server-side (no `userId` auth arg); no `Date.now()` in queries; no `any` / `as never`; no code comments; exactly one commit.
- `createOrgAndEvent` appended after existing exports; existing exports (`setupTest`, `seedAndProvision`, `aliceIdentity`, `bobIdentity`) byte-identical to before.
- Pre-existing dirty files (`.gitignore`, `.superpowers/sdd/*`, `.graphify*`) were left untouched and uncommitted.
