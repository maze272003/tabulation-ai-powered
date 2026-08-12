import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

export async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError(ErrorCode.UNAUTHENTICATED, "Sign in required");
  return identity;
}

export async function requireUserProfile(ctx: QueryCtx): Promise<Doc<"userProfiles">> {
  const identity = await requireIdentity(ctx);
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!profile) throw appError(ErrorCode.PROFILE_NOT_PROVISIONED, "Profile not provisioned");
  if (profile.status !== "active") throw appError(ErrorCode.FORBIDDEN, "Account not active");
  return profile;
}

export async function requirePlatformOwner(ctx: QueryCtx): Promise<Doc<"userProfiles">> {
  const profile = await requireUserProfile(ctx);
  if (profile.platformRole !== "platform_owner") {
    throw appError(ErrorCode.FORBIDDEN, "Platform owner only");
  }
  return profile;
}
