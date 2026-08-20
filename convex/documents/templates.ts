import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireOrgMember } from "../lib/authz";

export const list = query({
  args: {
    orgSlug: v.string(),
    kind: v.optional(v.union(v.literal("certificate"), v.literal("results"), v.literal("judgeSheet"))),
  },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    const kind = args.kind ?? "certificate";
    const system = await ctx.db
      .query("documentTemplates")
      .withIndex("by_kind", (q) => q.eq("kind", kind))
      .filter((q) => q.eq(q.field("isSystem"), true))
      .collect();
    const orgTemplates = await ctx.db
      .query("documentTemplates")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("kind"), kind))
      .collect();
    return [...system, ...orgTemplates];
  },
});
