### Task 4: Checkout flow (`billing/checkout.ts`)

**Files:**
- Create: `convex/billing/checkout.ts`
- Modify: `convex-test/setup.ts` (add `createOrgWithPendingCheckout` helper)
- Test: `convex-test/billingCheckout.test.ts` (create)

**Interfaces:**
- Consumes: `lib/paymongo.createCheckoutSession`, `lib/billing.randomHex`, `ErrorCode.PAYMENT_PROVIDER`, `billingPayments` table, `plans` table, `subscription.manage` permission.
- Produces:
  - `api.billing.checkout.createCheckout` (action, `{ orgSlug: string, planName: string }` → `Promise<string>` checkout URL; redirects happen client-side)
  - `api.billing.checkout.cancelCheckout` (mutation, `{ orgSlug: string }` → void)
  - internal: `internal.billing.checkout.createPendingPayment`, `internal.billing.checkout.attachCheckoutSession`, `internal.billing.checkout.failPayment` (Task 5's httpAction does not use these directly)
  - Test helper `createOrgWithPendingCheckout(t, opts?: { planName?: string; sessionSuffix?: string })` returns `{ orgSlug, paymentId, checkoutSessionId, amountCents, referenceNumber }` — used by Tasks 5 and 6.

- [ ] **Step 1: Add the shared test helper**

In `convex-test/setup.ts`, add these imports at the top (merge with existing):

```ts
import { vi } from "vitest";
import { internal } from "../convex/_generated/api";
```

Append at the end of the file:

```ts
let checkoutCounter = 0;

export async function createOrgWithPendingCheckout(
  t: ReturnType<typeof setupTest>,
  opts: { planName?: string; sessionSuffix?: string } = {},
): Promise<{
  orgSlug: string;
  paymentId: string;
  checkoutSessionId: string;
  amountCents: number;
}> {
  const orgSlug = "acme";
  // Safe to call multiple times per test (e.g. renewals): only bootstrap once.
  const existing = await t
    .withIdentity(aliceIdentity)
    .query(api.organizations.get, { orgSlug });
  if (existing === null) {
    await createOrgAndEvent(t, aliceIdentity, { orgSlug, eventSlug: "gala" });
  }
  checkoutCounter += 1;
  const suffix = opts.sessionSuffix ?? `auto${checkoutCounter}`;
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          data: {
            id: `cs_test_${suffix}`,
            attributes: { checkout_url: `https://checkout.paymongo.com/test/${suffix}` },
          },
        }),
        { status: 200 },
      ),
  );
  vi.stubEnv("PAYMONGO_SECRET_KEY", `sk_test_${suffix}`);
  try {
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, {
        orgSlug,
        planName: opts.planName ?? "Starter",
      });
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
  const active = await t
    .withIdentity(aliceIdentity)
    .query(api.billing.payments.getActiveCheckout, { orgSlug });
  if (!active) throw new Error("pending checkout not found after createCheckout");
  return {
    orgSlug,
    paymentId: active.paymentId,
    checkoutSessionId: `cs_test_${suffix}`,
    amountCents: active.amountCents,
  };
}

/**
 * Grants a paid plan through the REAL path (checkout + paid webhook) so tests
 * exercise the same state production reaches. Replaces the old
 * `subscriptions.changePlan`-based setup.
 */
