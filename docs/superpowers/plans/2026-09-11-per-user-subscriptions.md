# Per-User Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-organization billing with per-user (email account) billing: one subscription per user covering unlimited orgs they create, pooled limits, one-shot org-to-user migration.

**Architecture:** Widen-migrate-narrow schema change. Widen: add optional `userId` + `by_user_id` indexes while keeping `orgId` readable; re-key reads/writes task by task (every commit typechecks and passes tests); migrate data with an idempotent platform-owner mutation; narrow: drop org-keyed fields and indexes.

**Tech Stack:** Convex (schema, queries, mutations, actions, internal functions), Next.js App Router + React client components, convex-test + vitest, PayMongo (existing `convex/lib/paymongo.ts` helpers, unchanged).

## Global Constraints

- TypeScript strict: no `any`, no `@ts-ignore`, no `eslint-disable` without a documented reason; every Convex function arg has a validator.
- Naming: `userId` means `Id<"userProfiles">`; `subscriberId` on `AuthCtx` is the user whose subscription covers the current org (always `org.createdById`).
- Trial-once rule is structural: exactly one subscription row per user (unique `by_user_id` index), created on first org creation with the Free plan and `status: "active"` (today's new-org semantics). `trialing` stays an ops-granted state via existing superadmin trial extension.
- Audit rule: every billing/subscription write calls `writeAudit`; billing events that are no longer org-scoped use `orgId: null`.
- Verification per task: `npx tsc --noEmit` must pass and `npm test` (vitest) must be green before committing.
- Run commands from repo root; single test files via `npx vitest run convex-test/<file>.test.ts`.
- After any task that adds/renames convex modules, run `npx convex codegen` so `convex/_generated/api` picks them up (commit generated changes with the task).

---

## File structure

| File | Responsibility after this plan |
|---|---|
| `convex/schema.ts` | `subscriptions`/`usage` keyed by required `userId`; `billingPayments` requires `userId`, optional legacy `orgId`; `organizations` gains `by_created_by_id` |
| `convex/lib/billingOwnership.ts` (new) | Pure `pickWinningSubscription` tie-break + `requireSubscriptionOwner` user-scoped auth |
| `convex/lib/usage.ts` | Pooled per-user counters (events/judges/contestants only) |
| `convex/lib/entitlements.ts` | `getSubscription(ctx, userId)`; `requireLimit` reads pooled usage via explicit `subscriberId` |
| `convex/lib/authz.ts` | `AuthCtx` gains `subscriberId`; `requireOrgMember` resolves org → creator → subscription |
| `convex/billing/checkout.ts`, `convex/billing/payments.ts` | User-scoped purchase flow, no `orgSlug` args |
| `convex/billing/webhook.ts`, `convex/billing/lifecycle.ts` | Re-keyed subscription resolution, `orgId: null` audits |
| `convex/subscriptions.ts` | Owner-gated manage actions, `getForOrg` returns `isOwner`, new `getMine` |
| `convex/billing/refunds.ts`, `convex/support/tickets.ts` | Payment lookups by subscriber; refund ticket stays org-attributed |
| `convex/platform/*`, `convex/superadmin/*` | Admin surfaces re-keyed from org to user |
| `convex/platform/billingMigration.ts` (new) | Idempotent org→user migration + status query |
| `app/app/billing/page.tsx` (new) | User-scoped purchase page |
| `app/app/[orgSlug]/billing/page.tsx` | Read-only org coverage status (+ owner refund card) |
| `app/platform/subscriptions/page.tsx`, `app/sentry/(console)/billing/page.tsx`, `app/sentry/(console)/organizations/[orgId]/page.tsx` | Admin UI re-keyed to users |

---

### Task 1: Widen schema for per-user billing

**Files:**
- Modify: `convex/schema.ts`
- Modify (transitional compile guards): `convex/billing/webhook.ts`, `convex/billing/lifecycle.ts`, `convex/superadmin/billing.ts`, `convex/platform/subscriptions.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: optional `userId` fields + `by_user_id` / `by_user_id_and_resource` indexes + `organizations.by_created_by_id` index for Tasks 2-13

- [ ] **Step 1: Widen the schema**

In `convex/schema.ts`, change the `subscriptions` table to:

```ts
subscriptions: defineTable({
    orgId: v.optional(v.id("organizations")),
    userId: v.optional(v.id("userProfiles")),
    planId: v.id("plans"),
    status: v.union(
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("expired"),
      v.literal("paused"),
    ),
    trialEndsAt: v.union(v.null(), v.number()),
    currentPeriodEndAt: v.union(v.null(), v.number()),
    cancelAtPeriodEnd: v.boolean(),
    stripeCustomerId: v.union(v.null(), v.string()),
    stripeSubscriptionId: v.union(v.null(), v.string()),
  })
    .index("by_org_id", ["orgId"])
    .index("by_user_id", ["userId"])
    .index("by_status_and_period_end", ["status", "currentPeriodEndAt"]),
```

In `billingPayments`: change `orgId` to `v.optional(v.id("organizations"))`, add `userId: v.optional(v.id("userProfiles"))`, and add `.index("by_user_id", ["userId"])` alongside the existing indexes.

In `usage`: change `orgId` to `v.optional(v.id("organizations"))`, add `userId: v.optional(v.id("userProfiles"))`, and add `.index("by_user_id_and_resource", ["userId", "resource"])` alongside `by_org_id_and_resource`.

In `organizations`: add `.index("by_created_by_id", ["createdById"])` alongside `by_slug`.

- [ ] **Step 2: Add transitional compile guards**

In `convex/billing/webhook.ts`, replace both subscription lookups (in `applyPaidPayment` and `applyPaidEvent`):

```ts
const subscription = await ctx.db
  .query("subscriptions")
  .withIndex("by_org_id", (q) => q.eq("orgId", payment.orgId))
  .unique();
```

with:

```ts
const paymentOrgId = payment.orgId;
const subscription = paymentOrgId
  ? await ctx.db
      .query("subscriptions")
      .withIndex("by_org_id", (q) => q.eq("orgId", paymentOrgId))
      .unique()
  : null;
```

In `convex/billing/lifecycle.ts`, change the three audit calls from `orgId: payment.orgId` / `orgId: subscription.orgId` to `orgId: payment.orgId ?? null` / `orgId: subscription.orgId ?? null`.

In `convex/superadmin/billing.ts` `listSubscriptions` row mapping, replace:

```ts
const [org, plan] = await Promise.all([
  ctx.db.get(subscription.orgId),
  ctx.db.get(subscription.planId),
]);
```

with:

```ts
const [org, plan] = await Promise.all([
  subscription.orgId ? ctx.db.get(subscription.orgId) : Promise.resolve(null),
  ctx.db.get(subscription.planId),
]);
```

Apply the identical guard in `convex/platform/subscriptions.ts` `list` row mapping:

```ts
const [org, plan] = await Promise.all([
  subscription.orgId ? ctx.db.get(subscription.orgId) : Promise.resolve(null),
  ctx.db.get(subscription.planId),
]);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean, no errors

- [ ] **Step 4: Run the billing suites to confirm zero behavior change**

Run: `npx vitest run convex-test/billing.test.ts convex-test/billingCheckout.test.ts convex-test/billingWebhook.test.ts convex-test/billingLifecycle.test.ts convex-test/billingPayments.test.ts convex-test/billingRefunds.test.ts convex-test/billingSubscriptions.test.ts convex-test/billingUnits.test.ts`
Expected: all suites pass

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/billing/webhook.ts convex/billing/lifecycle.ts convex/superadmin/billing.ts convex/platform/subscriptions.ts
git commit -m "feat(billing): widen schema with optional userId and indexes"
```

---

### Task 2: Winner helper and owner auth helper with unit tests

**Files:**
- Create: `convex/lib/billingOwnership.ts`
- Modify: `convex-test/billingUnits.test.ts` (append describes)

**Interfaces:**
- Consumes: `Doc<"subscriptions">`, `requireUserProfile` from `convex/lib/auth.ts`
- Produces: `subscriptionRank(sub)`, `pickWinningSubscription(candidates)`, `requireSubscriptionOwner(ctx)` for Tasks 5, 7, 11

- [ ] **Step 1: Write the failing test**

Append to `convex-test/billingUnits.test.ts`:

```ts
import { pickWinningSubscription, subscriptionRank } from "../convex/lib/billingOwnership";

describe("pickWinningSubscription", () => {
  it("prefers paid-active over trial, then furthest period end", () => {
    const trial = { status: "trialing" as const, currentPeriodEndAt: null };
    const activeShort = { status: "active" as const, currentPeriodEndAt: 1000 };
    const activeLong = { status: "active" as const, currentPeriodEndAt: 2000 };
    expect(pickWinningSubscription([trial, activeShort, activeLong])).toBe(activeLong);
    expect(subscriptionRank(activeShort)).toBeGreaterThan(subscriptionRank(trial));
  });

  it("prefers past_due over canceled regardless of period end", () => {
    const canceled = { status: "canceled" as const, currentPeriodEndAt: 9000 };
    const pastDue = { status: "past_due" as const, currentPeriodEndAt: 100 };
    expect(pickWinningSubscription([canceled, pastDue])).toBe(pastDue);
  });

  it("throws on an empty candidate list", () => {
    expect(() => pickWinningSubscription([])).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run convex-test/billingUnits.test.ts`
Expected: FAIL with "Failed to resolve import ../convex/lib/billingOwnership"

- [ ] **Step 3: Implement the helper module**

Create `convex/lib/billingOwnership.ts` with this exact content:

```ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";
import { requireUserProfile } from "./auth";

type SubscriptionStatus = Doc<"subscriptions">["status"];

const STATUS_RANK: Record<SubscriptionStatus, number> = {
  active: 5,
  trialing: 4,
  past_due: 3,
  paused: 2,
  canceled: 1,
  expired: 0,
};

type RankableSubscription = Pick<Doc<"subscriptions">, "status" | "currentPeriodEndAt">;

export function subscriptionRank(sub: RankableSubscription): number {
  return STATUS_RANK[sub.status] * 1e13 + (sub.currentPeriodEndAt ?? 0);
}

export function pickWinningSubscription<T extends RankableSubscription>(candidates: T[]): T {
  if (candidates.length === 0) {
    throw new Error("pickWinningSubscription requires at least one candidate");
  }
  return candidates.reduce((best, candidate) =>
    subscriptionRank(candidate) > subscriptionRank(best) ? candidate : best,
  );
}

export async function requireSubscriptionOwner(ctx: QueryCtx): Promise<{
  user: Doc<"userProfiles">;
  subscription: Doc<"subscriptions">;
  subscriberId: Id<"userProfiles">;
}> {
  const user = await requireUserProfile(ctx);
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .unique();
  if (!subscription) throw appError(ErrorCode.FORBIDDEN, "No subscription");
  return { user, subscription, subscriberId: user._id };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run convex-test/billingUnits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lib/billingOwnership.ts convex-test/billingUnits.test.ts
git commit -m "feat(billing): subscription winner helper and owner auth"
```

---

### Task 3: Core entitlement resolution re-key

**Files:**
- Modify: `convex/lib/usage.ts` (rewrite), `convex/lib/entitlements.ts` (`getSubscription`, `requireLimit`), `convex/lib/authz.ts` (`AuthCtx`, `requireOrgMember`)
- Modify (mechanical call sites): `convex/events.ts`, `convex/contestants.ts`, `convex/accounts.ts`, `convex/reset.ts`, `convex/platform/orgs.ts`, `convex/platform/subscriptions.ts`, `convex/superadmin/orgs.ts`
- Create: `convex-test/perUserResolution.test.ts`

**Interfaces:**
- Consumes: `by_user_id` / `by_user_id_and_resource` / `by_created_by_id` indexes from Task 1
- Produces: user-keyed `getSubscription`/`getUsage`/`incrementUsage`, `AuthCtx.subscriberId`, creator-based resolution for Tasks 4-13

- [ ] **Step 1: Write the failing resolution tests**

Create `convex-test/perUserResolution.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import {
  addOrgMemberWithoutDocumentsManage,
  aliceIdentity,
  bobIdentity,
  createOrgAndEvent,
  seedAndProvision,
  setupTest,
} from "./setup";

describe("per-user subscription resolution", () => {
  it("resolves a non-owner member through the creator's subscription", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await seedAndProvision(t, bobIdentity);
    await addOrgMemberWithoutDocumentsManage(t, "acme", bobIdentity);
    const org = await t.withIdentity(bobIdentity).query(api.organizations.get, { orgSlug: "acme" });
    expect(org?.slug).toBe("acme");
  });

  it("rejects with FORBIDDEN No subscription when the creator has no subscription row", async () => {
    const t = setupTest();
    await seedAndProvision(t, bobIdentity);
    await t.run(async (ctx) => {
      const bob = await ctx.db
        .query("userProfiles")
        .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", bobIdentity.tokenIdentifier))
        .unique();
      if (!bob) throw new Error("bob missing");
      const ownerRole = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", "Org Owner"))
        .unique();
      if (!ownerRole) throw new Error("owner role missing");
      const orgId = await ctx.db.insert("organizations", {
        slug: "orphan",
        name: "Orphan",
        ownerId: bob._id,
        createdById: bob._id,
        status: "active",
        branding: {},
      });
      await ctx.db.insert("organizationMembers", {
        userId: bob._id,
        orgId,
        roleId: ownerRole._id,
        status: "active",
        joinedAt: Date.now(),
      });
    });
    await expect(
      t.withIdentity(bobIdentity).query(api.subscriptions.getForOrg, { orgSlug: "orphan" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN", message: "No subscription" } });
  });

  it("pools the event limit across all orgs created by one user", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: "beta", slug: "beta" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.create, {
        orgSlug: "beta",
        name: "Beta Event",
        slug: "beta-event",
      }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex-test/perUserResolution.test.ts`
Expected: FAIL (resolution still org-keyed; second-org event creation succeeds)

- [ ] **Step 3: Re-key the usage library**

Replace the full content of `convex/lib/usage.ts` with:

```ts
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function getUsage(
  ctx: QueryCtx,
  userId: Id<"userProfiles">,
  resource: string,
): Promise<number> {
  const row = await ctx.db
    .query("usage")
    .withIndex("by_user_id_and_resource", (q) => q.eq("userId", userId).eq("resource", resource))
    .unique();
  return row?.count ?? 0;
}

export async function incrementUsage(
  ctx: MutationCtx,
  userId: Id<"userProfiles">,
  resource: string,
  delta: number,
): Promise<void> {
  const existing = await ctx.db
    .query("usage")
    .withIndex("by_user_id_and_resource", (q) => q.eq("userId", userId).eq("resource", resource))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { count: Math.max(0, existing.count + delta) });
  } else if (delta > 0) {
    await ctx.db.insert("usage", { userId, resource, count: delta, periodKey: null });
  }
}
```

- [ ] **Step 4: Re-key entitlements**

In `convex/lib/entitlements.ts`, replace `getSubscription`:

```ts
export async function getSubscription(ctx: QueryCtx, userId: Id<"userProfiles">) {
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique();
  if (!sub) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");
  return sub;
}
```

Replace `requireLimit`:

```ts
export async function requireLimit(
  ctx: MutationCtx,
  sub: Doc<"subscriptions">,
  resource: string,
  subscriberId: Id<"userProfiles">,
): Promise<void> {
  const plan = await getPlan(ctx, sub);
  const current = await getUsage(ctx, subscriberId, resource);
  const limitKey = limitKeyForResource(resource);
  if (!hasLimit(plan, limitKey, current)) {
    throw appError(ErrorCode.LIMIT_EXCEEDED, `Limit reached: ${resource}`, {
      resource,
      current,
      max: plan.limits[limitKey as keyof typeof plan.limits],
    });
  }
}
```

- [ ] **Step 5: Re-key the auth context**

In `convex/lib/authz.ts`, extend `AuthCtx`:

```ts
export type AuthCtx = {
  user: Doc<"userProfiles">;
  org: Doc<"organizations">;
  membership: Doc<"organizationMembers">;
  role: Doc<"roles">;
  permissions: Set<string>;
  subscription: Doc<"subscriptions">;
  subscriberId: Id<"userProfiles">;
};
```

In `requireOrgMember`, replace the subscription lookup and return:

```ts
const subscription = await ctx.db
  .query("subscriptions")
  .withIndex("by_user_id", (q) => q.eq("userId", org.createdById))
  .unique();
if (!subscription) throw appError(ErrorCode.FORBIDDEN, "No subscription");
const permissions = await loadPermissions(ctx, role._id);
return { user, org, membership, role, permissions, subscription, subscriberId: org.createdById };
```

(`convex/lib/eventAuthz.ts` needs no change: `EventAuthCtx` extends `AuthCtx`.)

- [ ] **Step 6: Update the pooled-limit and usage call sites**

`convex/events.ts`: replace both `await requireLimit(ctx, actx.subscription, "events");` lines (create ~48, update ~205) with `await requireLimit(ctx, actx.subscription, "events", actx.subscriberId);` (replaceAll). Replace both `await incrementUsage(ctx, actx.org._id, "events", 1);` lines (~65, ~264) with `await incrementUsage(ctx, actx.subscriberId, "events", 1);` (replaceAll).

`convex/contestants.ts`: `await requireLimit(ctx, eactx.subscription, "contestants");` becomes `await requireLimit(ctx, eactx.subscription, "contestants", eactx.subscriberId);`. Replace all three increments `incrementUsage(ctx, eactx.org._id, "contestants", N)` with `incrementUsage(ctx, eactx.subscriberId, "contestants", N)` (preserve each delta: 1, -1, args.rows.length).

`convex/accounts.ts`: `requireLimit(ctx, eactx.subscription, "judges")` gains `, eactx.subscriberId`. Increments at ~150/~308/~550 switch `eactx.org._id` to `eactx.subscriberId`. Bulk mirror (~487): `const currentJudges = await getUsage(ctx, eactx.org._id, "judges");` becomes `const currentJudges = await getUsage(ctx, eactx.subscriberId, "judges");`.

`convex/reset.ts` (~353): `await incrementUsage(ctx, org._id, "events", -1);` becomes `await incrementUsage(ctx, org.createdById, "events", -1);`.

`convex/platform/orgs.ts` list (~59-62):

```ts
const subscription = await ctx.db
  .query("subscriptions")
  .withIndex("by_user_id", (q) => q.eq("userId", org.createdById))
  .unique();
```

`convex/platform/orgs.ts` get (~94, ~101-106):

```ts
const subscription = await getSubscription(ctx, org.createdById);
```

```ts
const subscriberId = org.createdById;
const activeMembers = await ctx.db
  .query("organizationMembers")
  .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
  .filter((q) => q.eq(q.field("status"), "active"))
  .collect();
const usage = {
  members: activeMembers.length,
  events: await getUsage(ctx, subscriberId, "events"),
  judges: await getUsage(ctx, subscriberId, "judges"),
  contestants: await getUsage(ctx, subscriberId, "contestants"),
};
```

`convex/platform/subscriptions.ts` setPlan (~74): `getSubscription(ctx, org._id)` becomes `getSubscription(ctx, org.createdById)`.

`convex/superadmin/orgs.ts` list (~44-58): subscription lookup becomes `by_user_id` on `org.createdById`; usage block becomes:

```ts
const subscriberId = org.createdById;
const activeMembers = await ctx.db
  .query("organizationMembers")
  .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
  .filter((q) => q.eq(q.field("status"), "active"))
  .collect();
usage: {
  members: activeMembers.length,
  events: await getUsage(ctx, subscriberId, "events"),
  judges: await getUsage(ctx, subscriberId, "judges"),
  contestants: await getUsage(ctx, subscriberId, "contestants"),
},
```

`convex/superadmin/orgs.ts` detail (~84-87): subscription lookup becomes `by_user_id` on `org.createdById`; usage block (~161-166) gets the same pooled treatment with the live member count (reuse the file's existing `members` collect at ~118-121: `members: activeMembersFromDetail.length` — the detail handler already collects `members` with profiles; use `members.length` for the usage members value and pooled `getUsage(ctx, org.createdById, ...)` for the rest).

- [ ] **Step 7: Run the new tests**

Run: `npx vitest run convex-test/perUserResolution.test.ts`
Expected: PASS (production `organizations.create` still inserts an org-keyed row at this stage, so the pooled test passes because `requireLimit` now reads `getUsage(ctx, subscriberId)` which returns 0 for alice's userId while creation incremented the org-keyed row — wait, careful: after Step 6, `events.create` increments the USER-keyed row and `requireLimit` reads the USER-keyed row, so events=1 after gala, beta-event hits 1 < 1 false → LIMIT_EXCEEDED. PASS. The non-owner member test: alice's org row `by_org_id` no longer matches, but `by_user_id(alice)` matches since alice created the org. PASS.)

- [ ] **Step 8: Typecheck the whole repo and run the full unit suite**

Run: `npx tsc --noEmit`
Expected: clean

Run: `npm test`
Expected: all pass. Note: some existing tests may assert per-org usage rows; fix any failure by switching the assertion to the subscriber key (the same mechanical pattern as the code change).

- [ ] **Step 9: Commit**

```bash
git add convex/lib/usage.ts convex/lib/entitlements.ts convex/lib/authz.ts convex/events.ts convex/contestants.ts convex/accounts.ts convex/reset.ts convex/platform/orgs.ts convex/platform/subscriptions.ts convex/superadmin/orgs.ts convex-test/perUserResolution.test.ts
git commit -m "feat(billing): creator-based entitlement resolution with pooled limits"
```

---

### Task 4: User subscription on org creation (trial-once)

**Files:**
- Modify: `convex/organizations.ts` (create ~39-109)
- Modify: `convex-test/perUserResolution.test.ts` (append)

**Interfaces:**
- Consumes: `by_user_id` unique index from Task 1
- Produces: single Free/active subscription per user for Tasks 5-13

- [ ] **Step 1: Write the failing test**

Append to `convex-test/perUserResolution.test.ts`:

```ts
it("creates exactly one subscription for a user across multiple orgs", async () => {
  const t = setupTest();
  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
  await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: "beta", slug: "beta" });
  const subs = await t.run(async (ctx) => {
    const alice = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", aliceIdentity.tokenIdentifier))
      .unique();
    if (!alice) throw new Error("alice missing");
    return ctx.db
      .query("subscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", alice._id))
      .collect();
  });
  expect(subs).toHaveLength(1);
  expect(subs[0].status).toBe("active");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run convex-test/perUserResolution.test.ts`
Expected: FAIL (two org-keyed rows, zero user-keyed rows)

- [ ] **Step 3: Re-key org creation**

In `convex/organizations.ts` `create`, replace the subscription insert and members increment:

```ts
await ctx.db.insert("subscriptions", {
  orgId,
  planId: freePlan._id,
  status: "active",
  trialEndsAt: null,
  currentPeriodEndAt: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
});
await incrementUsage(ctx, orgId, "members", 1);
```

with:

```ts
// One subscription per user, ever (unique by_user_id): the first org
// creation opens it on the Free plan; later orgs reuse it. This is the
// trial-once guarantee — creating more orgs never yields a new trial.
const existingSubscription = await ctx.db
  .query("subscriptions")
  .withIndex("by_user_id", (q) => q.eq("userId", profile._id))
  .unique();
if (!existingSubscription) {
  await ctx.db.insert("subscriptions", {
    userId: profile._id,
    planId: freePlan._id,
    status: "active",
    trialEndsAt: null,
    currentPeriodEndAt: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });
}
```

Remove the now-unused `import { incrementUsage } from "./lib/usage";` from `convex/organizations.ts`. (`members` leaves the usage table; per-org member counts are live counts — see Task 3.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run convex-test/perUserResolution.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and run the full suite, then commit**

Run: `npx tsc --noEmit` (clean), then `npm test` (all pass)

```bash
git add convex/organizations.ts convex-test/perUserResolution.test.ts
git commit -m "feat(billing): one subscription per user created on first org"
```

---

### Task 5: User-scoped checkout and payment queries

**Files:**
- Modify: `convex/billing/checkout.ts` (full re-key), `convex/billing/payments.ts` (rewrite), `convex-test/setup.ts` (`createOrgWithPendingCheckout`)
- Modify (minimal compile fixes): `app/app/[orgSlug]/billing/page.tsx` call sites only
- Modify: `convex-test/billingCheckout.test.ts` (rewrite), `convex-test/billingPayments.test.ts` (mechanical arg updates)

**Interfaces:**
- Consumes: `requireSubscriptionOwner` from Task 2, `by_user_id` payments index from Task 1
- Produces: `createCheckout({planName})`, `cancelCheckout({})`, `syncCheckoutStatus({})`, `listForUser({})`, `getActiveCheckout({})` for Tasks 8, 11

- [ ] **Step 1: Rewrite the checkout tests user-scoped**

Replace the full content of `convex-test/billingCheckout.test.ts` with:

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
      .action(api.billing.checkout.createCheckout, { planName: "Starter" });
    expect(url).toBe("https://checkout.paymongo.com/test/1");
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, {});
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
        planName: "Free",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        planName: "Platinum",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("enforces the one-live-checkout rule per user with CONFLICT", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { planName: "Starter" });
    stubCheckoutSuccess("2");
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        planName: "Pro",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("rejects users without a subscription (non-creators cannot purchase)", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await seedAndProvision(t, bobIdentity);
    stubCheckoutSuccess();
    await expect(
      t.withIdentity(bobIdentity).action(api.billing.checkout.createCheckout, {
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
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "PAYMENT_PROVIDER" } });
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, {});
    expect(active).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForUser, {});
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
      .action(api.billing.checkout.createCheckout, { planName: "Starter" });
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.billing.checkout.cancelCheckout, {});
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, {});
    expect(active).toBeNull();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.billing.checkout.cancelCheckout, {}),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex-test/billingCheckout.test.ts`
Expected: FAIL (functions still take `orgSlug`)

- [ ] **Step 3: Re-key checkout.ts**

In `convex/billing/checkout.ts`, replace the `requirePermission` import with `import { requireSubscriptionOwner } from "../lib/billingOwnership";`.

Rewrite `createPendingPayment`:

```ts
export const createPendingPayment = internalMutation({
  args: { planName: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireSubscriptionOwner(ctx);
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
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (pending) {
      throw appError(
        ErrorCode.CONFLICT,
        "A checkout is already in progress. Complete or cancel it before starting another.",
      );
    }

    const paymentId = await ctx.db.insert("billingPayments", {
      userId: user._id,
      planId: plan._id,
      createdById: user._id,
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
      orgId: null,
      actorId: user._id,
      action: "billing.checkout.created",
      resourceType: "billingPayment",
      resourceId: paymentId,
      after: { planName: plan.name, amountCents, referenceNumber },
    });
    return {
      paymentId,
      userId: user._id,
      planName: plan.name,
      amountCents,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      referenceNumber,
    };
  },
});
```

`attachCheckoutSession` is unchanged. In `failPayment`, change the audit to `orgId: null`.

Rewrite `createCheckout`:

```ts
export const createCheckout = action({
  args: { planName: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const pending = await ctx.runMutation(internal.billing.checkout.createPendingPayment, {
      planName: args.planName,
    });
    try {
      const session = await createCheckoutSession({
        lineItemName: `${pending.planName} plan (${pending.billingInterval})`,
        amountCents: pending.amountCents,
        currency: pending.currency,
        referenceNumber: pending.referenceNumber,
        successUrl: `${siteUrl()}/app/billing?billing=success`,
        cancelUrl: `${siteUrl()}/app/billing?billing=cancelled`,
        metadata: { userId: pending.userId, paymentId: pending.paymentId },
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
```

Rewrite `cancelCheckout`:

```ts
export const cancelCheckout = mutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const { user } = await requireSubscriptionOwner(ctx);
    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (!pending) throw appError(ErrorCode.CONFLICT, "No active checkout to cancel");
    await ctx.db.patch(pending._id, { status: "cancelled" });
    await writeAudit(ctx, {
      orgId: null,
      actorId: user._id,
      action: "billing.checkout.cancelled",
      resourceType: "billingPayment",
      resourceId: pending._id,
    });
  },
});
```

Rewrite `syncCheckoutStatus` with `args: {}` and query `api.billing.payments.getActiveCheckout` with `{}` (rest of the polling logic unchanged).

- [ ] **Step 4: Rewrite payments.ts user-scoped**

Replace the full content of `convex/billing/payments.ts` with:

```ts
import { query } from "../_generated/server";
import { requireUserProfile } from "../lib/auth";
import { requireSubscriptionOwner } from "../lib/billingOwnership";

const HISTORY_LIMIT = 50;

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserProfile(ctx);
    const payments = await ctx.db
      .query("billingPayments")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
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
  args: {},
  handler: async (ctx) => {
    const { user } = await requireSubscriptionOwner(ctx);
    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (!pending) return null;
    const plan = await ctx.db.get(pending.planId);
    return {
      paymentId: pending._id,
      checkoutSessionId: pending.checkoutSessionId,
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

- [ ] **Step 5: Update the test helper for the new signatures**

In `convex-test/setup.ts` `createOrgWithPendingCheckout`, replace:

```ts
await t
  .withIdentity(aliceIdentity)
  .action(api.billing.checkout.createCheckout, {
    orgSlug,
    planName: opts.planName ?? "Starter",
  });
```

with:

```ts
await t
  .withIdentity(aliceIdentity)
  .action(api.billing.checkout.createCheckout, {
    planName: opts.planName ?? "Starter",
  });
```

and replace:

```ts
const active = await t
  .withIdentity(aliceIdentity)
  .query(api.billing.payments.getActiveCheckout, { orgSlug });
```

with:

```ts
const active = await t
  .withIdentity(aliceIdentity)
  .query(api.billing.payments.getActiveCheckout, {});
```

- [ ] **Step 6: Minimal UI compile fixes (full UX split lands in Task 8)**

In `app/app/[orgSlug]/billing/page.tsx`, make exactly these mechanical call-site changes (visual behavior unchanged for now):
- `useQuery(api.billing.payments.listForOrg, { orgSlug })` → `useQuery(api.billing.payments.listForUser, {})`
- `useQuery(api.billing.payments.getActiveCheckout, { orgSlug })` → `useQuery(api.billing.payments.getActiveCheckout, {})`
- `startCheckout({ orgSlug, planName })` → `startCheckout({ planName })`
- `cancelCheckout({ orgSlug })` → `cancelCheckout({})`
- `syncCheckout({ orgSlug })` → `syncCheckout({})`
- In the `useEffect` dependency array, replace `orgSlug` with nothing (remove it): `[billingResult, activeCheckout?.paymentId, syncCheckout]`

In `convex-test/billingPayments.test.ts`, replace `api.billing.payments.listForOrg, { orgSlug: "acme" }` with `api.billing.payments.listForUser, {}`, `getActiveCheckout, { orgSlug: "acme" }` with `getActiveCheckout, {}`, and drop `orgSlug` from any checkout action/mutation calls.

- [ ] **Step 7: Run the checkout and payments tests**

Run: `npx vitest run convex-test/billingCheckout.test.ts convex-test/billingPayments.test.ts`
Expected: PASS

- [ ] **Step 8: Typecheck the whole repo and commit**

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add convex/billing/checkout.ts convex/billing/payments.ts convex-test/setup.ts convex-test/billingCheckout.test.ts convex-test/billingPayments.test.ts "app/app/[orgSlug]/billing/page.tsx"
git commit -m "feat(billing): user-scoped checkout and payment history"
```

---

### Task 6: Webhook and lifecycle re-key

**Files:**
- Modify: `convex/billing/webhook.ts` (`applyPaidPayment`, `applyPaidEvent`, `flagPayment`, `applyTerminalEvent`), `convex/billing/lifecycle.ts` (audits)

**Interfaces:**
- Consumes: `payment.userId` written by Task 5; `by_user_id` subscription index from Task 1
- Produces: paid payments land on the purchaser's subscription for Tasks 7-8, 11

- [ ] **Step 1: Re-key the paid-payment paths**

In `convex/billing/webhook.ts` `applyPaidPayment`, replace:

```ts
const subscription = await ctx.db
  .query("subscriptions")
  .withIndex("by_org_id", (q) => q.eq("orgId", payment.orgId))
  .unique();
if (!subscription) {
  await flagPayment(ctx, payment, "No subscription found for organization");
  return { status: "flagged", planName: null };
}
```

with:

```ts
const subscription = await ctx.db
  .query("subscriptions")
  .withIndex("by_user_id", (q) => q.eq("userId", payment.userId))
  .unique();
if (!subscription) {
  await flagPayment(ctx, payment, "No subscription found for user");
  return { status: "flagged", planName: null };
}
```

Apply the identical replacement in `applyPaidEvent` (its missing-subscription branch returns `flagPayment(ctx, payment, "No subscription found for organization")` → `"No subscription found for user"`).

In `applyPaidPayment` and `applyPaidEvent` success audits, change `orgId: payment.orgId` to `orgId: null` (keep `actorId: payment.createdById`).

In `flagPayment`, change `orgId: payment.orgId` to `orgId: null`.

In `applyTerminalEvent`, change `orgId: payment.orgId` to `orgId: null`.

- [ ] **Step 2: Re-key the lifecycle audits**

In `convex/billing/lifecycle.ts`, the Task 1 guards wrote `orgId: payment.orgId ?? null` and `orgId: subscription.orgId ?? null`. Change all three to `orgId: null` (stale-pending expiry, past_due transition, expired downgrade). No other lifecycle logic changes: the ladder now lapses one row per user, which degrades all their orgs together by construction.

- [ ] **Step 3: Run webhook, lifecycle, and helper-path tests**

Run: `npx vitest run convex-test/billingWebhook.test.ts convex-test/billingLifecycle.test.ts convex-test/billingSubscriptions.test.ts`
Expected: PASS. If any assertion reads `payment.orgId` or an audit's `orgId`, update it to the new value (`payment.userId`, audit `orgId: null`) — the same mechanical pattern as the code change.

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add convex/billing/webhook.ts convex/billing/lifecycle.ts
git commit -m "feat(billing): webhook and lifecycle resolve subscriptions by user"
```

---

### Task 7: Subscription self-service, refunds, and support refund wrappers

**Files:**
- Modify: `convex/subscriptions.ts` (`getForOrg`, `changePlan`, `resume`, new `getMine`), `convex/billing/refunds.ts` (`getEligibility`, `submitRefundTicket`), `convex/support/tickets.ts` (`getRefundEligibility`, `createRefundTicket` payment lookups)
- Modify: `convex-test/billingRefunds.test.ts` (mechanical arg updates)

**Interfaces:**
- Consumes: `AuthCtx.subscriberId` from Task 3, user-scoped payments from Task 5
- Produces: `subscriptions.getMine({})`, owner-gated manage actions, subscriber-keyed refunds for Task 8

- [ ] **Step 1: Gate and extend subscriptions.ts**

In `convex/subscriptions.ts` `getForOrg`, change the return to include ownership:

```ts
const plan = await ctx.db.get(actx.subscription.planId);
return {
  subscription: actx.subscription,
  plan,
  isOwner: actx.org.createdById === actx.user._id,
};
```

Add the owner gate to `changePlan` right after the `requirePermission` call:

```ts
if (actx.org.createdById !== actx.user._id) {
  throw appError(ErrorCode.FORBIDDEN, "Only the subscription owner can manage billing");
}
```

Add the identical gate to `resume`. Change both functions' `writeAudit` calls from `orgId: actx.org._id` to `orgId: null`.

Append a user-scoped `getMine` query at the end of `convex/subscriptions.ts`:

```ts
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const { subscription } = await requireSubscriptionOwner(ctx);
    const plan = await ctx.db.get(subscription.planId);
    return { subscription, plan };
  },
});
```

Add the import: `import { requireSubscriptionOwner } from "./lib/billingOwnership";`.

- [ ] **Step 2: Re-key the refund payment lookups**

In `convex/billing/refunds.ts` `getEligibility`, replace:

```ts
const latestPayment = await ctx.db
  .query("billingPayments")
  .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
  .filter((q) => q.eq(q.field("status"), "paid"))
  .order("desc")
  .first();
```

with:

```ts
const latestPayment = await ctx.db
  .query("billingPayments")
  .withIndex("by_user_id", (q) => q.eq("userId", actx.subscriberId))
  .filter((q) => q.eq(q.field("status"), "paid"))
  .order("desc")
  .first();
```

Apply the identical replacement in `submitRefundTicket` (~107-112). In `submitRefundTicket`, add the owner gate after `requirePermission` (same two lines as `changePlan`: only the subscription owner may request a refund against their payment). Keep `refundTickets.orgId`, `crmLeads.convertedOrgId`, and the audit `orgId: actx.org._id` — the ticket is raised from that org's page and the trail stays org-attributed.

In `convex/support/tickets.ts` `getRefundEligibility` (~48-53) and `createRefundTicket` (its paid-payment lookup), apply the same `by_org_id` → `by_user_id(actx.subscriberId)` replacement. Keep the rest of both functions (ticket CRUD, notifications, rate limit) unchanged.

- [ ] **Step 3: Update the refund tests and add owner-gate coverage**

In `convex-test/billingRefunds.test.ts`, apply the same mechanical updates as Task 5 Step 6 (drop `orgSlug` from checkout calls; the refund functions keep their `orgSlug` args). Run it; fix any assertion that reads org-keyed payments using the subscriber-key pattern above.

Append to `convex-test/billingRefunds.test.ts`:

```ts
it("lets the owner refund against a payment shared across their orgs", async () => {
  const t = setupTest();
  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
  await grantPaidPlan(t, "Starter");
  await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: "beta", slug: "beta" });
  const eligibility = await t
    .withIdentity(aliceIdentity)
    .query(api.billing.refunds.getEligibility, { orgSlug: "beta" });
  expect(eligibility.hasPaidSubscription).toBe(true);
  expect(eligibility.isEligible).toBe(true);
  expect(eligibility.planName).toBe("Starter");
});

it("rejects refund submission from a non-owner member", async () => {
  const t = setupTest();
  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
  await grantPaidPlan(t, "Starter");
  await seedAndProvision(t, bobIdentity);
  await addOrgMemberWithoutDocumentsManage(t, "acme", bobIdentity);
  await expect(
    t.withIdentity(bobIdentity).mutation(api.billing.refunds.submitRefundTicket, {
      orgSlug: "acme",
      reason: "Changed my mind",
    }),
  ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
});
```

Add `grantPaidPlan` and `addOrgMemberWithoutDocumentsManage` to the test file's `./setup` import.

- [ ] **Step 4: Run the refund and subscription tests**

Run: `npx vitest run convex-test/billingRefunds.test.ts convex-test/billingSubscriptions.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add convex/subscriptions.ts convex/billing/refunds.ts convex/support/tickets.ts convex-test/billingRefunds.test.ts
git commit -m "feat(billing): owner-gated subscription management and refunds"
```

---

### Task 8: Billing UI split (user purchase page + org status page)

**Files:**
- Create: `app/app/billing/page.tsx`
- Modify: `app/app/[orgSlug]/billing/page.tsx` (rewrite as status page), `app/app/page.tsx` (plan pre-select redirects)

**Interfaces:**
- Consumes: `subscriptions.getMine`, `billing.payments.listForUser/getActiveCheckout`, user-scoped checkout actions from Tasks 5, 7
- Produces: the purchase UX and owner/member status UX the design requires

- [ ] **Step 1: Create the user-scoped billing page**

Create `app/app/billing/page.tsx` by copying `app/app/[orgSlug]/billing/page.tsx` and applying exactly these changes:
- Remove the `orgSlug` prop/`params`: `BillingContent()` takes no props; the default export renders without `use(params)`.
- Replace `useQuery(api.subscriptions.getForOrg, { orgSlug })` with `useQuery(api.subscriptions.getMine, {})`; change `subscription?.subscription.planId` reads (same shape, no code change needed).
- Replace payment queries with the user-scoped ones (already done in Task 5 Step 6 — keep them).
- Replace `api.support.tickets.getRefundEligibility` / `createRefundTicket` usage and the entire refund policy card (lines ~321-383) and refund dialog (~607-692) — delete both blocks and their state (`refundDialogOpen`, `refundReason`, `refundDetails`, `submittingRefund`, `handleSubmitRefund`). Refunds live on the org billing page for owners (Step 2).
- PageHeader description becomes "Your subscription covers every organization you create. Upgrade once, tabulate everywhere."
- Plans grid helper line (~457) becomes: `Up to {plan.limits.maxEvents} pooled events · {plan.limits.maxJudges} pooled judges · {plan.limits.maxContestants} pooled contestants`.
- Payment history card description becomes "All payments on your account."
- Keep the landing `?plan=` pre-select banner, success/cancelled banners, past_due banner, and active-checkout card unchanged apart from the already-updated calls.

- [ ] **Step 2: Rewrite the org billing page as read-only status**

Replace the full content of `app/app/[orgSlug]/billing/page.tsx` with:

```tsx
"use client";

import { Suspense, use } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/PageHeader";
import { CheckCircle2, CreditCard, LifeBuoy, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const pesoFormat = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
});

function formatPeso(cents: number): string {
  return pesoFormat.format(cents / 100);
}

function formatDate(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRemainingTime(ms: number): string {
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    if (typeof data.message === "string") return data.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

const PLAN_FEATURE_LABELS: { key: string; label: string }[] = [
  { key: "canExportReports", label: "Report exports" },
  { key: "canUseCustomBranding", label: "Custom branding" },
  { key: "canUseAuditLogs", label: "Audit logs" },
  { key: "canCreateTemplates", label: "Event templates" },
  { key: "canUseAdvancedAnalytics", label: "Advanced analytics" },
];

function OrgBillingContent({ orgSlug }: { orgSlug: string }) {
  const subscription = useQuery(api.subscriptions.getForOrg, { orgSlug });
  const plans = useQuery(api.plans.list, {});
  const refundEligibility = useQuery(api.support.tickets.getRefundEligibility, { orgSlug });
  const submitRefundTicket = useMutation(api.support.tickets.createRefundTicket);

  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundDetails, setRefundDetails] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (refundReason.trim().length < 3) {
      toast.error("Please provide a reason for the refund request.");
      return;
    }
    setSubmittingRefund(true);
    try {
      const res = await submitRefundTicket({
        orgSlug,
        reason: refundReason.trim(),
        details: refundDetails.trim() || undefined,
      });
      toast.success(res.message);
      setRefundDialogOpen(false);
      setRefundReason("");
      setRefundDetails("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmittingRefund(false);
    }
  };

  if (subscription === undefined || plans === undefined) {
    return <div className="h-72 animate-pulse rounded-xl bg-muted" aria-busy />;
  }

  const currentPlan = plans.find((p) => p._id === subscription.subscription.planId);
  const isOwner = subscription.isOwner;
  const status = subscription.subscription.status;
  const periodEndAt = subscription.subscription.currentPeriodEndAt;
  const isPaidPlan = (currentPlan?.priceCents ?? 0) > 0;

  return (
    <div className="space-y-6">
      {status === "past_due" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-muted px-4 py-3 text-sm text-warning">
          <span>
            {isOwner
              ? `Your subscription expired on ${formatDate(periodEndAt)}. Renew within the 7-day grace period to keep your paid features across all your organizations.`
              : "This organization's subscription is past due — ask the owner to renew. Paid features stop working when the grace period ends."}
          </span>
          {isOwner ? (
            <Link href="/app/billing">
              <Button size="sm">Renew now</Button>
            </Link>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Coverage</CardTitle>
          <CardDescription>
            {isOwner
              ? "This organization is covered by your subscription."
              : "This organization is covered by its creator's subscription."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-semibold">{currentPlan?.name ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <Badge variant="outline" className="capitalize">{status}</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Period ends</span>
            <span className="font-mono text-xs">{formatDate(periodEndAt)}</span>
          </div>
          <ul className="space-y-2 pt-2 text-xs">
            {PLAN_FEATURE_LABELS.map(({ key, label }) => {
              const enabled = currentPlan?.features[key as keyof typeof currentPlan.features] === true;
              return (
                <li
                  key={key}
                  className={cn(
                    "flex items-center gap-2",
                    enabled ? "text-foreground font-medium" : "text-muted-foreground/50",
                  )}
                >
                  <CheckCircle2 aria-hidden className="size-3.5 text-success shrink-0" />
                  {enabled ? <span>{label}</span> : <span>{label} — not included</span>}
                </li>
              );
            })}
          </ul>
          {isOwner ? (
            <Link href="/app/billing" className="block pt-2">
              <Button className="w-full font-semibold">Manage subscription</Button>
            </Link>
          ) : (
            <p className="pt-2 text-xs text-muted-foreground">
              Only the subscription owner can change the plan or make payments.
            </p>
          )}
        </CardContent>
      </Card>

      {isOwner && isPaidPlan && refundEligibility ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2 text-base">
              <LifeBuoy className="size-4 text-primary" /> Subscription Refund Policy
            </CardTitle>
            <CardDescription>
              {refundEligibility.isEligible ? (
                <span>
                  Refund requests are valid strictly within <strong>10 hours</strong> of payment.
                  You have <strong>{formatRemainingTime(refundEligibility.remainingMs)}</strong> remaining.
                </span>
              ) : (
                <span>Refund tickets are only accepted within 10 hours of payment. This window has passed.</span>
              )}
            </CardDescription>
          </CardHeader>
          {refundEligibility.isEligible && !refundEligibility.existingTicket ? (
            <CardContent>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRefundDialogOpen(true)}>
                <Clock className="size-4 text-warning" /> Request Refund Ticket
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmitRefund} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LifeBuoy className="size-5 text-primary" /> Request Subscription Refund
              </DialogTitle>
              <DialogDescription>
                Refund tickets are processed by our support team. Submissions are valid strictly
                within <strong>10 hours</strong> from the payment timestamp.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan:</span>
                <span className="font-medium">{refundEligibility?.planName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-medium">{formatPeso(refundEligibility?.amountCents ?? 0)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reason">
                Reason for Refund <span className="text-destructive">*</span>
              </Label>
              <Input
                id="refund-reason"
                placeholder="e.g. Upgraded by mistake, wrong tier selected"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                required
                maxLength={500}
                disabled={submittingRefund}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-details">
                Additional Details <span className="text-muted-foreground text-xs">(Optional)</span>
              </Label>
              <textarea
                id="refund-details"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                placeholder="Provide any additional context for our support team..."
                value={refundDetails}
                onChange={(e) => setRefundDetails(e.target.value)}
                disabled={submittingRefund}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRefundDialogOpen(false)} disabled={submittingRefund}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingRefund}>
                {submittingRefund ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  "Submit Refund Ticket"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OrgBillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const searchParams = useSearchParams();
  void searchParams;
  return (
    <div className="space-y-6">
      <PageHeader
        icon={CreditCard}
        title="Billing"
        description="Subscription coverage for this organization."
      />
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
        <OrgBillingContent orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}
```

Note: if `useSearchParams` ends up unused after removing the `?plan=` banner, delete that import and the `void searchParams;` line instead of keeping them (lint forbids unused vars; the `void` keeps the build green if Suspense boundaries require it — prefer deletion).

- [ ] **Step 3: Point the landing plan flow at the user billing page**

In `app/app/page.tsx`, replace the three plan pre-select redirects (`/app/${orgSlug}/billing?plan=...` and `/app/${slug}/billing?plan=...`) with `/app/billing?plan=${encodeURIComponent(planParam.toLowerCase())}` (no org segment — purchase is user-scoped now).

- [ ] **Step 4: Confirm the org-creation success copy**

In `app/app/page.tsx`, locate the organization-creation success toast and set its text to "Organization created — your subscription covers it." This is unconditionally true under the new model (creation either opens the user's subscription or reuses it) and satisfies the second-org UX requirement.

- [ ] **Step 5: Build the app and commit**

Run: `npm run build`
Expected: compiles clean (this validates both billing pages and all client call sites)

```bash
git add "app/app/billing/page.tsx" "app/app/[orgSlug]/billing/page.tsx" app/app/page.tsx
git commit -m "feat(billing): user billing page and read-only org status"
```

---

### Task 9: Platform admin re-key and UI

**Files:**
- Modify: `convex/platform/subscriptions.ts` (`list`, `setPlan`), `app/platform/subscriptions/page.tsx` (columns + dialog)

**Interfaces:**
- Consumes: `by_user_id` subscription index, `by_created_by_id` org index from Task 1
- Produces: user-keyed platform subscription management

- [ ] **Step 1: Re-key the platform subscriptions module**

In `convex/platform/subscriptions.ts` `list`, replace the row mapping with owner + coverage:

```ts
const page = await Promise.all(
  result.page.map(async (subscription) => {
    const [owner, plan] = await Promise.all([
      subscription.userId ? ctx.db.get(subscription.userId) : Promise.resolve(null),
      ctx.db.get(subscription.planId),
    ]);
    const coveredOrgs = subscription.userId
      ? await ctx.db
          .query("organizations")
          .withIndex("by_created_by_id", (q) => q.eq("createdById", subscription.userId))
          .collect()
      : [];
    return {
      subscription,
      userId: subscription.userId ?? null,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      coveredOrgCount: coveredOrgs.length,
      coveredOrgNames: coveredOrgs.slice(0, 5).map((o) => o.name),
      planId: subscription.planId,
      planName: plan?.name ?? null,
    };
  }),
);
```

Replace `setPlan` with the user-keyed version:

```ts
export const setPlan = mutation({
  args: {
    userId: v.id("userProfiles"),
    planId: v.id("plans"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const reason = requireReason(args.reason);
    const owner = await ctx.db.get(args.userId);
    if (!owner) throw appError(ErrorCode.NOT_FOUND, "User not found");
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    const subscription = await getSubscription(ctx, args.userId);
    if (subscription.planId === plan._id) {
      throw appError(ErrorCode.CONFLICT, `Account is already on ${plan.name}`);
    }

    const beforePlan = await ctx.db.get(subscription.planId);
    await ctx.db.patch(subscription._id, { planId: plan._id });
    await writeAudit(ctx, {
      orgId: null,
      actorId: actor._id,
      action: "platform.subscription.plan_overridden",
      resourceType: "subscription",
      resourceId: subscription._id,
      before: { planName: beforePlan?.name ?? null },
      after: { planName: plan.name },
      reason,
    });
  },
});
```

(Delete the `requireOrg` helper and the `Id` import in this file only if `tsc` flags them unused. Doc comment above `setPlan`: change "audited on the org's trail" to "audited on the platform trail with orgId null".)

- [ ] **Step 2: Re-key the platform subscriptions page**

In `app/platform/subscriptions/page.tsx`, apply exactly these changes:
- PageHeader description → "Plan assignment for every account. One subscription covers all organizations its owner creates. Overrides here are administrative and audited."
- EmptyState hint → "Subscriptions are created with each user's first organization."
- Dialog state type: `{ orgId: Id<"organizations">; orgName: string; planId: string }` → `{ userId: Id<"userProfiles">; ownerLabel: string; planId: string }`; `setPlan({ orgId: overrideOrg.orgId, ... })` → `setPlan({ userId: overrideUser.userId, ... })`; dialog description → `Override {overrideUser?.ownerLabel}'s subscription. Applied immediately and recorded in the audit log.`
- Table header cells: Organization/Plan/Subscription/Org status/Period ends/Actions → Account/Plan/Subscription/Covered orgs/Period ends/Actions.
- Account cell: link to `/platform/users/${row.userId}` showing `row.ownerEmail ?? "—"` with sub-line `row.ownerName`; covered-orgs cell: `{row.coveredOrgCount}` with sub-line `row.coveredOrgNames.join(", ")`; remove the org-status badge cell and its `orgStatusLabel`/`orgStatusTone` imports if unused.

- [ ] **Step 3: Typecheck, test, commit**

Run: `npx tsc --noEmit` (clean), then `npm test` (all pass)

```bash
git add convex/platform/subscriptions.ts app/platform/subscriptions/page.tsx
git commit -m "feat(billing): platform subscription management keyed by user"
```

---

### Task 10: Sentry admin re-key and UI

**Files:**
- Modify: `convex/superadmin/billing.ts` (`listSubscriptions`, `setPlan`, `setStatus`, `setTrialEnd`), `convex/superadmin/tickets.ts` (refund-approval lookups)
- Modify: `app/sentry/(console)/billing/page.tsx` (subscriptions table), `app/sentry/(console)/organizations/[orgId]/page.tsx` (subscription card)

**Interfaces:**
- Consumes: same indexes as Task 9; org detail already returns creator-resolved `subscription` (Task 3)
- Produces: user-keyed Sentry billing ops

- [ ] **Step 1: Re-key the Sentry billing module**

In `convex/superadmin/billing.ts`, add after `requireOrg`:

```ts
async function requireUser(ctx: QueryCtx, userId: Id<"userProfiles">) {
  const user = await ctx.db.get(userId);
  if (!user) throw appError(ErrorCode.NOT_FOUND, "User not found");
  return user;
}
```

`listSubscriptions` row mapping becomes:

```ts
const page = await Promise.all(
  result.page.map(async (subscription) => {
    const [owner, plan] = await Promise.all([
      subscription.userId ? ctx.db.get(subscription.userId) : Promise.resolve(null),
      ctx.db.get(subscription.planId),
    ]);
    const coveredOrgs = subscription.userId
      ? await ctx.db
          .query("organizations")
          .withIndex("by_created_by_id", (q) => q.eq("createdById", subscription.userId))
          .collect()
      : [];
    return {
      subscription,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      coveredOrgCount: coveredOrgs.length,
      planName: plan?.name ?? null,
      planPriceCents: plan?.priceCents ?? null,
      planCurrency: plan?.currency ?? null,
      planInterval: plan?.billingInterval ?? null,
    };
  }),
);
```

`setPlan`: change args to `{ token: v.string(), userId: v.id("userProfiles"), planId: v.id("plans"), reason: v.string() }`. Replace the org + `by_org_id` lookup block with:

```ts
await requireUser(ctx, args.userId);
const plan = await ctx.db.get(args.planId);
if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
const subscription = await ctx.db
  .query("subscriptions")
  .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
  .unique();
if (!subscription) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");
if (subscription.planId === plan._id) {
  throw appError(ErrorCode.CONFLICT, `Account is already on ${plan.name}`);
}
```

Change that function's audit `orgId: org._id` → `orgId: null`. Apply the same arg swap (`orgId` → `userId`), `requireUser` + `by_user_id` lookup, and `orgId: null` audit to `setStatus` and `setTrialEnd`. Delete `requireOrg` only if `tsc` flags it unused.

- [ ] **Step 2: Re-key the refund-approval subscription lookups**

In `convex/superadmin/tickets.ts`, locate the subscription lookup feeding the refund detail view and the refund-approval downgrade. Replace each org-keyed lookup:

```ts
const subscription = await ctx.db
  .query("subscriptions")
  .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
  .unique();
```

with the creator-resolved form (fetch the org first wherever only an ID is in scope):

```ts
const org = await ctx.db.get(ticketOrgId);
const subscription = org
  ? await ctx.db
      .query("subscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", org.createdById))
      .unique()
  : null;
```

At the downgrade patch, add the comment: `// Per-user billing: this downgrades every org the subscriber created.`

- [ ] **Step 3: Re-key the Sentry billing and org pages**

In `app/sentry/(console)/billing/page.tsx` subscriptions table: replace the Organization column with an Account column rendering `ownerEmail` (link to `/sentry/users/${subscription.userId}`) with `ownerName` sub-line and covered-org count. Change the card description "Open an organization to manage its plan and trial." → "Open a user to manage their plan and trial."; EmptyState hint → "Subscriptions are created when users create their first organization."; PageHeader description "organization billing states" → "account billing states". Leave the plans table and `PlanEditorDialog` untouched.

In `app/sentry/(console)/organizations/[orgId]/page.tsx` subscription card: the org detail query already returns the creator-resolved `subscription` (Task 3) — pass `subscription.userId` instead of the org ID into the `setPlan`/`setStatus`/`setTrialEnd` dialog submissions, and change "No subscription found for this organization." to "No subscription found for this organization's creator." Keep dialog layouts unchanged.

- [ ] **Step 4: Typecheck, test, commit**

Run: `npx tsc --noEmit` (clean), then `npm test` (all pass)

```bash
git add convex/superadmin/billing.ts convex/superadmin/tickets.ts "app/sentry/(console)/billing/page.tsx" "app/sentry/(console)/organizations/[orgId]/page.tsx"
git commit -m "feat(billing): sentry billing operations keyed by user"
```

---

### Task 11: One-shot org-to-user migration

**Files:**
- Create: `convex/platform/billingMigration.ts`
- Create: `convex-test/billingMigration.test.ts`

**Interfaces:**
- Consumes: `pickWinningSubscription` from Task 2, widened schema from Task 1
- Produces: migrated user-keyed data required before Task 13 narrowing

- [ ] **Step 1: Write the failing migration test**

Create `convex-test/billingMigration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, seedAndProvision, setupTest } from "./setup";

async function grantPlatformOwner(t: ReturnType<typeof setupTest>) {
  await t.run(async (ctx) => {
    const alice = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", aliceIdentity.tokenIdentifier))
      .unique();
    if (!alice) throw new Error("alice missing");
    await ctx.db.patch(alice._id, { platformRole: "platform_owner" });
  });
}

describe("per-user billing migration", () => {
  it("transfers org subscriptions to creators, best plan wins, pools usage", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await seedAndProvision(t, bobIdentity);
    await t.run(async (ctx) => {
      const bob = await ctx.db
        .query("userProfiles")
        .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", bobIdentity.tokenIdentifier))
        .unique();
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", "acme"))
        .unique();
      const proPlan = await ctx.db
        .query("plans")
        .withIndex("by_name", (q) => q.eq("name", "Pro"))
        .unique();
      const freePlan = await ctx.db
        .query("plans")
        .withIndex("by_name", (q) => q.eq("name", "Free"))
        .unique();
      if (!bob || !org || !proPlan || !freePlan) throw new Error("seed missing");
      await ctx.db.insert("subscriptions", {
        userId: bob._id,
        planId: proPlan._id,
        status: "active",
        trialEndsAt: null,
        currentPeriodEndAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });
      await ctx.db.insert("subscriptions", {
        orgId: org._id,
        planId: freePlan._id,
        status: "trialing",
        trialEndsAt: null,
        currentPeriodEndAt: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });
    });
    await grantPlatformOwner(t);

    const statusBefore = await t
      .withIdentity(aliceIdentity)
      .query(api.platform.billingMigration.migrationStatus, {});
    expect(statusBefore.orgKeyedSubscriptions).toBe(1);

    const summary = await t
      .withIdentity(aliceIdentity)
      .mutation(api.platform.billingMigration.migrateOrgSubscriptionsToUsers, {
        reason: "test migration",
      });
    expect(summary.transferred).toBe(0);
    expect(summary.merged).toBe(1);

    const aliceSubs = await t.run(async (ctx) => {
      const alice = await ctx.db
        .query("userProfiles")
        .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", aliceIdentity.tokenIdentifier))
        .unique();
      if (!alice) throw new Error("alice missing");
      return ctx.db
        .query("subscriptions")
        .withIndex("by_user_id", (q) => q.eq("userId", alice._id))
        .collect();
    });
    expect(aliceSubs).toHaveLength(1);
    expect(aliceSubs[0].status).toBe("active");

    const usageRows = await t.run(async (ctx) => ctx.db.query("usage").collect());
    const aliceEvents = usageRows.filter((r) => r.resource === "events");
    expect(aliceEvents).toHaveLength(1);
    expect(aliceEvents[0].count).toBe(1);
    expect(aliceEvents[0].userId).toBeDefined();

    const statusAfter = await t
      .withIdentity(aliceIdentity)
      .query(api.platform.billingMigration.migrationStatus, {});
    expect(statusAfter).toEqual({
      orgKeyedSubscriptions: 0,
      paymentsWithoutUser: 0,
      usageRowsWithoutUser: 0,
    });

    const second = await t
      .withIdentity(aliceIdentity)
      .mutation(api.platform.billingMigration.migrateOrgSubscriptionsToUsers, {
        reason: "test rerun",
      });
    expect(second).toEqual({ transferred: 0, merged: 0, paymentsRekeyed: 0, usagePooled: 0 });
  });

  it("pools legacy org-keyed usage rows into the creator's counters", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.run(async (ctx) => {
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", "acme"))
        .unique();
      if (!org) throw new Error("org missing");
      await ctx.db.insert("usage", { orgId: org._id, resource: "events", count: 2, periodKey: null });
      await ctx.db.insert("usage", { orgId: org._id, resource: "members", count: 1, periodKey: null });
    });
    await grantPlatformOwner(t);
    const summary = await t
      .withIdentity(aliceIdentity)
      .mutation(api.platform.billingMigration.migrateOrgSubscriptionsToUsers, {
        reason: "test usage pooling",
      });
    expect(summary.usagePooled).toBe(1);
    const rows = await t.run(async (ctx) => ctx.db.query("usage").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].resource).toBe("events");
    expect(rows[0].count).toBe(3);
    expect(rows[0].userId).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex-test/billingMigration.test.ts`
Expected: FAIL (`api.platform.billingMigration` module does not exist)

- [ ] **Step 3: Implement the migration module**

Create `convex/platform/billingMigration.ts` with this exact content:

```ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requirePlatformOwner } from "../lib/auth";
import { pickWinningSubscription } from "../lib/billingOwnership";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw appError(ErrorCode.VALIDATION_ERROR, "A reason is required for this action");
  }
  return trimmed;
}

export const migrationStatus = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);
    let orgKeyedSubscriptions = 0;
    let paymentsWithoutUser = 0;
    let usageRowsWithoutUser = 0;
    for await (const sub of ctx.db.query("subscriptions")) {
      if (!sub.userId) orgKeyedSubscriptions += 1;
    }
    for await (const payment of ctx.db.query("billingPayments")) {
      if (!payment.userId) paymentsWithoutUser += 1;
    }
    for await (const row of ctx.db.query("usage")) {
      if (!row.userId) usageRowsWithoutUser += 1;
    }
    return { orgKeyedSubscriptions, paymentsWithoutUser, usageRowsWithoutUser };
  },
});

/**
 * One-shot, idempotent org-to-user billing migration. Safe to re-run:
 * rows that already carry a userId are skipped, and subscription
 * conflicts resolve deterministically via pickWinningSubscription.
 * Run migrationStatus first; when it reports all zeros, Task 13
 * (schema narrow) is safe to deploy.
 */
export const migrateOrgSubscriptionsToUsers = mutation({
  args: { reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const reason = requireReason(args.reason);
    let transferred = 0;
    let merged = 0;
    let paymentsRekeyed = 0;
    let usagePooled = 0;

    for await (const sub of ctx.db.query("subscriptions")) {
      if (sub.userId) continue;
      const org = sub.orgId ? await ctx.db.get(sub.orgId) : null;
      const creatorId = org?.createdById ?? org?.ownerId ?? null;
      if (!creatorId) {
        await ctx.db.delete(sub._id);
        continue;
      }
      const existing = await ctx.db
        .query("subscriptions")
        .withIndex("by_user_id", (q) => q.eq("userId", creatorId))
        .unique();
      const replacement = {
        userId: creatorId,
        planId: sub.planId,
        status: sub.status,
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEndAt: sub.currentPeriodEndAt,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        stripeCustomerId: sub.stripeCustomerId,
        stripeSubscriptionId: sub.stripeSubscriptionId,
      };
      if (!existing) {
        await ctx.db.replace(sub._id, replacement);
        transferred += 1;
      } else {
        const winner = pickWinningSubscription([
          { ...existing, _id: existing._id },
          { ...sub, _id: sub._id },
        ]);
        if (winner._id === existing._id) {
          await ctx.db.delete(sub._id);
        } else {
          await ctx.db.delete(existing._id);
          await ctx.db.replace(sub._id, replacement);
        }
        merged += 1;
      }
      await writeAudit(ctx, {
        orgId: null,
        actorId: actor._id,
        action: "billing.migration.subscription_transferred",
        resourceType: "subscription",
        resourceId: sub._id,
        after: { userId: creatorId, reason },
        reason,
      });
    }

    for await (const payment of ctx.db.query("billingPayments")) {
      if (payment.userId) continue;
      const org = payment.orgId ? await ctx.db.get(payment.orgId) : null;
      const ownerId: Id<"userProfiles"> | null =
        org?.createdById ?? org?.ownerId ?? payment.createdById ?? null;
      if (!ownerId) continue;
      await ctx.db.patch(payment._id, { userId: ownerId });
      paymentsRekeyed += 1;
    }

    const pooled = new Map<string, { userId: Id<"userProfiles">; resource: string; count: number }>();
    for await (const row of ctx.db.query("usage")) {
      if (row.userId) continue;
      if (row.resource === "members") {
        await ctx.db.delete(row._id);
        continue;
      }
      const org = row.orgId ? await ctx.db.get(row.orgId) : null;
      const ownerId = org?.createdById ?? org?.ownerId ?? null;
      if (!ownerId) {
        await ctx.db.delete(row._id);
        continue;
      }
      const key = `${ownerId}:${row.resource}`;
      const slot = pooled.get(key);
      if (slot) {
        slot.count += row.count;
      } else {
        pooled.set(key, { userId: ownerId, resource: row.resource, count: row.count });
      }
      await ctx.db.delete(row._id);
    }
    for (const slot of pooled.values()) {
      const existingRow = await ctx.db
        .query("usage")
        .withIndex("by_user_id_and_resource", (q) =>
          q.eq("userId", slot.userId).eq("resource", slot.resource),
        )
        .unique();
      if (existingRow) {
        await ctx.db.patch(existingRow._id, { count: existingRow.count + slot.count });
      } else {
        await ctx.db.insert("usage", {
          userId: slot.userId,
          resource: slot.resource,
          count: slot.count,
          periodKey: null,
        });
      }
      usagePooled += 1;
    }

    await writeAudit(ctx, {
      orgId: null,
      actorId: actor._id,
      action: "billing.migration.completed",
      resourceType: "subscription",
      resourceId: "all",
      after: { transferred, merged, paymentsRekeyed, usagePooled, reason },
      reason,
    });
    return { transferred, merged, paymentsRekeyed, usagePooled };
  },
});
```

- [ ] **Step 4: Run the migration tests**

Run: `npx vitest run convex-test/billingMigration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/platform/billingMigration.ts convex-test/billingMigration.test.ts
git commit -m "feat(billing): idempotent org-to-user subscription migration"
```

---

### Task 12: E2E seed subscription and remaining test fixes

**Files:**
- Modify: `convex/seed.ts` (E2E org bootstrap), plus any test files still failing after Tasks 1-11

**Interfaces:**
- Consumes: user-keyed subscription model from Task 4
- Produces: green `npm test` with seed coverage before Task 13 narrowing

- [ ] **Step 1: Run the full unit suite and list failures**

Run: `npm test`
Expected: possibly a few failures in older suites that assert org-keyed subscriptions or `members` usage rows (e.g. `billing.test.ts`, `billingSubscriptions.test.ts`).

- [ ] **Step 2: Fix remaining assertions with the subscriber-key pattern**

For each failure, apply the same mechanical pattern used in Tasks 3-7: replace `by_org_id` subscription expectations with `by_user_id(creator)` expectations, replace `getUsage(ctx, orgId, ...)` expectations with the subscriber key, and delete any `members`-usage assertions (the resource no longer exists; admin displays use live counts).

- [ ] **Step 3: Seed a user subscription for the E2E org**

In `convex/seed.ts`, inside the E2E seed org bootstrap (after the `e2e-org` insert, ~line 228), add a Free/active subscription for the test user so end-to-end authenticated flows resolve entitlements exactly as production first-org creation does:

```ts
const freePlan = await ctx.db
  .query("plans")
  .withIndex("by_name", (q) => q.eq("name", "Free"))
  .unique();
if (freePlan) {
  const existingSub = await ctx.db
    .query("subscriptions")
    .withIndex("by_user_id", (q) => q.eq("userId", testUser._id))
    .unique();
  if (!existingSub) {
    await ctx.db.insert("subscriptions", {
      userId: testUser._id,
      planId: freePlan._id,
      status: "active",
      trialEndsAt: null,
      currentPeriodEndAt: null,
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
  }
}
```

Place this block right after the org insert (`org = (await ctx.db.get(orgId))!;`) so re-running the seed stays idempotent via the `existingSub` guard.

- [ ] **Step 4: Verify green and commit**

Run: `npm test`
Expected: all pass

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add convex/seed.ts convex-test/
git commit -m "feat(billing): e2e seed user subscription and test alignment"
```

---

### Task 13: Narrow the schema (drop org-keyed billing fields)

**Files:**
- Modify: `convex/schema.ts`
- Modify: whatever `tsc` flags (expected stragglers: transitional guards from Task 1)

**Interfaces:**
- Consumes: migrated data (all subscriptions/payments/usage carry `userId`) from Task 11
- Produces: the final schema from design §2.1

- [ ] **Step 1: Confirm migration is complete**

Run `migrationStatus` (via the Convex dashboard function runner as a platform owner, or `npx convex run platform/billingMigration:migrationStatus` with deployment credentials). Proceed only when it reports `{ orgKeyedSubscriptions: 0, paymentsWithoutUser: 0, usageRowsWithoutUser: 0 }`. On a fresh dev database it already reports zeros — no migration run needed there. If any deployment still reports non-zero rows, run `migrateOrgSubscriptionsToUsers` there first with a recorded reason.

- [ ] **Step 2: Narrow the schema**

In `convex/schema.ts`:
- `subscriptions`: remove the `orgId` field and the `.index("by_org_id", ["orgId"])` line; change `userId` to `v.id("userProfiles")` (required). Keep `by_user_id` and `by_status_and_period_end`.
- `usage`: remove the `orgId` field and the `.index("by_org_id_and_resource", ...)` line; change `userId` to `v.id("userProfiles")` (required). Keep `by_user_id_and_resource`.
- `billingPayments`: change `userId` to `v.id("userProfiles")` (required); keep `orgId` as `v.optional(v.id("organizations"))` for legacy history; remove the `.index("by_org_id", ["orgId"])` line if no query uses it (verify with a repo search for `by_org_id` scoped to `billingPayments` — expected: zero uses after Tasks 5-7).

- [ ] **Step 3: Remove transitional guards flagged by the typechecker**

Run: `npx tsc --noEmit` and fix every error, which will be the Task 1 guards referencing removed fields:
- `webhook.ts`: collapse the `paymentOrgId` ternary to a direct `by_user_id(payment.userId)` lookup (already re-keyed in Task 6 — only the dead `?? null`-style leftovers remain, if any).
- `lifecycle.ts`: `?? null` on removed fields — simplify to `orgId: null`.
- `superadmin/billing.ts` and `platform/subscriptions.ts` list mappings: `subscription.orgId ? ... : ...` → since narrow removed the field, join owner/covered-orgs purely via `subscription.userId` (drop the ternary).
- Delete the transitional `.index("by_org_id")` references anywhere they remain.

- [ ] **Step 4: Run the full suite and commit**

Run: `npm test`
Expected: all pass

Run: `npx tsc --noEmit`
Expected: clean

```bash
git add convex/schema.ts convex/billing/webhook.ts convex/billing/lifecycle.ts convex/superadmin/billing.ts convex/platform/subscriptions.ts
git commit -m "feat(billing): narrow schema to user-keyed subscriptions"
```

---

### Task 14: Copy updates, docs, and final validation

**Files:**
- Modify: `components/landing/LandingPricingSection.tsx`, `components/auth/SignInForm.tsx`, `app/app/billing/page.tsx` (copy check), `README.md` (if it mentions per-org billing)
- Verify: `e2e/05-organizer-workspace.spec.ts` route-protection test still passes

**Interfaces:**
- Consumes: everything from Tasks 1-13
- Produces: shippable, documented per-user billing

- [ ] **Step 1: Update landing and sign-in copy**

In `components/landing/LandingPricingSection.tsx`: change the plan subtitle "Empower your organization with real-time scoring, custom certificate generation, and verified audit trails." to "One subscription per account — unlimited organizations, real-time scoring, custom certificates, and verified audit trails." Update any "per organization" pricing-frequency line to "per account".

In `components/auth/SignInForm.tsx`: change "activate the ${chosenPlan} subscription" to "activate the ${chosenPlan} subscription on your account" and "redirected directly to your organization with this plan pre-selected for checkout" to "redirected directly to your account billing page with this plan pre-selected for checkout".

- [ ] **Step 2: Typecheck, lint, unit tests, production build**

Run: `npx tsc --noEmit`
Expected: clean

Run: `npm run lint`
Expected: clean (fix any unused-import warnings from the refactor, e.g. removed `Id`/`requireOrg` imports)

Run: `npm test`
Expected: all suites pass

Run: `npm run build`
Expected: compiles clean (this is the required validation gate — validates both billing pages, admin pages, and all client call sites)

- [ ] **Step 3: Confirm the surviving e2e billing test**

The only e2e billing reference is the unauthenticated route-protection test in `e2e/05-organizer-workspace.spec.ts:37-39` (`/app/e2e-org/billing` → `/sign-in`). The org billing route still exists (Task 8), so no change is needed. If a dev server with seeded data is available, run `npx playwright test e2e/05-organizer-workspace.spec.ts` and confirm it passes; otherwise note it as verified-by-route-preservation in the commit message.

- [ ] **Step 4: Commit**

```bash
git add components/landing/LandingPricingSection.tsx components/auth/SignInForm.tsx README.md
git commit -m "docs(billing): per-account pricing copy"
```

---

## Self-review

**1. Spec coverage:** §2.1 schema → Tasks 1, 13. §2.2 resolution → Task 3. §2.3 trial-once → Task 4. §2.4 limits + members live count → Task 3. §3.1 checkout → Task 5. §3.2 webhook → Task 6. §3.3 lifecycle → Task 6. §3.4 refunds → Tasks 7, 10 (approval). §4 migration → Task 11. §5.1 billing pages → Task 8. §5.2 org-creation copy → Task 8 Step 4. §5.3 landing copy → Task 14. §5.4 admin → Tasks 9, 10. §6 orphans/flagging/idempotency/past-due banner → Tasks 3 (test 2), 6, 11, 8. §7 tests/build → per-task gates + Task 14. No gaps.

**2. Placeholder scan:** no TBD/TODO/generic-validation language; every step names exact files, code, commands, and expected results.

**3. Type consistency:** `getSubscription(ctx, userId)` + `requireLimit(ctx, sub, resource, subscriberId)` + `AuthCtx.subscriberId` used uniformly in Tasks 3-7; `setPlan/setStatus/setTrialEnd` take `userId` in Tasks 9-10 and both admin UIs pass `subscription.userId`; checkout/payments/refund signatures match their test call sites; migration `replace()` objects list every required narrowed field.

