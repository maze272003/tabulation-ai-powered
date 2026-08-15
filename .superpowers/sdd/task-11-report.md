# Task 11 Report: Templates

**Status:** DONE
**Commit:** `2c745a7` — `feat: event templates - list, instantiate, save-as-template` (branch `phase2-competition-config`)

## Files

- Created: `convex/templates.ts` (`list`, `createFromEvent`, `remove`)
- Modified: `convex/events.ts` (appended `createFromTemplate`; existing code untouched)
- Created: `convex-test/templates.test.ts` (3 tests)
- Committed `convex/_generated/api.d.ts` regenerated via `npx convex codegen` (repo convention; +2 lines: `templates` module)

## TDD Evidence

### RED (`npm test` after writing only the test file)

```
 Test Files  1 failed | 12 passed (13)
      Tests  3 failed | 55 passed (58)
Error: Could not find module for: "templates"
 ❯ convex-test/templates.test.ts:6:52  (templateIdByName -> api.templates.list)
 ❯ convex-test/templates.test.ts:37    (api.templates.createFromEvent)
```

All 3 failures were `Could not find module for: "templates"` / unresolved `api.events.createFromTemplate` — exactly the expected RED (prior 55 tests passed).

### GREEN (`npm test` after implementing `templates.ts` + appending `createFromTemplate`, then `npx convex codegen`)

```
 Test Files  13 passed (13)
      Tests  58 passed (58)
   Duration  7.85s
```

### Typecheck gate

```
Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck  ->  tsc --noEmit, exit 0
```

(Verified exit 0 twice, including once on the final verbatim state; see Deviation Note.)

## Self-Review

- `templates.list`: requires org membership; returns system templates (`isSystem` filter) + org templates (`by_org_id` index) concatenated.
- `templates.createFromEvent`: gated by `requireDraftEvent(..., "event.create")` — draft-only snapshots. Snapshot captures `decimalPrecision`, `resultVisibility`, categories (`name`/`order`), rounds (`name`/`order`/`qualifiesToNextRound`/`scoringRules`) with nested criteria (`name`/`order`/`weight`/`minScore`/`maxScore`/`decimalPrecision`). Writes `template.created` audit.
- `templates.remove`: `event.create` permission; system template → `FORBIDDEN`; foreign-org template → `NOT_FOUND`; deletes + `template.removed` audit.
- `events.createFromTemplate`: `event.create` permission + `requireLimit(events)` before any write; template must be system or org-owned (else `NOT_FOUND`); slug via module-private `slugify`, conflict → `CONFLICT`; instantiates event (records `templateId`), snapshot categories or default `"Open"`, rounds and nested criteria; `incrementUsage(events, 1)`; `event.created` audit with `fromTemplate`; returns slug.
- Test 1 passes because `createOrgAndEvent` seeds system templates via `seedReferenceData`; Pro upgrade happens before instantiation (Free allows 1 event).
- No comments, no `any`, no `as never`; object-form function syntax with validators on every function (including `v.id("eventTemplates")`).

## Deviation Note (investigated, resolved as NO deviation)

The brief's `remove` contains `if (tpl.isSystem || tpl.orgId === null)`. Since `orgId` is `v.optional(v.id("organizations"))` and system templates store `orgId` ABSENT (`undefined`, never `null` — Task 2 convention), I suspected a TS2367 no-overlap comparison error. I tested both variants against the full gate:

- `tpl.orgId === undefined`: tests 58/58, `tsc --noEmit` exit 0.
- `tpl.orgId === null` (verbatim): tests 58/58, `tsc --noEmit` exit 0 — **no TypeScript failure**.

Final committed code is the brief's **verbatim** `=== null`. Observation (harmless dead clause): `=== null` can never match under this schema, but behavior is identical because `tpl.isSystem` alone catches system templates, and any hypothetical non-system ownerless template falls through to `tpl.orgId !== actx.org._id` → `NOT_FOUND` (correct "not yours" semantics). No functional difference; nothing to flag as a bug.

## Constraints Check

- Object-form function syntax: yes (all 4 functions across both files).
- Validators on every function: yes.
- No `any` / `as never`: yes (grep + typecheck clean).
- No code comments: yes (Select-String over `convex/templates.ts`, `convex/events.ts`, `convex-test/templates.test.ts` → zero matches).
- One commit with exactly: `convex/templates.ts`, `convex/events.ts`, `convex-test/templates.test.ts`, `convex/_generated/api.d.ts` (4 files, 205 insertions).

## Fix: dead clause removal

**Commit:** `6cc3253` — `fix: drop dead orgId null check in templates.remove` (branch `phase2-competition-config`)

### Change

`convex/templates.ts` line 71, in `remove`:

```diff
-    if (tpl.isSystem || tpl.orgId === null) {
+    if (tpl.isSystem) {
```

Review finding (Important, user-approved): `orgId` is `v.optional(v.id("organizations"))` and system templates are stored WITHOUT the key (never `null`), so `tpl.orgId === null` was dead code that could never fire. Behavior unchanged — `tpl.isSystem` alone guards the `FORBIDDEN` branch, and any non-system ownerless template still falls through to the `orgId !== actx.org._id` check (`NOT_FOUND`). Nothing else touched; no comments added.

### Verification

1. Covering test — `npx vitest run convex-test/templates.test.ts`:

   ```
    Test Files  1 passed (1)
          Tests  3 passed (3)
     Duration  895ms
   ```

   3/3 passing — test 3 "refuses to delete a system template" covers this exact branch.

2. Full suite — `npm test`:

   ```
    Test Files  13 passed (13)
          Tests  58 passed (58)
     Duration  5.21s
   ```

   58/58 passing.

3. Typecheck — `Remove-Item -LiteralPath "tsconfig.tsbuildinfo" -Force; npm run typecheck`:

   ```
   tsc --noEmit, exit 0 (no errors)
   ```
