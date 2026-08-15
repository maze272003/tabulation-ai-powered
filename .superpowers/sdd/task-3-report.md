# Task 3 Report: Event authz helpers

## Status: DONE

## What was done

Created `convex/lib/eventAuthz.ts` with the exact verbatim code from the brief:

- `EventAuthCtx` type (`AuthCtx & { event: Doc<"events"> }`)
- `resolveEventBySlug(ctx, { orgSlug, eventSlug })` — org member gate via `requireOrgMember`, then `events` lookup via `withIndex("by_org_id_and_slug", ...).unique()`, NOT_FOUND if missing
- `requireEventMember(ctx, { orgSlug, eventSlug })` — returns `EventAuthCtx`
- `requireEventPermission(ctx, { orgSlug, eventSlug, permission })` — FORBIDDEN if permission missing from `permissions` set
- `requireDraftEvent(ctx, { orgSlug, eventSlug, permission })` — CONFLICT ("Event configuration is locked") if `event.status !== "draft"`

## Pre-flight verification

- `convex/lib/authz.ts` exports `requireOrgMember(ctx, { orgSlug })` returning `AuthCtx` (includes `org`, `permissions: Set<string>`) — matches consumption.
- `convex/lib/errors.ts` exports `appError` and `ErrorCode` incl. `NOT_FOUND`, `FORBIDDEN`, `CONFLICT` — matches consumption.
- `convex/schema.ts:169` — `events` table has `.index("by_org_id_and_slug", ["orgId", "slug"])` — matches the index name and field order used.
- `convex/schema.ts:159` — `events.status` is `v.union(v.literal("draft"), v.literal("ready"), v.literal("archived"))` — `"draft"` comparison is type-valid.
- Read `convex/_generated/ai/guidelines.md` per AGENTS.md before writing Convex code.

## Verification

- `Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck` — exit 0, no errors.
- `npm test` — 7 test files, **32/32 tests passed** (baseline maintained; no new tests per brief).
- No deviations from the brief's code were needed — file matches the brief verbatim, no comments, nothing extra.

## Commit

- `ea08453` — `feat: event-domain authorization helpers` (single commit, only `convex/lib/eventAuthz.ts` staged; pre-existing unrelated working-tree modifications left untouched).

## Concerns

None. The brief's code compiled and passed the full gate without modification (unlike Task 2).
