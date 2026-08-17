### Task 6: Subscription lifecycle cron (`billing/lifecycle.ts`)

**Files:**
- Create: `convex/billing/lifecycle.ts`
- Modify: `convex/crons.ts` (register daily cron)
- Test: `convex-test/billingLifecycle.test.ts` (create)

**Interfaces:**
- Consumes: `STALE_PENDING_MS`, `PAST_DUE_GRACE_MS` (Task 2), `billingPayments.by_status` + `subscriptions.by_status_and_period_end` indexes (Task 1), `createOrgWithPendingCheckout` + `internal.billing.webhook.processWebhookEvent` (Tasks 4–5).
- Produces: `internal.billing.lifecycle.expireSubscriptions({ now?: number })` — time is injectable because the mutation is internal-only (scheduler callers omit it); this is the deliberate test seam.

- [ ] **Step 1: Write the failing tests**

Create `convex-test/billingLifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, createOrgWithPendingCheckout, setupTest } from "./setup";

const DAY = 24 * 60 * 60 * 1000;

describe("billing lifecycle", () => {
  it("expires stale pending checkouts after 24h", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    const createdAt = Date.now();
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, {});
    // Within 24h the checkout is still pending.
    let active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: ctx.orgSlug });
    expect(active).not.toBeNull();

    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: createdAt + 25 * DAY });
    active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: ctx.orgSlug });
    expect(active).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("expired");
  });

  it("moves active → past_due at period end, then expired + Free after grace", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_life_1",
      eventType: "checkout_session.payment.paid",
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paidAmount: ctx.amountCents,
    });
    const paidAt = Date.now();

    // Just after period end (30 days): past_due.
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: paidAt + 31 * DAY });
    let sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("past_due");

    // Within grace: still past_due.
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: paidAt + 37 * DAY });
    sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("past_due");

    // After 7-day grace: expired and downgraded to Free.
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: paidAt + 38 * DAY });
    sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("expired");
    expect(sub?.plan?.name).toBe("Free");
  });

  it("never touches active subscriptions with no period (Free orgs)", async () => {
    const t = setupTest();
    await createOrgWithPendingCheckout(t);
    // The org above has a pending payment, not an applied one — create a pure Free org.
    // Use a second org via the public API.
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, {
      name: "Free Org",
      slug: "free-org",
    });
    const before = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: "free-org" });
    expect(before?.subscription.status).toBe("active");
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: Date.now() + 365 * DAY });
    const after = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: "free-org" });
    expect(after?.subscription.status).toBe("active");
    expect(after?.plan?.name).toBe("Free");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingLifecycle.test.ts`
Expected: FAIL — `internal.billing.lifecycle` undefined.

- [ ] **Step 3: Implement**

Create `convex/billing/lifecycle.ts`:

```ts
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { writeAudit } from "../lib/audit";
import { PAST_DUE_GRACE_MS, STALE_PENDING_MS } from "../lib/billing";

const BATCH_SIZE = 100;

/**
 * Daily maintenance ladder:
 * 1. Pending checkouts older than 24h are marked expired (sessions die at
 *    PayMongo on their own; this keeps the one-live-checkout rule honest).
 * 2. active + lapsed period → past_due (service keeps working during grace).
 * 3. past_due + 7-day grace exhausted → expired + downgrade to Free.
 *
 * `now` is injectable because this is an internal mutation used only by the
 * scheduler and tests; production callers omit it.
 */
export const expireSubscriptions = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<void> => {
    const now = args.now ?? Date.now();

    const stalePending = await ctx.db
      .query("billingPayments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(BATCH_SIZE);
    for (const payment of stalePending) {
      if (payment._creationTime > now - STALE_PENDING_MS) continue;
      await ctx.db.patch(payment._id, { status: "expired" });
      await writeAudit(ctx, {
        orgId: payment.orgId,
        actorId: null,
        action: "billing.payment.expired",
        resourceType: "billingPayment",
        resourceId: payment._id,
        after: { reason: "Checkout not completed within 24h" },
      });
    }

    const lapsed = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_period_end", (q) =>
        q.eq("status", "active").lt("currentPeriodEndAt", now),
      )
      .take(BATCH_SIZE);
    for (const subscription of lapsed) {
      // Free-tier orgs have status "active" with a null period — never expire them.
      if (subscription.currentPeriodEndAt === null) continue;
      await ctx.db.patch(subscription._id, { status: "past_due" });
      await writeAudit(ctx, {
        orgId: subscription.orgId,
        actorId: null,
        action: "subscription.past_due",
        resourceType: "subscription",
        resourceId: subscription._id,
        after: { currentPeriodEndAt: subscription.currentPeriodEndAt },
      });
    }

    const graceDeadline = now - PAST_DUE_GRACE_MS;
    const beyondGrace = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_period_end", (q) =>
        q.eq("status", "past_due").lt("currentPeriodEndAt", graceDeadline),
      )
      .take(BATCH_SIZE);
    if (beyondGrace.length === 0) return;
    const freePlan = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", "Free"))
      .unique();
    if (!freePlan) {
      console.error("billing lifecycle: Free plan missing — run seed; skipping downgrades");
      return;
    }
    for (const subscription of beyondGrace) {
      if (subscription.currentPeriodEndAt === null) continue;
      await ctx.db.patch(subscription._id, {
        status: "expired",
        planId: freePlan._id,
        cancelAtPeriodEnd: false,
      });
      await writeAudit(ctx, {
        orgId: subscription.orgId,
        actorId: null,
        action: "subscription.expired",
        resourceType: "subscription",
        resourceId: subscription._id,
        before: { planId: subscription.planId },
        after: { planId: freePlan._id },
      });
    }
  },
});
```

In `convex/crons.ts`, add the import and registration:

```ts
import { internal } from "./_generated/api";
// (already imported) — extend the crons section:

crons.interval(
  "expire subscriptions and stale checkouts",
  { hours: 24 },
  internal.billing.lifecycle.expireSubscriptions,
  {},
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingLifecycle.test.ts; npx vitest run convex-test/billingWebhook.test.ts`
Expected: both PASS.

- [ ] **Step 5: Codegen + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

```powershell
git add convex/billing/lifecycle.ts convex/crons.ts convex-test/billingLifecycle.test.ts convex/_generated
git commit -m "feat(billing): add subscription expiry ladder and stale checkout cleanup cron"
```

---

