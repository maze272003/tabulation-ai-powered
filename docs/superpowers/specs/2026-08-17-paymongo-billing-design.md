# PayMongo Billing Integration — Design

Date: 2026-08-17
Status: Approved (user delegated all decisions to the implementer)

## Goal

Replace the Phase 6 billing stub with a production PayMongo integration:
org owners buy/renew subscription periods (Starter / Pro) via PayMongo Hosted
Checkout, payments are confirmed only by a signature-verified webhook, and
subscription state (active / past_due / expired + auto-downgrade) is maintained
automatically. PHP currency, Philippine payment methods, zero PCI scope.

## Approach: Hosted Checkout + prepaid periods

A Convex action creates a PayMongo Checkout Session for the chosen plan; the
   org pays (GCash, Maya, cards, GrabPay, QR Ph, BNPL, online banking); the
`checkout_session.payment.paid` webhook applies a fixed-duration period
(monthly = 30 days, yearly = 365 days) to the org subscription. Renewals stack
on the current period end. A daily cron expires subscriptions.

Rejected alternatives:
- PayMongo native Subscriptions (auto-recurring): cards + Maya only (no
  GCash/GrabPay), requires PayMongo support activation + card vaulting, plan
  changes apply only next cycle. Worse coverage for more complexity.
- Custom in-app Payment Intent checkout: max PCI scope, most code, highest
  risk. Wrong for MVP.

MVP cuts (explicitly out of scope): proration, refunds UI (manual via PayMongo
dashboard), invoice/receipt PDFs, auto-recurring billing, multi-seat add-ons,
usage-based billing.

## Payment flow

1. Org owner opens `/[orgSlug]/billing`, picks a paid plan (Starter/Pro),
   clicks Upgrade/Renew.
2. Convex action `billing.createCheckout`:
   - `requirePermission(ctx, { permission: "subscription.manage" })`.
   - Loads the plan server-side; amount comes from `plan.priceCents` — never
     from client arguments.
   - Rejects if the org already has a live pending checkout (see
     "One-live-checkout rule").
   - Inserts a `billingPayments` row with status `pending` and a
   `referenceNumber` (payment table id + random suffix).
   - POSTs `/v2/checkout_sessions` (Basic auth, secret key; `amount` in PHP
     centavos, `currency: "PHP"`, `success_url`/`cancel_url` back to the
     billing page, `reference_number`, `metadata.orgId`/`paymentId`).
   - Saves `checkoutSessionId` + `checkoutUrl` on the payment row and returns
     the URL. Client redirects with `window.location.href`.
3. PayMongo redirects the browser to `success_url` (or `cancel_url`). The
   redirect grants nothing — display only.
4. PayMongo POSTs the `checkout_session.payment.paid` event to
   `POST /paymongo/webhook` (Convex http route). The webhook is the source of
   truth:
   - Verify `Paymongo-Signature` HMAC-SHA256 against the **raw request body**
     before parsing (Web Crypto `crypto.subtle`, constant-time compare, 5-min
     timestamp tolerance). 401 on failure.
   - Dedupe: insert into `processedWebhookEvents` first; if the event id
     already exists, 200 and skip.
   - `livemode` guard against `PAYMONGO_LIVEMODE`.
   - Unknown event types: 200 and ignore (never error — triggers retries).
   - On `checkout_session.payment.paid`: find the payment by
     `reference_number`; verify the paid amount/currency match the amounts
     recorded on the pending payment row (what we asked PayMongo to charge —
     plan price drift after checkout is intentionally honored); mismatch →
     mark payment `flagged`, audit, do not apply; atomically mark `paid`,
     extend `currentPeriodEndAt` (stacks while active), set subscription
     `status: "active"`, `cancelAtPeriodEnd: false`, write audit.
   - On `checkout_session.payment.failed` / `.expired` / `.canceled` (as
     available): mark the payment row accordingly.

## Period math

- `MONTHLY_PERIOD_MS = 30 * 24h`, `YEARLY_PERIOD_MS = 365 * 24h` (fixed
  durations; no calendar math, no DST concerns).
- New period starts at `max(now, currentPeriodEndAt)` while status is
  `active`/`trialing`/`past_due` (stacking); otherwise starts at now.
- `periodStartAt`/`periodEndAt` recorded on each payment row for the ledger.

## Data model (additive only)

- `billingPayments`:
  - `orgId`, `planId`, `createdById`
  - `checkoutSessionId` (unique index), `checkoutUrl`, `referenceNumber` (index)
  - `amountCentavos`, `currency`, `billingInterval`
  - `status: pending | paid | failed | expired | cancelled | flagged`
  - `periodStartAt`, `periodEndAt`, `paidAt`, `failureReason`
  - index `by_org_id_and_creation_time` (history), unique `by_checkout_session_id`
