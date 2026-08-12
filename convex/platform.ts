import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requirePlatformOwner } from "./lib/auth";
import { writeAudit } from "./lib/audit";

export const listAllOrgs = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);
    return ctx.db.query("organizations").collect();
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);
    return ctx.db.query("userProfiles").collect();
  },
});

export const setPlatformOwner = mutation({
  args: { userId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const actor = await requirePlatformOwner(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    await ctx.db.patch(args.userId, { platformRole: "platform_owner" });
    await writeAudit(ctx, {
      orgId: null,
      actorId: actor._id,
      action: "platform.user.promoted",
      resourceType: "userProfile",
      resourceId: args.userId,
      before: { platformRole: target.platformRole },
      after: { platformRole: "platform_owner" },
    });
  },
});
