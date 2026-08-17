### Task 5: Webhook handler + HTTP route

**Files:**
- Create: `convex/billing/webhook.ts`
- Modify: `convex/http.ts` (register route)
- Test: `convex-test/billingWebhook.test.ts` (create)

**Interfaces:**
- Consumes: `verifyPaymongoSignature`, `expectedLivemode` (Task 2), `computeRenewalWindow` (Task 2), `processedWebhookEvents` + `billingPayments` (Task 1), `createOrgWithPendingCheckout` (Task 4), `internal.billing.webhook.processWebhookEvent`.
- Produces: `POST /paymongo/webhook` route (registered in `convex/http.ts`); `internal.billing.webhook.processWebhookEvent({ eventId, eventType, checkoutSessionId, referenceNumber, paidAmount })` → `Promise<"duplicate" | "applied" | "flagged" | "ignored">`.

- [ ] **Step 1: Write the failing tests**

Create `convex-test/billingWebhook.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, createOrgWithPendingCheckout, setupTest } from "./setup";

const PAID_EVENT = "checkout_session.payment.paid";

function paidEvent(payment: { checkoutSessionId: string; amountCents: number }, eventId: string) {
  return {
    eventId,
    eventType: PAID_EVENT,
    checkoutSessionId: payment.checkoutSessionId,
    referenceNumber: null,
    paidAmount: payment.amountCents,
  };
}

describe("paymongo webhook processing", () => {
  it("applies a paid event: payment paid, subscription active with a 30-day period", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      ...paidEvent(ctx, "evt_1"),
    });
    expect(outcome).toBe("applied");
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("active");
    expect(sub?.subscription.planId).not.toBeNull();
    expect(sub?.subscription.currentPeriodEndAt).toBeGreaterThan(Date.now());
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("paid");
    expect(history[0].periodStartAt).not.toBeNull();
    expect(history[0].periodEndAt).not.toBeNull();
  });

  it("is idempotent under duplicate delivery (no double period extension)", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(ctx, "evt_dup"));
    const first = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      ...paidEvent(ctx, "evt_dup"),
    });
    expect(outcome).toBe("duplicate");
    const second = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(second?.subscription.currentPeriodEndAt).toBe(first?.subscription.currentPeriodEndAt);
  });

  it("flags a paid event whose amount does not match the payment row", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_amt",
      eventType: PAID_EVENT,
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paidAmount: ctx.amountCents - 1,
    });
    expect(outcome).toBe("flagged");
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.currentPeriodEndAt).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("flagged");
  });

  it("ignores replays against non-pending payments and unknown sessions", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(ctx, "evt_r1"));
    const replay = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      ...paidEvent(ctx, "evt_r2"),
    });
    expect(replay).toBe("ignored");
    const unknown = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_r3",
      eventType: PAID_EVENT,
      checkoutSessionId: "cs_test_unknown",
      referenceNumber: null,
      paidAmount: 49900,
    });
    expect(unknown).toBe("ignored");
  });

  it("marks payments failed on failure events and records unknown types", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_f1",
      eventType: "checkout_session.payment.failed",
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paidAmount: null,
    });
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("failed");
    const unknown = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_u1",
      eventType: "source.chargeable",
      checkoutSessionId: null,
      referenceNumber: null,
      paidAmount: null,
    });
    expect(unknown).toBe("ignored");
  });

  it("stacks a second paid period on top of the active one", async () => {
    const t = setupTest();
    const first = await createOrgWithPendingCheckout(t, { sessionSuffix: "1" });
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(first, "evt_s1"));
    const sub1 = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: first.orgSlug });
    // Renewal requires the first checkout to be settled (paid), so create another.
    const second = await createOrgWithPendingCheckout(t, {
      planName: "Pro",
      sessionSuffix: "2",
    });
    expect(second.orgSlug).toBe("acme");
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(second, "evt_s2"));
    const sub2 = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: second.orgSlug });
    expect(sub2?.subscription.currentPeriodEndAt).toBeGreaterThan(
      sub1?.subscription.currentPeriodEndAt ?? 0,
    );
  });
});
```

