# Task 17 — Final verification & cleanup (report)

Branch: `phase1-foundation`
Prior head: `bf5f831` → new head: `e2ab17939fac5dea4f382105897308e701ecd070`
Subject: `chore: Phase 1 final cleanup - remove unused deps, dead shim, mojibake, stray comment`

## Part 1 — Quality gate BEFORE cleanup

`tsconfig.tsbuildinfo` and `convex/tsconfig.tsbuildinfo` cleared before running.

| Step         | Command             | Exit | Result |
| ------------ | ------------------- | ---- | ------ |
| typecheck    | `npm run typecheck` | 0    | PASS   |
| lint         | `npm run lint`      | 0    | PASS (0 errors, 8 warnings — pre-existing/expected, see note) |
| test         | `npm test`          | 0    | PASS — 28/28 tests, 7 files |
| build        | `npm run build`     | 0    | PASS — Next.js 16.3.0 (Turbopack), 6 static pages |

Lint warnings (all pre-existing, all `warning` severity, 0 errors — lint exits 0):
- `convex-test/errors.test.ts:2` unused `ErrorCode` import.
- `convex/betterAuth/_generated/{dataModel,server}.ts` unused eslint-disable directives (generated code).
- `convex-dev/no-filter-in-query` on `invitations.ts` (×3), `organizations.ts:121`, `seed.ts:45` — these are the Phase-2 `listMine` soft-deleted filter + invitation status filters explicitly deferred by this task's scope note #5. Not addressed.

## Part 2 — Cleanup items

All four items completed and verified.

### 1. Unused Radix dependencies removed ✓
- Verified 0 source imports of `@radix-ui/*` across the repo (`rg "@radix-ui"` in `*.{ts,tsx,js,jsx,mjs,cjs}` → no matches in source; remaining matches are historical docs/reports only).
- Ran: `npm uninstall @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-select @radix-ui/react-slot @radix-ui/react-tooltip` → removed 41 packages (6 direct + 35 transitive), 0 vulnerabilities.
- `package.json` `dependencies` block no longer contains any `@radix-ui/*` entry (confirmed via diff). The shadcn v4 "base-nova" primitives use `@base-ui/react` (kept).
- Post-uninstall `npm run typecheck` and `npm run build` both PASS (Part 3) — nothing depended on them.

### 2. Dead `convex-test/convex-shim.ts` deleted ✓
- File was a 2-line placeholder (`// Placeholder; convex-test intercepts convex/* imports via the test setup.` + `export {};`), made dead in Task 5 when the vitest `convex:` alias was removed. No source/test import referenced it (`rg "convex-shim"` → only docs/plans/reports).
- Removed via `git rm convex-test/convex-shim.ts`. The 7 test files / 28 tests still pass after deletion.

### 3. Mojibake em-dash fixed in `convex/organizations.ts` ✓
- `convex/organizations.ts:54` error message had a non-ASCII dash. Byte inspection: `E2 80 94` (UTF-8 for U+2014 EM DASH) — renders as mojibake `ΓÇö` under CP1252 terminals.
- Replaced with plain ASCII hyphen:
  - before: `throw appError(ErrorCode.NOT_FOUND, "Free plan missing \u2014 run seed");`
  - after:  `throw appError(ErrorCode.NOT_FOUND, "Free plan missing - run seed");`
- String is now pure ASCII.

### 4. Unauthorized `_creationTime` comment removed from `convex/schema.ts` ✓
- `convex/schema.ts:145` previously read:
  `.index("by_org_id_and_creation_time", ["orgId"]) // _creationTime is auto-appended by Convex; explicit listing is rejected by schema validation`
- Comment removed; the index declaration is now bare:
  `.index("by_org_id_and_creation_time", ["orgId"])`
- Rationale lives in this report, not the source.

### Phase-2 marker on `invitations.eventId` KEPT ✓
- `convex/schema.ts:69` unchanged:
  `eventId: v.union(v.null(), v.string())), // Phase 2: change to v.id("events") when the events table lands`
- This is the single allowed comment exception. Confirmed present after the edit.

### Out-of-scope items NOT touched (per task note #5)
- `middleware.ts` → `proxy.ts` rename: NOT done (Next 17 migration; build emits the deprecation warning, which is expected and harmless).
- Pagination on platform lists: NOT added (Phase 2).
- `listMine` soft-deleted filter: NOT changed (Phase 2 — surfaces as the `no-filter-in-query` lint warning noted above).
- Expired-invitation sweep cron: NOT added (Phase 2).

## Part 3 — Quality gate AFTER cleanup

`tsconfig.tsbuildinfo` and `convex/tsconfig.tsbuildinfo` re-cleared before running.

| Step         | Command             | Exit | Result |
| ------------ | ------------------- | ---- | ------ |
| typecheck    | `npm run typecheck` | 0    | PASS   |
| lint         | `npm run lint`      | 0    | PASS (0 errors, same 8 warnings) |
| test         | `npm test`          | 0    | PASS — 28/28 tests, 7 files |
| build        | `npm run build`     | 0    | PASS — Next.js 16.3.0 (Turbopack), 6 static pages |

All four gates green both before and after cleanup.

## Commit

