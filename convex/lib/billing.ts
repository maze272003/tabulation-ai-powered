import type { Doc } from "../_generated/dataModel";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTHLY_PERIOD_MS = 30 * DAY_MS;
export const YEARLY_PERIOD_MS = 365 * DAY_MS;
export const PAST_DUE_GRACE_MS = 7 * DAY_MS;
export const STALE_PENDING_MS = DAY_MS;

export function periodDurationMs(interval: "monthly" | "yearly"): number {
  return interval === "yearly" ? YEARLY_PERIOD_MS : MONTHLY_PERIOD_MS;
}

type RenewalSubscription = Pick<Doc<"subscriptions">, "status" | "currentPeriodEndAt">;

/**
 * Fixed-duration prepaid periods whose length follows the paid plan's billing
 * interval. A renewal while a period is still running stacks on its end (the
 * customer keeps paid time); otherwise the new period starts now. `past_due`
 * periods have already lapsed, so stacking is a no-op.
 */
export function computeRenewalWindow(
  subscription: RenewalSubscription,
  interval: "monthly" | "yearly",
  now: number,
): { periodStartAt: number; periodEndAt: number } {
  const stackable =
    subscription.status === "active" ||
    subscription.status === "trialing" ||
    subscription.status === "past_due";
  const periodStartAt = stackable
    ? Math.max(now, subscription.currentPeriodEndAt ?? 0)
    : now;
  return { periodStartAt, periodEndAt: periodStartAt + periodDurationMs(interval) };
}

export function randomHex(charCount: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(charCount / 2)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, charCount);
}
