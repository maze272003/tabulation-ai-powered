# Task 6 Report — Error model & serializers

**Status:** DONE_WITH_CONCERNS
**Commit:** `90853c9` — `feat: typed error model and JSON serializers`
**Branch:** `phase1-foundation`

## Summary

`npm test: 6/6 pass; npm run typecheck: clean (exit 0)`. TDD RED → GREEN evidence below.

## Deliverables

- `convex/lib/errors.ts` — `ErrorCode` union + `appError()` factory returning a typed `ConvexError<AppErrorData>`.
- `convex/lib/serializers.ts` — `serialize()` / `deserialize()` JSON helpers.
- `convex-test/errors.test.ts` — verbatim from the brief.

## TDD evidence

### RED (Step 2) — modules did not exist yet

Command: `npm test`

```
 ❯ convex-test/errors.test.ts (0 test)
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 Test Files  1 failed | 1 passed (2)
      Tests  2 passed (2)

 FAIL  convex-test/errors.test.ts
Error: Cannot find module '../convex/lib/errors' imported from
C:/Users/USER/Documents/data/convex/tabulation-ai-powered/convex-test/errors.test.ts
```

### Implementation iteration (informational)

The brief's reference `errors.ts` was used first as-is. Two real issues surfaced, both caught by the test/typecheck loop — exactly what TDD is for:

1. **`err.message` was the JSON-stringified data, not the `message` field.** Verified against the installed `convex@1.43.0` source:
   ```js
   // node_modules/convex/dist/cjs/values/errors.js
   constructor(data) {
     super(typeof data === "string" ? data : stringifyValueForError(data));
     this.data = data;
   }
   ```
   So `new ConvexError({code,message,context})` produces `err.message === '{"code":"FORBIDDEN","message":"no access"}'`, **not** `"no access"` — which fails the brief's assertion `expect(err.message).toBe("no access")`.
   **Fix:** set `err.message = message` after construction (Error's `message` field is writable; `.data` is set independently by the constructor so this is safe).

2. **`ConvexError<AppErrorData>` fails the `TData extends Value` constraint.** `AppErrorData.context: Record<string, unknown>` is wider than Convex's `Value` (`unknown` is not assignable to `Value | undefined`). The brief's caveat #1 suggested "drop the explicit generic," but typecheck showed the constraint is *also* checked on the inferred argument type — so dropping the generic alone did not work:
   ```
   convex/lib/errors.ts(27,31): error TS2345: Argument of type
   '{ code: ErrorCode; message: string; context: Record<string, unknown> | undefined; }'
   is not assignable to parameter of type 'Value'.
   ```
   **Fix:** narrowed `context?: Record<string, Value>` (importing `Value` from `convex/values`). This is semantically honest — error data crosses the Convex wire and must be serializable. All call sites that pass JSON-friendly context (`{ resource: "members" }`, etc.) are unaffected.

### GREEN (Step 5) — after both fixes

Command: `npm test`

```
 Test Files  2 passed (2)
      Tests  6 passed (6)
   Duration  1.95s
```

Command: `npm run typecheck` (after deleting `tsconfig.tsbuildinfo`)

```
npm notice run tabulation-ai-powered@0.1.0 typecheck
npm notice run tsc --noEmit
---EXIT: 0---
```

Command: `npm run lint`

```
✖ 3 problems (0 errors, 3 warnings)
```
(all warnings: the brief's prescribed-but-unused `ErrorCode` import in the test, plus 2 pre-existing unused-`eslint-disable` lines in `convex/betterAuth/_generated/*` — not introduced here.)

## Self-review

- **Tests verify real behavior.** Beyond shape checks, the `err.message === "no access"` assertion pins down the override fix; the `serialize(undefined) === "null"` assertion pins down the `?? null` coercion.
- **`ErrorCode` union:** 8 codes (UNAUTHENTICATED, PROFILE_NOT_PROVISIONED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, LIMIT_EXCEEDED, FEATURE_UNAVAILABLE, CONFLICT) — complete for the Phase-1 schema surface (auth, profiles, RBAC, invitations, plans, usage, auditLogs). Add INTERNAL_ERROR / RATE_LIMITED later if needed.
- **`serialize` robustness:** handles `null`/`undefined`/plain objects. Does **not** guard against `bigint` (throws `TypeError`) or circular structures (throws) — both can occur if audit callers pass Convex Int64 fields or self-referential structures. Acceptable for the stated "audit diffs of JSON-shaped values" use case; flagged below.

## Concerns

1. **Brief deviation (necessary):** `appError`'s `context` parameter and `AppErrorData.context` are typed `Record<string, Value>` rather than `Record<string, unknown>`. Required to satisfy the `ConvexError<TData extends Value>` constraint. Downstream callers must pass Convex-serializable context (strings/numbers/booleans/arrays/plain objects) — which is the correct contract for data that crosses the wire in a thrown error.
2. **Brief deviation (necessary):** `appError` sets `err.message = message` after `new ConvexError(...)`. Required to satisfy the brief's own test assertion `expect(err.message).toBe("no access")`.
3. **`serialize` is not BigInt/circular-safe.** If a later task serializes Convex Int64 fields or recursive structures for audit `before`/`after`, this will throw. Add a replacer or pre-stringify sanitization at that point.
4. **`deserialize` is exported but not directly tested.** The brief's test suite only exercises `serialize`. Coverage gap; trivial to add a round-trip test in a later task if desired.
5. The `ErrorCode` import in `errors.test.ts` is unused (lint warning). Kept verbatim from the brief; serves as a weak "is-exported" check.

## Files changed

```
convex/lib/errors.ts         | 31 +++++++++++++++++++++++++++++++
convex/lib/serializers.ts    |  8 ++++++++
convex-test/errors.test.ts   | 25 +++++++++++++++++++++++++
3 files changed, 64 insertions(+)
```