export async function grantPaidPlan(
  t: ReturnType<typeof setupTest>,
  planName: "Starter" | "Pro",
): Promise<{ orgSlug: string; checkoutSessionId: string; amountCents: number }> {
  const ctx = await createOrgWithPendingCheckout(t, { planName });
  const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
    eventId: `evt_grant_${planName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType: "checkout_session.payment.paid",
    checkoutSessionId: ctx.checkoutSessionId,
    referenceNumber: null,
    paidAmount: ctx.amountCents,
  });
  if (outcome !== "applied") throw new Error(`grantPaidPlan failed: ${outcome}`);
  return ctx;
}
```

Note: `grantPaidPlan` depends on Task 5's `processWebhookEvent`; it is introduced with Task 5 (step 1) but lives here so all later tasks share it. Add it to setup.ts during **Task 5**, together with the `internal` import; Task 4 only adds `createOrgWithPendingCheckout` + the `vi` import.

- [ ] **Step 2: Write the failing tests**

Create `convex-test/billingCheckout.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, seedAndProvision, setupTest } from "./setup";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubCheckoutSuccess(suffix = "1") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: `cs_test_${suffix}`,
            attributes: { checkout_url: `https://checkout.paymongo.com/test/${suffix}` },
          },
        }),
        { status: 200 },
      ),
    ),
  );
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_key");
}

