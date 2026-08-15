# Phase 3 — Tabulation Engine (Design Spec)

**Project:** Tabulation SaaS (`tabulation-ai-powered`)
**Phase:** 3 of 7 (Tabulation Engine)
**Status:** Approved design — pending user review
**Date:** 2026-08-16
**Builds on:** Phase 1 Foundation + Phase 2 Competition Config Engine (backend complete on `phase2-competition-config` @ `2c745a7`)

---

## 0. Context

Phase 1 shipped auth, multi-tenancy, RBAC, entitlements, audit, and the app shell.
Phase 2 shipped the full competition-config backend: events, categories, rounds,
criteria + weights, contestants, judges + scoped assignments, score-sheet
skeletons, templates, readiness checklist, and the `draft → ready → archived`
lifecycle with sheet generation. Phase 2's admin UI (plan tasks 12–14) and final
verification (task 15) were **deferred** and are executed as the first stage of
this phase's build order (§8).

**Phase 3 ships the deterministic tabulation engine + all remaining UI**: judge
score entry, tabulator round management, results with versioning and
finalization — plus the Phase 2 Event Control Center screens so the whole flow
is usable end-to-end.

**In scope:** judge score entry (autosave draft, submit), strict score
immutability, a pure deterministic scoring core (aggregation with optional
drop-hi/lo, weighting, ranking, tie-break cascade, advancement rules), round
lifecycle (`open → closed → published`), result snapshots with versions and
post-publish corrections, event finalization, blackout-before-publish
visibility, judge/tabulator/results UI, Phase 2 admin UI.
**Out of scope:** public results portal (Phase 5), notifications/email (Phase
5), simulation mode (Phase 5), reports/PDF/certificates (Phase 4),
judge-consistency analytics (Phase 7), offline scoring (Phase 7).

### Decisions captured during brainstorm

| # | Decision | Choice |
|---|---|---|
| 1 | UI scope | Engine + judge/tabulator/results UI **+ Phase 2 admin UI** (existing plan tasks 12–15 executed first) |
| 2 | Judge aggregation | **Configurable drop hi/lo** per event (`events.scoringRules.dropHighLow`, default false); applies only when ≥ 3 judges scored that contestant-criterion; drop one highest + one lowest |
| 3 | Tie-breaking | Cascade: (a) higher score in highest-weight criterion (descending weights), (b) per-judge first-place counts among the tied group, (c) manual `tieBreaks` rows, (d) else publish blocked `TIES_UNRESOLVED` |
| 4 | Advancement | Event-level `eliminationEnabled` + per-round `advancement` rule: `none / top_count / top_percent / manual`, with `allowOverride`; overrides force advance/cut. Extensible shape (mode union + params object) |
| 5 | Score edits | **Strict immutable on submit.** No unlock flow, no edits. Corrections only via a new `resultVersions` entry (reason required) after publish |
| 6 | Visibility | **Blackout until publish.** No standings query exists for unpublished rounds; tabulators see submission progress (counts) only |
| 7 | Cross-round combination | Per-round integer `weight` (sums to 100 across the event); final standing = Σ roundScore × roundWeight; "final round standing" expressed as 100/0/0 weights |
| 8 | Architecture | **A: deterministic pure-function core** (`convex/lib/tabulation.ts`, no I/O) + immutable `resultVersions` snapshots persisted at publish/correction |

### Phase 2 interfaces Phase 3 builds on

- `scoreSheets` skeleton rows (judge × round × contestant, status
  `not_started | in_progress | submitted | locked`) generated on `draft → ready`.
- `criteria` carry `weight` (integer %, sums to 100 per round), `minScore`,
  `maxScore`, `decimalPrecision`.
- `judgeAssignments` scope a judge by round/category/criterion (null = all in scope).
- `rounds.qualifiesToNextRound`, `rounds.scoringRules.winner`
  (`highest | lowest`), `events.decimalPrecision`, `events.resultVisibility`.
- `requireEventMember` / `requireEventPermission` / `requireDraftEvent`
  (`convex/lib/eventAuthz.ts`) returning `EventAuthCtx`.
- Entitlements, `writeAudit`, typed `appError` codes, convex-test harness,
  RBAC permission tables + `seedReferenceData` idempotent seeding.

---

## 1. Data Model

### Schema changes to existing tables (all draft-gated edits via `requireDraftEvent`)

**`events`**
- `status: union<"draft", "ready", "finalized", "archived">` (new `finalized`)
- `scoringRules: object<{ dropHighLow: boolean }>` (new; default `{ dropHighLow: false }`)
- `eliminationEnabled: boolean` (new; default `true`)

