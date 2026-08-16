import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { TableNames, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { seedReferenceDataInternal } from "./seed";
import { writeAudit } from "./lib/audit";
import { incrementUsage } from "./lib/usage";

/**
 * All application table names in cascade-safe deletion order.
 */
const ALL_TABLES: readonly TableNames[] = [
  "scores",
  "scoreSheets",
  "resultVersions",
  "advancementOverrides",
  "tieBreaks",
  "judgeAssignments",
  "eventSessions",
  "eventAccounts",
  "contestants",
  "criteria",
  "rounds",
  "categories",
  "events",
  "eventTemplates",
  "usage",
  "auditLogs",
  "subscriptions",
  "organizationMembers",
  "organizations",
  "rolePermissions",
  "permissions",
  "roles",
  "plans",
  "userProfiles",
] as const;

/**
 * Tables that belong specifically to events and scoring.
 */
const EVENT_TABLES: readonly TableNames[] = [
  "scores",
  "scoreSheets",
  "resultVersions",
  "advancementOverrides",
  "tieBreaks",
  "judgeAssignments",
  "eventSessions",
  "eventAccounts",
  "contestants",
  "criteria",
  "rounds",
  "categories",
  "events",
] as const;

/**
 * Verifies that the caller is authorized:
 * - If called via client session, requires platform_owner role.
 * - If called via CLI (`npx convex run`), identity is null and confirmation string protects execution.
 */
async function assertResetAuthorized(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!profile || profile.platformRole !== "platform_owner") {
      throw appError(ErrorCode.FORBIDDEN, "Only platform owners can execute database reset operations");
    }
    return profile;
  }
  return null;
}

/**
 * Helper to delete all documents in a specific table and return the count.
 */
async function clearTable(ctx: MutationCtx, tableName: TableNames): Promise<number> {
  const docs = await ctx.db.query(tableName).collect();
  for (const doc of docs) {
    await ctx.db.delete(doc._id);
  }
  return docs.length;
}

/**
 * Inspect live document counts across all database tables.
 */
export const getDatabaseStats = query({
  args: {},
  handler: async (ctx) => {
    await assertResetAuthorized(ctx);

    const tableCounts: Record<string, number> = {};
    let totalDocuments = 0;

    for (const table of ALL_TABLES) {
      const docs = await ctx.db.query(table).collect();
      tableCounts[table] = docs.length;
      totalDocuments += docs.length;
    }

    return {
      tableCounts,
      totalDocuments,
      timestamp: Date.now(),
    };
  },
});

/**
 * Fully reset / wipe database tables.
 *
 * Example CLI usage:
 * npx convex run reset:resetAll '{"confirmation": "CONFIRM_RESET_ALL", "reseed": true}'
 */
export const resetAll = mutation({
  args: {
    confirmation: v.string(),
    reseed: v.optional(v.boolean()),
    preserveUsers: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.confirmation !== "CONFIRM_RESET_ALL") {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        'Database reset aborted: You must provide confirmation: "CONFIRM_RESET_ALL"',
      );
    }

    const caller = await assertResetAuthorized(ctx);
    const deletedCounts: Record<string, number> = {};
    let totalDeleted = 0;

    const preserveUsers = args.preserveUsers ?? false;
    const shouldReseed = args.reseed ?? true;

    for (const table of ALL_TABLES) {
      if (table === "userProfiles" && preserveUsers) {
        deletedCounts[table] = 0;
        continue;
      }

      const count = await clearTable(ctx, table);
      deletedCounts[table] = count;
      totalDeleted += count;
    }

    if (shouldReseed) {
      await seedReferenceDataInternal(ctx);
    }

    if (caller && preserveUsers) {
      await writeAudit(ctx, {
        orgId: null,
        actorId: caller._id,
        action: "platform.database.reset_all",
        resourceType: "database",
        resourceId: "global",
        before: { totalDocuments: totalDeleted },
        after: { reseeded: shouldReseed, preserveUsers },
        reason: "Manual database reset executed",
      });
    }

    return {
      success: true,
      deletedCounts,
      totalDeleted,
      reseeded: shouldReseed,
      preserveUsers,
      message: `Successfully reset database. Deleted ${totalDeleted} documents across ${ALL_TABLES.length} tables.${shouldReseed ? " System reference data re-seeded." : ""}`,
    };
  },
});

/**
 * Reset and cleanup all event and scoring data while preserving users,
 * organizations, subscriptions, and system reference data.
 *
 * Example CLI usage:
 * npx convex run reset:resetEvents '{"confirmation": "CONFIRM_RESET_EVENTS"}'
 */
