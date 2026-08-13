## Task 11: Members & invitations

**Files:**
- Create: `convex/members.ts`
- Create: `convex/invitations.ts`

**Interfaces:**
- Produces: `api.members.{list,changeRole,remove}`, `api.invitations.{create,listForOrg,getByToken,accept,revoke}`.

- [ ] **Step 1: Write failing tests**

Create `convex-test/members.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, seedAndProvision, setupTest } from "./setup";

describe("members & invitations", () => {
  it("invites, then the invitee accepts and becomes a member", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t.runMutation(api.organizations.create, { name: "Acme", slug: "acme" }, { userIdentity: aliceIdentity });
    await t.runMutation(
      api.invitations.create,
      { orgSlug: "acme", email: "bob@example.com", roleName: "Judge" },
      { userIdentity: aliceIdentity },
    );
    const pending = await t.runQuery(api.invitations.listForUser, {}, { userIdentity: bobIdentity });
    expect(pending.length).toBe(1);
    await t.runMutation(
      api.invitations.accept,
      { token: pending[0].token },
      { userIdentity: bobIdentity },
    );
    const members = await t.runQuery(api.members.list, { orgSlug: "acme" }, { userIdentity: aliceIdentity });
    expect(members.find((m: { email: string }) => m.email === "bob@example.com")).toBeTruthy();
  });

  it("rejects an invitation addressed to a different email", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t.runMutation(api.organizations.create, { name: "Acme", slug: "acme" }, { userIdentity: aliceIdentity });
    await t.runMutation(
      api.invitations.create,
      { orgSlug: "acme", email: "someone-else@example.com", roleName: "Viewer" },
      { userIdentity: aliceIdentity },
    );
    const pending = await t.runQuery(api.invitations.listForUser, {}, { userIdentity: bobIdentity });
    expect(pending.length).toBe(0);
  });

  it("expires invitations past their TTL", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t.runMutation(api.organizations.create, { name: "Acme", slug: "acme" }, { userIdentity: aliceIdentity });
    await t.runMutation(
      api.invitations.create,
      { orgSlug: "acme", email: "bob@example.com", roleName: "Viewer" },
      { userIdentity: aliceIdentity },
    );
    const pending = await t.runQuery(api.invitations.listForUser, {}, { userIdentity: bobIdentity });
    // Advance time past expiry (7 days) and attempt to accept.
    await expect(
      t.runMutation(api.invitations.accept, { token: pending[0].token }, { userIdentity: bobIdentity }, { ts: Date.now() + 8 * 24 * 60 * 60 * 1000 }),
    ).rejects.toMatchObject({ message: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement `convex/members.ts`**

Create `convex/members.ts`:
```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requirePermission } from "./lib/authz";
import { requirePlatformOwner } from "./lib/auth";
import { writeAudit } from "./lib/audit";
import { incrementUsage } from "./lib/usage";

export const list = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.view" });
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .collect();
    return Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        const role = await ctx.db.get(m.roleId);
        return {
          membershipId: m._id,
          userId: m.userId,
          name: user?.name ?? "",
          email: user?.email ?? "",
          image: user?.image ?? "",
          roleName: role?.name ?? "",
          status: m.status,
          joinedAt: m.joinedAt,
        };
      }),
    );
  },
});

