import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function getUsage(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  resource: string,
): Promise<number> {
  const row = await ctx.db
    .query("usage")
    .withIndex("by_org_id_and_resource", (q) => q.eq("orgId", orgId).eq("resource", resource))
    .unique();
  return row?.count ?? 0;
}

export async function incrementUsage(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  resource: string,
  delta: number,
): Promise<void> {
  const existing = await ctx.db
    .query("usage")
    .withIndex("by_org_id_and_resource", (q) => q.eq("orgId", orgId).eq("resource", resource))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { count: Math.max(0, existing.count + delta) });
  } else if (delta > 0) {
    await ctx.db.insert("usage", { orgId, resource, count: delta, periodKey: null });
  }
}
