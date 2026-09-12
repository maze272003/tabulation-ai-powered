import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";
import { requireUserProfile } from "./auth";

type SubscriptionStatus = Doc<"subscriptions">["status"];

const STATUS_RANK: Record<SubscriptionStatus, number> = {
  active: 5,
  trialing: 4,
  past_due: 3,
  paused: 2,
  canceled: 1,
  expired: 0,
};

type RankableSubscription = Pick<Doc<"subscriptions">, "status" | "currentPeriodEndAt">;

export function subscriptionRank(sub: RankableSubscription): number {
  return STATUS_RANK[sub.status] * 1e13 + (sub.currentPeriodEndAt ?? 0);
}

export function pickWinningSubscription<T extends RankableSubscription>(candidates: T[]): T {
  if (candidates.length === 0) {
    throw new Error("pickWinningSubscription requires at least one candidate");
  }
  return candidates.reduce((best, candidate) =>
    subscriptionRank(candidate) > subscriptionRank(best) ? candidate : best,
  );
}

export async function requireSubscriptionOwner(ctx: QueryCtx): Promise<{
  user: Doc<"userProfiles">;
  subscription: Doc<"subscriptions">;
  subscriberId: Id<"userProfiles">;
}> {
  const user = await requireUserProfile(ctx);
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .unique();
  if (!subscription) throw appError(ErrorCode.FORBIDDEN, "No subscription");
  return { user, subscription, subscriberId: user._id };
}
