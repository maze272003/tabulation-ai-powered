import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireSuperadminSession } from "../lib/superadmin";
import { writeAudit } from "../lib/audit";

const DEFAULT_SETTINGS = {
  maintenanceMode: false,
  allowSignups: true,
} as const;

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    const settings = await ctx.db.query("platformSettings").first();
    if (!settings) return { ...DEFAULT_SETTINGS, updatedAt: null };
    return {
      maintenanceMode: settings.maintenanceMode,
      allowSignups: settings.allowSignups,
      updatedAt: settings.updatedAt,
    };
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    maintenanceMode: v.optional(v.boolean()),
    allowSignups: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const existing = await ctx.db.query("platformSettings").first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        maintenanceMode: args.maintenanceMode ?? existing.maintenanceMode,
        allowSignups: args.allowSignups ?? existing.allowSignups,
        updatedById: null,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("platformSettings", {
        maintenanceMode: args.maintenanceMode ?? DEFAULT_SETTINGS.maintenanceMode,
        allowSignups: args.allowSignups ?? DEFAULT_SETTINGS.allowSignups,
        updatedById: null,
        updatedAt: Date.now(),
      });
    }

    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "platform.settings.updated",
      resourceType: "platformSettings",
      resourceId: "platformSettings",
      before: null,
      after: args,
      reason: `superadmin:${session.label}`,
    });
  },
});

export const getPublic = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("platformSettings").first();
    if (!settings) return DEFAULT_SETTINGS;
    return {
      maintenanceMode: settings.maintenanceMode,
      allowSignups: settings.allowSignups,
    };
  },
});