# Task 4 Report: Checkout flow (`billing/checkout.ts`)

## Status: COMPLETE

## What Was Implemented

Per the brief, verbatim:

1. **`convex-test/setup.ts`** — added the shared helper `createOrgWithPendingCheckout(t, opts)` (bootstraps org "acme" once, stubs fetch/env, runs the real `createCheckout` action, then reads back the pending payment) plus the `vi` import. Per the brief's note, `grantPaidPlan` and the `internal` import were intentionally NOT added (Task 5).
2. **`convex-test/billingCheckout.test.ts`** — 6 tests covering: happy-path pending payment with checkout URL; Free plan → VALIDATION_ERROR and unknown plan → NOT_FOUND; one-live-checkout rule → CONFLICT; non-member → FORBIDDEN; PayMongo rejection → payment marked failed with `failureReason` and PAYMENT_PROVIDER error; cancelCheckout happy path + CONFLICT when none active.
3. **`convex/billing/checkout.ts`**:
   - `createPendingPayment` (internalMutation): `requirePermission("subscription.manage")`, server-side amount from `plans.priceCents`, Free/unpriced/inactive → VALIDATION_ERROR, unknown plan → NOT_FOUND, one-live-checkout CONFLICT, inserts pending `billingPayments` row with `referenceNumber` = `{paymentId}.{randomHex(6)}`, audit `billing.checkout.created`.
   - `attachCheckoutSession` (internalMutation): guards payment still pending; rejects checkout-session clash on another payment.
   - `failPayment` (internalMutation): idempotent — only patches payments still pending; audit `billing.checkout.failed` with `actorId: null`.
   - `createCheckout` (public action): pending mutation → `createCheckoutSession` → attach; on PayMongo failure marks failed and rethrows.
   - `cancelCheckout` (public mutation): permission-gated, CONFLICT when no pending checkout, audit `billing.checkout.cancelled`.
   - Used the brief's corrected final import block (no unused `Id` import).

## TDD Evidence

- **RED**: `npx vitest run convex-test/billingCheckout.test.ts` → 6/6 failed with `Could not find module for: "billing/checkout"` (exactly the brief's expected failure mode).
- **GREEN**: same command after implementation → **6/6 passed**, pristine output (no console noise, no unhandled rejections).
- **Regression sweep**: `npx vitest run convex-test/billingCheckout.test.ts convex-test/billing.test.ts convex-test/billingPayments.test.ts convex-test/billingUnits.test.ts` → **4 files, 18/18 passed**.
- **Type safety**: `npx convex codegen` (regenerated `api.d.ts`) followed by `npx tsc --noEmit` → clean, no errors.

## Files Changed (commit 926d292)

- `convex/billing/checkout.ts` (new)
- `convex-test/billingCheckout.test.ts` (new)
- `convex-test/setup.ts` (modified — helper + `vi` import only)
- `convex/_generated/api.d.ts` (regenerated)

Commit: `926d292 feat(billing): implement PayMongo checkout flow with one-live-checkout guard`

## Self-Review

- **Completeness vs brief**: all 6 steps executed in order; code used verbatim from the brief including the corrected import block. `grantPaidPlan`/`internal` import correctly deferred to Task 5.
- **Constraints verified**: amounts computed only server-side from `plan.priceCents` (client args are `orgSlug` + `planName` only); CONFLICT on existing pending payment; VALIDATION_ERROR for Free (priceCents 0)/unpriced/inactive; NOT_FOUND for unknown plan; audit actions exactly `billing.checkout.created` / `billing.checkout.failed` / `billing.checkout.cancelled`; no `any`, no `@ts-ignore`.
- **Scope**: only the brief's listed files staged/committed; pre-existing modified `.superpowers/sdd/*` files left untouched and unstaged; AGENTS.md never staged.
- **No overbuilding**: nothing added beyond the brief.

## Concerns

- `checkoutCounter` is module-level state in setup.ts; suffix collisions across test files are impossible to matter because each `convexTest` instance is an isolated DB (and vitest isolates module state per worker anyway). Noted for awareness only.
- The pending-checkout lookup uses `by_org_id` + `.filter(status)` rather than a dedicated index. Correct and matches the brief; revisit only if payment history per org grows large (a `by_status` index exists if Task 7's stale-pending sweep ever needs it).
- `createCheckout` is an action calling an internal mutation for authz — this is the intentional brief/repo pattern (action context can't run the full authz chain in one transaction); the one-live-checkout rule therefore isn't transactionally atomic against concurrent actions, but Convex serializes the internal mutations so the window is negligible for this workflow.
