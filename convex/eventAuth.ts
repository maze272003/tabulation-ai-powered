import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { appError, ErrorCode } from "./lib/errors";
import { timingSafeDummyVerify, verifyPassword } from "./lib/password";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export const lookupAccountForLogin = internalQuery({
  args: { eventCode: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_event_code", (q) => q.eq("eventCode", args.eventCode.toUpperCase().trim()))
      .unique();
    if (!event || event.status !== "ready") {
      return { status: "no_event" as const };
    }
    const username = args.username.toLowerCase().trim();
    const account = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_username", (q) => q.eq("eventId", event._id).eq("username", username))
      .unique();
    if (!account) {
      return { status: "no_account" as const };
    }
    return {
      status: "found" as const,
      event: { _id: event._id, name: event.name },
      account: {
        _id: account._id,
        kind: account.kind,
        displayName: account.displayName,
        passwordHash: account.passwordHash,
        status: account.status,
        failedAttempts: account.failedAttempts,
        lockedUntil: account.lockedUntil,
      },
    };
  },
});

export const login = action({
  args: { eventCode: v.string(), username: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<{ token: string; kind: string; displayName: string; eventName: string }> => {
    const res = await ctx.runQuery(internal.eventAuth.lookupAccountForLogin, {
      eventCode: args.eventCode,
      username: args.username,
    });
    if (res.status === "no_event") {
      throw appError(ErrorCode.NOT_FOUND, "Event code does not exist or event has ended");
    }
    if (res.status === "no_account") {
      // Burn equivalent PBKDF2 work so unknown usernames are not distinguishable by timing.
      await timingSafeDummyVerify(args.password);
      throw appError(ErrorCode.UNAUTHENTICATED, "Invalid event code or judge credentials");
    }
    const { event, account } = res;
    if (account.status === "disabled") {
      throw appError(ErrorCode.FORBIDDEN, "This account has been disabled.");
    }
    if (account.lockedUntil !== null && account.lockedUntil > Date.now()) {
      throw appError(ErrorCode.FORBIDDEN, "Account locked due to failed attempts. Try again later.");
    }
    if (!(await verifyPassword(args.password, account.passwordHash))) {
      await ctx.runMutation(internal.eventAuth.recordFailedAttempt, { accountId: account._id });
      throw appError(ErrorCode.UNAUTHENTICATED, "Invalid event code or judge credentials");
    }
    if (account.failedAttempts !== 0 || account.lockedUntil !== null) {
      await ctx.runMutation(internal.eventAuth.clearFailureCounters, { accountId: account._id });
    }
    return await ctx.runMutation(internal.eventAuth.createSession, {
      accountId: account._id, eventId: event._id,
    });
  },
});

export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const session = await ctx.db
      .query("eventSessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (session) await ctx.db.delete(session._id);
  },
});

export const sessionInfo = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ kind: string; displayName: string; eventName: string; expiresAt: number } | null> => {
    const session = await ctx.db
      .query("eventSessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (!session || session.expiresAt <= Date.now()) return null;
    const account = await ctx.db.get(session.accountId);
    const event = await ctx.db.get(session.eventId);
    if (!account || account.status !== "active" || !event) return null;
    return { kind: account.kind, displayName: account.displayName, eventName: event.name, expiresAt: session.expiresAt };
  },
});

export const recordFailedAttempt = internalMutation({
  args: { accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return;
    const failedAttempts = account.failedAttempts + 1;
    await ctx.db.patch(args.accountId, {
      failedAttempts,
      lockedUntil: failedAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : account.lockedUntil,
    });
  },
});

export const clearFailureCounters = internalMutation({
  args: { accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.accountId, { failedAttempts: 0, lockedUntil: null });
  },
});

export const createSession = internalMutation({
  args: { accountId: v.id("eventAccounts"), eventId: v.id("events") },
  handler: async (ctx, args): Promise<{ token: string; kind: string; displayName: string; eventName: string }> => {
    const account = await ctx.db.get(args.accountId);
    const event = await ctx.db.get(args.eventId);
    if (!account || !event) throw appError(ErrorCode.NOT_FOUND, "Account or event missing");
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const now = Date.now();
    await ctx.db.insert("eventSessions", {
      token, accountId: args.accountId, eventId: args.eventId,
      expiresAt: now + SESSION_TTL_MS, lastSeenAt: now,
    });
    return { token, kind: account.kind, displayName: account.displayName, eventName: event.name };
  },
});
