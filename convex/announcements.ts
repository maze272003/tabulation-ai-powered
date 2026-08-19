import { query } from "./_generated/server";

/**
 * Active platform announcements for the app shell banner and notification bell.
 * Visible to all users.
 */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_active_and_published_at", (q) => q.eq("isActive", true))
      .order("desc")
      .take(20);

    return announcements.map((announcement) => ({
      _id: announcement._id,
      title: announcement.title,
      body: announcement.body,
      publishedAt: announcement.publishedAt,
    }));
  },
});