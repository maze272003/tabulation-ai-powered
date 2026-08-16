# ET2 Report — Task 2: Schema extension + writer defaults

## STATUS: DONE_WITH_CONCERNS

## Files changed

- `convex/schema.ts` — events.status gains `"finalized"`; events gains `scoringRules { dropHighLow }` + `eliminationEnabled`; rounds gains `weight`/`status`/`advancement`; scoreSheets gains `draftValues`; eventTemplates.configSnapshot gains `eliminationEnabled?`, `scoringRules { dropHighLow }?`, `rounds[].weight?`, `rounds[].advancement?`; new tables `scores`, `resultVersions`, `advancementOverrides`, `tieBreaks` (verbatim from plan Step 3, placed between `scoreSheets` and `eventTemplates`).
- `convex/events.ts` — `create` writes default `scoringRules { dropHighLow: false }` / `eliminationEnabled: true`; added `defaultRoundWeight` helper next to `slugify`; `createFromTemplate` writes the new event fields with `??` fallbacks and the `entries()` rounds loop (weight/status/advancement); `update` accepts `scoringRules`/`eliminationEnabled`, patch type widened to `Record<string, unknown>`.
- `convex/rounds.ts` — module-level `advancementArgs` validator block + `validateAdvancement` (verbatim); `add` accepts optional `weight`/`advancement`, validates advancement before insert, writes `weight` (first round 100, later 0), `status: "open"`, default advancement `{ mode: "none", allowOverride: true }`; `update` accepts `weight` (integer 0-100) + `advancement` with validation before the empty-patch early return.
- `convex/templates.ts` — `createFromEvent` snapshot gains `eliminationEnabled`/`scoringRules` (event-level) and `rounds[].weight`/`rounds[].advancement` pass-through.
- `convex-test/phase3Schema.test.ts` — new, plan-verbatim test file (one deviation, see below).

## Test commands + output

- TDD red: `npx vitest run convex-test/phase3Schema.test.ts` → `Tests 5 failed (5)` (missing fields / wrong defaults, as the plan expects).
- TDD green (after first writer pass): 4 passed / 1 failed — template test hit `FEATURE_UNAVAILABLE: canCreateTemplates` (see deviation 1).
- Final: `npx vitest run convex-test/phase3Schema.test.ts` → `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

Per controller instructions, the targeted vitest command was the ONLY verification run; the plan's Step 5 full gate (`npm run typecheck` / `npm test`) and Step 6 commit were intentionally skipped (controller gates and commits centrally).

## Deviations from the plan's verbatim code

1. **Test file — added one line** (`api.subscriptions.changePlan` to "Pro") in "save-as-template round-trips phase 3 fields" before `api.templates.createFromEvent`. The plan's verbatim test fails on the default Free plan because `createFromEvent` requires the `canCreateTemplates` feature (`requireFeature`, convex/templates.ts:29). Every existing template test does this same upgrade (convex-test/templates.test.ts:37). Without this line the plan's expected result (tests PASS) is unachievable.
2. **Schema — replaced the snapshot-level `scoringRules` field instead of adding a second one.** The plan says to "add after `resultVisibility`" in `eventTemplates.configSnapshot`: `scoringRules: v.optional(v.object({ dropHighLow: v.boolean() }))`. The existing schema already had a snapshot-level `scoringRules: v.optional(v.object({ winner: ... }))` right after `resultVisibility` (old schema.ts:260); duplicate object keys are a TS compile error. Verified no writer anywhere sets that snapshot-level `{ winner }` field (`templates.createFromEvent` never wrote it; `SYSTEM_TEMPLATES` in `convex/lib/constants.ts` don't set it), so replacing it with the `{ dropHighLow }` shape is behavior-preserving and matches the plan's Interfaces section and test assertions (`configSnapshot.scoringRules` equals `{ dropHighLow: true }`). The round-level `scoringRules { winner }` fields (rounds table, snapshot rounds elements) are untouched, as the plan intends.

## Concerns

- The plan's Step 4 note says the `add`/`update` shared validator block is used by "both `add` and `update`" — implemented as the module-level `advancementArgs` spread into `v.object(...)` in both functions' args, exactly as the plan's code shows.
- `defaultRoundWeight` is currently only exercised indirectly via `createFromTemplate` (system templates all have exactly 1 round → weight 100); it is not covered by the new tests' assertions beyond the single-round case. Later plan tasks (rounds UI) exercise weights more.
- Existing deployed dev-database docs predate the now-required `events.scoringRules`/`eliminationEnabled` and `rounds.weight`/`status`/`advancement` fields — per the plan's Global Constraints, dev data is disposable and affected tables may need clearing in the dashboard. Test DBs are fresh, so tests are unaffected.
- Sibling-agent files were untouched; only the five listed files were modified.
