# Task 1 Report: Schema additions + plan pricing

**Status:** DONE
**Commit:** `a274572` feat(billing): add billingPayments/processedWebhookEvents schema and PHP plan pricing

## What I implemented

Followed the brief verbatim (TDD):

1. **Test (Step 1):** Created `convex-test/billing.test.ts` with the exact content from the brief — seeds via `seedAndProvision(t, aliceIdentity)`, queries `api.plans.list`, asserts `priceCents` (Free 0, Starter 49900, Pro 149900), and `currency: "PHP"`, `billingInterval: "monthly"`, `isActive: true` for all plans.
2. **Schema (Step 3):** In `convex/schema.ts`:
   - Added `billingPayments` table (after `subscriptions`) with fields exactly per brief: `orgId`, `planId`, `createdById`, `checkoutSessionId`, `checkoutUrl`, `referenceNumber`, `amountCents`, `currency`, `billingInterval` (monthly|yearly), `status` (pending|paid|failed|expired|cancelled|flagged), `periodStartAt`, `periodEndAt`, `paidAt`, `failureReason`; indexes `by_org_id`, `by_status`, `by_checkout_session_id`, `by_reference_number`.
   - Added `processedWebhookEvents` table with `eventId`, `eventType`, `receivedAt`; index `by_event_id`.
   - Added `subscriptions` index `by_status_and_period_end` on `["status", "currentPeriodEndAt"]` (name includes all index fields, per Convex guidelines).
3. **Pricing (Step 3):** In `convex/lib/constants.ts`, added `priceCents`/`currency`/`billingInterval`/`isActive` to each `SYSTEM_PLANS` entry after `isSystem: true,` (Free 0, Starter 49900, Pro 149900; all `"PHP"`, `"monthly"`, `true`). `seed.ts` spreads entries with `{ ...plan }`, so pricing flows into the `plans` table with no seed changes needed.

## TDD evidence

**RED** — `npx vitest run convex-test/billing.test.ts` (before implementation):

```
 FAIL  convex-test/billing.test.ts > billing plans > seeds plans with PHP pricing
AssertionError: expected undefined to be +0
    expect(byName.get("Free")?.priceCents).toBe(0);
 Test Files  1 failed (1)
      Tests  1 failed (1)
```

**GREEN** — same command after implementation:

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

**Codegen + typecheck (Step 5):** `npx convex codegen; if ($?) { npx tsc --noEmit }` — both succeeded (codegen completed "Generating TypeScript bindings... Running TypeScript..." and tsc produced no errors).

**Full unit suite (safety check, beyond brief):** `npx vitest run` — `27 files / 169 tests passed`, confirming the shared schema/seed changes broke nothing.

## Files changed (commit a274572)

- `convex/schema.ts` — two new tables + one new `subscriptions` index (+38 lines)
- `convex/lib/constants.ts` — pricing fields on all three `SYSTEM_PLANS` entries (+12 lines)
- `convex-test/billing.test.ts` — new test (verbatim from brief)

No `convex/_generated` changes were committed because codegen produced zero diffs there: this project's generated `dataModel.d.ts` derives types via `DataModelFromSchemaDefinition<typeof schema>`, so table additions require no regeneration of the checked-in files (verified via `git status` and grep — expected and correct).

## Self-review findings

- **Completeness:** All brief steps done with exact values; test file byte-equivalent to the brief's listing.
- **Quality/conventions:** Matches existing `defineTable` style and index naming; no `any`, no `@ts-ignore`, no comments added; no scope creep (only files listed in the brief were touched).
- **Constraints honored:** Money as integer PHP centavos with field name `priceCents`; exact plan values; no unlisted files staged.
- **Observation:** The `plans` table in `convex/schema.ts` already had optional `priceCents`/`currency`/`billingInterval`/`isActive` fields before this task, so no `plans` schema change was required (the brief did not ask for one).

## Concerns

None blocking. Notes:

- `.superpowers/sdd/task-1-brief.md` was already modified in the working tree before this task started; deliberately left unstaged.
- `npx convex codegen` contacts the configured (dev) deployment as part of its normal flow; no deployment-affecting push beyond function metadata upload.