**`rounds`**
- `weight: number` (new; integer 0–100, cross-round combination share)
- `status: union<"open", "closed", "published">` (new; default `"open"`)
- `advancement: object<{
    mode: union<"none", "top_count", "top_percent", "manual">,
    count: optional<number>,
    percent: optional<number>,
    allowOverride: boolean,
  }>` (new; default `{ mode: "none", allowOverride: true }`)

**`scoreSheets`** gains:
- `draftValues: optional<record<v.string(), v.number()>>` — autosaved draft
  scores keyed by criterionId (bounded by criteria-in-scope count); cleared on
  submit. Keyed record (not array) so partial drafts stay small and mergeable.

Readiness checklist (§4) extends: when the event has > 1 round, round weights
must sum to exactly 100 (single-round events: the round's weight must be 100).
`advancement.count` required when `mode: "top_count"`; `advancement.percent`
(1–100) required when `mode: "top_percent"`. An `advancement` rule is only
meaningful when `qualifiesToNextRound && eliminationEnabled`; the UI hides it
otherwise (validation stays server-side regardless).

### New tables

**`scores`** — the immutable score history. One row per submitted sheet per criterion.
- `sheetId: Id<"scoreSheets">`
- `eventId: Id<"events">`, `roundId: Id<"rounds">`
- `judgeId: Id<"judges">`, `contestantId: Id<"contestants">`, `criterionId: Id<"criteria">`
- `value: number` (validated: within criterion min/max at criterion precision)
- `submittedAt: number` (ms since epoch), `submittedById: Id<"userProfiles">`
- Indexes: `by_sheet_id`, `by_event_id_and_round_id`,
  `by_event_id_and_round_id_and_contestant_id`.
- **Never patched, never deleted** by any application mutation.

**`resultVersions`** — immutable computed-result snapshots.
- `eventId: Id<"events">`, `roundId: Id<"rounds">`
- `version: number` (1 on publish; +1 per correction; highest per round is authoritative)
- `snapshot: object<{ … }>` — precise shape in §5
- `createdById: Id<"userProfiles">`, `createdAt: number`
- `reason: optional<string>` (required on corrections v ≥ 2)
- Indexes: `by_round_id`, `by_event_id`.
- Immutable once inserted.

**`advancementOverrides`** — tabulator decisions layered on the computed cut.
- `roundId: Id<"rounds">`, `eventId: Id<"events">`
- `contestantId: Id<"contestants">`
- `action: union<"force_advance", "force_cut">`
- `createdById: Id<"userProfiles">`, `createdAt: number`
- Indexes: `by_round_id`, `by_event_id_and_contestant_id`.
- Settable only while `rounds.status === "closed"`. Applied by the compute core
  at publish; frozen verbatim into the snapshot.

**`tieBreaks`** — manual tie resolutions (cascade step c).
- `roundId: Id<"rounds">`, `eventId: Id<"events">`
- `tiedContestantIds: array<Id<"contestants">>` (the tie group, ≥ 2)
- `orderedIds: array<Id<"contestants">>` (explicit final order of that group)
- `createdById: Id<"userProfiles">`, `createdAt: number`
- Indexes: `by_round_id`, `by_event_id`.
- Same window as overrides (`closed` only); arrays are bounded by category size.

### Key schema decisions

- Draft values live on the sheet doc (small, bounded record); submitted values
  live in immutable `scores` rows. The two never mix.
- Snapshots are write-once `v.object`s — no `v.any()`; a precise snapshot
  validator makes historical versions forever parseable.
- Tie-break and override decisions are separate small tables (not blob fields)
  so they are individually auditable and testable; they freeze into the
  snapshot at publish.
- No standings table, no live-standings query — blackout is enforced
  structurally (Decision 6 / Architecture A).

---

## 2. Permissions Extension

New permissions seeded into `SYSTEM_PERMISSIONS` and wired into
`ROLE_PERMISSIONS` (idempotent `seedReferenceData` extension):

- `score.enter` — submit own score sheets
- `score.manage` — close/reopen/publish rounds, tie-breaks, advancement
  overrides, corrections, finalize event
- `result.view` — view published results

| Role | New permissions |
|---|---|
| Org Owner, Org Admin | `score.manage`, `result.view` |
| Event Admin | `score.manage`, `result.view` |
| Tabulator | `score.manage`, `result.view` |
| Judge | `score.enter`, `result.view` |
| Staff | `result.view` |
| Viewer | `result.view` |

**`score.enter` enforcement is ownership-based:** the server resolves the
caller's `judges` row for the event (by `userId`); a mutation referencing a
sheet whose `judgeId` does not match → `NOT_FOUND` (indistinguishable from a
missing sheet — no existence leak). Cross-judge IDOR is tested explicitly.

**`result.view` enforcement is visibility-based:** published results are
readable by permission holders subject to `events.resultVisibility`:
- `"private"` → requires `score.manage` (org staff inner circle)
- `"organization"` → any active org member with `result.view`
- `"public"` → same as organization for now; the public portal lands in Phase 5

---

## 3. Authorization Helpers (extend `convex/lib/eventAuthz.ts`)

- `requireJudgeSheet(ctx, { orgSlug, eventSlug, sheetId })` → `{ actx, sheet }` —
  `requireEventPermission("score.enter")` + resolves the caller's judges row +
  verifies sheet ownership and `sheet.eventId === event._id`.
- `requireScoringRound(ctx, { orgSlug, eventSlug, roundId })` → `{ actx, round }` —
  `requireEventPermission("score.manage")` + `round.eventId` check + event
  `status === "ready"` (scoring flows only on ready events).
- `requireClosedRound(...)` / `requirePublishedRound(...)` — status gates for
  the review/publish/correction windows.
- `requireReadyEvent(ctx, ...)` — reused from event scoring entry; `finalized`
  and `archived` events refuse all score mutations.

All new mutations derive identity server-side; every ID-bearing argument is
verified against the resolved event (`NOT_FOUND` on mismatch), matching the
Phase 2 IDOR-guard pattern.

---

## 4. Lifecycle & Flows

### Round lifecycle (`rounds.status`)

- **`open`** — judges enter/submit sheets (event must be `ready`, round `open`).
  Tabulator sees the monitor grid (counts only).
- **`closed`** — tabulator action (audited). Unsubmitted sheets are blocked from
  submitting. The review screen becomes available: computed standings (via the
  pure core, inside `score.manage`-gated functions only), tie-resolution
  controls, advancement cut preview + overrides.
- **`published`** — tabulator action (audited). Runs the full compute +
  validation (ties must be resolved → else `TIES_UNRESOLVED`; advancement
  config must be satisfiable), inserts `resultVersions` v1, patches round
  status. Results now visible per §2. Terminal for the round.
- **`closed → open` reopen** — allowed while unpublished (audited); re-enables
  pending submissions.

### Event lifecycle

- **`ready → finalized`** — `finalize event` mutation: requires every round
  `published`; patches event status to `finalized`, which locks the ability to
  create new result versions or move the event back. Audited. Event-final
  cross-round standings are **computed on read** by a query over published
  round versions (§5 step 7) — all inputs are immutable, so the query is
  deterministic and cheap; no separate event-final snapshot is stored.
- **`finalized → archived`** and **`ready → archived`** — as in Phase 2.
- **`ready → draft` reopen (Phase 2) is tightened:** refused (`CONFLICT`) once
  any sheet is `submitted`/`locked` or any round is beyond `open`. This
  protects the immutable score history from the sheet-deleting reopen path.

### Score entry flow (judge)

1. Judge opens `scoring` → sees only rounds/categories/criteria in their
   assignment scope where sheets exist for them.
2. Opens a contestant sheet → criteria list with min/max/precision hints.
3. Keystrokes debounced → `saveDraft` patches `sheet.draftValues` (valid values
   only; sheet status → `in_progress`).
4. **Submit** — validates: every in-scope criterion present, each within
   `[minScore, maxScore]` at `decimalPrecision`; inserts one `scores` row per
   criterion, patches sheet status `submitted`, clears `draftValues`, writes
   audit (`score.submitted`), stamps `submittedAt/By`. Strictly immutable
   afterward — no mutation exists that can alter or delete these rows.

### Correction flow (tabulator, post-publish)

- `resultVersions` correction mutation: requires round `published` + event not
  `finalized`; inserts version N+1 — a superseding standings snapshot produced
  under the same deterministic core (e.g. after an advancement-decision
  change) — plus a required `reason`; audited. Scores rows are never touched:
  corrections document judging outcomes, not score edits.

---

## 5. Tabulation Core (`convex/lib/tabulation.ts`)

Pure, deterministic, no Convex imports beyond types. Inputs are plain data
(config + score rows + decisions); outputs are plain standings structures
persisted verbatim into `resultVersions.snapshot`. Directly unit-testable in
vitest without the Convex harness.

**Pipeline per round, per category:**

1. **Collect** — sheets with status `submitted` or `locked`. Contestants with
   status `scratched` or `disqualified` are excluded from ranking (a
   `disqualified` flag is carried in the snapshot; `scratched` is omitted).
2. **Aggregate per contestant × criterion** — average judge raw values; if
   `events.scoringRules.dropHighLow` and ≥ 3 judges scored that
   contestant-criterion, drop exactly one highest and one lowest first.
   Participation is per-criterion: a judge who scored 3 of 5 criteria counts
   for those 3 only.
3. **Weight** — criterion contribution = `(avgRaw / maxScore) × weight`; round
   score = Σ contributions (0–100), computed at fixed internal precision
   (1e-6), emitted at event `decimalPrecision`.
4. **Rank** — within category; `rounds.scoringRules.winner === "lowest"`
   inverts ordering.
5. **Tie-break cascade** — (a) higher score in the highest-weight criterion,
   then next-highest, …; (b) among the still-tied group, count per-judge
   first places (each judge's internal ordering of that group by their own raw
   round totals); (c) `tieBreaks` rows for the group; (d) still tied →
   `TIES_UNRESOLVED` (publish blocked). Determinism: inputs sorted by id;
   identical inputs → identical output.
6. **Advancement** — applied when `qualifiesToNextRound && eliminationEnabled
   && mode ≠ "none"`: cut by `top_count` (N), `top_percent` (⌈N%⌉ of ranked
   eligible), or `manual` (no auto cut); then `advancementOverrides` force
   advance/cut regardless of the computed cut (only honored when
   `allowOverride`; else `VALIDATION_ERROR`). Emits `advanced: boolean` per
   contestant.
7. **Cross-round final standings** (deterministic query over published
   versions, or inside finalize checks) — per contestant: Σ `roundScore ×
   roundWeight` over rounds they appear in; contestants advancing out of the
   last round rank above eliminated ones; eliminated contestants rank by
   elimination round descending, then score. Per category.

**`resultVersions.snapshot` shape (precise v.object):**
```ts
{
  computedAt: number,
  decimalPrecision: number,
  categories: array<{
    categoryId: Id,
    standings: array<{
      contestantId: Id, rank: number,
      roundScore: number,                 // 0–100 weighted
      criterionScores: array<{ criterionId: Id, avgRaw: number, contribution: number }>,
      droppedJudges: optional<array<{ criterionId: Id, judgeId: Id, value: number }>>, // when dropHighLow applied
      tieResolvedBy: union<"criteria_cascade", "judge_firsts", "manual">,
      advanced: optional<boolean>,        // elimination rounds only
    }>,
  }>,
  judgeParticipation: array<{ judgeId: Id, sheetsSubmitted: number, sheetsTotal: number }>,
  decisions: {
    tieBreaks: array<{ tiedContestantIds: Id[], orderedIds: Id[], createdById: Id }>,
    advancementOverrides: array<{ contestantId: Id, action: string, createdById: Id }>,
  },
}
```

---

## 6. UI Architecture

### Phase 3 routes (extend `/app/[orgSlug]/events/[eventSlug]/`)

```
scoring                                  judge home: assigned rounds + sheet status
scoring/[roundId]                        judge's sheet list for a round
scoring/[roundId]/[contestantId]         score entry form (autosave + submit)
rounds/[roundId]/monitor                 tabulator: submission progress grid (counts only)
rounds/[roundId]/review                  tabulator: post-close standings, tie + advancement controls, publish
results                                  published standings per round/category, version badges, finalize
```

- **Score entry form** — inputs constrained by criterion min/max/precision;
  debounced autosave with "saved" indicator; submit runs full client
  validation first (server re-validates); success renders a locked
  confirmation state. Error UX reads `.data.code` (Phase 1 convention).
- **Monitor grid** — judges × contestants matrix of submission status dots;
  live via reactive query on sheet statuses; **no score values ever included**
  in any pre-publish query payload.
- **Review screen** — standings table with tie groups highlighted and
  resolution controls, advancement cut preview with override toggles, publish
  action with `TIES_UNRESOLVED` inline error handling.
- **Results screen** — published versions only; version selector when > 1;
  finalize-event action (enabled when all rounds published); correction dialog
  (reason required).

### Phase 2 UI (executed first, from the existing plan)

Events list/new, event shell + overview, config editors (rounds, categories,
contestants, judges), settings/readiness/publish, templates library — plan
tasks 12–15. Phase 3's new config fields (round `weight` + `advancement`,
event `scoringRules.dropHighLow` + `eliminationEnabled`) are added into these
editors as part of Phase 3 backend tasks, with the elimination settings shown
only when enabled (user requirement).

