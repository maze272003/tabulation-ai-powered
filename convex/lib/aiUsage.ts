import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

export const WIZARD_DAILY_LIMIT = 20;
export const EXPLANATION_DAILY_LIMIT = 30;
export const DOCUMENT_DESIGN_DAILY_LIMIT = 20;

export const AI_USAGE_RESOURCES = {
  wizard: "ai_wizard_calls",
  explanations: "ai_explanations",
  documentDesigns: "ai_document_designs",
} as const;

export function todayKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function resolveDailyQuotaCount(
  currentCount: number | null,
  rowPeriodKey: string | null,
  today: string,
  limit: number,
): number {
  if (rowPeriodKey === null || rowPeriodKey !== today) return 1;
  const current = currentCount ?? 0;
  if (current >= limit) {
    throw appError(ErrorCode.LIMIT_EXCEEDED, `Daily AI limit reached (${limit}). Try again tomorrow.`);
  }
  return current + 1;
}

export async function consumeAiQuota(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  resource: string,
  limit: number,
): Promise<void> {
  const today = todayKey();
  const org = await ctx.db.get(orgId);
  const userId = org?.createdById ?? org?.ownerId;
  if (!userId) return;
  const existing = await ctx.db
    .query("usage")
    .withIndex("by_user_id_and_resource", (q) => q.eq("userId", userId).eq("resource", resource))
    .unique();
  const nextCount = resolveDailyQuotaCount(existing?.count ?? null, existing?.periodKey ?? null, today, limit);
  if (existing) {
    await ctx.db.patch(existing._id, { count: nextCount, periodKey: today });
  } else {
    await ctx.db.insert("usage", { userId, resource, count: nextCount, periodKey: today });
  }
}
