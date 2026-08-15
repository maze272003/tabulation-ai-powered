# Task 12 Report: UI — events list, new event, event shell, overview (Phase 2)

**Status:** DONE_WITH_CONCERNS (one process deviation, no code deviations from brief intent)
**Commit:** `06ce68b` — `feat: events list, creation, event shell, overview UI` (7 files, +250)

## IMPORTANT DEVIATION — brief file was stale (process, not code)

`task-12-brief.md` at dispatch contained **Phase 1's** Task 12 ("Reference reads & platform admin" — `convex/roles.ts`, `plans.ts`, `subscriptions.ts`, `audit.ts`, `platform.ts`), which was already completed and committed in Phase 1 (`8289776`, stale `task-12-report.md` also present). The task description clearly specified the Phase 2 UI task, so I regenerated the brief from the authoritative Phase 2 plan (`docs/superpowers/plans/2026-08-13-phase2-competition-config.md`, Task 12, lines 2037–2350) using the project's own `.superpowers/sdd/extract-task.ps1` (314 lines, matches the task description's file list exactly). All work below follows the regenerated (correct) brief. This report file replaces the stale Phase 1 report at the same path.

## Files delivered

| File | Action | Notes |
|------|--------|-------|
| `app/app/[orgSlug]/events/page.tsx` | Create | Events list: quick-create (blank) with typed LIMIT_EXCEEDED/CONFLICT toasts, event cards linking to overview. Verbatim. |
| `app/app/[orgSlug]/events/new/page.tsx` | Create | New event: blank create + system-template picker via `createFromTemplate`. Verbatim. |
| `components/EventShell.tsx` | Create | Event shell: `events.get` loading (`Loading…`) / null (`notFound()`) states, status Badge, locked banner + draft banner, 7-item sub-nav. Verbatim. |
| `app/app/[orgSlug]/events/[eventSlug]/layout.tsx` | Create | Client layout, `use(params)` → `EventShell`. Verbatim. |
| `app/app/[orgSlug]/events/[eventSlug]/page.tsx` | Create | Server redirect to `.../overview` (`await params`, `redirect()`). Verbatim. |
| `app/app/[orgSlug]/events/[eventSlug]/overview/page.tsx` | Create | Readiness cards + PASS/FAIL checklist. Verbatim MINUS unused `toast` import — brief line 293 explicitly directs removal if lint flags it (it would; `@typescript-eslint/no-unused-vars`). |
| `app/app/[orgSlug]/layout.tsx` | Modify | Added `Events` + `Templates` nav links after Billing (lines 32-33), matching existing link classes exactly. |

## Gate outputs (Step 6, in order)

1. **typecheck**: `Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck` — first run FAILED with 3 errors in `.next/dev/types/validator.ts`: stale `.next/types` (Phase 1 build output, 00:21) lacked the new `/app/[orgSlug]/events/[eventSlug]` layout route that current dev types (00:32) reference. Fix: `Remove-Item -Recurse -Force .next\types` (stale regenerable build artifact; no source changed). Re-run: **exit 0, clean**. The build in step 3 regenerated `.next/types` fresh and re-ran tsc cleanly inside `npm run build`.
2. **lint**: `npm run lint` — **0 errors**, 11 warnings, all pre-existing (`convex/invitations.ts`, `organizations.ts`, `seed.ts`, `templates.ts` filter warnings; test-file unused vars; generated-file directives). None in new files.
3. **build**: `npm run build` — **success**. New routes emitted: `/app/[orgSlug]/events`, `/app/[orgSlug]/events/new`, `/app/[orgSlug]/events/[eventSlug]`, `/app/[orgSlug]/events/[eventSlug]/overview`. (Pre-existing middleware→proxy deprecation warning, unrelated.)
4. **test**: `npm test` — **58/58 passing** (13 files), matching the expected count.

## Commit

Brief says `git add app components/EventShell.tsx`. The working tree also contained unrelated uncommitted/untracked changes (`app/graphify/`, `package.json`, `.gitignore`, `.graphifyignore`, `.superpowers/sdd/*` edits — graphify tooling setup, not this task's work). Literal `git add app` would have swept `app/graphify/` into the commit. Minimal deviation: staged exactly the 7 task files by path, one commit, exact message from the brief:

```
git commit -m "feat: events list, creation, event shell, overview UI"
# 06ce68b, 7 files changed, 250 insertions(+)
```

## Self-review

- [x] Pages match the regenerated brief verbatim (only sanctioned change: omitted unused `toast` import in overview page).
- [x] Nav links added (Events, Templates) after Billing, identical classes to siblings.
- [x] Redirect page present (server component, `await params`, `redirect` to overview).
- [x] No unused imports; no code comments; no `any` / `as never` (only brief-mandated `as { data?: { code?: string } }`).
- [x] Loading/null states: EventShell `undefined` → Loading, `null` → `notFound()`; pages use optional chaining so query-pending renders empty containers (brief's design).
- [x] Every mutation has typed error toasts reading `.data.code` (LIMIT_EXCEEDED / CONFLICT / generic).
- [x] Conventions: `use(params)` for Next 16 async params, `useQuery`/`useMutation` from `convex/react`, design-system tokens (`text-muted-foreground`, `bg-accent`, `border`, `text-destructive`), Base UI shadcn primitives, no emoji icons.
- [x] Single commit on `phase2-competition-config`; unrelated working-tree changes left untouched.

## Concerns

1. Brief file at dispatch was stale Phase 1 content (resolved via extract script — recommend the orchestrator verify future task-N briefs are regenerated from the active phase's plan).
2. Stale `.next/types` had to be deleted to pass typecheck (regenerable build artifact; dev server and rebuild both fine afterwards).
3. `git add` scoped to exact file paths instead of literal `git add app` to avoid committing unrelated `app/graphify/` work sitting untracked in the tree.

## Fix: grid loading/empty states

Review finding (Important, user-approved): the events grid and the system-templates grid rendered an empty container both while the query was pending and when the list was empty — indistinguishable loading vs. empty states.

**Change** (2 files, nothing else touched; existing design tokens only, no comments):

- `app/app/[orgSlug]/events/page.tsx` — grid div replaced in place with a three-way conditional: `events === undefined` → `<p className="text-sm text-muted-foreground">Loading…</p>`; `events.length === 0` → `<p className="text-sm text-muted-foreground">No events yet - create your first event.</p>`; otherwise the original grid (now `events.map` without optional chaining), rendering unchanged.
- `app/app/[orgSlug]/events/new/page.tsx` — same pattern applied to the SYSTEM-template grid (section heading `Start from a template` kept): `templates === undefined` → `Loading templates…`; `templates.filter((tpl) => tpl.isSystem).length === 0` → `No templates available.`; otherwise the original filtered grid, rendering unchanged.

**Commands and output summaries:**

1. `Remove-Item -LiteralPath "tsconfig.tsbuildinfo" -Force; npm run typecheck` — **exit 0**, clean (fresh tsbuildinfo).
2. `npm run lint` — **0 errors**, 11 warnings (all pre-existing, in `convex/*` and test files; none in the touched pages).
3. `npm run build` — **success** (typecheck re-ran clean inside build; Turbopack compiled in 2.4s; all routes emitted; only pre-existing middleware→proxy deprecation warning).
4. `npm test` — **58/58 passing** (13 test files, 4.84s).

**Commit** (only the two page files staged; unrelated WIP — `app/graphify/`, `package.json`, `.superpowers/` — left untracked/modified):

```
git add "app/app/[orgSlug]/events/page.tsx" "app/app/[orgSlug]/events/new/page.tsx"
git commit -m "fix: distinguish loading and empty states on events and template grids"
# 2c2a6cd, 2 files changed, 35 insertions(+), 23 deletions(-)
```
