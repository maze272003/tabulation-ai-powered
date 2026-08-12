import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userProfiles: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    image: v.string(),
    platformRole: v.union(v.null(), v.literal("platform_owner")),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("suspended")),
    lastLoginAt: v.number(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  organizations: defineTable({
    slug: v.string(),
    name: v.string(),
    logoUrl: v.optional(v.string()),
    ownerId: v.id("userProfiles"),
    createdById: v.id("userProfiles"),
    status: v.union(v.literal("active"), v.literal("suspended"), v.literal("deleted")),
    branding: v.object({
      primaryColor: v.optional(v.string()),
      secondaryColor: v.optional(v.string()),
    }),
  })
    .index("by_slug", ["slug"]),

  organizationMembers: defineTable({
    userId: v.id("userProfiles"),
    orgId: v.id("organizations"),
    roleId: v.id("roles"),
    status: v.union(v.literal("active"), v.literal("invited"), v.literal("inactive")),
    joinedAt: v.number(),
  })
    .index("by_org_id_and_user_id", ["orgId", "userId"])
    .index("by_user_id", ["userId"])
    .index("by_org_id", ["orgId"]),

  roles: defineTable({
    name: v.string(),
    scope: v.union(v.literal("organization"), v.literal("platform")),
    isSystem: v.boolean(),
    description: v.string(),
  })
    .index("by_scope", ["scope"])
    .index("by_name", ["name"]),

  permissions: defineTable({
    name: v.string(),
    category: v.string(),
    description: v.string(),
  })
    .index("by_name", ["name"]),

  rolePermissions: defineTable({
    roleId: v.id("roles"),
    permissionId: v.id("permissions"),
  })
    .index("by_role_id", ["roleId"])
    .index("by_permission_id", ["permissionId"]),

  invitations: defineTable({
    orgId: v.id("organizations"),
    email: v.string(),
    roleId: v.id("roles"),
    eventId: v.union(v.null(), v.string()), // Phase 2: change to v.id("events") when the events table lands
    token: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("expired"),
      v.literal("revoked"),
    ),
    expiresAt: v.number(),
    createdById: v.id("userProfiles"),
    acceptedById: v.union(v.null(), v.id("userProfiles")),
    acceptedAt: v.union(v.null(), v.number()),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"])
    .index("by_org_id_and_email", ["orgId", "email"]),

  plans: defineTable({
    name: v.string(),
    sortOrder: v.number(),
    features: v.object({
      canCreateEvent: v.boolean(),
      canExportReports: v.boolean(),
      canUseCustomBranding: v.boolean(),
      canUseAuditLogs: v.boolean(),
      canCreateTemplates: v.boolean(),
      canUseAdvancedAnalytics: v.boolean(),
      canUseApi: v.boolean(),
    }),
    limits: v.object({
      maxMembers: v.number(),
      maxEvents: v.number(),
      maxJudges: v.number(),
      maxContestants: v.number(),
    }),
    isSystem: v.boolean(),
  })
    .index("by_name", ["name"]),

  subscriptions: defineTable({
    orgId: v.id("organizations"),
    planId: v.id("plans"),
    status: v.union(
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("expired"),
      v.literal("paused"),
    ),
    trialEndsAt: v.union(v.null(), v.number()),
    currentPeriodEndAt: v.union(v.null(), v.number()),
    cancelAtPeriodEnd: v.boolean(),
    stripeCustomerId: v.union(v.null(), v.string()),
    stripeSubscriptionId: v.union(v.null(), v.string()),
  })
    .index("by_org_id", ["orgId"]),

  usage: defineTable({
    orgId: v.id("organizations"),
    resource: v.string(),
    count: v.number(),
    periodKey: v.union(v.null(), v.string()),
  })
    .index("by_org_id_and_resource", ["orgId", "resource"]),

  auditLogs: defineTable({
    orgId: v.union(v.null(), v.id("organizations")),
    actorId: v.union(v.null(), v.id("userProfiles")),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    before: v.string(),
    after: v.string(),
    reason: v.union(v.null(), v.string()),
  })
    .index("by_org_id_and_creation_time", ["orgId"])
    .index("by_actor", ["actorId"]),
});
