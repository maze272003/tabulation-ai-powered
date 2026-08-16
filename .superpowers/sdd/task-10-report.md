# Task 10 Report: Lifecycle — publish, reopen, archive

**Status:** DONE_WITH_CONCERNS (one minimal, flagged test fix — see Deviation)
**Commit:** `cc66eb3` — `feat: publish/reopen/archive lifecycle with sheet generation` (branch `phase2-competition-config`)
**Files:** `convex/eventLifecycle.ts` (new), `convex-test/lifecycle.test.ts` (new), `convex/_generated/api.d.ts` (regenerated via `npx convex codegen`, committed per repo convention)

## TDD Evidence

### Baseline (before any change)
```
Test Files  11 passed (11)
     Tests  52 passed (52)
```

### RED (after writing `convex-test/lifecycle.test.ts`, before implementation)
```
Test Files  1 failed | 11 passed (12)
     Tests  3 failed | 52 passed (55)
```
Failure detail: test 1 failed on `api.eventLifecycle.publish` being `undefined`; tests 2–3 cascaded inside `configureValidEvent` (see Deviation — the missing-bob-provisioning defect surfaced here too).

### GREEN (after implementing `convex/eventLifecycle.ts` + test fix)
```
Test Files  12 passed (12)
     Tests  55 passed (55)
```

## Deviation From Brief (flagged prominently)

**The brief's verbatim `configureValidEvent` is defective and cannot pass as written.** It calls `api.invitations.listForUser` with `bobIdentity` (test line 13), but bob's user profile is never provisioned — `createOrgAndEvent` only provisions the creator (alice), and `requireUserProfile` throws `PROFILE_NOT_PROVISIONED` (observed in RED output at `convex/invitations.ts:88`). This failure is independent of `eventLifecycle`; tests 2–3 would have failed even after a correct implementation.

**Minimal fix (one line, first line of `configureValidEvent`):**
```ts
await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
```
This matches the established repo convention exactly — `convex-test/judges.test.ts:6` does the identical call in the identical scenario. `convex/eventLifecycle.ts` itself was implemented 100% verbatim from the brief with zero changes.

## Full Gate

| Check | Result |
|---|---|
| `npm test` | 55/55 pass (12 files) |
| `Remove-Item tsconfig.tsbuildinfo` + `npm run typecheck` | exit 0 |
| `npx convex codegen` | regenerated; `api.d.ts` now contains `eventLifecycle` (import + registry), committed |
| Commit contents | exactly `convex/eventLifecycle.ts`, `convex-test/lifecycle.test.ts`, `convex/_generated/api.d.ts` |

## Self-Review Verification

- **publish** (`convex/eventLifecycle.ts:8`): requires `event.publish` permission via `requireEventPermission`; rejects non-draft with `CONFLICT` ("Only draft events can be published"); runs `computeReadiness` and throws `VALIDATION_ERROR` with `{ failures }` context (failing `ReadinessCheck[]`) when any check fails; generates scoreSheets as judges × rounds × **active** contestants (filters `status === "active"`), each `not_started`; patches event → `ready`; audit `event.published` with `scoreSheetsGenerated`.
- **reopen** (`convex/eventLifecycle.ts:47`): requires `event.publish`; rejects non-ready with `CONFLICT`; deletes ALL event scoreSheets via `withIndex("by_event_id_and_round_id", q => q.eq("eventId", ...))` — index-prefix-only binding, valid Convex; patches → `draft`; audit `event.reopened` with `scoreSheetsDeleted`.
- **archive** (`convex/eventLifecycle.ts:71`): requires `event.archive`; rejects non-ready with `CONFLICT`; patches → `archived`; audit `event.archived`.
- **Freeze asserted by test 2:** `rounds.add` after publish rejects `CONFLICT` (via `requireDraftEvent` in `convex/rounds.ts:13`); after `reopen`, sheet count is 0 and status is `draft`.
- **Constraints:** object-form function syntax; validators (`v.string()`) on all three functions; no `any` / `as never`; no comments in either file; single commit.

## Notes

- `event.publish` / `event.archive` permissions verified seeded for Org Owner (alice) in `convex/lib/constants.ts:32`.
- Pre-existing dirty worktree files (`.superpowers/*`, `.gitignore`, `.graphifyignore`) were left untouched — commit contains only the three intended files.
