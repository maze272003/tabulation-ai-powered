import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "../_generated/server";
import { requirePlatformOwner } from "../lib/auth";

/**
 * Platform-wide audit trail.
 *
 * - orgId undefined: every entry, globally ordered by time (default index).
 * - orgId null: the platform channel (superadmin and system actions).
 * - orgId set: one organization's trail.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    orgId: v.optional(v.union(v.null(), v.id("organizations"))),
  },
  handler: async (ctx, args) => {
    await requirePlatformOwner(ctx);

    const orgId = args.orgId;
    const base =
      orgId === undefined
        ? ctx.db.query("auditLogs").order("desc")
        : ctx.db
            .query("auditLogs")
            .withIndex("by_org_id_and_creation_time", (q) => q.eq("orgId", orgId))
            .order("desc");
    const result = await base.paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (entry) => {
        const actor = entry.actorId ? await ctx.db.get(entry.actorId) : null;
        return {
          _id: entry._id,
          _creationTime: entry._creationTime,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          orgId: entry.orgId,
          actorName: actor?.name ?? null,
          reason: entry.reason,
        };
      }),
    );
    return { ...result, page };
  },
});
