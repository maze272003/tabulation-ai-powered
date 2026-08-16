# Final Whole-Branch Review Fixes — Phase 2 Competition Config

Date: 2026-08-16
Branch: `phase2-competition-config`
Commit: `5daa295e77d38935844d169edfb929b342c61667` — `fix: enforce canCreateTemplates gate, reject blank names, judge IDOR test`

## Fix 1 (Important): enforce the `canCreateTemplates` feature gate

- `convex/templates.ts` `createFromEvent`:
  - Added import `requireFeature` from `./lib/entitlements`.
  - Added `await requireFeature(ctx, eactx.subscription, "canCreateTemplates");` immediately after the `requireDraftEvent` call. Free/Starter plans (feature `false`) now throw `FEATURE_UNAVAILABLE`; Pro+ passes.
- `convex-test/templates.test.ts`:
  - "save-as-template round-trips a draft event config": moved `api.subscriptions.changePlan` (Pro) to before `api.templates.createFromEvent`; later `events.createFromTemplate` instantiation still works (plan already Pro).
  - Added negative test "refuses to save a template on the Free plan": `createOrgAndEvent` for `gala`, no plan change, `templates.createFromEvent` → `rejects.toMatchObject({ data: { code: "FEATURE_UNAVAILABLE" } })`.

## Fix 2 (merge-blocker Minor): reject blank names on config endpoints

Guard added with uniform message `"name must not be empty"` (`ErrorCode.VALIDATION_ERROR`):

- `convex/events.ts` `update`: `args.name !== undefined && !args.name.trim()` → throw, placed before building the patch. (`events.create` untouched — slugify-empty guard already covers it.)
- `convex/categories.ts` `add` (`if (!args.name.trim())`) and `update` (when provided).
- `convex/rounds.ts` `add` and `update` (same pattern).
- `convex/criteria.ts` `add` and `update` (same pattern).
- `convex/contestants.ts` `add` and `update` (same pattern).
- `convex-test/events.test.ts`: added "rejects an all-whitespace name on update with VALIDATION_ERROR" — update with `name: "   "` → `VALIDATION_ERROR`.

## Fix 3 (merge-blocker Minor): judges IDOR negative test

- `convex-test/judges.test.ts`:
  - Third test title adjusted to "adds and removes scoped assignments" (it previously claimed IDOR coverage it did not have; its body is unchanged).
  - Appended new test "refuses to remove a judge scoped to another event (IDOR)": `createOrgAndEvent` for event `one`, upgrade to Pro via `api.subscriptions.changePlan` (Alice is Org Owner; needed because Free plan caps maxEvents=1), provision Bob via existing `addBobAsJudgeMember` helper, `judges.add` on `one`, create second event `api.events.create({ orgSlug: "acme", name: "Two", slug: "two" })`, then `judges.remove({ orgSlug: "acme", eventSlug: "two", judgeId: <judge from event one> })` → `rejects.toMatchObject({ data: { code: "NOT_FOUND" } })`.

## Verification (exact commands + results)

| Gate | Command | Result |
|---|---|---|
| Tests | `npm test` | 13 files, **61/61 passed** (baseline 58 + 3 new) |
| Typecheck | `Remove-Item -LiteralPath "tsconfig.tsbuildinfo" -Force; npm run typecheck` | exit **0** |
| Lint | `npm run lint` | exit **0**; 0 errors, 11 warnings (pre-existing, e.g. `no-filter-in-query` in `convex/templates.ts:15`) |
| Build | `npm run build` | exit **0**; Next.js route table rendered successfully |

## Commit

Staged only the nine touched files (user WIP — `app/graphify/`, `package.json`, `.graphifyignore`, `AGENTS.md`, `.gitignore` — left unstaged):

```
git add convex/templates.ts convex/events.ts convex/categories.ts convex/rounds.ts convex/criteria.ts convex/contestants.ts convex-test/templates.test.ts convex-test/events.test.ts convex-test/judges.test.ts
git commit -m "fix: enforce canCreateTemplates gate, reject blank names, judge IDOR test"
```

Result: `5daa295` — 9 files changed, 53 insertions(+), 2 deletions(-).

## Constraints check

- No comments added; no `any` / `as never`; object-form function syntax preserved; conventional commit message.
