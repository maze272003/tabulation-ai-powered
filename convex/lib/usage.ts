import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function getUsage(
  ctx: QueryCtx,
  userId: Id<"userProfiles">,
  resource: string,
): Promise<number> {
  const row = await ctx.db
    .query("usage")
    .withIndex("by_user_id_and_resource", (q) => q.eq("userId", userId).eq("resource", resource))
    .unique();
  return row?.count ?? 0;
}

export async function incrementUsage(
  ctx: MutationCtx,
  userId: Id<"userProfiles">,
  resource: string,
  delta: number,
): Promise<void> {
  const existing = await ctx.db
    .query("usage")
    .withIndex("by_user_id_and_resource", (q) => q.eq("userId", userId).eq("resource", resource))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { count: Math.max(0, existing.count + delta) });
  } else if (delta > 0) {
    await ctx.db.insert("usage", { userId, resource, count: delta, periodKey: null });
  }
}
