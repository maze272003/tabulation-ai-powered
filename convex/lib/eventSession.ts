import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

export type EventSessionCtx = {
  account: Doc<"eventAccounts">;
  event: Doc<"events">;
  session: Doc<"eventSessions">;
};

export async function requireEventSession(
  ctx: QueryCtx,
  args: { sessionToken: string; kind?: "staff" | "judge"; requireReadyEvent?: boolean },
): Promise<EventSessionCtx> {
  const session = await ctx.db
    .query("eventSessions")
    .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
    .unique();
  if (!session || session.expiresAt <= Date.now()) {
    throw appError(ErrorCode.UNAUTHENTICATED, "Session expired — sign in again");
  }
  const account = await ctx.db.get(session.accountId);
  if (!account || account.status !== "active") {
    throw appError(ErrorCode.FORBIDDEN, "This account has been disabled.");
  }
  if (args.kind && account.kind !== args.kind) {
    throw appError(ErrorCode.FORBIDDEN, "Not allowed for this account type");
  }
  const event = await ctx.db.get(session.eventId);
  if (!event) throw appError(ErrorCode.NOT_FOUND, "Event not found");
  if (args.requireReadyEvent && event.status !== "ready") {
    throw appError(ErrorCode.CONFLICT, "Event is not in scoring state");
  }
  return { account, event, session };
}

export async function touchSession(ctx: MutationCtx, sessionId: Doc<"eventSessions">["_id"]): Promise<void> {
  await ctx.db.patch(sessionId, { lastSeenAt: Date.now() });
}