export const resetEvents = mutation({
  args: {
    confirmation: v.string(),
    orgSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.confirmation !== "CONFIRM_RESET_EVENTS") {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        'Event reset aborted: You must provide confirmation: "CONFIRM_RESET_EVENTS"',
      );
    }

    const caller = await assertResetAuthorized(ctx);
    const deletedCounts: Record<string, number> = {};
    let totalDeleted = 0;

    if (args.orgSlug) {
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug!))
        .unique();

      if (!org) {
        throw appError(ErrorCode.NOT_FOUND, `Organization not found: ${args.orgSlug}`);
      }

      const events = await ctx.db
        .query("events")
        .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
        .collect();

      for (const event of events) {
        const counts = await deleteEventCascade(ctx, event._id);
        for (const [key, val] of Object.entries(counts)) {
          deletedCounts[key] = (deletedCounts[key] ?? 0) + val;
          totalDeleted += val;
        }
      }

      // Reset event-related usage counter for this org
      const eventUsage = await ctx.db
        .query("usage")
        .withIndex("by_org_id_and_resource", (q) => q.eq("orgId", org._id).eq("resource", "events"))
        .unique();
      if (eventUsage) {
        await ctx.db.patch(eventUsage._id, { count: 0 });
      }
      const judgeUsage = await ctx.db
        .query("usage")
        .withIndex("by_org_id_and_resource", (q) => q.eq("orgId", org._id).eq("resource", "judges"))
        .unique();
      if (judgeUsage) {
        await ctx.db.patch(judgeUsage._id, { count: 0 });
      }
      const contestantUsage = await ctx.db
        .query("usage")
        .withIndex("by_org_id_and_resource", (q) => q.eq("orgId", org._id).eq("resource", "contestants"))
        .unique();
      if (contestantUsage) {
        await ctx.db.patch(contestantUsage._id, { count: 0 });
      }

      // Remove non-system event templates for this org
      const customTemplates = await ctx.db
        .query("eventTemplates")
        .withIndex("by_org_id", (q) => q.eq("orgId", org._id))
        .collect();
      for (const tpl of customTemplates) {
        if (!tpl.isSystem) {
          await ctx.db.delete(tpl._id);
          deletedCounts.eventTemplates = (deletedCounts.eventTemplates ?? 0) + 1;
          totalDeleted++;
        }
      }

      if (caller) {
        await writeAudit(ctx, {
          orgId: org._id,
          actorId: caller._id,
          action: "platform.database.reset_events",
          resourceType: "organization",
          resourceId: org._id,
          before: { totalDeleted },
          after: { orgSlug: args.orgSlug },
          reason: `Reset events for organization ${args.orgSlug}`,
        });
      }

      return {
        success: true,
        orgSlug: args.orgSlug,
        deletedCounts,
        totalDeleted,
        message: `Successfully cleaned up ${totalDeleted} event records for organization "${args.orgSlug}".`,
      };
    }

    // Reset across all orgs
    for (const table of EVENT_TABLES) {
      const count = await clearTable(ctx, table);
      deletedCounts[table] = count;
      totalDeleted += count;
    }

    // Clean up non-system event templates
    const customTemplates = await ctx.db.query("eventTemplates").collect();
    let templatesDeleted = 0;
    for (const tpl of customTemplates) {
      if (!tpl.isSystem) {
        await ctx.db.delete(tpl._id);
        templatesDeleted++;
      }
    }
    deletedCounts.eventTemplates = templatesDeleted;
    totalDeleted += templatesDeleted;

    // Reset event usage counters
    const usageRecords = await ctx.db.query("usage").collect();
    for (const u of usageRecords) {
      if (u.resource === "events" || u.resource === "judges" || u.resource === "contestants") {
        await ctx.db.patch(u._id, { count: 0 });
      }
    }

    if (caller) {
      await writeAudit(ctx, {
        orgId: null,
        actorId: caller._id,
        action: "platform.database.reset_events",
        resourceType: "database",
        resourceId: "events_all",
        before: { totalDeleted },
        after: {},
        reason: "Reset all events across platform",
      });
    }

    return {
      success: true,
      deletedCounts,
      totalDeleted,
      message: `Successfully cleaned up all ${totalDeleted} event and scoring records across the database.`,
    };
  },
});

/**
 * Delete a single event and all associated scoring/structure records.
 *
 * Example CLI usage:
 * npx convex run reset:resetSingleEvent '{"orgSlug": "my-org", "eventSlug": "summer-gala", "confirmation": "CONFIRM_RESET_EVENT"}'
 */
