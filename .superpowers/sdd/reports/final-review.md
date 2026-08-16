# Phase 3 Final Whole-Branch Review — Tabulation Engine + UI Modules

**Range:** `dc35971..HEAD` (20 tasks: engine Tasks 2–11, modules Tasks 1–10)
**Inputs:** `final-review-package.md` (commits + stat + full diff), `progress.md` ledger, engine design §1–§5, UI/UX modules §2–§5, repo spot-checks.
**Gate status (controller):** typecheck / lint / build / 122 tests green — not re-run per review instructions.

---

## Verdict: **With fixes**

3 Important findings must be fixed before merge. No Critical findings. The remaining Minors are deferrable. Overall the branch is faithful to both specs: security posture (server-side identity, NOT_FOUND ID guards on all mutations, monitor/review blackout payloads, results visibility gating), immutability (`scores` rows are never patched or deleted anywhere in `convex/`; `resultVersions` write-once; corrections create vN+1 only), determinism (pure core, id-sorted inputs, fixed 1e-6 precision, no `Date.now()`/randomness inside `convex/lib/tabulation.ts`), and Convex hygiene (validators on every function, no `v.any()`, precise snapshot validator, indexed queries, loops bounded by plan config scale) all check out and are test-backed.

---

## What was verified clean (evidence)

- **Authz / identity**: every new public mutation derives identity via `requireEventPermission`/`requireReadyEvent`/`requireDraftEvent`; ID-bearing args verified — `loadRound` (`convex/lib/eventAuthz.ts:63-71`), `loadOwnSheet` sheet ownership (`convex/scoring.ts:29-46`), `tieBreak.eventId` (`convex/roundAdmin.ts:180-184`), `override.eventId` (`roundAdmin.ts:236-240`), contestant-in-event checks in `addTieBreak`/`addAdvancementOverride`/`correctResults`. Cross-judge IDOR, cross-event, unauthenticated, and permission-less paths are integration-tested (`scoringEntry.test.ts`, `roundLifecycle3.test.ts`, `reviewDecisions.test.ts`). One exception → Finding I-3.
- **Blackout / no score leak pre-publish**: `roundMonitor` returns statuses only (test asserts payload JSON contains no `"value"`/`draftValues`); `roundReview` standings are `score.manage`-gated and closed-round-gated per spec; `myAssignments`/`sheetDetail` expose only the caller's own sheet/drafts; `draftValues` cleared on submit.
- **Results visibility**: `requireResultAccess` enforces `result.view` + `private → score.manage` (`convex/results.ts:12-24`), matching engine spec §2; tested for private vs organization.
- **Immutability**: repo-wide grep confirms `scores` is only inserted (`scoring.ts:157-168`), never patched/deleted; `eventLifecycle.reopen` sheet deletion is now double-guarded (all rounds open AND no submitted/locked sheets — so no `scores` rows can exist), exactly the tightening spec §4 required; `resultVersions` only inserted; `correctResults` inserts vN+1 with required trimmed reason; `finalizeEvent` locks corrections (tested).
- **Determinism**: core sorts by id everywhere (contestants, judges, criteria by weight-then-id), `roundToPrecision` fixed precision, `judgeFirsts`/`applyAdvancement`/`computeEventFinal` pure with id tiebreaks; repeat-run determinism test present. `Date.now()` appears only for audit/createdAt metadata outside the core. (One determinism hole → Finding I-2.)
- **Convex correctness**: validators on all 20+ new functions; no `v.any()`; snapshot is a precise `v.object`; new indexes (`scores`, `resultVersions`, `tieBreaks`, `advancementOverrides`, sheet compound index) all used by their consumers; per-round/per-version queries are loop bodies bounded by config scale (plan-mandated), no unbounded N+1 beyond that; tie-break arrays bounded by permutation validation + contestant-in-event NOT_FOUND.
- **Lifecycle**: close/reopen/publish windows enforced (`CONFLICT` on wrong status), publish blocked on `TIES_UNRESOLVED`, finalize requires every round published, reopen-to-draft tightened, `archived` accepts `finalized`. Readiness extended with `rounds.weightsSum` + `rounds.advancement` and gated through `eventLifecycle.publish` (`eventLifecycle.ts:15-19`).
- **UI**: status colors are token-only (`globals.css` success/warning/info triplets light+dark; no hardcoded hex; the one gradient uses `var(--info)`); error handling reads `.data.code` with the §5.4 copy map; a11y basics present (Label/htmlFor on criteria inputs, `aria-describedby` errors, `sr-only` captions, aria-label on dots/progress, `aria-live` SaveIndicator); confirm dialogs on close/publish/finalize/correct; locked post-submit state with no edit affordance; `beforeunload` guard; no-double-submit disabled states.

---

## Findings

### Important (fix before merge)

**I-1. Scoring home crashes (white screen) for every role except Judge.**
`app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx:21-31` — `myAssignments` requires `score.enter`, which per `convex/lib/constants.ts` is granted **only to the Judge role**. Any other event member (Tabulator, Event Admin, Org Owner/Admin, Staff, Viewer) clicking the always-rendered "Scoring" nav item gets a `FORBIDDEN` query error; Convex `useQuery` then returns an `Error` object, `mine.judgeId === null` is false (`undefined`), and `mine.rounds.length` at line 31 throws `TypeError` → runtime crash. This is the ledger's deferred "pages skip instanceof Error branching" Minor (Modules Tasks 5/9) — triaged **must-fix**: it is a hard crash on a primary nav item for the majority of roles, squarely inside the "no obvious runtime crash paths" review gate. Fix: branch on `mine instanceof Error` → permission empty state (mirror the monitor page's `FORBIDDEN` hint).

