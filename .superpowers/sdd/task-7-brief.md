## Task 7: Identity & authz helpers

**Files:**
- Create: `convex/lib/auth.ts`
- Create: `convex/lib/authz.ts`

**Interfaces:**
- Produces: `requireIdentity`, `requireUserProfile`, `requirePlatformOwner`, `resolveOrgBySlug`, `requireOrgMember`, `requirePermission`, `requireOrgOwner`, `requireOrgAdmin`, and the `AuthCtx` type.

- [ ] **Step 1: Write the failing test**

Create `convex-test/authz.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { ConvexError } from "convex/values";
import { aliceIdentity, bobIdentity, seedAndProvision, setupTest } from "./setup";

describe("authz helpers", () => {
  let t: ReturnType<typeof setupTest>;
  beforeEach(() => {
    t = setupTest();
  });

  it("requireIdentity throws UNAUTHENTICATED for anonymous", async () => {
    await expect(t.runQuery(api.__test__.whoAmI, {})).rejects.toMatchObject({
      message: expect.stringMatching(/.*/),
    });
  });

  it("requireOrgMember throws FORBIDDEN for non-members", async () => {
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    const orgId = await t.runMutation(api.__test__.createOrgAs, { name: "Acme", slug: "acme" }, { userIdentity: aliceIdentity });
    await expect(
      t.runQuery(api.__test__.orgMemberCount, { orgSlug: "acme" }, { userIdentity: bobIdentity }),
    ).rejects.toMatchObject({ message: expect.any(String) });
  });
});
```

> Note: the test uses temporary `api.__test__.*` endpoints defined in `convex/_test.ts` that wrap the helpers — these exist only for testing and are removed in the final cleanup task. Implement them in Step 3.

- [ ] **Step 2: Run — expect failure**

Run: `npm test`. Expected: FAIL (`api.__test__` and `convex/lib/auth*` do not exist).

- [ ] **Step 3: Implement `convex/lib/auth.ts`**

Create `convex/lib/auth.ts`:
```ts
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

export async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError(ErrorCode.UNAUTHENTICATED, "Sign in required");
  return identity;
}

export async function requireUserProfile(ctx: QueryCtx): Promise<Doc<"userProfiles">> {
  const identity = await requireIdentity(ctx);
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!profile) throw appError(ErrorCode.PROFILE_NOT_PROVISIONED, "Profile not provisioned");
  if (profile.status !== "active") throw appError(ErrorCode.FORBIDDEN, "Account not active");
  return profile;
}

export async function requirePlatformOwner(ctx: QueryCtx): Promise<Doc<"userProfiles">> {
  const profile = await requireUserProfile(ctx);
  if (profile.platformRole !== "platform_owner") {
    throw appError(ErrorCode.FORBIDDEN, "Platform owner only");
  }
  return profile;
}
```

- [ ] **Step 4: Implement `convex/lib/authz.ts`**

Create `convex/lib/authz.ts`:
```ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";
import { requireUserProfile } from "./auth";

export type AuthCtx = {
  user: Doc<"userProfiles">;
  org: Doc<"organizations">;
  membership: Doc<"organizationMembers">;
  role: Doc<"roles">;
  permissions: Set<string>;
  subscription: Doc<"subscriptions">;
};

export async function resolveOrgBySlug(ctx: QueryCtx, slug: string) {
  const org = await ctx.db
    .query("organizations")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!org || org.status === "deleted") throw appError(ErrorCode.NOT_FOUND, "Organization not found");
  return org;
}

async function loadPermissions(ctx: QueryCtx, roleId: Id<"roles">): Promise<Set<string>> {
  const rolePermissions = await ctx.db
    .query("rolePermissions")
    .withIndex("by_role_id", (q) => q.eq("roleId", roleId))
    .collect();
  const names = await Promise.all(
    rolePermissions.map((rp) => ctx.db.get(rp.permissionId)),
  );
  return new Set(names.filter(Boolean).map((p) => p!.name));
}

export async function requireOrgMember(
  ctx: QueryCtx,
  args: { orgSlug: string },
): Promise<AuthCtx> {
  const user = await requireUserProfile(ctx);
  const org = await resolveOrgBySlug(ctx, args.orgSlug);
  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_id_and_user_id", (q) => q.eq("orgId", org._id).eq("userId", user._id))
    .unique();
  if (!membership || membership.status !== "active") {
    throw appError(ErrorCode.FORBIDDEN, "Not a member of this organization");
  }
  const role = await ctx.db.get(membership.roleId);
  if (!role) throw appError(ErrorCode.FORBIDDEN, "Role not found");
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
    .unique();
  if (!subscription) throw appError(ErrorCode.FORBIDDEN, "No subscription");
  const permissions = await loadPermissions(ctx, role._id);
  return { user, org, membership, role, permissions, subscription };
}

export async function requirePermission(
  ctx: QueryCtx,
  args: { orgSlug: string; permission: string },
): Promise<AuthCtx> {
  const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
  if (!actx.permissions.has(args.permission)) {
    throw appError(ErrorCode.FORBIDDEN, `Missing permission: ${args.permission}`);
  }
  return actx;
}

export const requireOrgOwner = (ctx: QueryCtx, args: { orgSlug: string }) =>
  requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.update" });

export const requireOrgAdmin = (ctx: QueryCtx, args: { orgSlug: string }) =>
  requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.members.manage" });
```

- [ ] **Step 5: Create test-only endpoints**

Create `convex/_test.ts` (deleted in the final cleanup task):
```ts
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireIdentity, requireOrgMember } from "./lib/authz-impl";

export const whoAmI = query({
  args: {},
  handler: async (ctx) => {
    return (await requireIdentity(ctx)).tokenIdentifier;
  },
});

export const orgMemberCount = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    return actx.org.name;
  },
});
```

> Note: `requireIdentity` is exported by `convex/lib/auth.ts`, and `requireOrgMember` by `convex/lib/authz.ts`. The import line above should be:
> ```ts
> import { requireIdentity } from "./lib/auth";
> import { requireOrgMember } from "./lib/authz";
> ```
> Replace the placeholder import with these two lines.

- [ ] **Step 6: Run — expect pass**

Run: `npm test`. Expected: authz tests PASS (after Task 8 seeds roles; if `seedReferenceData` is not yet defined, these tests remain failing until Task 8 — that is expected).

- [ ] **Step 7: Commit**

```powershell
git add convex/lib/auth.ts convex/lib/authz.ts convex/_test.ts convex-test/authz.test.ts
git commit -m "feat: identity and authorization helpers"
```

---

