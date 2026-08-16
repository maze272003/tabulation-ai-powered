/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { setupTest, aliceIdentity, bobIdentity, prepareScoredEvent, createOrgAndEvent } from "./setup";

describe("database reset & cleanup", () => {
  it("getDatabaseStats returns counts across all tables", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);

    const stats = await t.query(api.reset.getDatabaseStats, {});
    expect(stats.totalDocuments).toBeGreaterThan(0);
    expect(stats.tableCounts.events).toBe(1);
    expect(stats.tableCounts.userProfiles).toBe(1);
    expect(stats.tableCounts.rounds).toBe(1);
    expect(stats.tableCounts.criteria).toBe(2);
    expect(stats.tableCounts.contestants).toBe(2);
    expect(stats.tableCounts.eventAccounts).toBe(2);
  });

  it("resetAll requires valid confirmation string", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });

    await expect(
      t.mutation(api.reset.resetAll, {
        confirmation: "wrong_confirmation",
      }),
    ).rejects.toThrow(/confirmation: "CONFIRM_RESET_ALL"/);
  });

  it("resetAll wipes all data and reseeds system reference data by default", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });

    const beforeStats = await t.query(api.reset.getDatabaseStats, {});
    expect(beforeStats.tableCounts.events).toBe(1);
    expect(beforeStats.tableCounts.organizations).toBe(1);

    const res = await t.mutation(api.reset.resetAll, {
      confirmation: "CONFIRM_RESET_ALL",
      reseed: true,
    });

    expect(res.success).toBe(true);
    expect(res.reseeded).toBe(true);
    expect(res.totalDeleted).toBeGreaterThan(0);

    const afterStats = await t.query(api.reset.getDatabaseStats, {});
    // Events, organizations, users are completely wiped
    expect(afterStats.tableCounts.events).toBe(0);
    expect(afterStats.tableCounts.organizations).toBe(0);
    expect(afterStats.tableCounts.userProfiles).toBe(0);

    // System reference tables are re-seeded
    expect(afterStats.tableCounts.roles).toBeGreaterThan(0);
    expect(afterStats.tableCounts.permissions).toBeGreaterThan(0);
    expect(afterStats.tableCounts.plans).toBeGreaterThan(0);
    expect(afterStats.tableCounts.eventTemplates).toBe(3); // 3 system templates
  });

  it("resetAll can preserve user profiles when preserveUsers is true", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });

    const res = await t.mutation(api.reset.resetAll, {
      confirmation: "CONFIRM_RESET_ALL",
      preserveUsers: true,
      reseed: false,
    });

    expect(res.success).toBe(true);
    expect(res.preserveUsers).toBe(true);

    const afterStats = await t.query(api.reset.getDatabaseStats, {});
    expect(afterStats.tableCounts.userProfiles).toBe(1);
    expect(afterStats.tableCounts.events).toBe(0);
    expect(afterStats.tableCounts.organizations).toBe(0);
  });

  it("resetEvents requires valid confirmation string", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });

    await expect(
      t.mutation(api.reset.resetEvents, {
        confirmation: "wrong_confirmation",
      }),
    ).rejects.toThrow(/confirmation: "CONFIRM_RESET_EVENTS"/);
  });

  it("resetEvents wipes event & scoring tables while retaining orgs, users, and plans", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);

    const res = await t.mutation(api.reset.resetEvents, {
      confirmation: "CONFIRM_RESET_EVENTS",
    });

    expect(res.success).toBe(true);
    expect(res.totalDeleted).toBeGreaterThan(0);

    const afterStats = await t.query(api.reset.getDatabaseStats, {});
    // Event domain tables are cleared
    expect(afterStats.tableCounts.events).toBe(0);
    expect(afterStats.tableCounts.rounds).toBe(0);
    expect(afterStats.tableCounts.criteria).toBe(0);
    expect(afterStats.tableCounts.contestants).toBe(0);
    expect(afterStats.tableCounts.scoreSheets).toBe(0);
    expect(afterStats.tableCounts.eventAccounts).toBe(0);
    expect(afterStats.tableCounts.eventSessions).toBe(0);

    // Orgs, users, plans remain intact
    expect(afterStats.tableCounts.organizations).toBe(1);
    expect(afterStats.tableCounts.userProfiles).toBe(1);
    expect(afterStats.tableCounts.plans).toBeGreaterThan(0);
  });

  it("resetEvents with orgSlug deletes only events for the specified organization", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "org-one", eventSlug: "event-one" });
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, {
      name: "Org Two",
      slug: "org-two",
    });
    await t.withIdentity(aliceIdentity).mutation(api.events.create, {
      orgSlug: "org-two",
      name: "Event Two",
      slug: "event-two",
    });

    const before = await t.query(api.reset.getDatabaseStats, {});
    expect(before.tableCounts.events).toBe(2);

    const res = await t.mutation(api.reset.resetEvents, {
      confirmation: "CONFIRM_RESET_EVENTS",
      orgSlug: "org-one",
    });

    expect(res.success).toBe(true);
    expect(res.orgSlug).toBe("org-one");

    const after = await t.query(api.reset.getDatabaseStats, {});
    expect(after.tableCounts.events).toBe(1);

    // Ensure event in org-two is untouched
    const orgTwoEvent = await t.withIdentity(aliceIdentity).query(api.events.get, {
      orgSlug: "org-two",
      eventSlug: "event-two",
    });
    expect(orgTwoEvent).not.toBeNull();
  });

  it("resetSingleEvent deletes only the targeted event and frees usage limit", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "event-alpha" });

    const before = await t.query(api.reset.getDatabaseStats, {});
    expect(before.tableCounts.events).toBe(1);

    const res = await t.mutation(api.reset.resetSingleEvent, {
      orgSlug: "acme",
      eventSlug: "event-alpha",
      confirmation: "CONFIRM_RESET_EVENT",
    });

    expect(res.success).toBe(true);
    expect(res.eventSlug).toBe("event-alpha");

    const after = await t.query(api.reset.getDatabaseStats, {});
    expect(after.tableCounts.events).toBe(0);

    // Verify usage was freed and a new event can now be created in the same org
    await t.withIdentity(aliceIdentity).mutation(api.events.create, {
      orgSlug: "acme",
      name: "Event Beta",
      slug: "event-beta",
    });

    const finalStats = await t.query(api.reset.getDatabaseStats, {});
    expect(finalStats.tableCounts.events).toBe(1);

    const createdEvent = await t.withIdentity(aliceIdentity).query(api.events.get, {
      orgSlug: "acme",
      eventSlug: "event-beta",
    });
    expect(createdEvent?.name).toBe("Event Beta");
  });

  it("rejects non-platform_owner when authenticated caller attempts reset", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, bobIdentity, { orgSlug: "bob-org", eventSlug: "bob-event" });

    // Bob is a regular user (not platform_owner)
    await expect(
      t.withIdentity(bobIdentity).mutation(api.reset.resetAll, {
        confirmation: "CONFIRM_RESET_ALL",
      }),
    ).rejects.toThrow(/Only platform owners/);
  });
});