**I-2. Tabulation core produces NaN round scores for scoreless active contestants / uncovered criteria → publish fails opaquely and determinism breaks.**
`convex/lib/tabulation.ts:41` — `avg = sum / used.length` divides by zero when no judge submitted a score for a contestant-criterion (`entries` empty ⇒ `0/0 = NaN`); NaN survives into `roundScore` and passes the rankable filter at `tabulation.ts:167` (`NaN !== null`), the sort comparator at :170 returns NaN (engine-defined, non-deterministic ordering), and `publishRound` then attempts to insert a NaN into the `resultVersions` snapshot `v.number()` — Convex rejects non-finite numbers, so publish dies with an opaque data-validation error instead of an app error. Reachable in the supported flow where a round is closed with unsubmitted sheets (the close dialog explicitly promises "unsubmitted sheets will be excluded from results"), and more easily via criterion-scoped assignments that leave a criterion with zero scoring judges (readiness does not check criterion coverage). Spec §5 step 1 collects only submitted/locked sheets; scoreless rankable contestants/criteria must be excluded (unranked or 0-contribution) rather than NaN'd. Fix in the pure core + a unit test (empty entries; contestant with zero scores).

**I-3. `sheetDetail` returns docs for IDs not verified against the resolved event (NOT_FOUND pattern gap, cross-org read).**
`convex/scoring.ts:104-109` — `criteria` is fetched by raw `args.roundId` and `contestant` by raw `args.contestantId` with no `eventId`/event-scope check, so a caller with `score.enter` (in their own event) can retrieve another org's criterion set (names, weights, ranges) and contestant doc (name, number) by supplying foreign IDs. The `sheet` itself is correctly event-scoped, so exploitability is low (opaque 32+ char IDs), but it violates the spec §3 rule that every ID-bearing argument is verified against the resolved event, and the fix is one `loadRound` + one contestant-event check returning `NOT_FOUND`.

### Minor (deferrable, with triage)

**M-1. Review standings scores render at precision 0.** `app/.../rounds/[roundId]/review/page.tsx:237` — `<Num value={row.roundScore} />` omits `precision={ev.decimalPrecision}` (event not fetched on this page); 89.2 renders "89", violating UI spec §1.2 (fixed decimals, trailing zeros). Results pages do it correctly. **Defer or fix cheaply pre-merge.**

**M-2. Results tables flatten categories; duplicate ranks unexplained.** `convex/results.ts:94` — `eventResults` flatMaps snapshot categories into one standings list; `RoundResultsCard` and the final-standings table render a single table, so multi-category events show interleaved rows with duplicate per-category rank numbers and no category column (review page groups correctly). **Defer** (display clarity for multi-category events).

**M-3. Final standings silently renumber ranks.** `convex/lib/tabulation.ts:338` — `computeEventFinal` assigns sequential 1..n ranks; UI spec §4.5 requires gaps from ties/elimination kept visible ("never renumbered silently"). **Defer.**

**M-4. Version-number race under concurrent publish/correct.** `convex/roundAdmin.ts:284,341` — `version = max+1` then insert; two concurrent `correctResults` calls can both read the same set and commit duplicate version numbers (Convex has no unique index to enforce it; single-tabulator reality makes this unlikely). **Defer.**

**M-5. Correction-time `overrides` are not frozen into snapshot decisions.** `convex/roundAdmin.ts:341` + `convex/lib/roundCompute.ts:136` — `correctResults`' optional `overrides` arg shapes the snapshot's `advanced` flags but is omitted from `snapshot.decisions.advancementOverrides` (only persisted rows are frozen), so a corrected snapshot's outcomes aren't reconstructable from its own decisions record; audit logs only `{version, reason}`. UI never passes the arg today. **Defer.**

**M-6. Overlapping tie-break rows silently resolved first-match.** `convex/lib/tabulation.ts:124` — `manualRankFor` returns the first row containing the contestant; `addTieBreak` doesn't reject a second, conflicting break for the same contestants. **Defer.**

**M-7. Ledger Minors (Modules Task 7/8, Engine Task 6) — confirmed, defer:** `review/page.tsx:129` `tieError` never resets (stale destructive tint after ties resolved) and `review/page.tsx:377` `setPositions({})` wipes all tie groups' inputs when one group saves; results-page Correct dialog's confirm isn't disabled for an empty reason (server-side `VALIDATION_ERROR` toast covers it); whole-group `separatedBy` label takes the last pair's tier when pairs resolve at different tiers (`tabulation.ts:214`).

### Ledger Minor triage summary

| Ledger item | Triage |
|---|---|
| "pages skip instanceof Error branching" (Modules 5/9) | **Must fix** → Finding I-1 (crash, not a polish issue) |
| tieError never resets / shared positions (Modules 7) | Defer → M-7 |
| correct dialog relies on server-side reason validation (Modules 8) | Defer → M-7 |
| whole-group separatedBy tier label (Engine 6) | Defer → M-7 |

---

## Conclusion

The engine, authz model, immutability guarantees, and UI token system are production-quality and match the approved specs. Fix I-1 (crash), I-2 (NaN core edge), and I-3 (sheetDetail scope guard), re-run the controller gate, and this branch is merge-ready; the Minors can ride the next iteration.

**Final verdict: With fixes.**
