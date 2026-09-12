import type { MutationCtx } from "../_generated/server";
import { appError, ErrorCode } from "./errors";

/**
 * Fixed-window rate limit buckets. Each entry is one counter row per
 * (name, key). Windows reset lazily when the row is read past its expiry.
 *
 * Keys must be server-derived identity fragments (user ids, org ids, event
 * codes) — never raw, attacker-controlled free text, so buckets cannot be
 * multiplied to bypass the limit.
 */
export const RATE_LIMITS = {
  // Judge/staff portal login: per event code + username, and per event code
  // to bound credential stuffing across many usernames.
  eventLogin: { max: 10, windowMs: 5 * 60 * 1000 },
  eventLoginByCode: { max: 60, windowMs: 5 * 60 * 1000 },
  // Superadmin console login (single shared credential set).
  superadminLogin: { max: 10, windowMs: 5 * 60 * 1000 },
  // Org self-provisioning (complements the per-user org count cap).
  orgCreate: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
  // Gemini-backed generation (complements per-org daily quotas).
  aiGenerate: { max: 5, windowMs: 60 * 1000 },
  // Support surfaces.
  supportTicket: { max: 10, windowMs: 60 * 60 * 1000 },
  supportMessage: { max: 30, windowMs: 60 * 60 * 1000 },
  refundTicket: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
  // File-storage upload URL minting.
  uploadUrl: { max: 30, windowMs: 60 * 60 * 1000 },
  // PayMongo checkout status sync (outbound provider API call).
  checkoutSync: { max: 10, windowMs: 60 * 60 * 1000 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export function isRateLimitName(value: string): value is RateLimitName {
  return value in RATE_LIMITS;
}

/**
 * Throws TOO_MANY_REQUESTS when the (name, key) bucket is exhausted;
 * otherwise consumes one slot. Must run inside a mutation so the counter
 * write is transactional — concurrent callers serialize via OCC on the
 * counter row.
 */
export async function enforceRateLimit(
  ctx: MutationCtx,
  name: RateLimitName,
  key: string,
): Promise<void> {
  const { max, windowMs } = RATE_LIMITS[name];
  const now = Date.now();
  const bucket = await ctx.db
    .query("rateLimits")
    .withIndex("by_name_and_key", (q) => q.eq("name", name).eq("key", key))
    .unique();

  if (!bucket || now - bucket.windowStartMs >= windowMs) {
    if (bucket) {
      await ctx.db.patch(bucket._id, { count: 1, windowStartMs: now });
    } else {
      await ctx.db.insert("rateLimits", { name, key, count: 1, windowStartMs: now });
    }
    return;
  }

  if (bucket.count >= max) {
    throw appError(ErrorCode.TOO_MANY_REQUESTS, "Too many requests — please try again later");
  }
  await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
}
