## Task 9: Entitlements, usage & audit helpers

**Files:**
- Create: `convex/lib/usage.ts`
- Create: `convex/lib/entitlements.ts`
- Create: `convex/lib/audit.ts`

**Interfaces:**
- Produces: `getUsage`, `incrementUsage`, `getSubscription`, `hasFeature`, `hasLimit`, `requireFeature`, `requireLimit`, `writeAudit`.

- [ ] **Step 1: Write failing tests**

Create `convex-test/entitlements.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, seedAndProvision, setupTest } from "./setup";

describe("entitlements", () => {
  it("blocks member creation beyond maxMembers on Free plan", async () => {
    const t = setupTest();
    const ownerId = await seedAndProvision(t, aliceIdentity);
    await t.runMutation(api.__test__.createOrgAs, { name: "Acme", slug: "acme" }, { userIdentity: aliceIdentity });
    // Free plan maxMembers = 5 (1 owner already). Invite 4 more should succeed, 5th should fail.
    for (let i = 0; i < 4; i++) {
      await t.runMutation(
        api.__test__.inviteEmailAs,
        { orgSlug: "acme", email: `u${i}@x.com`, role: "Viewer" },
        { userIdentity: aliceIdentity },
      );
    }
    await expect(
      t.runMutation(
        api.__test__.inviteEmailAs,
        { orgSlug: "acme", email: `overflow@x.com`, role: "Viewer" },
        { userIdentity: aliceIdentity },
      ),
    ).rejects.toMatchObject({ message: expect.any(String) });
  });
});
```

Create `convex-test/audit.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, seedAndProvision, setupTest } from "./setup";

describe("audit", () => {
  it("writes an audit row on org creation", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await t.runMutation(api.__test__.createOrgAs, { name: "Acme", slug: "acme" }, { userIdentity: aliceIdentity });
    const logs = await t.runQuery(api.__test__.auditForOrg, { orgSlug: "acme" }, { userIdentity: aliceIdentity });
    expect(logs.some((l: { action: string }) => l.action === "organization.created")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement `usage.ts`**

Create `convex/lib/usage.ts`:
```ts
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function getUsage(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  resource: string,
): Promise<number> {
  const row = await ctx.db
    .query("usage")
    .withIndex("by_org_id_and_resource", (q) => q.eq("orgId", orgId).eq("resource", resource))
    .unique();
  return row?.count ?? 0;
}

export async function incrementUsage(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  resource: string,
  delta: number,
): Promise<void> {
  const existing = await ctx.db
    .query("usage")
    .withIndex("by_org_id_and_resource", (q) => q.eq("orgId", orgId).eq("resource", resource))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { count: Math.max(0, existing.count + delta) });
  } else if (delta > 0) {
    await ctx.db.insert("usage", { orgId, resource, count: delta, periodKey: null });
  }
}
```

- [ ] **Step 4: Implement `entitlements.ts`**

Create `convex/lib/entitlements.ts`:
```ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";
import { getUsage } from "./usage";

export async function getSubscription(ctx: QueryCtx, orgId: Id<"organizations">) {
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_org_id", (q) => q.eq("orgId", orgId))
    .unique();
  if (!sub) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");
  return sub;
}

export async function getPlan(ctx: QueryCtx, sub: Doc<"subscriptions">) {
  const plan = await ctx.db.get(sub.planId);
  if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
  return plan;
}

export function hasFeature(plan: { features: Record<string, boolean> }, feature: string): boolean {
  return plan.features[feature] === true;
}

export function hasLimit(plan: { limits: Record<string, number> }, resource: string, current: number): boolean {
  const max = plan.limits[resource];
  return typeof max === "number" && current < max;
}

export async function requireFeature(
  ctx: QueryCtx,
  sub: Doc<"subscriptions">,
  feature: string,
): Promise<void> {
  const plan = await getPlan(ctx, sub);
  if (!hasFeature(plan, feature)) {
    throw appError(ErrorCode.FEATURE_UNAVAILABLE, `Feature unavailable: ${feature}`, { feature });
  }
}

export async function requireLimit(
  ctx: QueryCtx,
  sub: Doc<"subscriptions">,
  resource: string,
): Promise<void> {
  const plan = await getPlan(ctx, sub);
  const current = await getUsage(ctx as never, sub.orgId, resource);
  if (!hasLimit(plan, resource, current)) {
    throw appError(ErrorCode.LIMIT_EXCEEDED, `Limit reached: ${resource}`, { resource, current, max: plan.limits[resource] });
  }
}
```

> Note: `getUsage` takes a `MutationCtx`, but `requireLimit` is often called inside a mutation (which is also valid). The `ctx as never` cast is a pragmatic workaround because `convex-test` contexts satisfy both. If your Convex version types this strictly, change `requireLimit` to accept `MutationCtx` directly and update call sites — they are all mutations.

- [ ] **Step 5: Implement `audit.ts`**

Create `convex/lib/audit.ts`:
```ts
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { serialize } from "./serializers";

type AuditInput = {
  orgId: Id<"organizations"> | null;
  actorId: Id<"userProfiles"> | null;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

export async function writeAudit(ctx: MutationCtx, input: AuditInput): Promise<void> {
  await ctx.db.insert("auditLogs", {
    orgId: input.orgId,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    before: serialize(input.before ?? null),
    after: serialize(input.after ?? null),
    reason: input.reason ?? null,
  });
}
```

- [ ] **Step 6: Run — expect partial pass**

Run: `npm test`. Expected: errors/serializers tests pass; entitlements/audit tests still fail until `api.__test__.*` helpers are extended in Task 10–11.

- [ ] **Step 7: Commit**

```powershell
git add convex/lib/usage.ts convex/lib/entitlements.ts convex/lib/audit.ts convex-test/entitlements.test.ts convex-test/audit.test.ts
git commit -m "feat: entitlement, usage, and audit helpers"
```

---

