# Task 9 Report: Full validation + Graphify refresh

**Date:** 2026-08-17
**Outcome:** Billing integration is fully green (tests, lint, zero billing type errors). `typecheck` and `build` gates fail **exclusively** on the concurrent worker's in-flight, uncommitted results-export/print UI files — reported as concerns, not fixed, per task instructions.

## Gate results

| Gate | Command | Result |
|---|---|---|
| Tests | `npm run test` | **PASS** — 37 files, 223 tests, 0 failures (~26s). All billing suites and all pre-existing suites pass; no regressions from `changePlan` semantics or schema additions. |
| Lint | `npm run lint` | **PASS** — 0 errors, 20 warnings (exit 0). |
| Typecheck | `npm run typecheck` | **FAIL — no billing errors.** All errors are in the concurrent worker's files (details below). |
| Build | `npm run build` | **FAIL at its typecheck pre-step** (`build` = `typecheck && next build`) — same worker files; `next build` never reached. |
| Graphify | `npm run graphify:build` | **PASS** — exit 0; 838 nodes, 2,299 edges, 60 communities; studio written. (0/838 descriptions is expected — project runs `--no-description`.) |

## Billing-specific verification

- No type errors in any billing file (`convex/billing/*`, `convex/lib/paymongo.ts`, `convex/lib/billing.ts`, `convex/subscriptions.ts`, `convex/schema.ts` billing tables, `convex/http.ts`, `convex/crons.ts`, billing page, billing tests) across every `tsc --noEmit` run.
- `convex/_generated` (tracked, last regenerated with billing lifecycle commit `f1b292c`) contains all billing API types — billing codegen is complete and committed.
- Lint warnings in billing code (non-blocking, pre-existing pattern shared with the rest of the repo): `.filter()` on query results in `convex/billing/checkout.ts:38,172` and `convex/billing/payments.ts:46` — post-pagination/in-memory filters, consistent with existing project style (same warning fires in `events.ts`, `seed.ts`, `reset.ts`, etc.). Left as-is per minimal-change principle; no `eslint-disable` introduced.
- Authorized pre-existing Minor (unused `seedAndProvision` import in `convex-test/eventCodes.test.ts`): **not flagged by current lint** — already resolved; no fix needed.

## Concurrent-worker findings (concerns — NOT fixed, per instructions)

1. **Uncommitted broken UI files (primary typecheck/build blocker):**
   - `app/app/[orgSlug]/events/[eventSlug]/results/page.tsx` (modified, uncommitted): `asChild` prop passed to `Button` (line 118) — project's `Button` has no `asChild`/Slot support. Error TS2322.
   - `app/app/[orgSlug]/events/[eventSlug]/results/print/page.tsx` (untracked, new): `PageHeader`-style component requires `icon` prop, missing at lines 27 & 60 (TS2741); raw `string` passed where `Id<"categories">` required at line 64 (TS2345).
2. **Stale `convex/_generated`:** worker's commit `32139eb` ("feat: results export query gated by canExportReports entitlement") added `exportData` to `convex/results.ts:97` but did **not** commit regenerated `_generated` — `api.results.exportData` is absent from `convex/_generated/api.d.ts`. Their untracked test `convex-test/exports.test.ts` references it and failed typecheck in an early run (`Property 'exportData' does not exist`, TS2339/TS7006). The worker needs to run `npx convex codegen` and commit `_generated` with their feature (repo convention per post-plan notes).
3. Worker activity observed mid-gate: new commits landed during validation (`e9cdaa7` bulk judge provisioning dialog, `7ed0baf` CSV helper); the failing files above appeared/changed between runs. Working tree at report time: worker's `results/page.tsx` (modified) + `results/print/` + `convex-test/exports.test.ts` (untracked).

**Recommendation for operator:** re-run `npm run typecheck; npm run build` after the worker's Phase 4 tasks complete; expected to pass once their UI fixes land and `_generated` is regenerated. Billing code requires no changes.

## Commits made by this task

- `67f1b23` — `chore: refresh graphify context for billing module` (14 tracked `.graphify` files; pathspec-limited add — `git add .graphify` staged tracked files only; ignored untracked studio artifacts excluded).

No billing fixes were required → no fix commits. `AGENTS.md`, `.superpowers`, and all worker files untouched.

## Manual smoke checklist (for the operator — from task brief)

1. `npx convex env set PAYMONGO_SECRET_KEY=sk_test_...`, `PAYMONGO_WEBHOOK_SECRET=...`, `PAYMONGO_LIVEMODE=false`, `SITE_URL=http://localhost:3000`
2. Register webhook `http://localhost:3000/paymongo/webhook` (or a tunnel URL) in the PayMongo dashboard with the checkout_session events.
3. Buy Starter with the test GCash/card flows from PayMongo's testing docs; verify the subscription flips to active and history shows paid.

## Final whole-branch review fixes (2026-08-17)

**Findings addressed:**

1. **Critical � `sig1` signature key:** `parseSignatureHeader` (convex/lib/paymongo.ts:38) now accepts both `sig` and `sig1`; classic timestamped scheme no longer 401s. Added unit test: timestamped header `t=...,sig1=<hmac of `${t}.${body}`>` verifies.
2. **Important � yearly interval honored:** `computeRenewalWindow` (convex/lib/billing.ts:20) now takes `interval: "monthly" | "yearly"` and uses `periodDurationMs(interval)` instead of hardcoded `MONTHLY_PERIOD_MS`; webhook caller (convex/billing/webhook.ts:134) passes `payment.billingInterval`. Tests updated to new signature; yearly stacking test added (active sub end=now+10d ? end + YEARLY_PERIOD_MS).
3. **Important � ops runbook events:** `.env.example` now says subscribe to `checkout_session.payment.paid` only (stale-pending cron covers abandoned/failed) and secret example updated to `whsk_`.
4. **Important � price backfill note:** runbook line appended: existing deployments backfill prices once (Free 0 / Starter 49900 / Pro 149900 PHP, currency PHP, monthly, isActive true) via superadmin Plans page or scripted patch.
5. **Minor � livemode drop visibility:** `console.warn("paymongo webhook: livemode mismatch � event dropped")` added before the 200 in the livemode guard (convex/billing/webhook.ts:229).

**Commands + output:**

- `npx vitest run convex-test/billingUnits.test.ts convex-test/billingWebhook.test.ts convex-test/billingLifecycle.test.ts convex-test/billingCheckout.test.ts` ? Test Files 4 passed (4), Tests 26 passed (26) (billingUnits +2: sig1, yearly stacking)
- `npx tsc --noEmit` ? exit 0, zero errors

**Commit:** `591fd88` � `fix(billing): accept sig1 signature key, honor yearly intervals, correct ops runbook` (5 files, verified via `git show --stat HEAD`; pathspec-limited add; worker files/AGENTS.md/.superpowers untouched)
