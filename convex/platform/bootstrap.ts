import type { MutationCtx } from "../_generated/server";
import { env } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { writeAudit } from "../lib/audit";

/**
 * Promote the profile whose email matches PLATFORM_OWNER_EMAIL when the
 * deployment has no platform owner yet. This makes the first superadmin
 * self-serviceable without manual database access. Idempotent: once any
 * platform owner exists, the bootstrap never runs again.
 */
export async function maybeBootstrapPlatformOwner(
  ctx: MutationCtx,
  profile: Pick<Doc<"userProfiles">, "_id" | "email" | "platformRole">,
): Promise<void> {
  const configuredEmail = env.PLATFORM_OWNER_EMAIL;
  if (!configuredEmail || profile.platformRole === "platform_owner") {
    return;
  }
  if (profile.email.toLowerCase() !== configuredEmail.toLowerCase()) {
    return;
  }

  const anyOwner = await ctx.db
    .query("userProfiles")
    .withIndex("by_platform_role", (q) => q.eq("platformRole", "platform_owner"))
    .first();
  if (anyOwner) {
    return;
  }

  await ctx.db.patch(profile._id, { platformRole: "platform_owner" });
  await writeAudit(ctx, {
    orgId: null,
    actorId: null,
    action: "platform.user.bootstrapped",
    resourceType: "userProfile",
    resourceId: profile._id,
    before: { platformRole: null },
    after: { platformRole: "platform_owner" },
    reason: "PLATFORM_OWNER_EMAIL bootstrap",
  });
}
