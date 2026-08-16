import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventPermission } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";
import { hashPassword, MIN_PASSWORD_LENGTH, USERNAME_PATTERN } from "./lib/password";

const AUTO_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const AUTO_PASSWORD_LENGTH = 10;

function generateAutoPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(AUTO_PASSWORD_LENGTH));
  return Array.from(bytes, (b) => AUTO_PASSWORD_ALPHABET[b % AUTO_PASSWORD_ALPHABET.length]).join("");
}

async function nextAutoUsername(ctx: QueryCtx, kind: "staff" | "judge", eventId: Id<"events">): Promise<string> {
  const existing = await ctx.db
    .query("eventAccounts")
    .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eventId).eq("kind", kind))
    .collect();
  const taken = new Set(existing.map((a) => a.username));
  let n = existing.length + 1;
  while (taken.has(`${kind}${n}`)) n++;
  return `${kind}${n}`;
}

async function revokeSessions(ctx: MutationCtx, accountId: Id<"eventAccounts">): Promise<void> {
  const sessions = await ctx.db
    .query("eventSessions")
    .withIndex("by_account_id", (q) => q.eq("accountId", accountId))
    .collect();
  for (const s of sessions) await ctx.db.delete(s._id);
}

export const create = action({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    kind: v.union(v.literal("staff"), v.literal("judge")),
    displayName: v.string(),
    username: v.optional(v.string()),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ accountId: Id<"eventAccounts">; username: string; password: string }> => {
    const username = args.username?.toLowerCase().trim();
    if (username !== undefined && !USERNAME_PATTERN.test(username)) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Username must be 3-32 chars: a-z, 0-9, dot, dash, underscore");
    }
    if (args.password !== undefined && args.password.length < MIN_PASSWORD_LENGTH) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const password = args.password ?? generateAutoPassword();
    const passwordHash = await hashPassword(password);
    return await ctx.runMutation(internal.accounts.createAccount, {
      orgSlug: args.orgSlug,
      eventSlug: args.eventSlug,
      kind: args.kind,
      displayName: args.displayName,
      username,
      password,
      passwordHash,
    });
  },
});

export const createAccount = internalMutation({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    kind: v.union(v.literal("staff"), v.literal("judge")),
    displayName: v.string(),
    username: v.optional(v.string()),
    password: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args): Promise<{ accountId: Id<"eventAccounts">; username: string; password: string }> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    if (!args.displayName.trim()) throw appError(ErrorCode.VALIDATION_ERROR, "Display name is required");
    if (args.kind === "judge" && eactx.event.status !== "draft") {
      throw appError(ErrorCode.CONFLICT, "Judges can only be added while the event is a draft");
    }
    if (args.kind === "staff" && eactx.event.status !== "draft" && eactx.event.status !== "ready") {
      throw appError(ErrorCode.CONFLICT, "Staff can only be added before the event is finalized");
    }
    await requireLimit(ctx, eactx.subscription, "judges");
    const resolvedUsername = args.username ?? (await nextAutoUsername(ctx, args.kind, eactx.event._id));
    const dup = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_username", (q) => q.eq("eventId", eactx.event._id).eq("username", resolvedUsername))
      .unique();
    if (dup) throw appError(ErrorCode.CONFLICT, "Username already taken for this event");
    const accountId = await ctx.db.insert("eventAccounts", {
      orgId: eactx.org._id,
      eventId: eactx.event._id,
      kind: args.kind,
      displayName: args.displayName.trim(),
      username: resolvedUsername,
      passwordHash: args.passwordHash,
      status: "active",
      failedAttempts: 0,
      lockedUntil: null,
      createdById: eactx.user._id,
    });
    await incrementUsage(ctx, eactx.org._id, "judges", 1);
    await writeAudit(ctx, {
      orgId: eactx.org._id,
      actorId: eactx.user._id,
      action: "eventAccount.created",
      resourceType: "eventAccount",
      resourceId: accountId,
      after: { kind: args.kind, username: resolvedUsername },
    });
    return { accountId, username: resolvedUsername, password: args.password };
  },
});

export const list = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const accounts = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    // NOTE: judgeAssignments enrichment is added in Task 6, after judgeAssignments.judgeId
    // is flipped to Id<"eventAccounts">.
    return accounts.map((a) => ({
      _id: a._id,
      kind: a.kind,
      displayName: a.displayName,
      username: a.username,
      status: a.status,
      lockedUntil: a.lockedUntil,
    }));
  },
});

export const resetPassword = action({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    accountId: v.id("eventAccounts"),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ password: string }> => {
    if (args.password !== undefined && args.password.length < MIN_PASSWORD_LENGTH) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const password = args.password ?? generateAutoPassword();
    const passwordHash = await hashPassword(password);
    await ctx.runMutation(internal.accounts.resetPasswordInternal, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, accountId: args.accountId, passwordHash,
    });
    return { password };
  },
});

export const resetPasswordInternal = internalMutation({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    accountId: v.id("eventAccounts"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.eventId !== eactx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Account not found");
    }
    await ctx.db.patch(args.accountId, { passwordHash: args.passwordHash, failedAttempts: 0, lockedUntil: null });
    await revokeSessions(ctx, args.accountId);
    await writeAudit(ctx, {
      orgId: eactx.org._id,
      actorId: eactx.user._id,
      action: "eventAccount.passwordReset",
      resourceType: "eventAccount",
      resourceId: args.accountId,
    });
  },
});

export const disable = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Account not found");
    await ctx.db.patch(args.accountId, { status: "disabled" });
    await revokeSessions(ctx, args.accountId);
    await writeAudit(ctx, {
      orgId: eactx.org._id,
      actorId: eactx.user._id,
      action: "eventAccount.disabled",
      resourceType: "eventAccount",
      resourceId: args.accountId,
    });
  },
});

export const enable = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Account not found");
    await ctx.db.patch(args.accountId, { status: "active", failedAttempts: 0, lockedUntil: null });
    await writeAudit(ctx, {
      orgId: eactx.org._id,
      actorId: eactx.user._id,
      action: "eventAccount.enabled",
      resourceType: "eventAccount",
      resourceId: args.accountId,
    });
  },
});

export const deleteAccount = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Account not found");
    // NOTE: the scoreSheets guard is added in Task 6, after scoreSheets.judgeId
    // is flipped to Id<"eventAccounts">.
    const assignments = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_judge_id", (q) => q.eq("judgeId", args.accountId as unknown as Id<"judges">))
      .collect();
    for (const a of assignments) await ctx.db.delete(a._id);
    await revokeSessions(ctx, args.accountId);
    await ctx.db.delete(args.accountId);
    await incrementUsage(ctx, eactx.org._id, "judges", -1);
    await writeAudit(ctx, {
      orgId: eactx.org._id,
      actorId: eactx.user._id,
      action: "eventAccount.deleted",
      resourceType: "eventAccount",
      resourceId: args.accountId,
      before: { username: account.username, kind: account.kind },
    });
  },
});
