# Task 5 Report: Webhook handler + HTTP route

**Status:** DONE
**Commit:** `601ad06` — `feat(billing): verify and process PayMongo webhooks idempotently`
**Branch:** `main`

## Implemented

- `convex/billing/webhook.ts` — `paymongoWebhook` httpAction + `processWebhookEvent` internalMutation, per the brief's final code:
  - Signature verification over the **raw body before any JSON parsing** (`verifyPaymongoSignature`); 401 on failure; 500 only when `PAYMONGO_WEBHOOK_SECRET` is missing or `scheduler.runAfter(0, ...)` itself throws; 200 for everything else (unparseable payload, livemode mismatch, unknown event types).
  - `extractEvent` narrows the PayMongo envelope with `isRecord` guards — no `any`, no `@ts-ignore`.
  - `processWebhookEvent`: dedupes via `processedWebhookEvents` `by_event_id` first ("duplicate"), inserts the event record, then dispatches. Paid events find the pending payment by `checkoutSessionId` (fallback `referenceNumber`), flag on amount mismatch or missing subscription, else mark paid + extend subscription via `computeRenewalWindow` (stacking, `status: "active"`, `cancelAtPeriodEnd: false`, `planId = payment.planId`) + audit `billing.payment.paid`. failed / expired / canceled(cancelled) events mark the payment terminal + audit. Unknown types are recorded and ignored (still 200).
- `convex/http.ts` — registered `POST /paymongo/webhook` per the brief.
- `convex-test/setup.ts` — added `grantPaidPlan` helper + `internal` import, exactly as shown in the Task 4 brief's setup.ts block (note at task-4-brief.md:108 says to add it during Task 5).
- `convex/_generated/api.d.ts` — regenerated via `npx convex codegen`.

## TDD evidence

- **RED:** `npx vitest run convex-test/billingWebhook.test.ts` → 6/6 FAIL with `Could not find module for: "billing/webhook"` (test written first, verbatim from brief).
- **GREEN:** after implementing `webhook.ts` + `convex codegen` → 6/6 PASS.
- **Pre-commit:** `npx vitest run convex-test/billingWebhook.test.ts convex-test/billingCheckout.test.ts` → 2 files, **12/12 PASS**.
- `npx tsc --noEmit` → clean. `npm run build` → passes (AGENTS.md gate).

## Files changed (commit 601ad06)

- `convex/billing/webhook.ts` (new)
- `convex/http.ts` (+7 lines: import + route)
- `convex-test/billingWebhook.test.ts` (new, 6 tests)
- `convex-test/setup.ts` (+23 lines: `internal` import + `grantPaidPlan`)
- `convex/_generated/api.d.ts` (codegen)

## Self-review

- Idempotency: dedupe row (transactional — rolls back with the mutation on failure) + `findPendingPayment`'s `status === "pending"` guard → replayed-but-distinct events against settled payments return "ignored" without re-extension. Covered by tests 2 and 4.
- Constraints verified: exact audit actions (`billing.payment.paid|flagged|failed|expired`), raw-body-before-parse signature check, no non-2xx on unknown event types, no `any`/`@ts-ignore`, no files touched beyond the brief's list, AGENTS.md never staged.
- Commit hygiene: repo had unrelated staged files (`lib/csv.ts`, `lib/csv.test.ts`) from a concurrent worker; used a pathspec-limited commit so 601ad06 contains exactly the 5 files above. The concurrent worker's own commit landed as parent 93eff76.

## Deviation from brief (1, minimal)

The brief's verbatim `findPendingPayment` fails `tsc`: TS2345 at `q.eq("referenceNumber", event.referenceNumber)` — property narrowing from `event.referenceNumber !== null` is reset inside the `withIndex` closure, and the schema field is non-nullable (`v.string()`), so the callback parameter requires `string`. Fixed by capturing the narrowed value in a `const referenceNumber = event.referenceNumber;` before the query (behavior identical). This was required to satisfy the brief's own hard gate (`npx convex codegen` runs `tsc`).

## Concerns

- The httpAction layer itself (signature 401/500 paths, livemode guard) is not exercised by unit tests — the brief's tests target the internalMutation only; signature logic is covered by Task 2's tests and the action is a thin verify→schedule wrapper. An end-to-end route test could be added later if the tooling supports httpAction invocation.
- `applyTerminalEvent` returns `"applied"` (not a distinct outcome) when it terminal-marks a payment — matches the brief's design; the test asserts the resulting `status` instead.
