# Task 2 Report: Permissions, role wiring, system templates

## Status: DONE_WITH_CONCERNS (3 small, documented deviations from verbatim brief code — all forced by schema/type-system failures; data values 100% verbatim)

## What was implemented

### 1. `convex/lib/constants.ts`
- Appended 8 event-domain permissions to `SYSTEM_PERMISSIONS` exactly as specified: `event.create`, `event.view`, `event.update`, `event.delete`, `event.publish`, `event.archive`, `contestant.manage`, `judge.manage` (with categories/descriptions verbatim).
- Replaced `ROLE_PERMISSIONS` entirely with the brief's version. Verified Event Admin gets NO `event.delete` (spec §2). Org Owner/Org Admin retain full event-domain grants including `event.delete`.
- Appended `SYSTEM_TEMPLATES` with Pageant / Singing / Quiz templates — all names, descriptions, decimalPrecision, resultVisibility, rounds, criteria (names, orders, weights, min/max, precision) verbatim from the brief.

### 2. `convex/seed.ts`
- Updated import to include `SYSTEM_TEMPLATES`.
- Appended idempotent template-seeding loop at the end of `seedReferenceData`'s handler (after the plans loop): query `eventTemplates` filtered on name + `isSystem: true`, insert if absent.

### 3. `convex-test/seed.test.ts`
- Appended `"seeds system templates idempotently"` test inside the existing `describe`, verbatim: two `seedReferenceData` runs, then counts `isSystem` templates via `t.run` and asserts exactly 3. This genuinely exercises idempotency — it fails (count = 1) against a non-idempotent filter and passes only when the second run inserts nothing.

## Deviations from the brief (with reasons)

The brief's code blocks were specified as verbatim, but three snippets could not compile/run against the Task 1 schema and Convex/TS semantics. Each was fixed minimally; all data values, names, and structure are unchanged:

1. **`orgId: null` omitted from the template insert.**
   `eventTemplates.orgId` is `v.optional(v.id("organizations"))` (schema.ts:254). Convex `v.optional` accepts field-absence/`undefined`, NOT explicit `null` — the verbatim insert threw `Validator error: Expected string, got null`, cascading into 23 test failures. Omitting the field is semantically identical (system templates have no org).

2. **`&&` → `q.and(...)` in the seed filter.**
   JavaScript cannot overload `&&`; in `q.eq(...) && q.eq(...)` the first operand is truthy, so the whole expression evaluates to just the second condition (`isSystem: true`), silently dropping the name check. Result: the first inserted template matched as "existing" for the other two, so only 1 of 3 templates was created (test observed `expected 1 to be 3`). Fixed with `q.and(q.eq(q.field("name"), tpl.name), q.eq(q.field("isSystem"), true))`, preserving the brief's exact semantics.

3. **`as const` dropped on `SYSTEM_TEMPLATES`, replaced with an explicit type annotation.**
   - With `as const`: `tsc` error TS2322 — readonly arrays are not assignable to the mutable array types `v.array()` infers for `configSnapshot` (readonly object *properties* are assignable; readonly *arrays* are not — this is why `SYSTEM_PLANS` with `as const` works: it contains no arrays).
   - Without any annotation: `resultVisibility` widened to `string`, failing the `"private" | "organization" | "public"` union.
   - Resolution: `export const SYSTEM_TEMPLATES: { name: string; description: string; configSnapshot: Doc<"eventTemplates">["configSnapshot"] }[]` with `import type { Doc } from "../_generated/dataModel"` — the established pattern in `convex/lib` (used by authz.ts, auth.ts, entitlements.ts). Array data remains verbatim; no casts, no duplicated shape.

## Verification evidence

- `npm test`: **32/32 passed (7 files)** — matches expected baseline 31 + 1 new.
  - Intermediate runs documented the failures that motivated deviations 1 and 2 (23 failed with validator error on `null`; then 1 failed with `expected 1 to be 3`).
- `Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck`: **exit 0** (after deviation 3; the verbatim form produced the TS2322 quoted above).
- No comments added anywhere; nothing beyond the three specified files changed.

## Files changed (commit `02b5762`)

- `convex/lib/constants.ts` (+75/−8)
- `convex/seed.ts` (+15/−1)
- `convex-test/seed.test.ts` (+10/−1)

Commit message (exact, per brief): `feat: event-domain permissions, role wiring, system templates`
Branch: `phase2-competition-config`

## Self-review findings

- Permission lists: byte-compared against brief — verbatim. Event Admin list contains exactly 9 permissions, no `event.delete`. ✓
- Template data: all 3 templates' names, descriptions, config values byte-compared — verbatim. ✓
- No code comments. ✓
- No extra functionality, no schema changes, no out-of-scope edits. Unrelated dirty files in the worktree (`.gitignore`, `.superpowers/sdd/*`) were left unstaged. ✓
- Concern for downstream tasks: system template docs have NO `orgId` field (absent, not `null`) — any future query filtering `orgId === null` should use absence/`undefined` semantics or `q.eq(q.field("orgId"), undefined)`.
