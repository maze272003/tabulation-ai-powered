# Phase 3 SDD Progress Ledger

Plans: engine (2026-08-16-phase3-tabulation-engine.md) Tasks 2-11 + modules (2026-08-16-phase3-ui-ux-modules.md) Tasks 1-10
Branch: phase2-competition-config
Engine Task 1 (Phase 2 UI gate): complete per Phase 2 ledger
Engine Tasks 12-14: SUPERSEDED by modules plan
Mode: parallel waves of 5 (disjoint file sets), controller gates + commits between waves
NEVER stage: AGENTS.md (user WIP)

## Completed tasks

Wave 1 complete (base dc35971, gate green: typecheck/lint/build/79 tests):
Engine Task 2: complete (ed1c6c8; 2 justified deviations: template test +Pro plan step, dead snapshot scoringRules replaced)
Engine Task 4: complete (2d4d281)
Engine Task 5: complete (031aa45)
Modules Task 1: complete (1e29e84)
Modules Task 3: complete (f70f622)

Wave 2 complete (gate green: typecheck/lint/build/98 tests):
Engine Task 3: complete (adjudicated fix: invalid-advancement test seeds via t.run db.patch)
Engine Task 6: complete (adjudicated: strict judge firsts - no first on per-judge total ties; test-5 data rebuilt 3-judge 2-1 majority; Minor deferred: whole-group separatedBy tier label)
Engine Task 8: complete (codegen run for api.scoring)
Modules Task 2: complete
Modules Task 9: complete (controller fix: advancementPatch fallback + NonNullable typing; Minor deferred: pages skip instanceof Error branching)
Controller gate fixes: setup.ts Id typing, fixture RoundComputeInput annotation, merged duplicate import

Wave 3 complete (gate green: typecheck/lint/build/110 tests):
Engine Task 7: complete (applyAdvancement ignores allowOverride by design - roundAdmin enforces)
Engine Task 9: complete (deviation: NOT_FOUND test uses foreign roundId, malformed id rejected by convex-test validation)
Modules Task 4: complete
Modules Task 5: complete (controller fix: scoring.ts literal status unions + Id casts at query boundary; Minor deferred: instanceof Error branching on scoring pages)

Wave 4 complete (gate green: typecheck/lint/build/116 tests):
Engine Task 10: complete (deviation: eliminationEnabled patch via conditional pattern in setup)
Modules Task 6: complete (controller fixes: dialog stays open on error via run() boolean, Button render={Link} nesting, Error data cast)
Controller gate fixes: reviewDecisions identity-union + Id typing

Wave 5 complete (gate green: typecheck/lint/build/122 tests):
Engine Task 11: complete
Modules Task 7: complete (Minor deferred: tieError never resets, shared positions state across tie groups)
Modules Task 8: complete (controller fix: historical version Error guarded; Minor deferred: correct dialog relies on server-side reason validation)
Controller gate fixes: publishResults Id typing

Modules Task 10: complete (controller-run: final gate green, no hardcoded hex, 6 token definitions, engine tasks 12-14 marked superseded)
All 20 tasks complete. Range dc35971..HEAD.

Final whole-branch review: verdict 'With fixes' -> ONE fix subagent (4e99062): scoring home Error branch, zero-score contestants unrankable (no NaN), sheetDetail event-scope guards. Re-verified by controller; gate green: typecheck/lint/build/125 tests.
Minor findings deferred to Phase 4+ (see final-review.md): review precision, cross-category rank display, version race guard, correction overrides snapshot fidelity, overlapping tie-break rows, tieError reset, shared positions state, correct-dialog client validation, separatedBy tier label.
Phase 3 execution COMPLETE: dc35971..4e99062 (20 tasks + fix commits, 5 waves of parallel agents).


