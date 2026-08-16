# Task 15: Final verification — Controller Report

## Step 1: Full quality gate (controller-run, 2026-08-16)

| Gate | Command | Result |
|---|---|---|
| typecheck | `Remove-Item tsconfig.tsbuildinfo, convex/tsconfig.tsbuildinfo; npm run typecheck` | exit 0 |
| lint | `npm run lint` | 0 errors, 11 pre-existing warnings (Convex `no-filter-in-query`, plan-mandated `.filter()` uses in seed/templates) |
| tests | `npm test` | 13 files, 58/58 passed (31 pre-Phase-2 + 27 new) |
| build | `npm run build` | success — all routes incl. `/app/[orgSlug]/events/...`, `/app/[orgSlug]/templates` |

## Step 2: convex-authz deterministic scan (controller-run)

1. **Identity-from-arg** — grep `(userId|actorId|ownerId|authorId|accountId)\s*:\s*v\.id\(` over `convex/**/*.ts` (excl. `_generated/`): hits = `platform.ts:23` (Phase 1 setPlatformOwner — known-legitimate target arg, caller identity derived server-side) and `judges.ts:10` (`judges.add({ userId })` — legitimate TARGET argument: caller identity derived via requireDraftEvent → requireEventPermission → requireOrgMember; target verified as ACTIVE org member (VALIDATION_ERROR otherwise, tested in Task 8 corrected test); per-event uniqueness CONFLICT tested). Remaining hits are schema field definitions, not function args. **PASS**.
2. **Missing-ownership on get→patch/delete** — all 21 `ctx.db.get(args.X)` sites audited (per-task reviews + this scan): every Phase 2 site compares `doc.eventId !== eactx.event._id` (categories/rounds/criteria-via-requireRoundOfEvent/contestants/judges/judgeAssignments) or `tpl.isSystem || tpl.orgId === actx.org._id` (events.createFromTemplate, templates.remove) before mutating; scope docs in judges.addAssignment each verified against the event. Phase 1 sites (platform/members/invitations) were audited in Phase 1. **PASS**.
3. **PII-leak (emails in public queries)** — `members.list` gated by `requirePermission(organization.view)` which requires active membership in the resolved org (members.ts:8-11); `judges.listWithAssignments` gated by `requireEventMember` (org member + event resolution). No other query returns emails. **PASS**.
4. **Parent-ref-on-write** — all Phase 2 inserts either use server-derived parent ids (events/categories/rounds/judges/scoreSheets/eventTemplates) or verify client-supplied parent ids against the resolved event before insert (criteria.add via requireRoundOfEvent; contestants.add/update categoryId checks; judgeAssignments.addAssignment scope checks). **PASS**.

## Step 3: Manual smoke checklist (for the human — requires real Google OAuth creds)

1. Sign in → org → Events → New event from "Pageant" template.
2. Edit rounds/criteria; add contestants, judges, assignments.
3. Readiness page shows PASS items; publish freezes config; reopen unlocks.
4. Cross-org slug access shows not-found.

## Step 4: Commit

No code cleanup required (all work committed per-task). Session scratch (`.superpowers/`) updated per Phase 1 precedent; user WIP (`app/graphify/`, `package.json` graphify scripts, `.graphifyignore`) deliberately NOT staged.
