# Phase 1 Foundation — Progress Ledger

Branch: `phase1-foundation` (off `master` @ c26eaa1)
Plan: `docs/superpowers/plans/2026-08-12-phase1-foundation.md`
Spec: `docs/superpowers/specs/2026-08-12-phase1-foundation-design.md`

## Tasks

- [x] Task 1: Project dependencies & environment
- [x] Task 2: Better-Auth Convex component
- [x] Task 3: Client auth wiring & profile provisioning
- [x] Task 4: Core schema
- [x] Task 5: Test harness
- [x] Task 6: Error model & serializers
- [x] Task 7: Identity & authz helpers
- [x] Task 8: Seed reference data
- [x] Task 9: Entitlements, usage & audit helpers
- [x] Task 10: Organizations
- [x] Task 11: Members & invitations
- [x] Task 12: Reference reads & platform admin
- [x] Task 13: Remove test-only endpoints
- [x] Task 14: Design system setup
- [x] Task 15: Demo cleanup & middleware
- [x] Task 16: App routes & pages
- [x] Task 17: Final verification & cleanup

## Completion log

<!-- append one line per completed task: "Task N: complete (commits <base7>..<head7>, review clean)" -->

- Task 1: complete (commits 4748b0c..b5ef576, review clean) — deps installed, vitest config + shim, env vars set (Google creds placeholders, human must replace before Task 17)
- Task 2: complete (commits b5ef576..8757b7e, review clean) — Better-Auth local component mounted, schema generated, HTTP handlers wired; _generated/ regen committed (repo tracks it)
- Task 3: complete (commits 8757b7e..8fb901a, review clean after fix) — client wired, ensureUserProfile/getCurrentUser, Authenticated gate; FIX: deleted demo app/server + placeholder app/page.tsx (stale-cache typecheck false positive caught by reviewer)
- Task 4: complete (commits 8fb901a..f9dc8ee, review PASS with 2 Minor) — 11-table schema; `invitations.eventId` uses v.string() Phase-1 form. MINOR (deferred to final review): (a) `auditLogs.by_org_id_and_creation_time` name implies `_creationTime` is explicit but it's auto-appended (matches Task 12 query, functionally correct, rename optional); (b) unauthorized explanatory comment on schema.ts:145 (only the Phase-2 marker on :69 is allowed).
- Task 5: complete (commits f9dc8ee..9c5a105, review clean) — convex-test harness, 2/2 sanity tests pass. CRITICAL for later tasks: convex-test 0.0.55 API = `.withIdentity(identity)` chaining + `t.query`/`t.mutation` (NOT runQuery/runMutation) + two-arg `(fnRef, args)`. The plan's test code uses the wrong 3rd-arg `{userIdentity}` syntax — every later test task MUST translate to the real API. `seedAndProvision` deferred to Task 8. MINOR: `convex-test/convex-shim.ts` is now dead code (alias removed).
- Task 6: complete (commits 9c5a105..90853c9, review clean) — appError/ErrorCode + serialize/deserialize, 6/6 tests pass. FOLLOW-UP for Task 16 UI: `ConvexError.message` override is in-process only; after wire transit the client sees JSON-stringified `.message`, so error→UX mapping MUST read `.data.code` (and `.data.message` for the stable string), NOT `err.message`.
- Task 7: complete (commits 90853c9..da37d3e, review clean, security review found NO authz bypass) — auth.ts + authz.ts library verbatim, AuthCtx type, `__test__.ts` scaffolding + 1 identity test (7/7 pass). Org-scoped authz tests DEFERRED to Task 10 (will use real org/members endpoints). MINOR: weak `.toThrow()` assertion on temp scaffolding — Task 10 must use strong `ConvexError` data assertions (`.rejects.toMatchObject({ data: { code: "FORBIDDEN" } })`). FOLLOW-UP: `requireOrgMember` doesn't check `subscription.status` (canceled orgs retain access) — brief-verbatim, flag for later.
- Task 8: complete (commits da37d3e..4797828, review clean) — seed roles/permissions/plans (idempotent), seedAndProvision added to setup.ts (unblocks Task 10/11). 9/9 tests pass. Fixed brief bug: `canApi` → `canUseApi` to match schema. MINOR: idempotency test asserts no-throw rather than row-count stability.
- Task 9: complete (commits 4797828..91bc41f, review clean) — usage.ts/entitlements.ts/audit.ts library + pure hasFeature/hasLimit tests (11/11 pass). ctx-requiring helpers (requireLimit/requireFeature/writeAudit/etc.) deferred to Task 10/11 integration tests. `requireLimit` typed with MutationCtx (no `as never` cast). `plan.limits` read via structural `Record<string, number>` assignment (type-safe).
- Task 10: complete (commits 91bc41f..57d2aa7, review PASS) — organizations create/get/listMine/update, 15/15 tests pass with strong `data.code` assertions (FORBIDDEN cross-tenant, CONFLICT dup slug, UNAUTHENTICATED anon). KNOWN LIMITATION: Convex has NO DB-enforced unique constraints; slug uniqueness is app-layer only (TOCTOU on concurrent creates), but `get` uses `.unique()` which fail-throws on duplicate (no silent leak). Side fixes (legit): widened `seedAndProvision` to `Partial<UserIdentity>` (bobIdentity was unassignable), regenerated stale `api.d.ts`. MINOR (final review): mojibake em-dash in organizations.ts:80; no explicit `update` test; `listMine` doesn't filter soft-deleted orgs.
- Task 11: complete (commits 57d2aa7..a3da9ce, review PASS after 4-fix wave) — members (list/changeRole/remove) + invitations (create/listForUser/listForOrg/getByToken/accept/revoke), 25/25 tests pass. FIXES (all resolved, re-reviewed clean): (1) `accept` now calls `requireLimit` — was a real quota bypass; (2) `remove` guards decrement on active→inactive — was double-decrementing to negative; (3) `requireLimit` unified through `hasLimit` via `limitKeyForResource` — was a silent-false trap (Task 9 bug surfaced here); (4) `accept` normalizes `profile.email.toLowerCase()`. KNOWN LIMITATION (Phase 2): expired invitations stay `pending` (no sweep cron); `listForUser`/`listForOrg` surface expired rows. Expiry test patches `expiresAt` via `t.run()` (convex-test 0.0.55 has no time-advance API).
- Task 12: complete (commits a3da9ce..8289776, review clean) — roles/plans/subscriptions/audit/platform reads, 29/29 tests pass. All permission gates correct (subscription.view/manage, audit.view, requirePlatformOwner). `roles.list`/`plans.list` ungated (reference data). Platform bootstrap via `t.run` direct patch verified. MINOR: platform lists use `.collect()` (no pagination — fine for Phase 1).
- Task 13: complete (commits 8289776..8462fd6, controller-verified deletion) — removed `convex/__test__.ts` + `convex-test/authz.test.ts` (scaffolding made redundant by Task 10's real-endpoint UNAUTHENTICATED test at organizations.test.ts:46). 28/28 tests pass, 0 `api.__test__` references remain.
- Task 14: complete (commits 8462fd6..66367b2, review clean) — shadcn/ui design system, 12 primitives, cn() helper. NOTABLE: shadcn latest uses `@base-ui/react` NOT `@radix-ui/*` — Task 1's Radix deps are now dead weight (harmless, candidate for cleanup). Fixed shadcn self-ref bug (`--font-sans: var(--font-geist-sans)`). Arial override removed; Geist applies. `ignoreBuildErrors` REMOVED — build is now a real type gate. typecheck+lint+build all PASS clean. Task 16 must add `<TooltipProvider>` + Sonner `<Toaster/>`.
- Task 15: complete (commits 66367b2..be6943a, review PASS after fix) — middleware gates /app, /platform, /invite via session-cookie presence (UX gate; Convex does real authz). FIX (Critical-resolved): switched to `getSessionCookie` from `better-auth/cookies` — manual cookie-name checks missed the `__Secure-` prefix used on HTTPS deploys (would have locked ALL users out of /app in production). Demo cleanup (myFunctions.ts, app/server/) was already done in Task 3. Next 16 soft-deprecates `middleware.ts` → `proxy.ts` (future rename).
- Task 16: complete (commits be6943a..bf5f831, review PASS after fix) — 10 pages + 2 components (sign-in, org picker, shell, overview, members, settings, billing, invite, platform, landing + OrgSwitcher/UserMenu), typecheck/lint/build all PASS. Cross-cutting: TooltipProvider + Toaster mounted in root layout; error UX reads `.data.code` (members/create-org/accept-invite). Base UI shift handled (`render={<Link/>}` not asChild; Suspense for useSearchParams). FIX: (1) settings useState stale-init synced via guarded setState; (2) `organizations.get` returns null for non-members so layout `notFound()` fires (was dead branch → infinite "Loading…" for non-members). MINOR (final review): settings error toast doesn't switch on .data.code.
- Task 17: complete (commits bf5f831..10b11b1, controller-verified, FINAL FIX applied) — full quality gate green (typecheck/lint/31 tests/build all PASS); cleanup removed 6 unused @radix-ui/* deps, dead convex-shim.ts, mojibake em-dash, unauthorized _creationTime comment. Phase-2 marker on invitations.eventId KEPT. FINAL FIX: blocked Org Owner assignment via changeRole + invitations.create (privilege escalation found in whole-branch review) + 2 regression tests + 1 audit-row test + requireOrgOwner misnomer comment. 31/31 tests pass.
- convex-authz audit: RUN + ESCALATION FIXED. Deterministic scan CLEAN for all 4 shapes. 1 judgment finding (privilege escalation) — FIXED in 10b11b1.
- WHOLE-BRANCH REVIEW: PASS (FIX BEFORE MERGE → must-fix applied). All 9 spec acceptance criteria met or partial-with-justification. Ready.
- MINOR findings roll-up (ALL DEFERRED to Phase 2/6, triaged by final reviewer): (a) listMine soft-deleted filter; (b) platform list pagination; (c) expired-invitation sweep cron; (d) settings generic toast; (e) middleware.ts→proxy.ts rename; (f) slug TOCTOU (fail-safe via .unique()); (g) subscription.status check in requireOrgMember (**Phase 6 — fix with billing lifecycle**); (h) requireOrgOwner misnomer (Phase 6 rename); (i) audit-row coverage (now tested); (j) profile.email normalization at provisioning.
- Google OAuth creds: PLACEHOLDER — human must set real GOOGLE_CLIENT_ID/SECRET before the Task 17 smoke test.