Note: the helper is safe to call twice in one test (it skips org creation when "acme" already exists and auto-increments session suffixes), which is exactly what the stacking test does. After the test file passes, add `grantPaidPlan` (defined in Task 4's setup.ts block above) plus the `internal` import to `convex-test/setup.ts` now — it is consumed by Tasks 6, 7, and the legacy-test migration.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingWebhook.test.ts`
Expected: FAIL — `internal.billing.webhook` undefined.

- [ ] **Step 3: Implement**

Create `convex/billing/webhook.ts` (final version — no intermediate refactors):

```ts
import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { writeAudit } from "../lib/audit";
import { computeRenewalWindow } from "../lib/billing";
import { expectedLivemode, verifyPaymongoSignature } from "../lib/paymongo";

const EVENT_PAID = "checkout_session.payment.paid";
const EVENT_FAILED = "checkout_session.payment.failed";
const EXPIRY_EVENTS = new Set([
  "checkout_session.payment.expired",
  "checkout_session.payment.canceled",
  "checkout_session.payment.cancelled",
]);

type ProcessedEvent = {
  eventId: string;
  eventType: string;
  checkoutSessionId: string | null;
  referenceNumber: string | null;
  paidAmount: number | null;
};

type WebhookOutcome = "duplicate" | "applied" | "flagged" | "ignored";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extracts the fields the processor needs from a PayMongo event envelope:
 * `{ data: { id, attributes: { type, livemode, data: <resource> } } }`.
 * Returns null for anything that does not match the documented shape.
 */
function extractEvent(rawBody: string): { event: ProcessedEvent; livemode: boolean } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.data)) return null;
  const { id: eventId, attributes } = parsed.data;
  if (typeof eventId !== "string" || !isRecord(attributes)) return null;
  const { type: eventType, livemode, data: resource } = attributes;
  if (typeof eventType !== "string" || typeof livemode !== "boolean") return null;
  const resourceAttributes =
    isRecord(resource) && isRecord(resource.attributes) ? resource.attributes : {};
  const sessionId = isRecord(resource) ? resource.id : undefined;
  const checkoutSessionId = typeof sessionId === "string" ? sessionId : null;
  const referenceNumber =
    typeof resourceAttributes.reference_number === "string"
      ? resourceAttributes.reference_number
      : null;
  let paidAmount: number | null = null;
  if (Array.isArray(resourceAttributes.payments) && resourceAttributes.payments.length > 0) {
    const first = resourceAttributes.payments[0];
    if (
      isRecord(first) &&
      isRecord(first.attributes) &&
      typeof first.attributes.amount === "number"
    ) {
      paidAmount = first.attributes.amount;
    }
  }
  return {
    event: { eventId, eventType, checkoutSessionId, referenceNumber, paidAmount },
    livemode,
  };
}

async function findPendingPayment(
  ctx: MutationCtx,
  event: ProcessedEvent,
): Promise<Doc<"billingPayments"> | null> {
  let payment: Doc<"billingPayments"> | null = null;
  if (event.checkoutSessionId !== null) {
    payment = await ctx.db
      .query("billingPayments")
      .withIndex("by_checkout_session_id", (q) =>
        q.eq("checkoutSessionId", event.checkoutSessionId),
      )
      .unique();
  }
  if (!payment && event.referenceNumber !== null) {
    payment = await ctx.db
      .query("billingPayments")
      .withIndex("by_reference_number", (q) => q.eq("referenceNumber", event.referenceNumber))
      .unique();
  }
  if (!payment || payment.status !== "pending") return null;
  return payment;
}

async function flagPayment(
  ctx: MutationCtx,
  payment: Doc<"billingPayments">,
  reason: string,
): Promise<WebhookOutcome> {
  await ctx.db.patch(payment._id, { status: "flagged", failureReason: reason });
  await writeAudit(ctx, {
    orgId: payment.orgId,
    actorId: null,
    action: "billing.payment.flagged",
    resourceType: "billingPayment",
    resourceId: payment._id,
    after: { reason },
  });
  return "flagged";
}

async function applyPaidEvent(ctx: MutationCtx, event: ProcessedEvent): Promise<WebhookOutcome> {
  const payment = await findPendingPayment(ctx, event);
  if (!payment) return "ignored";
  if (event.paidAmount !== null && event.paidAmount !== payment.amountCents) {
    return flagPayment(
      ctx,
      payment,
      `Amount mismatch: expected ${payment.amountCents}, webhook reported ${event.paidAmount}`,
    );
  }
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_org_id", (q) => q.eq("orgId", payment.orgId))
    .unique();
  if (!subscription) {
    return flagPayment(ctx, payment, "No subscription found for organization");
  }
  const now = Date.now();
  const window = computeRenewalWindow(subscription, now);
  await ctx.db.patch(payment._id, {
    status: "paid",
    paidAt: now,
    periodStartAt: window.periodStartAt,
    periodEndAt: window.periodEndAt,
  });
  await ctx.db.patch(subscription._id, {
    planId: payment.planId,
    status: "active",
    currentPeriodEndAt: window.periodEndAt,
    cancelAtPeriodEnd: false,
  });
  await writeAudit(ctx, {
    orgId: payment.orgId,
    actorId: payment.createdById,
    action: "billing.payment.paid",
    resourceType: "billingPayment",
    resourceId: payment._id,
    after: { amountCents: payment.amountCents, periodEndAt: window.periodEndAt },
  });
  return "applied";
}

async function applyTerminalEvent(
  ctx: MutationCtx,
  event: ProcessedEvent,
  status: "failed" | "expired",
  reason: string,
  auditAction: string,
): Promise<WebhookOutcome> {
  const payment = await findPendingPayment(ctx, event);
  if (!payment) return "ignored";
  await ctx.db.patch(payment._id, { status, failureReason: reason });
  await writeAudit(ctx, {
    orgId: payment.orgId,
    actorId: null,
    action: auditAction,
    resourceType: "billingPayment",
    resourceId: payment._id,
  });
  return "applied";
}

export const processWebhookEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    checkoutSessionId: v.union(v.null(), v.string()),
    referenceNumber: v.union(v.null(), v.string()),
    paidAmount: v.union(v.null(), v.number()),
  },
  handler: async (ctx, args): Promise<WebhookOutcome> => {
    // Dedupe first: PayMongo retries up to 12 times, so replays are expected.
    const existing = await ctx.db
      .query("processedWebhookEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (existing) return "duplicate";
    await ctx.db.insert("processedWebhookEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      receivedAt: Date.now(),
    });

    const event: ProcessedEvent = { ...args };
    if (event.eventType === EVENT_PAID) return applyPaidEvent(ctx, event);
    if (event.eventType === EVENT_FAILED) {
      return applyTerminalEvent(ctx, event, "failed", "Payment failed at PayMongo", "billing.payment.failed");
    }
    if (EXPIRY_EVENTS.has(event.eventType)) {
      return applyTerminalEvent(ctx, event, "expired", "Checkout session expired", "billing.payment.expired");
    }
    // Unknown types are recorded above and acknowledged — never error, that
    // would push the event into PayMongo's retry queue forever.
    return "ignored";
  },
});

export const paymongoWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("PAYMONGO_WEBHOOK_SECRET is not configured");
    return new Response(null, { status: 500 });
  }
  const rawBody = await request.text();
  const signature = request.headers.get("paymongo-signature");
  if (!(await verifyPaymongoSignature(rawBody, signature, secret))) {
    return new Response(null, { status: 401 });
  }
  const extracted = extractEvent(rawBody);
  if (!extracted) {
    console.error("paymongo webhook: unparseable payload after valid signature");
    return new Response(null, { status: 200 });
  }
  if (extracted.livemode !== expectedLivemode()) {
    return new Response(null, { status: 200 });
  }
  try {
    // Acknowledge immediately, process asynchronously — PayMongo requires a
    // 2xx within 30 seconds. A failed scheduled run is visible in Convex logs.
    await ctx.scheduler.runAfter(0, internal.billing.webhook.processWebhookEvent, extracted.event);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("paymongo webhook: failed to schedule processing", error);
    return new Response(null, { status: 500 });
  }
});
```

In `convex/http.ts`, add the route:

```ts
import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { paymongoWebhook } from "./billing/webhook";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);
http.route({
  path: "/paymongo/webhook",
  method: "POST",
  handler: paymongoWebhook,
});

export default http;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingWebhook.test.ts; npx vitest run convex-test/billingCheckout.test.ts`
Expected: both PASS (6 + 6).

- [ ] **Step 5: Codegen + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

```powershell
git add convex/billing/webhook.ts convex/http.ts convex-test/billingWebhook.test.ts convex-test/setup.ts convex/_generated
git commit -m "feat(billing): verify and process PayMongo webhooks idempotently"
```

---

