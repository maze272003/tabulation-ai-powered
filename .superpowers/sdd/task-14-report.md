# Task 14 Report: UI — settings, readiness, publish, templates library

## Status: DONE

## Files Created

1. `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx` (67 lines)
2. `app/app/[orgSlug]/events/[eventSlug]/readiness/page.tsx` (19 lines)
3. `app/app/[orgSlug]/events/[eventSlug]/publish/page.tsx` (66 lines)
4. `app/app/[orgSlug]/templates/page.tsx` (69 lines) — org-level, outside the event shell, renders its own `<h1>`

## Implementation Notes

- All four pages transcribed from `.superpowers/sdd/task-14-brief.md`. The brief file contained UTF-8 mojibake; decoded to the intended characters: `Loading…` and `From draft event…` (U+2026 ellipsis). All other punctuation in the code blocks is plain ASCII (e.g. `"Not ready - fix the failing items first."`, `"PASS - "`).
- Settings page render-phase state sync (`if (ev !== undefined && ev !== null && prevKey !== ev._id) { setPrevKey(...) ... }`) kept verbatim — React's documented "adjust state when props change" pattern.
- **One deviation from the brief (required):** publish page `run()` helper parameter type widened from `fn: () => Promise<void>` to `fn: () => Promise<unknown>`. The brief's code does NOT compile as written: Convex client mutations `publish`/`reopen`/`archive` are typed `Promise<null>` (Convex void functions return `null` to clients), producing TS2322 at all three call sites. `Promise<unknown>` is the minimal type-safe fix — no casts, no `any`, body unchanged. Verified: typecheck fails with the brief's type (3 × TS2322 at publish/page.tsx:42,48,51), passes with the fix.
- Verified backend surfaces before writing: `api.events.{get,update,readiness,listByOrg}`, `api.eventLifecycle.{publish,reopen,archive}`, `api.templates.{list,createFromEvent,remove}` all exist with matching arg shapes (`events.get` → `Doc<"events"> | null` with `venue: string | undefined`; `templates.list` → docs with `_id/name/isSystem/description`).

## Gate Outputs (Step 5)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck` | exit 0, no errors |
| Lint | `npm run lint` | 0 errors (11 pre-existing warnings, all in `convex/` + `convex-test/` files, none in new pages) |
| Build | `npm run build` | Success — includes `tsc --noEmit` pre-pass; all 4 new routes emitted (`.../settings`, `.../readiness`, `.../publish`, `/app/[orgSlug]/templates`) |
| Tests | `npm test` | 13 files, 58/58 passed (8.24s) |

## Commit

- `927e831` — `feat: settings, readiness, publish, templates UI` on branch `phase2-competition-config`
- Staged exactly the 4 page files (verified via `git status`: only `A` entries for the 4 paths). Unrelated user WIP (`.gitignore`, `.superpowers/`, `AGENTS.md`, `package.json`, `app/graphify/`, `.graphifyignore`) left untouched and unstaged.

## Self-Review

- [x] Pages match the brief (modulo the one documented `Promise<unknown>` fix above)
- [x] Status-gated actions: draft → Publish button (disabled while `failed.length > 0`); ready → Reopen (outline) + Archive (secondary); archived → "This event is archived." message; settings Save disabled unless draft/valid name
- [x] Error handling reads `.data.code` / `.data.message` on all mutations; `VALIDATION_ERROR` → "Not ready - fix the failing items first." toast; `CONFLICT` → "Configuration is locked."; success toasts per action ("Saved.", "Event published.", "Event reopened.", "Event archived.", "Template saved.")
- [x] No comments in any file
- [x] No `as never`, no `any` (only the brief's own `as { data?: ... }` object-literal casts on `err: unknown`)
- [x] Templates page: system templates render "(system)" and have no Delete button; save-from-draft requires both name and event selection
