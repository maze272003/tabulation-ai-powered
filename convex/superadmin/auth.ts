import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { appError, ErrorCode } from "../lib/errors";
import {
  generateSuperadminToken,
  hashSuperadminToken,
  requireSuperadminSession,
  resolveSuperadminCredentials,
  SUPERADMIN_SESSION_TTL_MS,
} from "../lib/superadmin";

function credentialsMatch(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) {
    mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export const login = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    // Single shared credential set, so one fixed-window bucket is enough.
    // This trades a theoretical lockout of the console login for brute-force
    // resistance — the password should also be strong and env-managed.
    await ctx.runMutation(internal.rateLimits.check, {
      name: "superadminLogin",
      key: "global",
    });

    const credentials = resolveSuperadminCredentials();
    if (
      !credentialsMatch(args.username, credentials.username) ||
      !credentialsMatch(args.password, credentials.password)
    ) {
      throw appError(ErrorCode.FORBIDDEN, "Invalid superadmin credentials");
    }

    const token = generateSuperadminToken();
    const tokenHash = await hashSuperadminToken(token);
    const now = Date.now();
    await ctx.db.insert("superadminSessions", {
      tokenHash,
      label: credentials.username,
      expiresAt: now + SUPERADMIN_SESSION_TTL_MS,
      lastSeenAt: now,
    });
    return { token, expiresAt: now + SUPERADMIN_SESSION_TTL_MS, label: credentials.username };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await hashSuperadminToken(args.token);
    const session = await ctx.db
      .query("superadminSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    return {
      label: session.label,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
    };
  },
});

/**
 * Auth gate for superadmin actions. Actions cannot call requireSuperadminSession
 * directly (no db handle), so they assert the session through this internal
 * query before performing privileged work. Data-loading queries must still
 * re-check as defense in depth.
 */
export const assertSession = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
  },
});
