import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";
import { getUsage } from "./usage";

export async function getSubscription(ctx: QueryCtx, orgId: Id<"organizations">) {
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_org_id", (q) => q.eq("orgId", orgId))
    .unique();
  if (!sub) throw appError(ErrorCode.NOT_FOUND, "Subscription not found");
  return sub;
}

export async function getPlan(ctx: QueryCtx, sub: Doc<"subscriptions">) {
  const plan = await ctx.db.get(sub.planId);
  if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
  return plan;
}

export function hasFeature(plan: { features: Record<string, boolean> }, feature: string): boolean {
  return plan.features[feature] === true;
}

export function hasLimit(plan: { limits: Record<string, number> }, resource: string, current: number): boolean {
  const max = plan.limits[resource];
  return typeof max === "number" && current < max;
}

export async function requireFeature(
  ctx: QueryCtx,
  sub: Doc<"subscriptions">,
  feature: string,
): Promise<void> {
  const plan = await getPlan(ctx, sub);
  if (!hasFeature(plan, feature)) {
    throw appError(ErrorCode.FEATURE_UNAVAILABLE, `Feature unavailable: ${feature}`, { feature });
  }
}

export async function requireLimit(
  ctx: MutationCtx,
  sub: Doc<"subscriptions">,
  resource: string,
): Promise<void> {
  const plan = await getPlan(ctx, sub);
  const current = await getUsage(ctx, sub.orgId, resource);
  if (!hasLimit(plan, resource, current)) {
    const limits: Record<string, number> = plan.limits;
    throw appError(ErrorCode.LIMIT_EXCEEDED, `Limit reached: ${resource}`, {
      resource,
      current,
      max: limits[resource],
    });
  }
}
