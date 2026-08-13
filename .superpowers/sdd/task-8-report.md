# Task 8 Report: Seed reference data

## Status: DONE_WITH_CONCERNS

## Commits

- `4797828` — feat: seed system roles, permissions, plans

## Summary

`npm test`: 9/9 pass (sanity 2, errors 4, authz 1, seed 2). `npm run typecheck`: clean.

## Deliverables

| File | Status |
|------|--------|
| `convex/lib/constants.ts` | created — SYSTEM_ROLES (7), SYSTEM_PERMISSIONS (7), ROLE_PERMISSIONS (7 mappings), SYSTEM_PLANS (3) |
| `convex/seed.ts` | created — `seedReferenceData` public mutation, idempotent |
| `convex-test/setup.ts` | modified — added `seedAndProvision` export (4th export; existing 3 untouched) |
| `convex-test/seed.test.ts` | created — 2 tests (idempotency, seedAndProvision end-to-end) |

## `seedAndProvision` unblocks downstream tasks

```ts
export async function seedAndProvision(
  t: ReturnType<typeof setupTest>,
  identity: typeof aliceIdentity,
) {
  await t.mutation(api.seed.seedReferenceData, {});
  return t.withIdentity(identity).mutation(api.auth.ensureUserProfile, {});
}
```

Uses the real convex-test 0.0.55 two-arg API (`t.mutation(fnRef, args)` and `t.withIdentity(identity).mutation(fnRef, args)`). No `runMutation`, no third-arg `{ userIdentity }`. Verified end-to-end by `seed.test.ts` test 2 (queries `getCurrentUser` and asserts `alice@example.com`). Tasks 10/11 can now call this helper.

## Self-review

### Idempotency — confirmed

Every insert is preceded by a dedup lookup:
- **permissions**: `.withIndex("by_name", name).unique()`
- **roles**: `.withIndex("by_name", name).unique()`
- **rolePermissions**: `.withIndex("by_role_id", roleId).filter(permissionId).first()`
- **plans**: `.withIndex("by_name", name).unique()`

`seed.test.ts` test 1 calls `seedReferenceData` twice in sequence and passes — no duplicates, no unique-index violations.

### Plan features/limits — match schema

`SYSTEM_PLANS[*].features` keys: `canCreateEvent, canExportReports, canUseCustomBranding, canUseAuditLogs, canCreateTemplates, canUseAdvancedAnalytics, canUseApi` — exactly the 7 keys in `schema.ts:89-97`. All booleans.

`SYSTEM_PLANS[*].limits` keys: `maxMembers, maxEvents, maxJudges, maxContestants` — exactly the 4 keys in `schema.ts:98-103`. All numbers.

## Concerns

### 1. Brief typo: `canApi` → `canUseApi` (resolved)

The brief's `SYSTEM_PLANS` code block used `canApi: false` in all three plans. This conflicts with:
- the schema (`convex/schema.ts:96` defines `canUseApi: v.boolean()`), and
- the task's own Caveat #2, which explicitly enumerates `canUseApi` as a required key.

Without the fix, both `npm run typecheck` (TS2345) and `npm test` (Validator error: Missing required field `canUseApi`) fail at the `ctx.db.insert("plans", ...)` call. I treated the schema + Caveat #2 as authoritative and renamed the key to `canUseApi` in all three plans. This is a one-token deviation from the verbatim brief; everything else in `constants.ts` and `seed.ts` is byte-for-byte from the brief.

### 2. `seedReferenceData` is public

Per the brief and Caveat #1, `seedReferenceData` is a public `mutation` (not `internalMutation`). It is harmless and idempotent, but is callable from any client. Task noted this is acceptable for Phase 1 and can be gated or made internal later — flagging for awareness.

### 3. Commit scope followed task instructions

The task said "stage the 4 files." The auto-generated `convex/_generated/api.d.ts` (which gained a `seed` module entry reflecting the new file) was left unstaged and will regenerate on the next `convex dev` run. No source files outside the 4 deliverables were touched.

## Verification evidence

```
Test Files  4 passed (4)
     Tests  9 passed (9)
```

```
$ npm run typecheck
(tsc --noEmit exits 0, no errors)
```

## Report path

`C:\Users\USER\Documents\data\convex\tabulation-ai-powered\.superpowers\sdd\task-8-report.md`
