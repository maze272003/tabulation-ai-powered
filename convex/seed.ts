import { mutation } from "./_generated/server";
import { ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS, SYSTEM_ROLES } from "./lib/constants";

export const seedReferenceData = mutation({
  args: {},
  handler: async (ctx) => {
    for (const p of SYSTEM_PERMISSIONS) {
      const existing = await ctx.db
        .query("permissions")
        .withIndex("by_name", (q) => q.eq("name", p.name))
        .unique();
      if (!existing) {
        await ctx.db.insert("permissions", { ...p });
      }
    }
    for (const r of SYSTEM_ROLES) {
      const existing = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", r.name))
        .unique();
      if (!existing) {
        await ctx.db.insert("roles", {
          name: r.name,
          scope: "organization",
          isSystem: true,
          description: r.description,
        });
      }
    }
    for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
      const role = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", roleName))
        .unique();
      if (!role) continue;
      for (const permName of permNames) {
        const perm = await ctx.db
          .query("permissions")
          .withIndex("by_name", (q) => q.eq("name", permName))
          .unique();
        if (!perm) continue;
        const existing = await ctx.db
          .query("rolePermissions")
          .withIndex("by_role_id", (q) => q.eq("roleId", role._id))
          .filter((q) => q.eq(q.field("permissionId"), perm._id))
          .first();
        if (!existing) {
          await ctx.db.insert("rolePermissions", { roleId: role._id, permissionId: perm._id });
        }
      }
    }
    for (const plan of SYSTEM_PLANS) {
      const existing = await ctx.db
        .query("plans")
        .withIndex("by_name", (q) => q.eq("name", plan.name))
        .unique();
      if (!existing) {
        await ctx.db.insert("plans", { ...plan });
      }
    }
  },
});
