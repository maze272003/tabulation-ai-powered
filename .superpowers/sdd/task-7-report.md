# Task 7 Report — Identity & authz helpers

**Status:** DONE_WITH_CONCERNS (one naming discrepancy, resolved; see Concerns)

## Commits

- `da37d3e` — feat: identity and authorization helpers

## Files created

- `convex/lib/auth.ts` — `requireIdentity`, `requireUserProfile`, `requirePlatformOwner` (verbatim from brief Step 3)
- `convex/lib/authz.ts` — `AuthCtx` type, `resolveOrgBySlug`, `loadPermissions` (private), `requireOrgMember`, `requirePermission`, `requireOrgOwner`, `requireOrgAdmin` (verbatim from brief Step 4)
- `convex/__test__.ts` — `whoAmI` query only (per revised scope)
- `convex-test/authz.test.ts` — single anonymous-throws test (per revised scope)

## Verification

- `npm test` → **7/7 pass** across 3 test files (sanity 2, errors 4, authz 1). The new `authz helpers > requireIdentity throws for anonymous callers` test passes.
- `npm run typecheck` → **clean** (after deleting `tsconfig.tsbuildinfo`).

## Org-scoped authz tests deferred to Task 10

Confirmed. Cross-tenant (`requireOrgMember` throws FORBIDDEN for non-members) and permission tests need real `organizations`/`members`/`rolePermissions` rows. The brief's `createOrgAs`/`orgMemberCount` scaffolding would have been deleted in Task 13 anyway. These tests will be written in Task 10 against the real org/membership endpoints.

## Security model review

Layered check chain — every public helper ultimately reduces to `ctx.auth.getUserIdentity()`, which is Convex-server-trusted and not client-supplied:

```
requireIdentity         → identity must exist
  ↓
requireUserProfile      → profile exists + status === "active"
  ↓
requirePlatformOwner    → platformRole === "platform_owner"
  ↓                        (or, for org scope:)
requireOrgMember        → org exists + status !== "deleted"
                         + membership exists + status === "active"
                         + role exists
                         + subscription exists
  ↓
requirePermission       → permissions Set.has(name)
```

**No bypass paths identified:**

- `resolveOrgBySlug` accepts caller-supplied `slug` but access is still gated by the membership lookup `(orgId, userId).unique()`. A user cannot enumerate or access orgs they aren't a member of.
- `requireOrgMember` rejects `status !== "active"` memberships, so invited/inactive members can't read data.
- Subscription is required — orgs without a subscription record are fully inaccessible (intentional per brief).
- All errors are `appError(...)` (typed `ConvexError<AppErrorData>`); no plain `throw new Error(...)` that would leak stack details.
- No `args.userId` / `args.orgId` accepted from clients anywhere — identity-derived only.

## Concerns

### 1. Filename: `convex/_test.ts` → `convex/__test__.ts` (RESOLVED, deviates from instruction)

**Discrepancy:** The user's instructions specified `convex/_test.ts` (step 4 and step 8 staging list), but the test code in step 5 references `api.__test__.whoAmI`. Convex's codegen preserves leading underscores, so:

- `convex/_test.ts`     → `api._test`
- `convex/__test__.ts`  → `api.__test__`

Typecheck failed with the original `_test.ts` filename (`Property '__test__' does not exist`). The original brief exhibits the same discrepancy (`convex/_test.ts` filename + `api.__test__.*` test code), so the discrepancy propagates from the brief into the revised instructions.

**Resolution taken:** Renamed the file to `convex/__test__.ts` to honor the verbatim test code. The alternative (keep `_test.ts` and rewrite the test to `api._test.whoAmI`) would have modified the test code the user provided as the corrected canonical reference.

**If the user prefers the other resolution:** change `convex/__test__.ts` → `convex/_test.ts`, change the test import to `api._test.whoAmI`, and amend the commit. Trivial 2-line diff.

### 2. N+1 in `loadPermissions` (acknowledged, not blocking)

`loadPermissions` does one `.collect()` on `rolePermissions` then `ctx.db.get(permissionId)` per row. For Phase 1's small system-role permission set this is fine (caveat 2 acknowledged). If permission counts grow >100 per role in Phase 2, consider a `by_role_id` join table or batched fetch.

### 3. `_test.ts` deletion chore tracked

`convex/__test__.ts` is scaffolding slated for deletion in Task 13 (the brief says `_test.ts`, but the deletion task should catch either name via glob). Flagging here so Task 13 doesn't miss it.

## Report location

This file: `.superpowers/sdd/task-7-report.md`