## PayMongo Billing Plan (2026-08-17, branch main, base ac034e8)
Task 1: complete (a274572, review clean; Minor deferred: by_event_id non-unique index - idempotency is app-level by design, billing.test.ts loop-asserts indirectly)
Task 2: complete (d8545fd + fix 154de8c, re-review clean; fix: Buffer->btoa, typed network errors, +1 test; Minor deferred: secret-key lookup inside try wraps error message)
Task 3: complete (8e86567, review clean; Minor deferred: happy-path coverage for payments queries lands in T4/T5 tests, filter-first pending lookup oldest-first by design, checkoutUrl nullable)
Task 4: complete (926d292, review clean; Minor deferred: helper omits referenceNumber by design, catch spans attach - orphaned session unreachable in practice, report overcautious on atomicity)
Task 5: complete (601ad06, review clean; sanctioned deviation: referenceNumber closure capture; Minor deferred: livemode-mismatch silent 200, null paidAmount skips amount check by design, auditAction param could be literal union)

## Phase 4 SDD (2026-08-17, branch main, base 926d292; NOTE: parallel billing session commits interleave on main — scope review diffs by task file paths)
P4 Task 1: complete (926d292..54fb8c1, review clean after rowIndex fix; controller fix 9280520 vitest include lib/**; Minor deferred: rowIndex:0 empty-file sentinel, header-preceded-by-blanks hardcodes rowIndex 1, untested 3-col/category-empty branches, lenient 5-col header, scientific-notation numbers)

Task 6: complete (f1b292c committed by parallel session, validated by dispatched implementer; deviation: grace-boundary test asserts real currentPeriodEndAt instead of literal +37d - more correct; NOTE: parallel session also committed Task 7 386a740 unreviewed, left Task 8 WIP in working tree)
Task 7: complete (386a740 by parallel session, reviewed clean; justified deviation: already-on-plan CONFLICT checked before paid VALIDATION_ERROR - brief's code block was self-inconsistent, tests govern; Minor deferred: unused seedAndProvision import in eventCodes.test.ts)
Task 8: complete (aeeaf4b concurrent-worker partial + f9f8636 final, reviewed clean on scoped diff; sanctioned deviations: useAction for checkout action, window.location.assign for react-hooks/immutability lint; Minor deferred: resume/cancelCheckout lack busy states, per-plan busy only)
Task 9: complete (67f1b23 graphify refresh; full suite 223 tests + worker's suites; typecheck/build blocked only by worker WIP at the time, green after worker finished)
Final whole-branch review: verdict 'With fixes' -> ONE fix subagent (591fd88): sig1 signature key accepted (Critical), yearly interval honored in computeRenewalWindow, .env.example runbook corrected (only checkout_session.payment.paid exists, whsk_ prefix, price backfill note), livemode drop logged. Controller re-verified diff + final gates: 232/232 tests, lint 0 errors, tsc clean, build passes.
PayMongo Billing execution COMPLETE: ac034e8..591fd88 (9 tasks + final fix). Post-merge follow-ups: uniqueIndex on processedWebhookEvents.eventId, periodic PayMongo reconciliation query, test-mode smoke run (real header format + first payment), webhook-secret rotation runbook note.
P4 Task 3: complete (eac0bfc, review approved; Minor deferred: busy-dismiss not gated, file-read promise fixed by session)
P4 Task 4: complete (a0abffc, review approved; deviation: getUsage from ./lib/usage — brief entitlements import wrong; Minor deferred: fallback username numbering all-accounts vs per-kind, staff batch judged by judges limit msg)
P4 Task 5: complete (7ed0baf, review approved; Minor deferred: revokeObjectURL synchronous)
P4 Task 6: complete (e9cdaa7, review approved; Minor deferred: parseEntries blank-line counting, li key by error text)
P4 Task 7: complete (32139eb, review approved; deviation: grantPaidPlan helper; Minor deferred: O(finals*rounds*standings) in-memory find, silent fallbacks)
P4 Task 8: complete (ba79619 + controller fix f85593d skip-subscribe, review approved; standings[0] header concern answered — T7 builds uniform roundScores)
P4 Task 9: complete (2d43f9b, re-review approved; controller fix 4a80f78 print:hidden chrome in EventShell + org layout; Minor deferred: toLocaleDateString locale, duplicate screen h1)
P4 Task 10: complete (f9c0642, review approved; Minor deferred: archived-path test, event code case normalization divergence from eventAuth)
Controller fixes this stretch: 9280520 vitest include lib/**; review-package.ps1 array-arg bug (first-path-only) fixed via comma CSV param
P4 Task 11: complete (909a9a1, review approved; deviations verified: derived round fallback fixes latent TypeError + set-state-in-effect, aria-label category name; Minor deferred: redundant null-fallback ternary, composite key fragility, no arrow-key tabs)
P4 Task 12: complete (461cecf + fix 616ce41, review approved; defect found+fixed: publicResults NOT_FOUND rethrow unreachable instanceof branch -> null return, tests+page+E2E updated; E2E chromium 2/2 pass + env-skip; firefox/webkit browsers not installed)
P4 execution COMPLETE: 926d292..616ce41 (12 tasks + controller fixes 9280520/f85593d/4a80f78/616ce41)
P4 final review: verdict 'With fixes' -> ONE fix subagent (4ca89c4): bulkCreate action early validation before PBKDF2, busy-dismiss gating, public event-code normalization, sidebar print:hidden. Re-review: all fixes verified. P4 CLOSED.

## Phase 5 SDD (2026-08-17, branch main, base 4ca89c4)
P5 Task 1: complete (9be3d60, review approved; @google/genai@2.17.1, matcher nesting fix; Minor deferred: SDK transport errors unmapped to UPSTREAM, long lines, temperature magic value)
P5 Task 2: complete (b31493f, review approved with independent statistical verification; Set-based spread gating per controller mandate; Minor deferred: O(J^2*C^2*K) rescans, MIN_SCORES_PER_CONTESTANT naming, unknown-criterion edge, flat-rank agreement=0 convention)
P5 Task 3: complete (4b901f7, review approved; deviation: prepareThreeJudgePanel public-API path for 3-judge draft creation; explicit null-default merge; Minor deferred: scoreSheets read twice in roundMonitor)
P5 Task 4: complete (0ade3b3, review approved; Minor deferred: roundName unused payload, aria-label on div, LEVEL_TONE loose typing)
P5 Task 5: complete (114bb79, review approved; test matcher nesting fix; Minor deferred: consumeAiQuota wrapper untested until action tasks, resource string typing)
P5 Task 6: complete (98608f6, review approved; tsc defect in brief reference fixed assertion-free; Minor deferred: retry-prompt test under-asserts error forwarding, explicit undefined keys in advancement)
P5 Task 7: complete (5ddb7a1, review approved; deviation grantPaidPlan Pro in test 3; Minor deferred: saveGenerated unbounded inserts product decision, 2000 magic duplicated vs MAX_PROMPT_LENGTH)
P5 Task 8: complete (8ba060c, review approved; Minor deferred: busy lock after onCreated for future mounts, MAX_PROMPT_LENGTH duplicated client-side)
P5 Task 9: complete (9a324b0, review approved; security verified: no judge identity in LLM facts, quota only on miss; Minor deferred: facts unknown vs Record typing, redundant Id cast, benign TOCTOU note)
P5 Task 10: complete (a85342d, review approved; deviations verified incl. historical-version guard; Minor deferred: static explain-facts id, error-reopen refetch, transient column flicker)
P5 Task 11: complete (controller-run: README AI section; GEMINI_API_KEY secret step requires user-provided key — flagged as user follow-up, NOT set)
P5 Task 12: gates green (265/265 vitest, lint 0 errors, build pass). Graphify refresh DEFERRED: working tree holds parallel session's uncommitted billing changes that graphify would snapshot; refresh when tree is clean.
P5 final review: verdict 'With fixes' -> ONE fix subagent (c3cade0): inactive-judge completion signal (unscoredJudgeReport), gemini transport->UPSTREAM mapping, storeExplanation race hardening (.first() + optional versionId). Re-review: all verified. P5 CLOSED.
Phase 5 execution COMPLETE: 4ca89c4..c3cade0 (11 tasks + fix commit).
USER FOLLOW-UPS: (1) npx convex env add GEMINI_API_KEY before using wizard/explainer in deployed envs (fails safe UPSTREAM until set); (2) run npm run graphify:build when working tree is clean of the parallel billing session's uncommitted changes.
