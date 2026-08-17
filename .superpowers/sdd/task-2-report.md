# Task 2 Report: PayMongo lib (signature, client) + billing period math + unit tests

**Status:** DONE
**Commit:** d8545fd — `feat(billing): add PayMongo client, webhook signature verification, and period math`

## What Was Implemented

All code used verbatim from the task brief:

1. **`convex/lib/errors.ts`** (modified) — added `PAYMENT_PROVIDER: "PAYMENT_PROVIDER"` to the `ErrorCode` object, after `TIES_UNRESOLVED`.
2. **`convex/lib/billing.ts`** (created) — period constants (`DAY_MS`, `MONTHLY_PERIOD_MS` = 30d, `YEARLY_PERIOD_MS` = 365d, `PAST_DUE_GRACE_MS` = 7d, `STALE_PENDING_MS` = 24h), `periodDurationMs(interval)`, `computeRenewalWindow(subscription, now)` (stacks renewals on `active`/`trialing`/`past_due` with `Math.max(now, currentPeriodEndAt ?? 0)`; `canceled` or lapsed periods start at `now`), and `randomHex(charCount)` via `crypto.getRandomValues`.
3. **`convex/lib/paymongo.ts`** (created) — `paymongoSecretKey()` (throws `PAYMENT_PROVIDER` app error when unset), `expectedLivemode()`, `siteUrl()` (trailing-slash stripped, localhost default), `verifyPaymongoSignature(rawBody, signatureHeader, secret, now?)` accepting both `{t}.{body}` timestamped and raw-body schemes with a 5-minute tolerance and constant-time hex comparison, and `createCheckoutSession(input)` (POST to `/v2/checkout_sessions` with Basic auth from the secret key, defensive `unknown`-typed response extraction, `appError` on non-OK or incomplete payloads).
4. **`.env.example`** (modified) — appended the PayMongo block verbatim: comments/placeholders only, no secret values. Documents `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_LIVEMODE`, the webhook endpoint path, and the events to subscribe to.
5. **`convex-test/billingUnits.test.ts`** (created) — 8 tests verbatim from the brief covering both signature schemes, tampered body, stale timestamp, wrong secret, missing header, and the period-math cases.

## TDD Evidence

**RED** — `npx vitest run convex-test/billingUnits.test.ts` (before implementation):

```
 FAIL  convex-test/billingUnits.test.ts [ convex-test/billingUnits.test.ts ]
Error: Cannot find module '../convex/lib/billing' imported from .../convex-test/billingUnits.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

**GREEN** — same command after implementation:

```
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

**Full suite** — `npx vitest run`:

```
 Test Files  28 passed (28)
      Tests  177 passed (177)
```

No warnings, no console noise, no skipped/failed tests.

**Typecheck** — `npx convex codegen; npx tsc --noEmit`: both clean, zero errors.

## Files Changed (committed)

- `convex/lib/errors.ts` (modified)
- `convex/lib/paymongo.ts` (created)
- `convex/lib/billing.ts` (created)
- `.env.example` (modified)
- `convex-test/billingUnits.test.ts` (created)
- `convex/_generated/api.d.ts` (modified by `npx convex codegen` — registers `lib/billing` and `lib/paymongo` modules; included per the brief's `git add` list)

Not committed (left for the controller): `.superpowers/sdd/*` changes. `AGENTS.md` untouched and never staged.

## Self-Review Findings

- **Completeness:** every brief step executed in order (failing tests → verified fail → implement → verified pass → codegen/typecheck → exact-file commit). All interfaces Tasks 4–6 need are exported as specified.
- **Constants verified:** MONTHLY = 30×24h, YEARLY = 365×24h, grace = 7d, stale = 24h, tolerance = 5min — asserted by tests and by reading the diff.
- **Security:** signature verification runs on the raw body string before any JSON parsing; comparison is length-checked constant-time XOR; secret key only ever used server-side; `.env.example` contains comments/placeholders only.
- **Quality gates:** no `any`, no `@ts-ignore`, no non-null assertions; response parsing narrows `unknown` through `isRecord` guards; `tsc --noEmit` passes.
- **Scope:** no files outside the brief's list were modified. Codegen produced a real diff this time (new lib modules) — verified it contains only the two new module registrations before staging.

## Concerns

None.

## Review Fix Report (post-review)

**Status:** DONE
**Commit:** 154de8c — `fix(billing): use web-standard btoa and typed network errors in PayMongo client`

### What changed

1. **`convex/lib/paymongo.ts` — Finding 1 (Important):** `createCheckoutSession` built the Basic auth header with `Buffer.from(...).toString("base64")`. `Buffer` is a Node global absent in Convex's default V8-isolates runtime, which would have thrown `ReferenceError` in production. Replaced with web-standard `btoa` (safe here — PayMongo secret keys are ASCII).
2. **`convex/lib/paymongo.ts` — Finding 2 (Minor):** wrapped the `await fetch(...)` call in try/catch so network-level failures (DNS, timeout) throw a typed `appError(ErrorCode.PAYMENT_PROVIDER, "PayMongo request failed: ...")` instead of propagating a raw `TypeError`. Response handling unchanged.
3. **`convex-test/billingUnits.test.ts`:** added one test ("maps a network-level fetch failure to a PAYMENT_PROVIDER error") that stubs `fetch` via `vi.stubGlobal` to reject, stubs `PAYMONGO_SECRET_KEY` via `vi.stubEnv`, and asserts `createCheckoutSession` rejects with `data: { code: "PAYMENT_PROVIDER" }` — exercising the end-to-end non-Buffer path. Existing `afterEach` unstubbing preserved.

### Commands run

- `npx vitest run convex-test/billingUnits.test.ts` → `Test Files 1 passed (1), Tests 9 passed (9)` (8 existing + 1 new)
- `npx tsc --noEmit` → clean, zero errors
- `git add convex/lib/paymongo.ts convex-test/billingUnits.test.ts` + commit → `154de8c` (2 files, 53 insertions, 25 deletions)

### Concerns

None. No `any`, no `@ts-ignore`, `AGENTS.md` never staged.