- `processedWebhookEvents`: `eventId` (unique), `eventType`, `receivedAt`,
  `payloadSummary` — idempotency ledger.
- `subscriptions`: reuse as-is. `stripeCustomerId`/`stripeSubscriptionId` stay
  nullable and unused (no migration). `currentPeriodEndAt` becomes meaningful.
- Plans seeded with PHP pricing: Free ₱0, Starter ₱499/mo, Pro ₱1,499/mo
  (`priceCents` in centavos, `currency: "PHP"`, `billingInterval: "monthly"`).
  Prices remain editable in the existing superadmin console.

## Expiry lifecycle (daily cron)

- `active` + `currentPeriodEndAt <= now` → `past_due` (audited).
- `past_due` + `currentPeriodEndAt` older than 7-day grace → `expired` +
  auto-downgrade plan to Free (audited).
- Cancel = `cancelAtPeriodEnd: true`; service continues until period end, then
  the normal expiry ladder applies. Resume clears the flag (no-op if paid
  period still running).

## Backend modules

- `convex/billing/payments.ts` — queries `listForOrg` (history),
  `getActiveCheckout` (pending row for banner/CTA state).
- `convex/billing/checkout.ts` — action `createCheckout` (above), plus
  `cancelCheckout` (owner-initiated abandon: mark row `cancelled`; PayMongo
  session simply expires on its own).
- `convex/billing/webhook.ts` — http route handler `paymongoWebhook` +
  internal mutation `processWebhookEvent` (single transaction: dedupe insert +
  payment/subscription transition + audit).
- `convex/billing/lifecycle.ts` — internal mutation `expireSubscriptions`
  called from the existing cron file.
- `convex/lib/paymongo.ts` — env access, API client (checkout session create),
  signature verification, constants.
- `convex/subscriptions.ts` — `changePlan` stub replaced with explicit
  semantics: choosing Free (or any downgrade) sets `cancelAtPeriodEnd: true`
  (service until period end, then expiry ladder downgrades); choosing a paid
  plan throws `appError(VALIDATION_ERROR)` directing the caller to the
  checkout flow (`billing.createCheckout`). Immediate plan switches remain a
  superadmin override only. A `resume` mutation clears `cancelAtPeriodEnd`.

### One-live-checkout rule

`createCheckout` reuses an existing pending row for the same plan (returns its
URL) and rejects creating a second concurrent pending checkout for the same org
(CONFLICT). Prevents checkout spam and double-payment races. PayMongo sessions
naturally expire; a stale `pending` row older than 24h is auto-marked
`expired` by the cron before the rule is evaluated.

## Security

- Secrets only via Convex env: `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`,
  `PAYMONGO_LIVEMODE` ("true"/"false"). Documented in `.env.example` comments
  (values set via `npx convex env set`, never committed).
- All amounts computed and validated server-side at checkout **and** webhook
  time. Client sends only `{ orgSlug, planName }`.
- Webhook signature verification on the raw body before parsing; constant-time
  compare; timestamp freshness check.
- Event-id dedupe + all transitions in single transactions → idempotent under
  PayMongo's 12-retry delivery.
- Permission-gated mutations; org identity always from `ctx.auth`.
- Audit log entries for every payment transition and subscription status
  change (`billing.payment.paid`, `billing.payment.flagged`,
  `subscription.expired`, `subscription.downgraded`, …).

## UI (`/[orgSlug]/billing` rebuild, existing design system)

- Plan grid: Free/Starter/Pro cards with ₱ pricing, feature/limit summary,
  current-plan highlight, Upgrade / Renew CTAs (disabled for Free-current or
  lacking permission).
- Status banners: `past_due` → "Renew now", `cancelAtPeriodEnd` → "Cancels on
  …" + Resume button, `trialing` → trial end date.
- Pending-checkout banner: "Complete payment" (re-opens URL) + Cancel.
- Payment history table (date, plan, amount, interval, status).
- Return-to-app banners for `?billing=success|cancelled|flagged`.
- Full loading / empty / error states; `sonner` toasts on actions.

## Testing

- vitest unit: signature util (valid/tampered/stale), period math (stacking,
  grace, fixed durations).
- convex-test: webhook idempotency (double delivery applies once), permission
  denials, amount-mismatch flagging, expiry ladder.
- Playwright: billing page render, CTA gating, pending banner.
- Manual runbook with `sk_test` keys (test GCash/card from PayMongo docs).
- Gates: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`.
