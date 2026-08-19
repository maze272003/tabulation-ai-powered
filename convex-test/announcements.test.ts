import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, grantPaidPlan, setupTest } from "./setup";

describe("Platform Announcements & Notification Bell", () => {
  it("queries active announcements and displays in notification bell", async () => {
    const t = setupTest();
    const { orgSlug } = await grantPaidPlan(t, "Starter");

    // Insert an active announcement
    await t.run(async (ctx) => {
      await ctx.db.insert("announcements", {
        title: "Scheduled Maintenance Tonight",
        body: "The platform will undergo maintenance at 11 PM PHT for 30 minutes.",
        isActive: true,
        createdById: null,
        publishedAt: Date.now(),
      });
    });

    // Query active announcements
    const activeAnnouncements = await t.query(api.announcements.listActive, {});
    expect(activeAnnouncements.length).toBe(1);
    expect(activeAnnouncements[0].title).toBe("Scheduled Maintenance Tonight");

    // Query support badge for org
    const badge = await t
      .withIdentity(aliceIdentity)
      .query(api.support.tickets.getOrgSupportBadge, { orgSlug });

    expect(badge.unreadCount).toBe(0);
  });
});