export const resetSingleEvent = mutation({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    confirmation: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.confirmation !== "CONFIRM_RESET_EVENT") {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        'Single event reset aborted: You must provide confirmation: "CONFIRM_RESET_EVENT"',
      );
    }

    const caller = await assertResetAuthorized(ctx);

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .unique();
    if (!org) {
      throw appError(ErrorCode.NOT_FOUND, `Organization not found: ${args.orgSlug}`);
    }

    const event = await ctx.db
      .query("events")
      .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", org._id).eq("slug", args.eventSlug))
      .unique();
    if (!event) {
      throw appError(ErrorCode.NOT_FOUND, `Event not found: ${args.eventSlug}`);
    }

    const deletedCounts = await deleteEventCascade(ctx, event._id);
    await incrementUsage(ctx, org._id, "events", -1);
    let totalDeleted = 0;
    for (const val of Object.values(deletedCounts)) {
      totalDeleted += val;
    }

    if (caller) {
      await writeAudit(ctx, {
        orgId: org._id,
        actorId: caller._id,
        action: "platform.database.reset_single_event",
        resourceType: "event",
        resourceId: event._id,
        before: { eventSlug: args.eventSlug, totalDeleted },
        after: {},
        reason: `Deleted event ${args.eventSlug}`,
      });
    }

    return {
      success: true,
      orgSlug: args.orgSlug,
      eventSlug: args.eventSlug,
      deletedCounts,
      totalDeleted,
      message: `Successfully deleted event "${args.eventSlug}" and ${totalDeleted} associated records.`,
    };
  },
});

/**
 * Internal helper to cascade delete all records belonging to an event ID.
 */
async function deleteEventCascade(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const scores = await ctx.db
    .query("scores")
    .filter((q) => q.eq(q.field("eventId"), eventId))
    .collect();
  for (const s of scores) await ctx.db.delete(s._id);
  counts.scores = scores.length;

  const sheets = await ctx.db
    .query("scoreSheets")
    .filter((q) => q.eq(q.field("eventId"), eventId))
    .collect();
  for (const sh of sheets) await ctx.db.delete(sh._id);
  counts.scoreSheets = sheets.length;

  const resultVersions = await ctx.db
    .query("resultVersions")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .collect();
  for (const rv of resultVersions) await ctx.db.delete(rv._id);
  counts.resultVersions = resultVersions.length;

  const advancementOverrides = await ctx.db
    .query("advancementOverrides")
    .filter((q) => q.eq(q.field("eventId"), eventId))
    .collect();
  for (const ao of advancementOverrides) await ctx.db.delete(ao._id);
  counts.advancementOverrides = advancementOverrides.length;

  const tieBreaks = await ctx.db
    .query("tieBreaks")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .collect();
  for (const tb of tieBreaks) await ctx.db.delete(tb._id);
  counts.tieBreaks = tieBreaks.length;

  const judgeAssignments = await ctx.db
    .query("judgeAssignments")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .collect();
  for (const ja of judgeAssignments) await ctx.db.delete(ja._id);
  counts.judgeAssignments = judgeAssignments.length;

  const eventSessions = await ctx.db
    .query("eventSessions")
    .filter((q) => q.eq(q.field("eventId"), eventId))
    .collect();
  for (const es of eventSessions) await ctx.db.delete(es._id);
  counts.eventSessions = eventSessions.length;

  const eventAccounts = await ctx.db
    .query("eventAccounts")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .collect();
  for (const ea of eventAccounts) await ctx.db.delete(ea._id);
  counts.eventAccounts = eventAccounts.length;

  const contestants = await ctx.db
    .query("contestants")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .collect();
  for (const c of contestants) await ctx.db.delete(c._id);
  counts.contestants = contestants.length;

  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .collect();

  let criteriaCount = 0;
  for (const r of rounds) {
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", r._id))
      .collect();
    for (const cr of criteria) await ctx.db.delete(cr._id);
    criteriaCount += criteria.length;
    await ctx.db.delete(r._id);
  }
  counts.criteria = criteriaCount;
  counts.rounds = rounds.length;

  const categories = await ctx.db
    .query("categories")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .collect();
  for (const cat of categories) await ctx.db.delete(cat._id);
  counts.categories = categories.length;

  const event = await ctx.db.get(eventId);
  if (event) {
    await ctx.db.delete(event._id);
    counts.events = 1;
  }

  return counts;
}