```
e2ab17939fac5dea4f382105897308e701ecd070
chore: Phase 1 final cleanup - remove unused deps, dead shim, mojibake, stray comment
 convex-test/convex-shim.ts |   2 -
 convex/organizations.ts    |   2 +-
 convex/schema.ts           |   2 +-
 package-lock.json          | 862 +--------------------------------------------
 package.json               |   6 -
 5 files changed, 3 insertions(+), 871 deletions(-)
```

Staged set (surgical, not `git add -A` — see Concern #1):
- `convex-test/convex-shim.ts` (deleted)
- `convex/organizations.ts` (em-dash → ASCII hyphen)
- `convex/schema.ts` (`_creationTime` comment removed)
- `package.json` + `package-lock.json` (6 Radix packages removed)

## Manual steps deferred to the human user

These require live credentials / a real browser and are NOT automatable in this task:
- **Google sign-in smoke test** — exercise the better-auth Google OAuth flow end-to-end against the deployed/dev backend with real credentials.
- **Platform owner bootstrap smoke test** — confirm the first signed-in user is auto-provisioned as platform owner and can reach `/platform`.

## Separately run by the controller

- **convex-authz security audit** — not run here; the controller runs it as a separate step.

## Concerns

1. **Staging scope deviation (intentional).** The task said `git add -A`, but the working tree had 53 untracked files under `.superpowers/` (SDD briefs/reports/review-diffs, never committed across tasks 1–16) plus a pre-existing unrelated deletion of `.cursor/rules/convex_rules.mdc`. Sweeping those into a commit titled "Phase 1 final cleanup" would have produced a misleading commit (message ≠ contents). Per the "stage only intended files" guardrail, I staged only the 5 paths corresponding to the 4 cleanup items. The `.superpowers/` SDD artifacts and the `.cursor` deletion remain unstaged for the controller to handle (commit separately, gitignore, or discard). This is fully reversible.

2. **8 lint warnings remain** (0 errors). All are either generated code, an unused test import, or the Phase-2-deferred `no-filter-in-query` cases that task note #5 explicitly excludes from scope. Lint exits 0.

3. **`middleware.ts` deprecation warning** prints during `next build` (Next 16 → 17 rename to `proxy.ts`). Expected; out of scope per task note #5.

## Final Fix

Addresses the single HIGH-severity must-fix from the whole-branch review of `phase1-foundation @ e2ab179`: Org Admins (any `organization.members.manage` holder) could mint a new Org Owner via `members.changeRole` or `invitations.create`, gaining `organization.delete` + `subscription.manage` — a privilege escalation.

**Commit:** `10b11b1` — `fix: block Org Owner assignment via changeRole/invite (privilege escalation); add audit + regression tests`

### Changes

1. **`convex/members.ts` `changeRole`** — after the role lookup + existence check, reject `newRole.name === "Org Owner"` with `FORBIDDEN` ("The Owner role can only be granted via organization creation or ownership transfer."). Sits before the owner-demotion guard so it fires for any caller, including the current Org Owner.
2. **`convex/invitations.ts` `create`** — same check after `role` lookup, before the duplicate-invitation scan. Prevents minting an Owner invitation.
3. **`convex/lib/authz.ts`** — added the 4-line `NOTE:` comment above `requireOrgOwner` warning that it gates on `organization.update` (which Org Admins also hold), NOT a true Owner-only check, and pointing future callers at the `org.ownerId === user._id` comparison. Zero current call sites; comment is the sanctioned exception to the no-comments rule.
4. **`convex-test/members.test.ts`** — +3 tests (28 → 31):
   - `changeRole cannot assign the Org Owner role (FORBIDDEN)` — Alice invites Bob as Viewer → accepts → legitimate change to Tabulator succeeds → escalation attempt to "Org Owner" throws `FORBIDDEN`.
   - `invitations.create cannot request the Org Owner role (FORBIDDEN)` — Alice attempts `invitations.create({ roleName: "Org Owner" })` → `FORBIDDEN`.
   - `writes a member.role.changed audit row on role change` — closes spec acceptance criterion 7: performs a role change then reads `auditLogs` via `t.run(async ctx => ctx.db.query("auditLogs").withIndex("by_org_id_and_creation_time", ...))` and asserts ≥1 row with `action === "member.role.changed"` and the membership as `resourceId`.

Owner remains attainable only via `organizations.create` (seeds `ownerRoleId` directly, not through these functions) and the future Phase 6 ownership-transfer flow.

### Verification (buildinfo cleared first)

| Step         | Command             | Exit | Result |
| ------------ | ------------------- | ---- | ------ |
| typecheck    | `npm run typecheck` | 0    | PASS   |
| lint         | `npm run lint`      | 0    | PASS (0 errors, same 8 pre-existing warnings) |
| test         | `npm test`          | 0    | PASS — 31/31 tests, 7 files |
| build        | `npm run build`     | 0    | PASS — Next.js 16.3.0 (Turbopack), 6 static pages |

### Notes / concerns

- The two escalation regression tests assert with `.rejects.toMatchObject({ data: { code: "FORBIDDEN" } })` matching the existing style in this file (the `ConvexError<AppErrorData>` payload surfaces as `.data.code` through convex-test).
- Staged set was surgical (4 paths from the task spec). The unrelated `.cursor/rules/convex_rules.mdc` deletion and `.superpowers/` untracked artifacts from the prior task remain unstaged (see Concern #1 above) — not mine to handle.

## Status: DONE
