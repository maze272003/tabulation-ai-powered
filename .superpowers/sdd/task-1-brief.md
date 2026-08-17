### Task 1: Schema additions + plan pricing

**Files:**
- Modify: `convex/schema.ts` (add `billingPayments`, `processedWebhookEvents` tables; add 2 indexes)
- Modify: `convex/lib/constants.ts:32-63` (SYSTEM_PLANS pricing)
- Test: `convex-test/billing.test.ts` (create)

**Interfaces:**
- Produces: tables `billingPayments`, `processedWebhookEvents`; `subscriptions` index `by_status_and_period_end`; `billingPayments` indexes `by_org_id`, `by_checkout_session_id`, `by_reference_number`, `by_status`. Plans seeded with `priceCents` (Free 0, Starter 49900, Pro 149900), `currency: "PHP"`, `billingInterval: "monthly"`, `isActive: true`. Later tasks rely on these exact field names.

- [ ] **Step 1: Write the failing test**

Create `convex-test/billing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, seedAndProvision, setupTest } from "./setup";

describe("billing plans", () => {
  it("seeds plans with PHP pricing", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    const plans = await t.query(api.plans.list, {});
    const byName = new Map(plans.map((p) => [p.name, p]));
    expect(byName.get("Free")?.priceCents).toBe(0);
    expect(byName.get("Starter")?.priceCents).toBe(49900);
    expect(byName.get("Pro")?.priceCents).toBe(149900);
    for (const plan of plans) {
      expect(plan.currency).toBe("PHP");
      expect(plan.billingInterval).toBe("monthly");
      expect(plan.isActive).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex-test/billing.test.ts`
Expected: FAIL — `priceCents` undefined (plans have no pricing yet).

- [ ] **Step 3: Implement schema + pricing**

In `convex/schema.ts`, add these two tables after the `subscriptions` table definition:

```ts
  billingPayments: defineTable({
    orgId: v.id("organizations"),
    planId: v.id("plans"),
    createdById: v.id("userProfiles"),
    checkoutSessionId: v.union(v.null(), v.string()),
    checkoutUrl: v.union(v.null(), v.string()),
    referenceNumber: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    billingInterval: v.union(v.literal("monthly"), v.literal("yearly")),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("expired"),
      v.literal("cancelled"),
      v.literal("flagged"),
    ),
    periodStartAt: v.union(v.null(), v.number()),
    periodEndAt: v.union(v.null(), v.number()),
    paidAt: v.union(v.null(), v.number()),
    failureReason: v.union(v.null(), v.string()),
  })
    .index("by_org_id", ["orgId"])
    .index("by_status", ["status"])
    .index("by_checkout_session_id", ["checkoutSessionId"])
    .index("by_reference_number", ["referenceNumber"]),

  processedWebhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    receivedAt: v.number(),
  })
    .index("by_event_id", ["eventId"]),
```

Change the `subscriptions` table's index block from:

```ts
    .index("by_org_id", ["orgId"]),
```

to:

```ts
    .index("by_org_id", ["orgId"])
    .index("by_status_and_period_end", ["status", "currentPeriodEndAt"]),
```

In `convex/lib/constants.ts`, add pricing to each entry of `SYSTEM_PLANS` (inside each object literal, after `isSystem: true,` — keep arrays/objects identical otherwise):

```ts
    // Free:
    priceCents: 0,
    currency: "PHP",
    billingInterval: "monthly",
    isActive: true,
    // Starter:
    priceCents: 49900,
    currency: "PHP",
    billingInterval: "monthly",
    isActive: true,
    // Pro:
    priceCents: 149900,
    currency: "PHP",
    billingInterval: "monthly",
    isActive: true,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex-test/billing.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Codegen + typecheck + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

Expected: both succeed.

```powershell
git add convex/schema.ts convex/lib/constants.ts convex-test/billing.test.ts convex/_generated
git commit -m "feat(billing): add billingPayments/processedWebhookEvents schema and PHP plan pricing"
```

---

