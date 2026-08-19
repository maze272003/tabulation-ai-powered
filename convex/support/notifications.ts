import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireUserProfile } from "../lib/auth";

export const notificationTypeValidator = v.union(
  v.literal("ticket_created"),
  v.literal("ticket_reply"),
  v.literal("ticket_status_change"),
  v.literal("refund_approved"),
  v.literal("refund_rejected"),
  v.literal("chat_message"),
  v.literal("system"),
);

export const listMyNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUserProfile(ctx);
    const limit = Math.min(args.limit ?? 20, 50);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);

    return notifications;
  },
});

export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserProfile(ctx);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_and_read", (q) =>
        q.eq("userId", user._id).eq("isRead", false),
      )
      .take(100);

    return unread.length;
  },
});

export const markAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUserProfile(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== user._id) {
      return { success: false };
    }

    await ctx.db.patch(notification._id, { isRead: true });
    return { success: true };
  },
});

export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserProfile(ctx);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_and_read", (q) =>
        q.eq("userId", user._id).eq("isRead", false),
      )
      .take(100);

    for (const item of unread) {
      await ctx.db.patch(item._id, { isRead: true });
    }

    return { count: unread.length };
  },
});

/**
 * Helper to dispatch in-app notifications
 */
export async function createNotification(
  ctx: MutationCtx,
  input: {
    userId: Id<"userProfiles">;
    orgId?: Id<"organizations">;
    type:
      | "ticket_created"
      | "ticket_reply"
      | "ticket_status_change"
      | "refund_approved"
      | "refund_rejected"
      | "chat_message"
      | "system";
    title: string;
    message: string;
    link: string;
  },
) {
  return await ctx.db.insert("notifications", {
    userId: input.userId,
    orgId: input.orgId,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link,
    isRead: false,
    createdAt: Date.now(),
  });
}
