import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requirePermission } from "./lib/authz";

export const listByOrg = query({
  args: { orgSlug: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "audit.view",
    });
    return ctx.db
      .query("auditLogs")
      .withIndex("by_org_id_and_creation_time", (q) => q.eq("orgId", actx.org._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