Design system: existing shadcn/ui + Tailwind v4 + lucide-react conventions;
all states (loading/empty/error/success) validated per the project UI/UX rules.

---

## 7. Testing & Acceptance

**Pure-core unit tests (vitest, no Convex harness):**
- Aggregation: mean; drop-hi/lo at exactly 3 judges; > 3 judges; not applied
  with 2; per-criterion participation.
- Weighting/normalization: mixed maxScores; weights sum; `decimalPrecision`
  emission; `lowest` winner inversion.
- Tie cascade: each tier triggers correctly; manual rows only when needed;
  unresolved tie flagged.
- Advancement: none/top_count/top_percent (ceiling)/manual; overrides
  force-cut and force-advance; `allowOverride: false` rejects overrides.
- Cross-round: weights; eliminated ranking (elimination round desc, then
  score); single "final round standing" (100/0/0).
- Determinism: same input → byte-identical output (repeat runs).

**Integration tests (convex-test, existing harness):**
- **Authz matrix** for every new public mutation: unauthenticated /
  non-member / member-without-permission / cross-org / cross-event /
  judge-accessing-another-judge's-sheet → correct `.data.code`.
- **Blackout:** result queries refuse (or omit) unpublished rounds for every
  role including `score.manage` holders outside the publish flow; monitor
  query payload contains no score values.
