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
