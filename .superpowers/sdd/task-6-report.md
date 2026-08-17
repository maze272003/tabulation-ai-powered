# Task 6 Report: Subscription lifecycle cron (`billing/lifecycle.ts`)

## Status

COMPLETE — implemented, tested, and committed as `f1b292c`.

Note on session history: a prior session had already implemented and committed this
task but was interrupted before validation and reporting. This session verified the
committed work against the brief end-to-end (verbatim match confirmed for
`lifecycle.ts` and the cron registration), reproduced TDD evidence from a clean
state, re-ran codegen/typecheck, and confirmed the commit contains exactly the
brief's files.

## Implemented

- `convex/billing/lifecycle.ts` — `expireSubscriptions` internalMutation, matching
  the brief's code verbatim. Three bounded phases (`take(100)` each; overflow
  picked up next run):
  1. `billingPayments` with `status: "pending"` older than `STALE_PENDING_MS`
     (24h) → patched to `expired` + audit `billing.payment.expired` with
     `after.reason: "Checkout not completed within 24h"`.
  2. `subscriptions` `active` with `currentPeriodEndAt < now` → `past_due` +
     audit `subscription.past_due`. Rows with `currentPeriodEndAt === null`
     (Free orgs) are skipped via guard clause — never touched.
  3. `subscriptions` `past_due` with `currentPeriodEndAt < now - PAST_DUE_GRACE_MS`
     (7d) → `expired`, `planId` set to the Free plan, `cancelAtPeriodEnd: false` +
     audit `subscription.expired` (before/after planId). Missing Free plan →
     `console.error` + skip downgrades (cron never crashes).
  - `now` is an optional injectable arg — the deliberate test seam; scheduler
    callers pass `{}` via the cron registration.
- `convex/crons.ts` — registered daily cron exactly per brief:
  `crons.interval("expire subscriptions and stale checkouts", { hours: 24 }, internal.billing.lifecycle.expireSubscriptions, {})`.
- `convex-test/billingLifecycle.test.ts` — three tests: stale pending checkout
  expiry at 25 days (and still pending before 24h); active → past_due at period
  end, still past_due within grace, expired + Free after grace; Free org
  (`active` + null period) untouched 365 days out.
- `convex/_generated/api.d.ts` — regenerated via `npx convex codegen` and
  committed with the task.

### Deviation from the brief's literal test (test 2)

The brief's second test computed time offsets from `paidAt` captured *after* the
webhook mutation (`paidAt + 31/37/38 * DAY`). The subscription's period actually
starts at the webhook mutation's internal `now`, so `periodEnd < paidAt + 30d`,
which puts the brief's "within grace" assertion at `paidAt + 37d` *past* the
expiry boundary (`now > periodEnd + 7d`) — that literal test fails/flakes. The
committed test reads the real `currentPeriodEndAt` from the subscription and
asserts at `periodEnd + 1d` (past_due), `periodEnd + 5d` (still past_due,
safely within grace), and `periodEnd + 8d` (expired + Free, safely beyond
grace). Same lifecycle semantics, deterministic boundaries. `lifecycle.ts`
itself is verbatim from the brief.

## TDD Evidence

- RED (reproduced this session): with `convex/billing/lifecycle.ts` removed,
  `npx vitest run convex-test/billingLifecycle.test.ts` → **3 failed (3)** —
  each test errors at `t.mutation(internal.billing.lifecycle.expireSubscriptions, …)`
  because the module is absent (matches the brief's expected failure mode).
  File restored immediately via `git checkout -- convex/billing/lifecycle.ts`.
- GREEN: `npx vitest run convex-test/billingLifecycle.test.ts convex-test/billingWebhook.test.ts`
  → **2 files passed, 9 tests passed (9)** (3 lifecycle + 6 webhook; webhook
  suite confirms no regression).
- Codegen/typecheck: `npx convex codegen` succeeds and produces **zero diff**
  against the committed `convex/_generated` (bindings current). `npx tsc
  --noEmit` reports **one pre-existing error outside this task's scope** (see
  Concerns); no errors in any file touched by this task.

## Files Changed (commit `f1b292c`)

```
convex-test/billingLifecycle.test.ts | 89 +++++++++++++
convex/_generated/api.d.ts           |  2 +
convex/billing/lifecycle.ts          | 94 +++++++++++++
convex/crons.ts                      |  7 ++
4 files changed, 192 insertions(+)
```

Verified via `git show --stat HEAD`: exactly the four files the brief's commit
step lists — no unrelated files, no AGENTS.md, nothing from the concurrent CSV
work.

## Self-Review

- Completeness: all three lifecycle phases, audit actions (`billing.payment.expired`,
  `subscription.past_due`, `subscription.expired`), Free-org null-period guards in
  both subscription phases, missing-Free-plan `console.error` + skip, `BATCH_SIZE=100`
  bounds, injectable `now`, and the daily cron — all present and as specified.
- Quality: early-return guard clauses keep nesting shallow; no `any`, no
  `@ts-ignore`; constants imported from `lib/billing` rather than duplicated;
  reads are index-backed (`billingPayments.by_status`,
  `subscriptions.by_status_and_period_end`, `plans.by_name` — all verified in
  `schema.ts`); the Free-plan lookup is skipped entirely when there is nothing
  past grace (`beyondGrace.length === 0` early return).
- No overbuilding: implementation is the brief's code verbatim; no extra files,
  helpers, or options.
- Constraints honored: only the brief's files committed; concurrent worker's
  changes (`.superpowers/*`, `lib/csv.test.ts`, untracked
  `convex-test/billingSubscriptions.test.ts`) left untouched and unstaged.

## Concerns

1. **Pre-existing type error (not introduced here):** `npx tsc --noEmit` fails at
   `app/app/[orgSlug]/billing/page.tsx:84` — `useMutation(api.billing.checkout.createCheckout)`
   but `createCheckout` is a public **action** (Task 4). The page needs
   `useAction` (or an action-compatible wrapper). The page predates the Task 4
   rewrite; fixing it is outside this brief's file list, so it was left alone.
   Whichever task owns the billing UI should fix it before the next `npm run build`.
2. Minor observation: `convex/crons.ts` now ends without a trailing newline
   (inherited from the commit's diff). Cosmetic only; left as committed to match
   the brief's exact change.
3. Test-seam note for reviewers: `now` is only injectable because the mutation is
   internal-only; the cron correctly omits it.
