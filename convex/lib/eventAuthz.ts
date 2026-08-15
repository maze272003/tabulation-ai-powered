import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";
import { requireOrgMember, type AuthCtx } from "./authz";

export type EventAuthCtx = AuthCtx & { event: Doc<"events"> };

export async function resolveEventBySlug(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string },
): Promise<{ actx: AuthCtx; event: Doc<"events"> }> {
  const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
  const event = await ctx.db
    .query("events")
    .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", actx.org._id).eq("slug", args.eventSlug))
    .unique();
  if (!event) throw appError(ErrorCode.NOT_FOUND, "Event not found");
  return { actx, event };
}

export async function requireEventMember(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string },
): Promise<EventAuthCtx> {
  const { actx, event } = await resolveEventBySlug(ctx, args);
  return { ...actx, event };
}

export async function requireEventPermission(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string; permission: string },
): Promise<EventAuthCtx> {
  const eactx = await requireEventMember(ctx, {
    orgSlug: args.orgSlug,
    eventSlug: args.eventSlug,
  });
  if (!eactx.permissions.has(args.permission)) {
    throw appError(ErrorCode.FORBIDDEN, `Missing permission: ${args.permission}`);
  }
  return eactx;
}

export async function requireDraftEvent(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string; permission: string },
): Promise<EventAuthCtx> {
  const eactx = await requireEventPermission(ctx, args);
  if (eactx.event.status !== "draft") {
    throw appError(ErrorCode.CONFLICT, "Event configuration is locked");
  }
  return eactx;
}
