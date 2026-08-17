### Task 7: Replace `subscriptions.changePlan` stub + `resume`

**Files:**
- Modify: `convex/subscriptions.ts:18-43` (replace `changePlan`, add `resume`)
- Test: `convex-test/billingSubscriptions.test.ts` (create)

**Interfaces:**
- Consumes: `requirePermission` with `subscription.manage`, plans table.
- Produces: `api.subscriptions.changePlan({ orgSlug, planName })` — only Free (cancel-at-period-end) is accepted; paid plan names throw `VALIDATION_ERROR` directing callers to `billing.createCheckout`. `api.subscriptions.resume({ orgSlug })` clears `cancelAtPeriodEnd`. Both audit. (UI in Task 8 calls exactly these.)

- [ ] **Step 1: Write the failing tests**

Create `convex-test/billingSubscriptions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import {
  aliceIdentity,
  bobIdentity,
  grantPaidPlan,
  seedAndProvision,
  setupTest,
} from "./setup";

async function paidOrg() {
  const t = setupTest();
  const ctx = await grantPaidPlan(t, "Starter");
  return { t, orgSlug: ctx.orgSlug };
}

describe("subscriptions changePlan/resume", () => {
  it("schedules cancellation to Free via changePlan", async () => {
    const { t, orgSlug } = await paidOrg();
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.subscriptions.changePlan, { orgSlug, planName: "Free" });
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug });
    expect(sub?.subscription.cancelAtPeriodEnd).toBe(true);
    expect(sub?.subscription.planId).not.toBeNull();
  });

  it("rejects paid plans (must use checkout) and no-op switches", async () => {
    const { t, orgSlug } = await paidOrg();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, {
        orgSlug,
        planName: "Pro",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, {
        orgSlug,
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("resume clears cancelAtPeriodEnd and CONFLICTs when nothing to resume", async () => {
    const { t, orgSlug } = await paidOrg();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.resume, { orgSlug }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.subscriptions.changePlan, { orgSlug, planName: "Free" });
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.resume, { orgSlug });
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug });
    expect(sub?.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it("requires subscription.manage permission", async () => {
    const { t, orgSlug } = await paidOrg();
    await seedAndProvision(t, bobIdentity);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.subscriptions.changePlan, { orgSlug, planName: "Free" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.subscriptions.resume, { orgSlug }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingSubscriptions.test.ts`
Expected: FAIL — first test: `changePlan` currently patches planId immediately and does not set `cancelAtPeriodEnd` (assertion `cancelAtPeriodEnd === true` fails). Also `resume` undefined.

- [ ] **Step 3: Implement**

In `convex/subscriptions.ts`, replace the whole `changePlan` mutation (lines 18–43, the "Phase 1 stub") with:

```ts
/**
 * Downgrade path only: choosing Free schedules cancellation at period end.
 * Paid plans must go through PayMongo checkout (`billing.createCheckout`).
 * Immediate plan switches remain a superadmin override.
 */
export const changePlan = mutation({
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
    if ((plan.priceCents ?? 0) > 0) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        `Plan ${plan.name} requires payment — start a checkout instead`,
      );
    }
    if (actx.subscription.planId === plan._id) {
      throw appError(ErrorCode.CONFLICT, `Already on ${plan.name}`);
    }
    if (actx.subscription.cancelAtPeriodEnd) {
      throw appError(ErrorCode.CONFLICT, "Cancellation is already scheduled");
    }
    await ctx.db.patch(actx.subscription._id, { cancelAtPeriodEnd: true });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "subscription.cancel_scheduled",
      resourceType: "subscription",
      resourceId: actx.subscription._id,
      before: { cancelAtPeriodEnd: actx.subscription.cancelAtPeriodEnd },
      after: { cancelAtPeriodEnd: true },
    });
  },
});

export const resume = mutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    if (!actx.subscription.cancelAtPeriodEnd) {
      throw appError(ErrorCode.CONFLICT, "No scheduled cancellation to resume");
    }
    await ctx.db.patch(actx.subscription._id, { cancelAtPeriodEnd: false });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "subscription.resumed",
      resourceType: "subscription",
      resourceId: actx.subscription._id,
      before: { cancelAtPeriodEnd: true },
      after: { cancelAtPeriodEnd: false },
    });
  },
});
```

Also add to the file's imports (merge with existing):

```ts
import { appError, ErrorCode } from "./lib/errors";
```

(`v`, `mutation`, `query`, `requirePermission`, `writeAudit` are already imported.)

- [ ] **Step 3b: Migrate legacy tests off the old `changePlan` semantics**

The semantic change breaks existing setup calls that used `changePlan` to jump onto a paid plan. Replace each occurrence of:

```ts
await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
```

with:

```ts
await grantPaidPlan(t, "Pro");
```

in these files (add `grantPaidPlan` to their setup import):

- `convex-test/templates.test.ts` (lines ~16 and ~37)
- `convex-test/phase3Schema.test.ts` (line ~90)
- `convex-test/eventCodes.test.ts` (line ~21)
- `convex-test/config.test.ts` (line ~58)

This puts legacy feature-gate tests on the REAL payment path (checkout + webhook), which is strictly better coverage than the old stub hop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingSubscriptions.test.ts convex-test/entitlements.test.ts convex-test/templates.test.ts convex-test/phase3Schema.test.ts convex-test/eventCodes.test.ts convex-test/config.test.ts`
Expected: all PASS (the migrated legacy suites guard against regressions in existing subscription consumers).

- [ ] **Step 5: Commit**

```powershell
npx tsc --noEmit
git add convex/subscriptions.ts convex-test/billingSubscriptions.test.ts convex-test/templates.test.ts convex-test/phase3Schema.test.ts convex-test/eventCodes.test.ts convex-test/config.test.ts
git commit -m "feat(billing): replace plan stub with cancel-at-period-end downgrade; migrate tests to real payment path"
```

---

