### Task 3: Payment queries (`billing/payments.ts`)

**Files:**
- Create: `convex/billing/payments.ts`
- Test: `convex-test/billingPayments.test.ts` (create)

**Interfaces:**
- Consumes: `billingPayments` table (Task 1), `requirePermission` with permissions `subscription.view` / `subscription.manage`.
- Produces: `api.billing.payments.listForOrg({ orgSlug })` → array of `billingPayments` docs (+ `planName: string | null`), newest first, max 50; `api.billing.payments.getActiveCheckout({ orgSlug })` → `{ paymentId, checkoutUrl, planName, amountCents, currency, billingInterval, createdAt } | null`.

- [ ] **Step 1: Write the failing tests**

Create `convex-test/billingPayments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, seedAndProvision, setupTest } from "./setup";

describe("billing payments queries", () => {
  it("returns an empty history and no active checkout for a new org", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: "acme" });
    expect(history).toEqual([]);
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).toBeNull();
  });

  it("rejects non-members with FORBIDDEN", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await seedAndProvision(t, bobIdentity);
    await expect(
      t.withIdentity(bobIdentity).query(api.billing.payments.listForOrg, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(bobIdentity).query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingPayments.test.ts`
Expected: FAIL — `api.billing.payments` does not exist (undefined function).

- [ ] **Step 3: Implement**

Create `convex/billing/payments.ts`:

```ts
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requirePermission } from "../lib/authz";

const HISTORY_LIMIT = 50;

export const listForOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.view",
    });
    const payments = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .order("desc")
      .take(HISTORY_LIMIT);
    const planNames = new Map(
      await Promise.all(
        [...new Set(payments.map((p) => p.planId))].map(
          async (planId) => {
            const plan = await ctx.db.get(planId);
            return [planId, plan?.name ?? null] as const;
          },
        ),
      ),
    );
    return payments.map((payment) => ({
      ...payment,
      planName: planNames.get(payment.planId) ?? null,
    }));
  },
});

export const getActiveCheckout = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (!pending) return null;
    const plan = await ctx.db.get(pending.planId);
    return {
      paymentId: pending._id,
      checkoutUrl: pending.checkoutUrl,
      planName: plan?.name ?? null,
      amountCents: pending.amountCents,
      currency: pending.currency,
      billingInterval: pending.billingInterval,
      createdAt: pending._creationTime,
    };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingPayments.test.ts; npx vitest run convex-test/billing.test.ts`
Expected: both PASS.

- [ ] **Step 5: Codegen + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

```powershell
git add convex/billing/payments.ts convex-test/billingPayments.test.ts convex/_generated
git commit -m "feat(billing): add payment history and active checkout queries"
```

---

