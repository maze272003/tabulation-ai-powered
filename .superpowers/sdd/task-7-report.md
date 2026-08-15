# Task 7 Report: Contestants (Phase 2 — Competition Config Engine)

**Status:** DONE
**Commit:** `adb1d6e` — `feat: contestants with number uniqueness and plan limits`
**Branch:** `phase2-competition-config`

## Files

- Created `convex/contestants.ts` (verbatim from brief)
- Created `convex-test/contestants.test.ts` (verbatim from brief)
- Regenerated `convex/_generated/api.d.ts` via `npx convex codegen` (+2 lines, contestants module) — included in the commit per repo convention

## TDD Evidence

### Step 2 — RED (`npm test` after writing tests only)

```
 FAIL  convex-test/contestants.test.ts > contestants > adds contestants with unique numbers and lists them
 FAIL  convex-test/contestants.test.ts > contestants > enforces maxContestants (Free = 20)
 FAIL  convex-test/contestants.test.ts > contestants > updates status and removes with usage decrement round-trip
Error: Could not find module for: "contestants"

 Test Files  1 failed | 9 passed (10)
      Tests  3 failed | 44 passed (47)
```

All 3 new tests failed on the missing `contestants` module; the prior 44 tests passed. RED confirmed.

### Step 4 — GREEN (after implementing `convex/contestants.ts` + `npx convex codegen`)

```
 Test Files  10 passed (10)
      Tests  47 passed (47)
```

### Typecheck gate

```
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm notice run tabulation-ai-powered@0.1.0 typecheck
npm notice run tabulation-ai-powered@0.1.0 tsc --noEmit
TYPECHECK_EXIT=0
```

## Interface Verification (pre-implementation)

- `requireDraftEvent(ctx, { orgSlug, eventSlug, permission })` — returns `EventAuthCtx` with `user`, `org`, `subscription`, `event`; throws CONFLICT when event is not draft. Confirmed in `convex/lib/eventAuthz.ts`.
- `requireEventMember` — used by `list`. Confirmed.
- `requireLimit(ctx, sub, "contestants")` — maps resource `contestants` → plan limit `maxContestants` (Free = 20 in `convex/lib/constants.ts:49`); throws LIMIT_EXCEEDED. Confirmed.
- `incrementUsage(ctx, orgId, "contestants", ±1)` — confirmed in `convex/lib/usage.ts`.
- `writeAudit` — `resourceId: string` accepts branded `Id<"contestants">`; `before`/`after` are `unknown`. Confirmed.
- `contestant.manage` permission exists (`constants.ts:27`) and is granted to Org Owner/Admin, Event Admin, and Staff roles; Alice (org creator → Org Owner) passes. Confirmed.
- `PatchValue<Doc<"contestants">` accepts `Record<string, unknown>` (index-signature source vs all-optional target; same pattern as `events.ts` update, which typechecks). Verified against `convex/src/server/database.ts:477`.

## Self-Review Checklist

- [x] Endpoints `add`/`list`/`update`/`remove` match the brief verbatim (both files copied character-for-character; no modifications needed)
- [x] Number unique per event via `by_event_id_and_number` `.unique()` → CONFLICT on duplicate (test 1)
- [x] Positive-integer validation: `Number.isInteger(number) && number >= 1` else VALIDATION_ERROR
- [x] Category verified against event (NOT_FOUND on foreign/missing category) in both `add` and `update`; defaults to event's first category in `add`
- [x] Update verifies contestant ownership (`c.eventId !== eactx.event._id` → NOT_FOUND) and category before patch
- [x] Remove hard-deletes and decrements usage (`incrementUsage(..., -1)`); round-trip proven by test 3 (re-add succeeds after remove under Free limit)
- [x] maxContestants enforced in `add` (test 2: 20 succeed, 21st → LIMIT_EXCEEDED)
- [x] Object-form function syntax; validators on all 4 functions
- [x] No `any` / `as never` (only `Record<string, unknown>`, per brief verbatim)
- [x] No code comments
- [x] One commit containing exactly `convex/contestants.ts`, `convex-test/contestants.test.ts`, `convex/_generated/api.d.ts`

## Deviations from Brief

None. The brief's verbatim code compiled and passed the full gate unchanged (unlike Tasks 2/4, no latent bugs found).

## Gates

- `npm test`: 47/47 pass
- `npm run typecheck` (after clearing `tsconfig.tsbuildinfo`): exit 0
