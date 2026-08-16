# Phase 3 Final Review — Fix Report

**Date:** 2026-08-16
**Scope:** Important findings I-1, I-2, I-3 from `final-review.md`

---

## I-1 — Scoring home crash for non-Judge roles

**File:** `app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx`

**Change:** Added an `mine instanceof Error` branch directly after the loading skeleton branch. It renders an `EmptyState` ("Scoring unavailable" / "You may not have permission to enter scores for this event.") instead of falling through to `mine.rounds.length`, which threw `TypeError` when Convex `useQuery` returned a `FORBIDDEN` Error object for roles without `score.enter`.

**Test:** UI-only change; covered by the review's manual triage. No unit test added (page component, no component-test harness in repo).

**Validation:** not run per instructions (no build/typecheck); change is a pure guard branch using the already-imported `EmptyState`.

---

## I-2 — NaN round scores for contestants with zero submitted score rows

**File:** `convex/lib/tabulation.ts`

**Change:**
- `computeContestantCriteria` now skips criteria with zero score entries (`entries.length === 0` → no `CriterionResult` emitted) instead of computing `0/0 = NaN` via `aggregateJudgeValues`. Participation is per-criterion: an unjudged criterion contributes nothing.
- `computeRoundStandings` marks an active contestant with no score rows at all as unrankable: `roundScore: null`, `rank: null`, `criterionScores: []` — mirroring the scratched/disqualified handling, driven by a `hasScoreRows` check so `computeRoundScore([])` (= 0) can never leak a numeric score for a scoreless contestant. NaN can no longer reach the rankable filter, the sort comparator, or the `v.number()` snapshot on publish.

**Test command:** `npx vitest run convex-test/tabulationCore.test.ts`

**Output:**

```
 Test Files  1 passed (1)
      Tests  25 passed (25)
```

New tests:
- `contestant with no score rows is unrankable without NaN` — k2 with zero score rows → `rank` null, `roundScore` null, `criterionScores` empty; asserts `!Number.isNaN` on every emitted numeric score (roundScore, avgRaw, contribution, dropped values); `unresolvedTies` empty (publish path unaffected); k1 still ranks 1.
- `criterion with zero entries contributes nothing` — removing all cr2 rows yields single-criterion `criterionScores` with no NaN and unchanged deterministic ranking.

All 23 pre-existing tests still pass — no behavior change for fully-scored rounds.

---

## I-3 — `sheetDetail` fetched docs by raw IDs without event-scope verification

**File:** `convex/scoring.ts` (`sheetDetail`)

**Change:** `roundId` is now resolved through the existing `loadRound` helper (throws `NOT_FOUND` when the round is missing or `round.eventId !== event._id`), and the contestant doc is guarded with the repo pattern `!contestant || contestant.eventId !== eactx.event._id` → `appError(ErrorCode.NOT_FOUND, "Contestant not found")`. The scoreSheet and criteria queries now use the verified `round._id`. Cross-org/cross-event round or contestant IDs no longer leak criterion sets or contestant docs. The score-entry page consumer degrades gracefully (query Error → existing "Contestant not found" empty state).

**Test command:** `npx vitest run convex-test/scoringEntry.test.ts`

**Output:**

```
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

New test: `sheetDetail rejects ids from a foreign event` — builds a second org/event fixture (fresh org, so per-org plan limits are respected), then asserts `sheetDetail` on `acme/gala` rejects with `{ data: { code: "NOT_FOUND" } }` both for a foreign roundId (with a local contestantId) and for a local roundId with a foreign contestantId.

All 7 pre-existing tests still pass.

---

## Summary

| Finding | File | Status |
|---|---|---|
| I-1 runtime crash | `app/.../scoring/page.tsx` | Fixed |
| I-2 NaN avg | `convex/lib/tabulation.ts` | Fixed + 2 unit tests |
| I-3 sheetDetail ID guard | `convex/scoring.ts` | Fixed + 1 integration test |

Both covering suites pass in full: 25/25 and 8/8.
