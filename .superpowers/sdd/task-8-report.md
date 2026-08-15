# Task 8 Report: Judges and assignments

**Status:** DONE_WITH_CONCERNS (one minor, flagged test-helper deviation; implementation is verbatim from the brief)

**Commit:** `f9c9d9a` — `feat: judges and scoped assignments with IDOR guards`
Files: `convex/judges.ts` (new), `convex-test/judges.test.ts` (new), `convex/_generated/api.d.ts` (regenerated via `npx convex codegen`, repo convention).

## TDD Evidence

### RED (after writing tests, before implementation)

```
 Test Files  1 failed | 10 passed (11)
      Tests  3 failed | 47 passed (50)
...
- Error {
-   "message": "Could not find module for: \"judges\"",
```
All 3 new tests failed on `api.judges` being undefined (module not found); prior 47 tests passed — exact expected RED state.

### First GREEN attempt — flaw found in brief's test helper

With the brief-verbatim `judges.ts`, 2 of 3 new tests still failed:

```
 FAIL  convex-test/judges.test.ts > judges > adds a judge from org members, unique per event
 FAIL  convex-test/judges.test.ts > judges > adds and removes scoped assignments; IDOR on foreign judge
 ConvexError: Profile not provisioned
   ❯ addBobAsJudgeMember convex-test/judges.test.ts:7:19
```

**Root cause:** the brief's `addBobAsJudgeMember` helper has Bob call `api.invitations.listForUser` without a provisioned `userProfiles` row; that query requires a profile (throws `PROFILE_NOT_PROVISIONED`). The repo's own established pattern (convex-test/members.test.ts:85-86) provisions Bob via `seedAndProvision(t, bobIdentity)` before any Bob-side call. The brief's Task 7-era helper apparently assumed provisioning happened implicitly.

**Minimal fix (test-only):** added one line at the top of `addBobAsJudgeMember`:

```ts
await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
```

No implementation changes were needed; `convex/judges.ts` is byte-for-byte the brief's Step 3 code.

### GREEN (final)

```
 Test Files  11 passed (11)
      Tests  50 passed (50)
```

## Gate

- `npm test`: **50/50 passed** (11 files)
- `Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck`: **exit 0**
- `npx convex codegen`: regenerated `api.d.ts` (included in commit)

## Brief compliance

- Second test uses the NOTE-mandated corrected version verbatim (`ensureUserProfile` → non-member `VALIDATION_ERROR`); flawed `listAnyUserId` block and `api.events.update` filler line dropped, as instructed.
- `judges.ts` verbatim from brief: `add` (ACTIVE membership check via `by_org_id_and_user_id` → VALIDATION_ERROR; per-event uniqueness via `by_event_id_and_user_id` → CONFLICT; `requireLimit(ctx, sub, "judges")`; `incrementUsage` +1; audit), `remove` (deletes assignments via `by_judge_id` first, deletes judge, usage -1, audit), `listWithAssignments` (`requireEventMember`; joins `user: {name,email,image}` + `assignments[]`), `addAssignment` (verifies judge + optional round/category against event, criterion via its round), `removeAssignment` (verifies `assignment.eventId`).
- Object-form function syntax; validators on every function; no `any`/`as never`; no comments; one commit.
- Mutations use `requireDraftEvent(..., "judge.manage")`; list uses `requireEventMember` — matches verified interfaces.

## Deviation (flagged)

1. **Test helper fix** (described above): one added provisioning line in `addBobAsJudgeMember`. Genuine runtime failure of the brief's verbatim test code; fixed minimally, full gate re-run green. Implementation untouched.
