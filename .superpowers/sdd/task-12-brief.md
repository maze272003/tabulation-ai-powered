## Task 12: Reference reads & platform admin

**Files:**
- Create: `convex/roles.ts`
- Create: `convex/plans.ts`
- Create: `convex/subscriptions.ts`
- Create: `convex/audit.ts`
- Create: `convex/platform.ts`

**Interfaces:**
- Produces: read endpoints used by UI pages + platform-owner admin + audit list.

- [ ] **Step 1: Implement reference reads**

Create `convex/roles.ts`:
```ts
import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("roles")
      .withIndex("by_scope", (q) => q.eq("scope", "organization"))
      .collect();
  },
});
```

Create `convex/plans.ts`:
```ts
import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("plans").collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});
```

Create `convex/subscriptions.ts`:
```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requirePermission } from "./lib/authz";
import { writeAudit } from "./lib/audit";

export const getForOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "subscription.view" });
    const plan = await ctx.db.get(actx.subscription.planId);
    return { subscription: actx.subscription, plan };
  },
});

// Phase 1 stub — real Stripe wiring lands in Phase 6.
export const changePlan = mutation({
  args: { orgSlug: v.string(), planName: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "subscription.manage" });
    const plan = await ctx.db.query("plans").withIndex("by_name", (q) => q.eq("name", args.planName)).unique();
    if (!plan) throw new Error("Plan not found");
    const before = { planId: actx.subscription.planId };
    await ctx.db.patch(actx.subscription._id, { planId: plan._id });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "subscription.plan_changed",
      resourceType: "subscription", resourceId: actx.subscription._id, before, after: { planId: plan._id },
    });
  },
});
```

Create `convex/audit.ts`:
```ts
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requirePermission } from "./lib/authz";

export const listByOrg = query({
  args: { orgSlug: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "audit.view" });
    return ctx.db
      .query("auditLogs")
      .withIndex("by_org_id_and_creation_time", (q) => q.eq("orgId", actx.org._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

Create `convex/platform.ts`:
```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requirePlatformOwner } from "./lib/auth";
import { writeAudit } from "./lib/audit";

export const listAllOrgs = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);
    return ctx.db.query("organizations").collect();
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);
    return ctx.db.query("userProfiles").collect();
  },
});

export const setPlatformOwner = mutation({
  args: { userId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    await ctx.db.patch(args.userId, { platformRole: "platform_owner" });
    await writeAudit(ctx, {
      orgId: null, actorId: actor._id, action: "platform.user.promoted",
      resourceType: "userProfile", resourceId: args.userId,
      before: { platformRole: target.platformRole }, after: { platformRole: "platform_owner" },
    });
  },
});
```

- [ ] **Step 2: Verify typecheck & tests**

Run: `npm run typecheck`; `npm test`. Expected: both PASS.

- [ ] **Step 3: Commit**

```powershell
git add convex/roles.ts convex/plans.ts convex/subscriptions.ts convex/audit.ts convex/platform.ts
git commit -m "feat: reference reads, audit list, platform admin"
```

---

