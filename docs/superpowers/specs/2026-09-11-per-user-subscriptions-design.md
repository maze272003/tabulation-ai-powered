# Per-User Subscriptions Design (replacing per-org billing)

## 1. Executive Summary & Business Problem

Today a subscription belongs to one **organization**. Every new org starts its own
trial, and an organizer who runs tabulation for several client organizations
(a common freelance-tabulator pattern) must pay once per org.

This feature moves billing to the **email account** (the SSO `userProfiles` row):

- A subscription attaches to the signed-in user, not an org.
- One subscription covers **every org that user creates** — unlimited.
- All members of a covered org share full access while it is covered.
- **One trial per user, ever** — creating more orgs never yields a new trial.
- Plan limits **pool across all orgs** the subscriber created (one shared bucket).
- When the subscription lapses, **all the subscriber's orgs degrade together**.

Entitlement resolution changes from `org → subscription` to
`org → creator → subscription`. Checkout, webhook, refunds, lifecycle, and both
admin consoles re-key from org to user.

### Confirmed business rules

| Rule | Decision |
|---|---|
| Unit of billing | The SSO user account (email) |
| Coverage | Unlimited orgs created by the subscriber |
| Members of a covered org | Share full entitlements via the org |
| Trial | One per user, ever (created on first org creation) |
| Limits | Pooled per user across all their orgs |
| Existing paid org subscriptions | Transfer to the org creator (best plan wins, paid time preserved) |
| Who can purchase/manage billing | Only the subscription owner |

---

## 2. Architecture & Data Model

### 2.1 Schema changes (`convex/schema.ts`) — widen → migrate → narrow

| Table | Before | After |
|---|---|---|
| `subscriptions` | `orgId: Id<"organizations">`, index `by_org_id` | `userId: Id<"userProfiles">`, index `by_user_id` (one row per user, ever) |
| `billingPayments` | `orgId` (required) | `userId` (required) + `orgId` optional — legacy rows keep `orgId` for audit history |
| `usage` | `orgId`, index `by_org_id_and_resource` | `userId`, index `by_user_id_and_resource` — pooled counters |

`subscriptions` keeps its existing status ladder (`trialing | active | past_due |
canceled | expired | paused`), `trialEndsAt`, `currentPeriodEndAt`,
`cancelAtPeriodEnd`, and the PayMongo identifier fields unchanged.

Audit rows for billing events (`billing.*`, `subscription.*`) switch their
subject from `orgId` to `userId`.

### 2.2 Entitlement resolution (`convex/lib/authz.ts`)

`requirePermission` currently loads the org's subscription and rejects with
`FORBIDDEN "No subscription"` when missing. The lookup becomes:

```
org = organizations.by_slug(orgSlug)
creator = org.createdById
subscription = subscriptions.by_user_id(creator)   // unique
if (!subscription) → FORBIDDEN "No subscription"
```

The auth context still carries `subscription: Doc<"subscriptions">`, so the
existing `requireFeature` / `requireLimit` call sites (events, contestants,
accounts, templates, results export) keep their shape.
`requireLimit`'s usage read becomes `getUsage(ctx, creatorId, resource)` — one
indexed read of the pooled counter.

### 2.3 Subscription creation & the trial-once rule

- `organizations.create` no longer inserts a subscription row.
- New rule: when a user creates an org and has **no** subscription row, create
  one with `status: "trialing"` (first org ever = the one trial).
- Creating a second (third, …) org reuses the existing row — no new trial,
  enforced structurally by the unique `by_user_id` index.

### 2.4 Plan limit semantics

| Limit | Scope after this change |
|---|---|
| `maxMembers` | Per org — enforced by counting `organizationMembers` rows live (`by_org_id` index) instead of a usage counter, so pooling cannot silently change its meaning; RBAC remains org-scoped |
| `maxEvents` | **Pooled** across all the subscriber's orgs |
| `maxJudges` | **Pooled** across all the subscriber's orgs |
| `maxContestants` | **Pooled** across all the subscriber's orgs |

The `members` resource is removed from the `usage` table; admin displays that
read it (`platform/orgs`, `superadmin/orgs`) switch to the live member count.

---

## 3. Purchase Flow & Lifecycle

### 3.1 Checkout (`convex/billing/checkout.ts`)

