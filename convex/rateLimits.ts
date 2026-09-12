import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { enforceRateLimit, isRateLimitName } from "./lib/rateLimit";

/**
 * Rate-limit gate for actions. Actions cannot write directly, so they route
 * the counter update through this internal mutation, which rejects the call
 * by throwing when the bucket is exhausted.
 */
export const check = internalMutation({
  args: { name: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    if (!isRateLimitName(args.name)) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Unknown rate limit: ${args.name}`);
    }
    if (!args.key || args.key.length > 256) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Rate limit key must be 1-256 characters");
    }
    await enforceRateLimit(ctx, args.name, args.key);
  },
});
