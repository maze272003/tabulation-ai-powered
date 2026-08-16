# Task 5 Report: Categories and rounds

**Status:** DONE
**Commit:** `520cfce` — `feat: categories and rounds with draft gating and cascade delete`
**Branch:** `phase2-competition-config`

## Files created

- `convex/categories.ts` — `add`, `update`, `remove`, `list` (verbatim from brief)
- `convex/rounds.ts` — `add`, `update`, `remove`, `list` with joined `criteria` (verbatim from brief)
- `convex-test/config.test.ts` — 3 tests (verbatim from brief)
- `convex/_generated/api.d.ts` — regenerated via `npx convex codegen` (adds `categories` and `rounds` modules; repo convention from Task 4)

## TDD evidence

### RED (after writing `convex-test/config.test.ts`, before implementation)

```
 Test Files  1 failed | 8 passed (9)
      Tests  3 failed | 39 passed (42)
```

Failure cause (expected): `Could not find module for: "categories"` / `"rounds"` — `api.categories` / `api.rounds` undefined; all 3 new tests failed while the prior 39 passed.

### GREEN (after implementing `convex/categories.ts` + `convex/rounds.ts`)

```
 Test Files  9 passed (9)
      Tests  42 passed (42)
```

## Gate results

- `npm test`: 42/42 passed
- `npx convex codegen`: regenerated `api.d.ts` successfully
- `Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck`: exit 0

## Tests written

1. `adds and lists categories in order` — creates org+event (seeds default "Open" category via `events.create`), adds "Juniors", asserts `["Open", "Juniors"]` order.
2. `adds rounds and lists them with criteria joined` — adds "Preliminary"/"Final", asserts order and that each round has a joined `criteria` array.
3. `unknown event slug yields NOT_FOUND` — `categories.add` on nonexistent event slug rejects with `{ data: { code: "NOT_FOUND" } }`.

## Self-review checklist

- [x] `convex/categories.ts` and `convex/rounds.ts` match the brief verbatim (no modifications needed)
- [x] All ID-arg mutations (`categories.update/remove`, `rounds.update/remove`) verify `doc.eventId === eactx.event._id` and throw `NOT_FOUND` otherwise
- [x] `categories.remove` throws `CONFLICT` when contestants reference the category (`by_event_id_and_category_id` index, `.first()`)
- [x] `rounds.remove` deletes the round's criteria before deleting the round; audit records `criteriaDeleted` count
- [x] `rounds.list` returns rounds with joined `criteria` array
- [x] Mutations gated by `requireDraftEvent(..., permission: "event.update")`; lists gated by `requireEventMember`
- [x] All mutations write audit entries via `writeAudit`
- [x] Object-form function syntax; validators on every function; no `any`/`as never` (`Record<string, unknown>` used in `rounds.update` per brief); no comments
- [x] Single commit containing exactly the 4 intended files

## Deviations

None. The brief's verbatim code compiled and passed on the first attempt — no latent bugs encountered (unlike Tasks 2 and 4).

## Notes

- Test 1's `["Open", "Juniors"]` expectation relies on `events.create` seeding a default "Open" category (implemented in Task 4, `convex/events.ts:38`) — verified consistent.
- List ordering relies on the `by_event_id` index's ascending order with `_creationTime` tiebreak, matching insertion order.
