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
});
