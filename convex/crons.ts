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

const crons = cronJobs();

crons.interval(
  "cleanup expired superadmin sessions",
  { hours: 24 },
  internal.crons.cleanupExpiredSuperadminSessions,
  {},
);

crons.interval(
  "expire subscriptions and stale checkouts",
  { hours: 24 },
  internal.billing.lifecycle.expireSubscriptions,
  {},
);

export default crons;