import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireSuperadminSession } from "../lib/superadmin";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    return ctx.db.query("announcements").order("desc").take(200);
  },
});

export const create = mutation({
  args: { token: v.string(), title: v.string(), body: v.string(), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const title = args.title.trim();
    const body = args.body.trim();
    if (!title || !body) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Title and message are required");
    }

    const announcementId = await ctx.db.insert("announcements", {
      title,
      body,
      isActive: args.isActive,
      createdById: null,
      publishedAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "platform.announcement.created",
      resourceType: "announcement",
      resourceId: announcementId,
      before: null,
      after: { title, isActive: args.isActive },
      reason: `superadmin:${session.label}`,
    });
    if (args.isActive) {
      const allUsers = await ctx.db.query("userProfiles").take(100);
      const activeUsers = allUsers.filter((u) => u.status === "active");

      for (const u of activeUsers) {
        await ctx.db.insert("notifications", {
          userId: u._id,
          type: "system",
          title: `Announcement: ${title}`,
          message: body.slice(0, 200),
          link: "",
          isRead: false,
          createdAt: Date.now(),
        });
      }
    }

    return announcementId;
  },
});

export const setActive = mutation({
  args: { token: v.string(), announcementId: v.id("announcements"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) throw appError(ErrorCode.NOT_FOUND, "Announcement not found");
    if (announcement.isActive === args.isActive) {
      throw appError(ErrorCode.CONFLICT, "Announcement is already in that state");
    }

    await ctx.db.patch(announcement._id, { isActive: args.isActive });
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "platform.announcement.toggled",
      resourceType: "announcement",
      resourceId: announcement._id,
      before: { isActive: announcement.isActive },
      after: { isActive: args.isActive },
      reason: `superadmin:${session.label}`,
    });
  },
});

export const remove = mutation({
  args: { token: v.string(), announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) throw appError(ErrorCode.NOT_FOUND, "Announcement not found");

    await ctx.db.delete("announcements", announcement._id);
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "platform.announcement.deleted",
      resourceType: "announcement",
      resourceId: announcement._id,
      before: { title: announcement.title },
      after: null,
      reason: `superadmin:${session.label}`,
    });
  },
});