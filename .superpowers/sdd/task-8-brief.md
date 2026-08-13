## Task 8: Seed reference data

**Files:**
- Create: `convex/lib/constants.ts`
- Create: `convex/seed.ts`

**Interfaces:**
- Produces: `api.seed.seedReferenceData` (idempotent internal mutation) that creates the system roles, permissions, role-permission links, and plans.

- [ ] **Step 1: Define seed constants**

Create `convex/lib/constants.ts`:
```ts
export const SYSTEM_ROLES = [
  { name: "Org Owner", description: "Full control over the organization" },
  { name: "Org Admin", description: "Manage members and configuration" },
  { name: "Event Admin", description: "Create and manage events" },
  { name: "Tabulator", description: "Run tabulation and finalize results" },
  { name: "Judge", description: "Enter scores for assigned contestants" },
  { name: "Staff", description: "Assist with event operations" },
  { name: "Viewer", description: "Read-only access" },
] as const;

export const SYSTEM_PERMISSIONS = [
  { name: "organization.view", category: "organization", description: "View the organization" },
  { name: "organization.update", category: "organization", description: "Update organization settings" },
  { name: "organization.members.manage", category: "organization", description: "Manage members and roles" },
  { name: "organization.delete", category: "organization", description: "Delete the organization" },
  { name: "audit.view", category: "audit", description: "View audit logs" },
  { name: "subscription.view", category: "subscription", description: "View subscription" },
  { name: "subscription.manage", category: "subscription", description: "Change subscription plan" },
] as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Org Owner": ["organization.view", "organization.update", "organization.members.manage", "organization.delete", "audit.view", "subscription.view", "subscription.manage"],
  "Org Admin": ["organization.view", "organization.update", "organization.members.manage", "audit.view", "subscription.view"],
  "Event Admin": ["organization.view", "subscription.view"],
  "Tabulator": ["organization.view"],
  "Judge": ["organization.view"],
  "Staff": ["organization.view"],
  "Viewer": ["organization.view"],
};

export const SYSTEM_PLANS = [
  {
    name: "Free",
    sortOrder: 0,
    features: {
      canCreateEvent: true, canExportReports: false, canUseCustomBranding: false,
      canUseAuditLogs: false, canCreateTemplates: false, canUseAdvancedAnalytics: false, canUseApi: false,
    },
    limits: { maxMembers: 5, maxEvents: 1, maxJudges: 5, maxContestants: 20 },
    isSystem: true,
  },
  {
    name: "Starter",
    sortOrder: 1,
    features: {
      canCreateEvent: true, canExportReports: true, canUseCustomBranding: false,
      canUseAuditLogs: false, canCreateTemplates: false, canUseAdvancedAnalytics: false, canUseApi: false,
    },
    limits: { maxMembers: 15, maxEvents: 5, maxJudges: 20, maxContestants: 100 },
    isSystem: true,
  },
  {
    name: "Pro",
    sortOrder: 2,
    features: {
      canCreateEvent: true, canExportReports: true, canUseCustomBranding: true,
      canUseAuditLogs: true, canCreateTemplates: true, canUseAdvancedAnalytics: true, canUseApi: false,
    },
    limits: { maxMembers: 50, maxEvents: 25, maxJudges: 100, maxContestants: 500 },
    isSystem: true,
  },
] as const;
```

- [ ] **Step 2: Implement the seed mutation**

Create `convex/seed.ts`:
```ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS, SYSTEM_ROLES } from "./lib/constants";

export const seedReferenceData = mutation({
  args: {},
  handler: async (ctx) => {
    for (const p of SYSTEM_PERMISSIONS) {
      const existing = await ctx.db
        .query("permissions")
        .withIndex("by_name", (q) => q.eq("name", p.name))
        .unique();
      if (!existing) {
        await ctx.db.insert("permissions", { ...p });
      }
    }
    for (const r of SYSTEM_ROLES) {
      const existing = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", r.name))
        .unique();
      if (!existing) {
        await ctx.db.insert("roles", {
          name: r.name,
          scope: "organization",
          isSystem: true,
          description: r.description,
        });
      }
    }
    for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
      const role = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", roleName))
        .unique();
      if (!role) continue;
      for (const permName of permNames) {
        const perm = await ctx.db
          .query("permissions")
          .withIndex("by_name", (q) => q.eq("name", permName))
          .unique();
        if (!perm) continue;
        const existing = await ctx.db
          .query("rolePermissions")
          .withIndex("by_role_id", (q) => q.eq("roleId", role._id))
          .filter((q) => q.eq(q.field("permissionId"), perm._id))
          .first();
        if (!existing) {
          await ctx.db.insert("rolePermissions", { roleId: role._id, permissionId: perm._id });
        }
      }
    }
    for (const plan of SYSTEM_PLANS) {
      const existing = await ctx.db
        .query("plans")
        .withIndex("by_name", (q) => q.eq("name", plan.name))
        .unique();
      if (!existing) {
        await ctx.db.insert("plans", { ...plan });
      }
    }
  },
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`. Expected: sanity tests PASS; authz tests now reach real data (still pending organizations creation helper — Task 9 completes those tests).

- [ ] **Step 4: Commit**

```powershell
git add convex/lib/constants.ts convex/seed.ts
git commit -m "feat: seed system roles, permissions, plans"
```

---