describe("billing checkout", () => {
  it("creates a pending payment with a checkout URL", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    const url = await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { orgSlug: "acme", planName: "Starter" });
    expect(url).toBe("https://checkout.paymongo.com/test/1");
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).not.toBeNull();
    expect(active?.planName).toBe("Starter");
    expect(active?.amountCents).toBe(49900);
    expect(active?.billingInterval).toBe("monthly");
  });

  it("rejects the Free plan and unknown plans", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Free",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Platinum",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("enforces the one-live-checkout rule with CONFLICT", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { orgSlug: "acme", planName: "Starter" });
    stubCheckoutSuccess("2");
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Pro",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("requires subscription.manage permission", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await seedAndProvision(t, bobIdentity);
    stubCheckoutSuccess();
    await expect(
      t.withIdentity(bobIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("marks the payment failed when PayMongo rejects the request", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ errors: [{ detail: "Invalid amount" }] }),
            { status: 422 },
          ),
      ),
    );
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_key");
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "PAYMENT_PROVIDER" } });
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: "acme" });
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("failed");
    expect(history[0].failureReason).toContain("Invalid amount");
  });

  it("cancels an active checkout and CONFLICTs when none is active", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { orgSlug: "acme", planName: "Starter" });
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.billing.checkout.cancelCheckout, { orgSlug: "acme" });
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).toBeNull();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.billing.checkout.cancelCheckout, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingCheckout.test.ts`
Expected: FAIL — `api.billing.checkout` undefined.

- [ ] **Step 4: Implement**

Create `convex/billing/checkout.ts`:

```ts
import { v } from "convex/values";
import { action, internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "../lib/errors";
import { requirePermission } from "../lib/authz";
import { writeAudit } from "../lib/audit";
import { randomHex } from "../lib/billing";
import { createCheckoutSession, siteUrl } from "../lib/paymongo";

const REFERENCE_SUFFIX_LENGTH = 6;

export const createPendingPayment = internalMutation({
  args: { orgSlug: v.string(), planName: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    const plan = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", args.planName))
      .unique();
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    if (plan.isActive === false) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Plan ${plan.name} is not available`);
    }
    const amountCents = plan.priceCents ?? 0;
    if (amountCents <= 0 || !plan.currency || !plan.billingInterval) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        `Plan ${plan.name} cannot be purchased. Only priced plans support checkout.`,
      );
    }

    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (pending) {
      throw appError(
        ErrorCode.CONFLICT,
        "A checkout is already in progress. Complete or cancel it before starting another.",
      );
    }

    const paymentId = await ctx.db.insert("billingPayments", {
      orgId: actx.org._id,
      planId: plan._id,
      createdById: actx.user._id,
      checkoutSessionId: null,
      checkoutUrl: null,
      referenceNumber: "",
      amountCents,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      status: "pending",
      periodStartAt: null,
      periodEndAt: null,
      paidAt: null,
      failureReason: null,
    });
    const referenceNumber = `${paymentId}.${randomHex(REFERENCE_SUFFIX_LENGTH)}`;
    await ctx.db.patch(paymentId, { referenceNumber });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "billing.checkout.created",
      resourceType: "billingPayment",
      resourceId: paymentId,
      after: { planName: plan.name, amountCents, referenceNumber },
    });
    return {
      paymentId,
      orgId: actx.org._id,
      planName: plan.name,
      amountCents,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      referenceNumber,
    };
  },
});

export const attachCheckoutSession = internalMutation({
  args: {
    paymentId: v.id("billingPayments"),
    checkoutSessionId: v.string(),
    checkoutUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw appError(ErrorCode.NOT_FOUND, "Payment not found");
    if (payment.status !== "pending") {
      throw appError(ErrorCode.CONFLICT, "Payment is no longer pending");
    }
    const clash = await ctx.db
      .query("billingPayments")
      .withIndex("by_checkout_session_id", (q) => q.eq("checkoutSessionId", args.checkoutSessionId))
      .first();
    if (clash && clash._id !== payment._id) {
      throw appError(ErrorCode.CONFLICT, "Checkout session is already linked to another payment");
    }
    await ctx.db.patch(payment._id, {
      checkoutSessionId: args.checkoutSessionId,
      checkoutUrl: args.checkoutUrl,
    });
  },
});

export const failPayment = internalMutation({
  args: { paymentId: v.id("billingPayments"), reason: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status !== "pending") return;
    await ctx.db.patch(payment._id, { status: "failed", failureReason: args.reason });
    await writeAudit(ctx, {
      orgId: payment.orgId,
      actorId: null,
      action: "billing.checkout.failed",
      resourceType: "billingPayment",
      resourceId: payment._id,
      after: { reason: args.reason },
    });
  },
});

export const createCheckout = action({
  args: { orgSlug: v.string(), planName: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const pending = await ctx.runMutation(internal.billing.checkout.createPendingPayment, {
      orgSlug: args.orgSlug,
      planName: args.planName,
    });
    try {
      const session = await createCheckoutSession({
        lineItemName: `${pending.planName} plan (${pending.billingInterval})`,
        amountCents: pending.amountCents,
        currency: pending.currency,
        referenceNumber: pending.referenceNumber,
        successUrl: `${siteUrl()}/app/${args.orgSlug}/billing?billing=success`,
        cancelUrl: `${siteUrl()}/app/${args.orgSlug}/billing?billing=cancelled`,
        metadata: { orgId: pending.orgId, paymentId: pending.paymentId },
      });
      await ctx.runMutation(internal.billing.checkout.attachCheckoutSession, {
        paymentId: pending.paymentId,
        checkoutSessionId: session.checkoutSessionId,
        checkoutUrl: session.checkoutUrl,
      });
      return session.checkoutUrl;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown PayMongo error";
      await ctx.runMutation(internal.billing.checkout.failPayment, {
        paymentId: pending.paymentId,
        reason,
      });
      throw error;
    }
  },
});

export const cancelCheckout = mutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (!pending) throw appError(ErrorCode.CONFLICT, "No active checkout to cancel");
    await ctx.db.patch(pending._id, { status: "cancelled" });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "billing.checkout.cancelled",
      resourceType: "billingPayment",
      resourceId: pending._id,
    });
  },
});
```

Note: `Id` import is unused — remove it from the import list (only `v`, `action`, `internalMutation`, `mutation`, `internal`, helpers). Final import block:

```ts
import { v } from "convex/values";
import { action, internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { appError, ErrorCode } from "../lib/errors";
import { requirePermission } from "../lib/authz";
import { writeAudit } from "../lib/audit";
import { randomHex } from "../lib/billing";
import { createCheckoutSession, siteUrl } from "../lib/paymongo";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingCheckout.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Codegen + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

```powershell
git add convex/billing/checkout.ts convex-test/setup.ts convex-test/billingCheckout.test.ts convex/_generated
git commit -m "feat(billing): implement PayMongo checkout flow with one-live-checkout guard"
```

---