export const changeRole = mutation({
  args: { orgSlug: v.string(), membershipId: v.id("organizationMembers"), roleName: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.members.manage" });
    const target = await ctx.db.get(args.membershipId);
    if (!target || target.orgId !== actx.org._id) throw appError(ErrorCode.NOT_FOUND, "Member not found");
    const newRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.roleName))
      .unique();
    if (!newRole) throw appError(ErrorCode.NOT_FOUND, "Role not found");
    if (actx.org.ownerId === target.userId && target.roleId !== newRole._id) {
      throw appError(ErrorCode.CONFLICT, "Cannot change the owner's role; transfer ownership instead");
    }
    const before = { roleId: target.roleId };
    await ctx.db.patch(args.membershipId, { roleId: newRole._id });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "member.role.changed",
      resourceType: "organizationMember", resourceId: args.membershipId, before, after: { roleId: newRole._id },
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), membershipId: v.id("organizationMembers") },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.members.manage" });
    const target = await ctx.db.get(args.membershipId);
    if (!target || target.orgId !== actx.org._id) throw appError(ErrorCode.NOT_FOUND, "Member not found");
    if (actx.org.ownerId === target.userId) throw appError(ErrorCode.CONFLICT, "Cannot remove the owner");
    const before = target;
    await ctx.db.patch(args.membershipId, { status: "inactive" });
    await incrementUsage(ctx, actx.org._id, "members", -1);
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "member.removed",
      resourceType: "organizationMember", resourceId: args.membershipId, before, after: { status: "inactive" },
    });
  },
});
```

- [ ] **Step 4: Implement `convex/invitations.ts`**

Create `convex/invitations.ts`:
```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requirePermission } from "./lib/authz";
import { requireUserProfile } from "./lib/auth";
import { writeAudit } from "./lib/audit";
import { getSubscription } from "./lib/entitlements";
import { requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const create = mutation({
  args: { orgSlug: v.string(), email: v.string(), roleName: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.members.manage" });
    const sub = await getSubscription(ctx, actx.org._id);
    await requireLimit(ctx, sub, "members");
    const role = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.roleName))
      .unique();
    if (!role) throw appError(ErrorCode.NOT_FOUND, "Role not found");
    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_org_id_and_email", (q) => q.eq("orgId", actx.org._id).eq("email", args.email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (existing) throw appError(ErrorCode.CONFLICT, "Invitation already pending", { email: args.email });
    const token = randomToken();
    const expiresAt = Date.now() + INVITATION_TTL_MS;
    const id: Id<"invitations"> = await ctx.db.insert("invitations", {
      orgId: actx.org._id,
      email: args.email.toLowerCase(),
      roleId: role._id,
      eventId: null,
      token,
      status: "pending",
      expiresAt,
      createdById: actx.user._id,
      acceptedById: null,
      acceptedAt: null,
    });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "member.invited",
      resourceType: "invitation", resourceId: id, after: { email: args.email, roleName: args.roleName, expiresAt },
    });
    return token;
  },
});

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireUserProfile(ctx);
    return ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", profile.email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

export const listForOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.members.manage" });
    return ctx.db
      .query("invitations")
      .withIndex("by_org_id_and_email", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!inv || inv.status !== "pending") return null;
    const org = await ctx.db.get(inv.orgId);
    const role = await ctx.db.get(inv.roleId);
    return { orgName: org?.name ?? "", roleName: role?.name ?? "", email: inv.email, expiresAt: inv.expiresAt };
  },
});

export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireUserProfile(ctx);
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!inv || inv.status !== "pending") throw appError(ErrorCode.NOT_FOUND, "Invitation not found");
    if (inv.email !== profile.email) throw appError(ErrorCode.FORBIDDEN, "Invitation is not for you");
    if (Date.now() > inv.expiresAt) {
      await ctx.db.patch(inv._id, { status: "expired" });
      throw appError(ErrorCode.CONFLICT, "Invitation has expired");
    }
    const existing = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_id_and_user_id", (q) => q.eq("orgId", inv.orgId).eq("userId", profile._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { roleId: inv.roleId, status: "active" });
    } else {
      await ctx.db.insert("organizationMembers", {
        userId: profile._id, orgId: inv.orgId, roleId: inv.roleId, status: "active", joinedAt: Date.now(),
      });
      await incrementUsage(ctx, inv.orgId, "members", 1);
    }
    await ctx.db.patch(inv._id, { status: "accepted", acceptedById: profile._id, acceptedAt: Date.now() });
    await writeAudit(ctx, {
      orgId: inv.orgId, actorId: profile._id, action: "member.invitation.accepted",
      resourceType: "invitation", resourceId: inv._id, before: { status: "pending" }, after: { status: "accepted" },
    });
  },
});

export const revoke = mutation({
  args: { orgSlug: v.string(), invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.members.manage" });
    const inv = await ctx.db.get(args.invitationId);
    if (!inv || inv.orgId !== actx.org._id) throw appError(ErrorCode.NOT_FOUND, "Invitation not found");
    await ctx.db.patch(args.invitationId, { status: "revoked" });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "member.invitation.revoked",
      resourceType: "invitation", resourceId: args.invitationId, before: { status: inv.status }, after: { status: "revoked" },
    });
  },
});
```

- [ ] **Step 5: Run — expect pass**

Run: `npm test`. Expected: members & invitations tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add convex/members.ts convex/invitations.ts convex-test/members.test.ts
git commit -m "feat: members and invitations with limit enforcement"
```

---

