import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

export function resolveSuperadminCredentials(): {
  username: string;
  password: string;
} {
  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!username || !password) {
    throw appError(
      ErrorCode.FEATURE_UNAVAILABLE,
      "Superadmin credentials are not configured",
    );
  }

  return {
    username,
    password,
  };
}

export const SUPERADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateSuperadminToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  let token = "";

  for (const byte of bytes) {
    token += byte.toString(16).padStart(2, "0");
  }

  return token;
}

export async function requireSuperadminSession(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"superadminSessions">> {
  if (!token) {
    throw appError(
      ErrorCode.UNAUTHENTICATED,
      "Superadmin session required",
    );
  }

  const session = await ctx.db
    .query("superadminSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!session || session.expiresAt <= Date.now()) {
    throw appError(
      ErrorCode.UNAUTHENTICATED,
      "Session expired — sign in again",
    );
  }

  return session;
}

export function requireReason(reason: string): string {
  const trimmed = reason.trim();

  if (!trimmed) {
    throw appError(
      ErrorCode.VALIDATION_ERROR,
      "A reason is required for this action",
    );
  }

  return trimmed;
}