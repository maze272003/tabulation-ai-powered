/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import baseSchema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, seedAndProvision } from "./setup";

const testModules = import.meta.glob("../convex/**/*.ts");

const migrationSchema = {
  ...baseSchema,
  tables: {
    ...baseSchema.tables,
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
      .index("by_user_id", ["userId"])
      .index("by_status_and_period_end", ["status", "currentPeriodEndAt"]),
    usage: defineTable({
      orgId: v.optional(v.id("organizations")),
      userId: v.optional(v.id("userProfiles")),
      resource: v.string(),
      count: v.number(),
      periodKey: v.union(v.null(), v.string()),
    })
      .index("by_user_id_and_resource", ["userId", "resource"]),
  },
};

function setupMigrationTest() {
  return convexTest(migrationSchema, testModules);
}

async function grantPlatformOwner(t: ReturnType<typeof setupMigrationTest>) {
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
    const t = setupMigrationTest();
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
      const legacySub = {
        orgId: org._id,
        planId: freePlan._id,
        status: "trialing" as const,
        trialEndsAt: null,
        currentPeriodEndAt: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      };
      await ctx.db.insert("subscriptions", legacySub as unknown as Parameters<typeof ctx.db.insert<"subscriptions">>[1]);
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
    const t = setupMigrationTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.run(async (ctx) => {
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", "acme"))
        .unique();
      if (!org) throw new Error("org missing");
      const legacyUsage1 = { orgId: org._id, resource: "events", count: 2, periodKey: null };
      const legacyUsage2 = { orgId: org._id, resource: "members", count: 1, periodKey: null };
      await ctx.db.insert("usage", legacyUsage1 as unknown as Parameters<typeof ctx.db.insert<"usage">>[1]);
      await ctx.db.insert("usage", legacyUsage2 as unknown as Parameters<typeof ctx.db.insert<"usage">>[1]);
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
