import { query } from "./_generated/server";
import { requireIdentity } from "./lib/auth";

/**
 * Active platform announcements for the app shell banner. Visible to any
 * signed-in user; content is operator-authored, so no per-org scoping.
 */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    const now = Date.now();
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_active_and_published_at", (q) =>
        q.eq("isActive", true).lte("publishedAt", now),
      )
      .order("desc")
      .take(3);
    return announcements.map((announcement) => ({
      _id: announcement._id,
      title: announcement.title,
      body: announcement.body,
      publishedAt: announcement.publishedAt,
    }));
  },
});