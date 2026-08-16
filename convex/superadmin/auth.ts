import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { appError, ErrorCode } from "../lib/errors";
import {
  generateSuperadminToken,
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
    const credentials = resolveSuperadminCredentials();
    if (
      !credentialsMatch(args.username, credentials.username) ||
      !credentialsMatch(args.password, credentials.password)
    ) {
      throw appError(ErrorCode.FORBIDDEN, "Invalid superadmin credentials");
    }

    const token = generateSuperadminToken();
    const now = Date.now();
    await ctx.db.insert("superadminSessions", {
      token,
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
    const session = await ctx.db
      .query("superadminSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (session) {
      await ctx.db.delete("superadminSessions", session._id);
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