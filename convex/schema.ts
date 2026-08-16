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
    .index("by_email", ["email"])
    .index("by_platform_role", ["platformRole"]),

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
    eventId: v.union(v.null(), v.id("events")),
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

  events: defineTable({
    orgId: v.id("organizations"),
    slug: v.string(),
    eventCode: v.string(),
    name: v.string(),
    description: v.string(),
    logoUrl: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    venue: v.optional(v.string()),
    timezone: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("ready"), v.literal("finalized"), v.literal("archived")),
    decimalPrecision: v.number(),
    resultVisibility: v.union(v.literal("private"), v.literal("organization"), v.literal("public")),
    scoringRules: v.object({ dropHighLow: v.boolean() }),
    eliminationEnabled: v.boolean(),
    branding: v.object({
      primaryColor: v.optional(v.string()),
      secondaryColor: v.optional(v.string()),
    }),
    templateId: v.optional(v.id("eventTemplates")),
    createdById: v.id("userProfiles"),
  })
    .index("by_org_id_and_slug", ["orgId", "slug"])
    .index("by_org_id_and_status", ["orgId", "status"])
    .index("by_org_id", ["orgId"])
    .index("by_event_code", ["eventCode"]),

  categories: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
  })
    .index("by_event_id", ["eventId"]),

  rounds: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    qualifiesToNextRound: v.boolean(),
    scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
    weight: v.number(),
    status: v.union(v.literal("open"), v.literal("closed"), v.literal("published")),
    advancement: v.object({
      mode: v.union(v.literal("none"), v.literal("top_count"), v.literal("top_percent"), v.literal("manual")),
      count: v.optional(v.number()),
      percent: v.optional(v.number()),
      allowOverride: v.boolean(),
    }),
  })
    .index("by_event_id", ["eventId"]),

  criteria: defineTable({
    roundId: v.id("rounds"),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    weight: v.number(),
    minScore: v.number(),
    maxScore: v.number(),
    decimalPrecision: v.number(),
  })
    .index("by_round_id", ["roundId"]),

  contestants: defineTable({
    eventId: v.id("events"),
    categoryId: v.id("categories"),
    number: v.number(),
    name: v.string(),
    photoUrl: v.optional(v.string()),
    group: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("scratched"), v.literal("disqualified")),
    customFields: v.optional(v.record(v.string(), v.string())),
  })
    .index("by_event_id", ["eventId"])
    .index("by_event_id_and_category_id", ["eventId", "categoryId"])
    .index("by_event_id_and_number", ["eventId", "number"]),

  judges: defineTable({
    orgId: v.id("organizations"),
    eventId: v.id("events"),
    userId: v.id("userProfiles"),
    status: v.union(v.literal("assigned"), v.literal("declined"), v.literal("confirmed")),
  })
    .index("by_event_id", ["eventId"])
    .index("by_event_id_and_user_id", ["eventId", "userId"])
    .index("by_user_id", ["userId"]),

  judgeAssignments: defineTable({
    judgeId: v.id("judges"),
    eventId: v.id("events"),
    roundId: v.optional(v.id("rounds")),
    categoryId: v.optional(v.id("categories")),
    criterionId: v.optional(v.id("criteria")),
  })
    .index("by_judge_id", ["judgeId"])
    .index("by_event_id", ["eventId"]),

  eventAccounts: defineTable({
    orgId: v.id("organizations"),
    eventId: v.id("events"),
    kind: v.union(v.literal("staff"), v.literal("judge")),
    displayName: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled")),
    failedAttempts: v.number(),
    lockedUntil: v.union(v.null(), v.number()),
    createdById: v.id("userProfiles"),
  })
    .index("by_event_id", ["eventId"])
    .index("by_event_id_and_username", ["eventId", "username"])
    .index("by_event_id_and_kind", ["eventId", "kind"]),

  eventSessions: defineTable({
    token: v.string(),
    accountId: v.id("eventAccounts"),
    eventId: v.id("events"),
    expiresAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_account_id", ["accountId"]),

  scoreSheets: defineTable({
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    contestantId: v.id("contestants"),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("submitted"),
      v.literal("locked"),
    ),
    draftValues: v.optional(v.record(v.string(), v.number())),
  })
    .index("by_event_id_and_round_id", ["eventId", "roundId"])
    .index("by_judge_id_and_round_id", ["judgeId", "roundId"])
    .index("by_event_id_and_round_id_and_contestant_id", ["eventId", "roundId", "contestantId"]),

  scores: defineTable({
    sheetId: v.id("scoreSheets"),
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    contestantId: v.id("contestants"),
    criterionId: v.id("criteria"),
    value: v.number(),
    submittedAt: v.number(),
    submittedById: v.id("userProfiles"),
  })
    .index("by_sheet_id", ["sheetId"])
    .index("by_event_id_and_round_id", ["eventId", "roundId"])
    .index("by_event_id_and_round_id_and_contestant_id", ["eventId", "roundId", "contestantId"]),

  resultVersions: defineTable({
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    version: v.number(),
    snapshot: v.object({
      computedAt: v.number(),
      decimalPrecision: v.number(),
      categories: v.array(v.object({
        categoryId: v.id("categories"),
        standings: v.array(v.object({
          contestantId: v.id("contestants"),
          status: v.union(v.literal("active"), v.literal("scratched"), v.literal("disqualified")),
          rank: v.union(v.null(), v.number()),
          roundScore: v.union(v.null(), v.number()),
          criterionScores: v.array(v.object({
            criterionId: v.id("criteria"),
            avgRaw: v.number(),
            contribution: v.number(),
            dropped: v.array(v.object({ judgeId: v.id("judges"), value: v.number() })),
          })),
          tieResolvedBy: v.union(v.literal("none"), v.literal("criteria_cascade"), v.literal("judge_firsts"), v.literal("manual")),
          advanced: v.union(v.null(), v.boolean()),
        })),
      })),
      judgeParticipation: v.array(v.object({
        judgeId: v.id("judges"),
        sheetsSubmitted: v.number(),
        sheetsTotal: v.number(),
      })),
      decisions: v.object({
        tieBreaks: v.array(v.object({
          tiedContestantIds: v.array(v.id("contestants")),
          orderedIds: v.array(v.id("contestants")),
          createdById: v.id("userProfiles"),
        })),
        advancementOverrides: v.array(v.object({
          contestantId: v.id("contestants"),
          action: v.string(),
          createdById: v.id("userProfiles"),
          source: v.optional(v.union(v.literal("persisted"), v.literal("correction"))),
        })),
      }),
    }),
    createdById: v.id("userProfiles"),
    createdAt: v.number(),
    reason: v.optional(v.string()),
  })
    .index("by_round_id", ["roundId"])
    .index("by_event_id", ["eventId"]),

  advancementOverrides: defineTable({
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    contestantId: v.id("contestants"),
    action: v.union(v.literal("force_advance"), v.literal("force_cut")),
    createdById: v.id("userProfiles"),
    createdAt: v.number(),
  })
    .index("by_round_id", ["roundId"])
    .index("by_event_id_and_contestant_id", ["eventId", "contestantId"]),

  tieBreaks: defineTable({
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    tiedContestantIds: v.array(v.id("contestants")),
    orderedIds: v.array(v.id("contestants")),
    createdById: v.id("userProfiles"),
    createdAt: v.number(),
  })
    .index("by_round_id", ["roundId"])
    .index("by_event_id", ["eventId"]),

  eventTemplates: defineTable({
    orgId: v.optional(v.id("organizations")),
    name: v.string(),
    description: v.string(),
    configSnapshot: v.object({
      decimalPrecision: v.number(),
      resultVisibility: v.union(v.literal("private"), v.literal("organization"), v.literal("public")),
      eliminationEnabled: v.optional(v.boolean()),
      scoringRules: v.optional(v.object({ dropHighLow: v.boolean() })),
      categories: v.optional(v.array(v.object({ name: v.string(), order: v.number() }))),
      rounds: v.array(
        v.object({
          name: v.string(),
          order: v.number(),
          qualifiesToNextRound: v.boolean(),
          scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
          weight: v.optional(v.number()),
          advancement: v.optional(v.object({
            mode: v.union(v.literal("none"), v.literal("top_count"), v.literal("top_percent"), v.literal("manual")),
            count: v.optional(v.number()),
            percent: v.optional(v.number()),
            allowOverride: v.boolean(),
          })),
          criteria: v.array(
            v.object({
              name: v.string(),
              order: v.number(),
              weight: v.number(),
              minScore: v.number(),
              maxScore: v.number(),
              decimalPrecision: v.number(),
            }),
          ),
        }),
      ),
    }),
    isSystem: v.boolean(),
  })
    .index("by_org_id", ["orgId"])
    .index("by_name", ["name"]),
});
