import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, prepareScoredEvent, setupTest } from "./setup";

describe("expired event session cleanup", () => {
  it("deletes expired sessions and keeps live ones", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const event = await t.withIdentity(aliceIdentity).query(api.events.get, {
      orgSlug: "acme",
      eventSlug: "gala",
    });
    if (!event) throw new Error("event not found");

    await t.run(async (ctx) => {
      await ctx.db.insert("eventSessions", {
        token: "stale-session-token",
        accountId: ids.judgeIds.bob,
        eventId: event._id,
        expiresAt: Date.now() - 1000,
        lastSeenAt: Date.now() - 2000,
      });
    });

    await t.mutation(internal.crons.cleanupExpiredEventSessions, {});

    const stale = await t.run(async (ctx) =>
      ctx.db
        .query("eventSessions")
        .withIndex("by_token", (q) => q.eq("token", "stale-session-token"))
        .unique(),
    );
    expect(stale).toBeNull();

    const live = await t.run(
      async (ctx) =>
        await ctx.db
          .query("eventSessions")
          .withIndex("by_token", (q) => q.eq("token", ids.judgeSessions.bob))
          .unique(),
    );
    expect(live).not.toBeNull();
  });
});
