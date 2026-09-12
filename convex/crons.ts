import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Removes superadmin sessions that outlived their TTL. Runs as a bounded
 * batch; sessions that accumulate beyond the batch size are picked up on the
 * next run rather than blocking this transaction.
 */
export const cleanupExpiredSuperadminSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("superadminSessions")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(500);
    for (const session of expired) {
      await ctx.db.delete("superadminSessions", session._id);
    }
  },
});

/**
 * Removes event (judge/staff) sessions past their expiry. Sessions are only
 * invalidated lazily at read time, so without this sweep every judge login
 * leaves an immortal row behind. Bounded batch, same policy as the
 * superadmin session cleanup above.
 */
export const cleanupExpiredEventSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("eventSessions")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(500);
    for (const session of expired) {
      await ctx.db.delete("eventSessions", session._id);
    }
  },
});

/**
 * Purges stale rate-limit counters. Buckets older than 24h can no longer
 * affect any active window (the longest window is 24h), so the rows are dead
 * weight. Bounded batch like the session sweeps above.
 */
export const cleanupStaleRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("rateLimits")
      .withIndex("by_window_start", (q) => q.lt("windowStartMs", cutoff))
      .take(500);
    for (const bucket of stale) {
      await ctx.db.delete(bucket._id);
    }
  },
});

const crons = cronJobs();

crons.interval(
  "cleanup expired superadmin sessions",
  { hours: 24 },
  internal.crons.cleanupExpiredSuperadminSessions,
  {},
);

crons.interval(
  "cleanup expired event sessions",
  { hours: 1 },
  internal.crons.cleanupExpiredEventSessions,
  {},
);

crons.interval(
  "cleanup stale rate limit buckets",
  { hours: 1 },
  internal.crons.cleanupStaleRateLimits,
  {},
);

crons.interval(
  "expire subscriptions and stale checkouts",
  { hours: 24 },
  internal.billing.lifecycle.expireSubscriptions,
  {},
);

export default crons;