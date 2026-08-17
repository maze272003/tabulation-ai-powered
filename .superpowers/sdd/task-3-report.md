# Task 3 Report: Payment queries (`billing/payments.ts`)

## Status: DONE

## What Was Implemented

Created `convex/billing/payments.ts` with two org-scoped queries, exactly per the brief (verbatim code):

1. **`listForOrg`** — gated by `requirePermission(ctx, { orgSlug, permission: "subscription.view" })`. Reads `billingPayments` via the `by_org_id` index, newest first (`.order("desc")`), capped at `HISTORY_LIMIT = 50`. Each payment is hydrated with `planName` resolved through a `Map` keyed by deduplicated `planId`s (via `new Set`), with `null` fallback when the plan doc is missing.

2. **`getActiveCheckout`** — gated by `requirePermission(ctx, { orgSlug, permission: "subscription.manage" })`. Finds the first `status === "pending"` payment for the org via `by_org_id` + `.filter(...)`. Returns `null` when none pending; otherwise `{ paymentId, checkoutUrl, planName, amountCents, currency, billingInterval, createdAt }` (`createdAt` = `_creationTime`, `planName` = `null` when plan missing).

Created `convex-test/billingPayments.test.ts` (verbatim from brief): empty-history/null-checkout for a new org, and FORBIDDEN rejection for non-members (Bob) on both queries.

## TDD Evidence

### RED (Step 2)

Command: `npx vitest run convex-test/billingPayments.test.ts`

```
 ❯ convex-test/billingPayments.test.ts (2 tests | 2 failed) 287ms
 FAIL  ... > returns an empty history and no active checkout for a new org
Error: Could not find module for: "billing/payments"
 FAIL  ... > rejects non-members with FORBIDDEN
AssertionError: expected Error: Could not find module for: "billin… to match object { data: { code: 'FORBIDDEN' } }
 Test Files  1 failed (1)
      Tests  2 failed (2)
```

Failed for the expected reason (module `billing/payments` did not exist).

### GREEN (Step 4)

Commands: `npx vitest run convex-test/billingPayments.test.ts; npx vitest run convex-test/billing.test.ts`

```
 Test Files  1 passed (1)
      Tests  2 passed (2)          # billingPayments.test.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)          # billing.test.ts (regression)
```

Output pristine: no console noise, no skips, no warnings.

### Codegen + Typecheck (Step 5)

Command: `npx convex codegen; if ($?) { npx tsc --noEmit }`

Both completed with zero errors. `_generated/api.d.ts` diff registers the new `billing/payments` module (import + `fullApi` entry) — included in the commit.

## Files Changed (commit `8e86567`)

- `convex/billing/payments.ts` (new, 60 lines)
- `convex-test/billingPayments.test.ts` (new, 30 lines)
- `convex/_generated/api.d.ts` (2-line module registration)

Commit message: `feat(billing): add payment history and active checkout queries`

Not staged (correctly): `.superpowers/sdd/*` doc edits; `AGENTS.md` untouched.

## Self-Review

- **Completeness vs brief**: Both files match the brief verbatim; all 5 steps executed in order with RED→GREEN verification.
- **Constraints**: Permission strings exactly `"subscription.view"` / `"subscription.manage"`; newest-first, max 50, `planName: string | null`; `getActiveCheckout` shape exact; no `any`, no `@ts-ignore`; no files modified beyond the brief's list.
- **Quality**: Index-based reads (`by_org_id`), no N+1 (plans deduplicated through a Map), constant for the limit, no magic values. Pre-existing authz flow (`requirePermission` → `requireOrgMember` → org/membership/role/subscription checks) enforces server-side authorization.
- **No overbuilding**: Only the two specified queries; no extra helpers, mutations, or speculative abstractions.

## Concerns

None blocking. Two design notes inherited from the brief's verbatim code (flagged for a future task, not deviations):

1. `getActiveCheckout` uses `.filter(status == "pending").first()` on the `by_org_id` range — with multiple simultaneous pending payments it returns the first in index order, not the newest. Adequate while checkout flow creates at most one pending payment at a time.
2. `checkoutUrl` is nullable in the schema and returned as-is in the active-checkout shape, so consumers may receive `null` for a pending payment whose URL is absent. Matches the brief's specified shape.

## Report

Status: DONE — commit `8e86567`, 3/3 tests passing, `tsc --noEmit` clean.
