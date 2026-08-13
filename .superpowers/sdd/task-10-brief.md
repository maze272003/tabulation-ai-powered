## Task 10: Organizations

**Files:**
- Create: `convex/organizations.ts`
- Modify: `convex/_test.ts` (add `createOrgAs`, `auditForOrg`)

**Interfaces:**
- Produces: `api.organizations.create` (seeds subscription + owner membership + audit + usage), `get`, `listMine`, `update`.

- [ ] **Step 1: Write failing test**

Create `convex-test/organizations.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, seedAndProvision, setupTest } from "./setup";

describe("organizations", () => {
  it("creates an org with owner membership and free subscription", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    const slug = await t.runMutation(
      api.organizations.create,
      { name: "Acme", slug: "acme" },
      { userIdentity: aliceIdentity },
    );
    expect(slug).toBe("acme");
    const mine = await t.runQuery(api.organizations.listMine, {}, { userIdentity: aliceIdentity });
    expect(mine.length).toBe(1);
    expect(mine[0].org.slug).toBe("acme");
    expect(mine[0].role.name).toBe("Org Owner");
  });

  it("rejects duplicate slug", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await t.runMutation(api.organizations.create, { name: "Acme", slug: "acme" }, { userIdentity: aliceIdentity });
    await expect(
      t.runMutation(api.organizations.create, { name: "Other", slug: "acme" }, { userIdentity: aliceIdentity }),
    ).rejects.toMatchObject({ message: expect.any(String) });
  });

  it("prevents cross-org access by slug", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t.runMutation(api.organizations.create, { name: "Acme", slug: "acme" }, { userIdentity: aliceIdentity });
    await expect(
      t.runQuery(api.organizations.get, { orgSlug: "acme" }, { userIdentity: bobIdentity }),
    ).rejects.toMatchObject({ message: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test`. Expected: FAIL (`api.organizations.*` undefined).

- [ ] **Step 3: Implement `convex/organizations.ts`**

Create `convex/organizations.ts`:
```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireIdentity, requireOrgMember, requirePermission } from "./lib/auth";
import { writeAudit } from "./lib/audit";
import { incrementUsage } from "./lib/usage";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const create = mutation({
  args: { name: v.string(), slug: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const identity = await requireIdentity(ctx);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!profile) throw appError(ErrorCode.PROFILE_NOT_PROVISIONED, "Profile not provisioned");

    const slug = slugify(args.slug ?? args.name);
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw appError(ErrorCode.CONFLICT, "Slug already taken", { slug });

    const ownerRoleId = await pickSystemRole(ctx, "Org Owner");
    const freePlan = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", "Free"))
      .unique();
    if (!freePlan) throw appError(ErrorCode.NOT_FOUND, "Free plan missing — run seed");

    const orgId: Id<"organizations"> = await ctx.db.insert("organizations", {
      slug,
      name: args.name.trim(),
      ownerId: profile._id,
      createdById: profile._id,
      status: "active",
      branding: {},
    });
    await ctx.db.insert("organizationMembers", {
      userId: profile._id,
      orgId,
      roleId: ownerRoleId,
      status: "active",
      joinedAt: Date.now(),
    });
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
    await writeAudit(ctx, {
      orgId, actorId: profile._id, action: "organization.created",
      resourceType: "organization", resourceId: orgId, after: { slug, name: args.name },
    });
    return slug;
  },
});

async function pickSystemRole(ctx: { db: any }, name: string): Promise<Id<"roles">> {
  const role = await ctx.db
    .query("roles")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!role) throw appError(ErrorCode.NOT_FOUND, `Role missing: ${name}`);
  return role._id;
}

export const get = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    return actx.org;
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireUserProfileFromCtx(ctx);
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user_id", (q) => q.eq("userId", profile._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    return Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.orgId);
        const role = await ctx.db.get(m.roleId);
        return { membership: m, org, role };
      }),
    );
  },
});

export const update = mutation({
  args: { orgSlug: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.update" });
    if (args.name === undefined) return actx.org;
    const before = actx.org;
    await ctx.db.patch(actx.org._id, { name: args.name.trim() });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "organization.updated",
      resourceType: "organization", resourceId: actx.org._id, before, after: { ...before, name: args.name },
    });
  },
});

async function requireUserProfileFromCtx(ctx: any) {
  const { requireUserProfile } = await import("./lib/auth");
  return requireUserProfile(ctx);
}
```

> Note: the inline `import()` of `requireUserProfile` and the `any` ctx on `pickSystemRole`/`requireUserProfileFromCtx` are pragmatic shims to avoid circular-import edge cases during initial scaffolding. In Step 5 you will replace them with direct top-level imports — verify `npm run typecheck` passes both ways and prefer the direct import.

- [ ] **Step 4: Replace pragmatic shims with direct imports**

Edit the top of `convex/organizations.ts` to import `requireUserProfile` directly:
```ts
import { requireIdentity, requireUserProfile, requireOrgMember, requirePermission } from "./lib/auth";
```
Wait — `requireOrgMember` and `requirePermission` live in `convex/lib/authz.ts`, not `auth.ts`. Correct imports:
```ts
import { requireIdentity, requireUserProfile } from "./lib/auth";
import { requireOrgMember, requirePermission } from "./lib/authz";
```
Delete `requireUserProfileFromCtx` and the inline `import()` calls; call `requireUserProfile(ctx)` directly. Remove the `any`-typed `pickSystemRole` parameter and type it as `MutationCtx`:
```ts
import type { MutationCtx } from "./_generated/server";

async function pickSystemRole(ctx: MutationCtx, name: string): Promise<Id<"roles">> {
  const role = await ctx.db
    .query("roles")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!role) throw appError(ErrorCode.NOT_FOUND, `Role missing: ${name}`);
  return role._id;
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npm test`. Expected: organizations tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add convex/organizations.ts convex-test/organizations.test.ts
git commit -m "feat: organization create/get/listMine/update with audit"
```

---