- **Immutability:** after submit, no mutation alters/deletes `scores` rows;
  correction creates v2 with reason; event `finalized` blocks corrections.
- **Lifecycle legality:** submit only on `ready` event + `open` round; close →
  submit blocked; reopen → allowed; publish → terminal; finalize requires all
  published; Phase 2 reopen-to-draft blocked after any submission.
- **Readiness extension:** publish blocked when round weights ≠ 100 (multi-round).

**Acceptance — Phase 3 is "done" when:**
1. Phase 2 UI tasks 12–15 are complete (Event Control Center usable).
2. A judge signs in, sees exactly their scoped sheets, autosaves, submits —
   and can never edit after submit (verified by test).
3. A Tabulator monitors progress (counts only), closes a round, resolves a
   tie, previews + overrides the advancement cut, publishes — and results
   appear per `resultVisibility` exactly at publish, never before.
4. Corrections create superseding result versions with reasons; finalization
   locks the event; final cross-round standings are correct.
5. The pure core passes the full determinism suite; integration authz,
   blackout, immutability, and lifecycle tests are green.
6. `npm run typecheck && npm run lint && npm run build` pass; the
   `convex-authz` scan is clean for the new functions.

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| Compute-core floating-point drift | Fixed internal precision (1e-6), id-sorted inputs, integer weights, display-only rounding — determinism unit-tested with repeated runs. |
| Snapshot shape evolves in Phase 4 (reports) | Snapshot is a precise versioned `v.object`; Phase 4 reads/extends it rather than rewriting history. |
| Ties blocking publish at a live event | Review screen surfaces tie groups pre-publish with manual resolution; `TIES_UNRESOLVED` is actionable, not a crash. |
| Judge submits incomplete sheets under time pressure | Submit validates completeness + ranges client- and server-side; per-criterion state is explicit in the form. |
| Phase 2 UI + Phase 3 backend interleaving | Build order: Phase 2 UI first (frozen plan), then Phase 3 schema/core/mutations/UI; each stage independently verifiable. |
| `advancement` config invalid combos (`top_count` without count) | Readiness checklist + server validation; UI hides irrelevant modes. |

---

## 8. Build Order

1. **Phase 2 UI** — execute existing plan tasks 12–15 verbatim.
2. **Schema + core** — new tables/fields, permission seeding, pure
   `tabulation.ts` + full unit suite.
3. **Mutations & lifecycle** — score entry, close/reopen, review + decisions,
   publish, corrections, finalize; integration tests.
4. **Judge UI** — scoring home, sheet entry form.
5. **Tabulator UI** — monitor, review/publish, results + corrections +
   finalize.
6. **Full verification** — typecheck, lint, build, complete test suite,
   `convex-authz` scan.

---

## 9. Open items deferred to implementation planning

- Exact `draftValues` debounce interval and offline-tab warning (Phase 7 does
  true offline; v1 is a plain debounce).
- Correction mutation input ergonomics (full snapshot fragment vs. decision
  recompute) — decided at implementation time; both keep scores immutable.
- Whether `resultVersions` gains a compact per-contestant rollup index for
  large categories (current standings arrays are bounded by category size).
- `tieBreaks` UI affordance details (group highlight, drag-order vs. select).
- Public portal URL shape (Phase 5) — `"public"` visibility behaves as
  organization until then.
