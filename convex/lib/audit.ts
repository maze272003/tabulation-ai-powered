import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { serialize } from "./serializers";

type AuditInput = {
  orgId: Id<"organizations"> | null;
  actorId: Id<"userProfiles"> | null;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

export async function writeAudit(ctx: MutationCtx, input: AuditInput): Promise<void> {
  await ctx.db.insert("auditLogs", {
    orgId: input.orgId,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    before: serialize(input.before ?? null),
    after: serialize(input.after ?? null),
    reason: input.reason ?? null,
  });
}