- Checkout mutations lose the `orgSlug` parameter and run against the signed-in
  user; the caller must be the **subscription owner** (members cannot spend the
  owner's money).
- PayMongo metadata: `{ userId, paymentId }`.
- Success/cancel URLs point at the user-scoped billing page (`/app/billing`).
- The one-live-checkout rule becomes per-user.

### 3.2 Webhook (`convex/billing/webhook.ts`)

`applyPaidPayment` / `applyPaidEvent` logic is unchanged apart from re-keying:
look up the subscription `by_user_id(payment.userId)`, stack the renewal window
via `computeRenewalWindow`, patch to `active`. Amount-mismatch flagging,
event dedupe (`processedWebhookEvents`), and signature verification stay as-is.

### 3.3 Lifecycle cron (`convex/billing/lifecycle.ts`)

Same ladder — pending checkouts expire after 24h; `active` lapses to
`past_due`; `past_due` beyond the 7-day grace downgrades to the Free plan.
Semantics change only in blast radius: one lapsed subscriber degrades **all**
their orgs for **all** members simultaneously.

### 3.4 Refunds (`convex/billing/refunds.ts`)

Refund eligibility keys off the user's `paid` payments; the Sentry refund
approval workflow (including PayMongo payout) is otherwise unchanged.

---

## 4. Data Migration (one-shot)

Implemented as an idempotent maintenance mutation:

1. For every existing `subscriptions` row, resolve
   `targetUser = organizations.get(orgId).createdById`.
2. If the user already has a subscription: **best row wins** —
   paid `active` > `trialing`; tie-break by furthest `currentPeriodEndAt`.
   Losing rows are deleted; the winner's plan and period are preserved.
3. Rewrite `billingPayments.orgId → userId` (retain `orgId` on the row for
   purchase-history display of legacy payments).
4. Sum per-org `usage` rows into per-user pooled rows, then remove the
   per-org rows (the `members` resource is dropped entirely — see §2.4).
5. Delete org-keyed subscription rows only after their user-keyed counterpart
   exists; write one audit entry per transferred subscription.

Re-running is safe: rows already keyed `by_user_id` short-circuit the transfer.

Edge cases:
- Creator profile deleted → the subscription keeps their `userId`; resolution
  still works via the index.
- Same user owning two orgs with different paid plans → higher-priority plan
  wins, its paid time preserved.

---

## 5. UI & Admin Surfaces

### 5.1 Billing pages

- `/app/[orgSlug]/billing` becomes **read-only status**: current plan,
  coverage line ("This org is covered by your subscription" /
  "…by the owner's subscription"), pooled usage meters, payment history.
  Manage actions render only for the subscription owner.
- New user-scoped route `/app/billing` hosts the actual purchase flow
  (upgrade/change plan/cancel) and works without any org context.
- User menu gains a "Billing" entry; the org page links to it for owners.

### 5.2 Org creation UX

Creating a second+ org shows "Your subscription covers this org" instead of
any new-trial messaging.

### 5.3 Landing / pricing copy

"Per organization" wording becomes "per account — unlimited organizations".

### 5.4 Admin consoles (Platform `/platform` + Sentry `/sentry`)

Both consoles' subscription surfaces re-key from org to user: lists show the
owner email and the number of covered orgs; Sentry billing ops (plan editor,
manual assignment, trial extension) operate on the user's subscription. The
mirrored `platform/*` and `superadmin/*` modules change in parallel, matching
how they are maintained today.

---

## 6. Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| Org whose creator has no subscription row (migration orphan) | `requirePermission` fails with the existing `FORBIDDEN "No subscription"` contract; a Sentry-visible counter surfaces orphaned orgs so migration gaps are visible |
| Webhook payment for a user with no subscription | Existing `flagPayment` path, reason "No subscription found for user" |
| Concurrent checkouts | Unchanged pending-payment guard, now per-user |
| Member opens billing while owner lapses | Status banner: "Subscription past due — ask the owner to renew" (no dead end) |
| Migration interrupted | Idempotent re-run; org-keyed rows are only deleted after the user-keyed row exists |
| Deleted creator profile | Subscription row retains `userId`; index lookup still resolves |

---

## 7. Testing Strategy

- **Unit (vitest, pure functions):** migration tie-break (best-plan-wins,
  furthest period) extracted as a pure function; renewal stacking regression.
- **Convex tests (`convex-test`):**
  - Resolution chain: member of a covered org gets entitlements; uncovered org
    rejected.
  - Trial-once: creating a second org does not re-trial.
  - Pooled limits: events created in two orgs share one bucket and are capped
    together.
  - Webhook applies a paid payment to the **user's** subscription.
  - Lapse ladder downgrades all the creator's orgs together.
- **E2E (Playwright):** re-key the existing billing spec; add a flow where one
  user creates two orgs and upgrades once from `/app/billing`.
- **Validation gates:** `npm run build` and the project's typecheck must pass.
