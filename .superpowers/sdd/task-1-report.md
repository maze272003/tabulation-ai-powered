# Task 1 Report: Schema extension (Phase 2 — Competition Config Engine)

**Status:** DONE

## What was implemented

1. **`invitations.eventId` migration** — changed from `v.union(v.null(), v.string())` (with the Phase-2 marker comment) to `v.union(v.null(), v.id("events"))`. Marker comment removed.
2. **9 new tables appended** inside `defineSchema({...})` after `auditLogs`, verbatim from the brief:
   - `events` — indexes: `by_org_id_and_slug`, `by_org_id_and_status`, `by_org_id`
   - `categories` — index: `by_event_id`
   - `rounds` — index: `by_event_id`
   - `criteria` — index: `by_round_id`
   - `contestants` — indexes: `by_event_id`, `by_event_id_and_category_id`, `by_event_id_and_number`
   - `judges` — indexes: `by_event_id`, `by_event_id_and_user_id`, `by_user_id`
   - `judgeAssignments` — indexes: `by_judge_id`, `by_event_id`
   - `scoreSheets` — indexes: `by_event_id_and_round_id`, `by_judge_id_and_round_id`, `by_event_id_and_round_id_and_contestant_id`
   - `eventTemplates` — indexes: `by_org_id`, `by_name`

## Verify results (run in brief order)

1. `npx convex dev --once` — schema pushed cleanly to deployment `maze-839e1:tabulation-ai-powered:dev/maze`. All 20 new table indexes added; **no conflict** reported on the `invitations.eventId` narrowing (all existing values are null). "Convex functions ready! (8.18s)"
2. `Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck` — exit 0, no errors.
3. `npm test` — **31/31 tests passed** across 7 test files (3.34s). No new tests added, as specified.

## Files changed

- `convex/schema.ts` (+139 / -1)

## Commit

- `e34a8a3` — `feat: Phase 2 schema - events, config, participants, sheets, templates` (only `convex/schema.ts` staged; unrelated dirty SDD-tooling files left uncommitted)

## Self-review findings

- All 9 tables present with exact field names, validators, and index names as specified in the brief (diff compared line-by-line).
- Object-form conventions followed; no `v.any()` anywhere in the file; no code comments added.
- Nothing extra added beyond the two specified changes.
- No concerns.
