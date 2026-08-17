import { mutation, type MutationCtx } from "./_generated/server";
import { ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS, SYSTEM_ROLES, SYSTEM_TEMPLATES } from "./lib/constants";
import { hashPassword } from "./lib/password";

export async function seedReferenceDataInternal(ctx: MutationCtx) {
  for (const p of SYSTEM_PERMISSIONS) {
    const existing = await ctx.db
      .query("permissions")
      .withIndex("by_name", (q) => q.eq("name", p.name))
      .unique();
    if (!existing) {
      await ctx.db.insert("permissions", { ...p });
    }
  }
  for (const r of SYSTEM_ROLES) {
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", r.name))
      .unique();
    if (!existing) {
      await ctx.db.insert("roles", {
        name: r.name,
        scope: "organization",
        isSystem: true,
        description: r.description,
      });
    }
  }
  for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", roleName))
      .unique();
    if (!role) continue;
    for (const permName of permNames) {
      const perm = await ctx.db
        .query("permissions")
        .withIndex("by_name", (q) => q.eq("name", permName))
        .unique();
      if (!perm) continue;
      const existing = await ctx.db
        .query("rolePermissions")
        .withIndex("by_role_id", (q) => q.eq("roleId", role._id))
        .filter((q) => q.eq(q.field("permissionId"), perm._id))
        .first();
      if (!existing) {
        await ctx.db.insert("rolePermissions", { roleId: role._id, permissionId: perm._id });
      }
    }
  }
  for (const plan of SYSTEM_PLANS) {
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", plan.name))
      .unique();
    if (!existing) {
      await ctx.db.insert("plans", { ...plan });
    }
  }
  for (const tpl of SYSTEM_TEMPLATES) {
    const existing = await ctx.db
      .query("eventTemplates")
      .filter((q) => q.and(q.eq(q.field("name"), tpl.name), q.eq(q.field("isSystem"), true)))
      .first();
    if (!existing) {
      await ctx.db.insert("eventTemplates", {
        name: tpl.name,
        description: tpl.description,
        configSnapshot: tpl.configSnapshot,
        isSystem: true,
      });
    }
  }
}

export const seedReferenceData = mutation({
  args: {},
  handler: async (ctx) => {
    await seedReferenceDataInternal(ctx);
  },
});

export const seedE2EData = mutation({
  args: {},
  handler: async (ctx) => {
    await seedReferenceDataInternal(ctx);

    // 1. Ensure test user profile exists
    let testUser = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", (q) => q.eq("email", "e2e-organizer@tabulation.test"))
      .first();
    if (!testUser) {
      const userId = await ctx.db.insert("userProfiles", {
        tokenIdentifier: "e2e-organizer-token",
        name: "E2E Test Organizer",
        email: "e2e-organizer@tabulation.test",
        image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
        platformRole: "platform_owner",
        status: "active",
        lastLoginAt: Date.now(),
      });
      testUser = (await ctx.db.get(userId))!;
    }

    // 2. Ensure test organization exists
    let org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", "e2e-org"))
      .first();
    if (!org) {
      const orgId = await ctx.db.insert("organizations", {
        slug: "e2e-org",
        name: "E2E Showcase Organization",
        ownerId: testUser._id,
        createdById: testUser._id,
        status: "active",
        branding: {
          primaryColor: "#059669",
          secondaryColor: "#10b981",
        },
      });
      org = (await ctx.db.get(orgId))!;

      // Add org membership for owner
      const ownerRole = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", "owner"))
        .first();
      if (ownerRole) {
        await ctx.db.insert("organizationMembers", {
          orgId: org._id,
          userId: testUser._id,
          roleId: ownerRole._id,
          status: "active",
          joinedAt: Date.now(),
        });
      }
    }

    // 3. Ensure test event exists
    let event = await ctx.db
      .query("events")
      .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", org._id).eq("slug", "e2e-event"))
      .first();

    if (event) {
      await ctx.db.patch(event._id, {
        eventCode: "DEMO-2026",
        name: "National Tabulation Championship 2026",
        status: "ready",
        decimalPrecision: 1,
        resultVisibility: "organization",
        scoringRules: { dropHighLow: false },
        eliminationEnabled: false,
      });

      // Clear existing child items to make seeding fresh and idempotent
      const sheets = await ctx.db.query("scoreSheets").withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", event!._id)).collect();
      for (const s of sheets) await ctx.db.delete(s._id);

      const accounts = await ctx.db.query("eventAccounts").withIndex("by_event_id", (q) => q.eq("eventId", event!._id)).collect();
      for (const a of accounts) {
        const sessions = await ctx.db.query("eventSessions").withIndex("by_account_id", (q) => q.eq("accountId", a._id)).collect();
        for (const sess of sessions) await ctx.db.delete(sess._id);
        const assignments = await ctx.db.query("judgeAssignments").withIndex("by_judge_id", (q) => q.eq("judgeId", a._id)).collect();
        for (const assign of assignments) await ctx.db.delete(assign._id);
        await ctx.db.delete(a._id);
      }

      const contestants = await ctx.db.query("contestants").withIndex("by_event_id", (q) => q.eq("eventId", event!._id)).collect();
      for (const c of contestants) await ctx.db.delete(c._id);

      const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", event!._id)).collect();
      for (const r of rounds) {
        const criteria = await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", r._id)).collect();
        for (const cr of criteria) await ctx.db.delete(cr._id);
        await ctx.db.delete(r._id);
      }

      const categories = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", event!._id)).collect();
      for (const cat of categories) await ctx.db.delete(cat._id);
    } else {
      const eventId = await ctx.db.insert("events", {
        orgId: org._id,
        slug: "e2e-event",
        eventCode: "DEMO-2026",
        name: "National Tabulation Championship 2026",
        description: "Official 2026 Grand Championship for E2E validation",
        status: "ready",
        decimalPrecision: 1,
        resultVisibility: "organization",
        scoringRules: { dropHighLow: false },
        eliminationEnabled: false,
        branding: {
          primaryColor: "#0284c7",
          secondaryColor: "#38bdf8",
        },
        createdById: testUser._id,
      });
      event = (await ctx.db.get(eventId))!;
    }

    // 4. Create category
    const catId = await ctx.db.insert("categories", {
      eventId: event._id,
      name: "Championship Division",
      description: "Premier category for final contestants",
      order: 1,
    });

    // 5. Create round
    const roundId = await ctx.db.insert("rounds", {
      eventId: event._id,
      name: "Final Round",
      description: "Final judging round",
      order: 1,
      qualifiesToNextRound: true,
      weight: 100,
      status: "open",
      advancement: { mode: "none", allowOverride: false },
    });

    // 6. Create criteria
    const crit1 = await ctx.db.insert("criteria", {
      roundId,
      name: "Technical Execution",
      description: "Precision, technique, and accuracy of execution",
      order: 1,
      weight: 60,
      minScore: 0,
      maxScore: 10,
      decimalPrecision: 1,
    });

    const crit2 = await ctx.db.insert("criteria", {
      roundId,
      name: "Artistic Presentation",
      description: "Stage presence, style, and overall expression",
      order: 2,
      weight: 40,
      minScore: 0,
      maxScore: 10,
      decimalPrecision: 1,
    });

    // 7. Create contestants
    const con1 = await ctx.db.insert("contestants", {
      eventId: event._id,
      categoryId: catId,
      number: 1,
      name: "Aria Montgomery",
      status: "active",
    });

    const con2 = await ctx.db.insert("contestants", {
      eventId: event._id,
      categoryId: catId,
      number: 2,
      name: "Lucas Bennett",
      status: "active",
    });

    // 8. Create judge and staff accounts with hashed password ("password123")
    const passwordHash = await hashPassword("password123");

    const judge1Id = await ctx.db.insert("eventAccounts", {
      orgId: org._id,
      eventId: event._id,
      kind: "judge",
      displayName: "Judge Sophia",
      username: "judge1",
      passwordHash,
      status: "active",
      failedAttempts: 0,
      lockedUntil: null,
      createdById: testUser._id,
    });

    const judge2Id = await ctx.db.insert("eventAccounts", {
      orgId: org._id,
      eventId: event._id,
      kind: "judge",
      displayName: "Judge Marcus",
      username: "judge2",
      passwordHash,
      status: "active",
      failedAttempts: 0,
      lockedUntil: null,
      createdById: testUser._id,
    });

    const staff1Id = await ctx.db.insert("eventAccounts", {
      orgId: org._id,
      eventId: event._id,
      kind: "staff",
      displayName: "Staff Alex",
      username: "staff1",
      passwordHash,
      status: "active",
      failedAttempts: 0,
      lockedUntil: null,
      createdById: testUser._id,
    });

    // 9. Assign judges
    await ctx.db.insert("judgeAssignments", {
      judgeId: judge1Id,
      eventId: event._id,
    });

    await ctx.db.insert("judgeAssignments", {
      judgeId: judge2Id,
      eventId: event._id,
    });

    // 10. Generate score sheets
    const sheet1 = await ctx.db.insert("scoreSheets", {
      eventId: event._id,
      roundId,
      judgeId: judge1Id,
      contestantId: con1,
      status: "not_started",
    });

    const sheet2 = await ctx.db.insert("scoreSheets", {
      eventId: event._id,
      roundId,
      judgeId: judge1Id,
      contestantId: con2,
      status: "not_started",
    });

    const sheet3 = await ctx.db.insert("scoreSheets", {
      eventId: event._id,
      roundId,
      judgeId: judge2Id,
      contestantId: con1,
      status: "not_started",
    });

    const sheet4 = await ctx.db.insert("scoreSheets", {
      eventId: event._id,
      roundId,
      judgeId: judge2Id,
      contestantId: con2,
      status: "not_started",
    });

    return {
      success: true,
      orgSlug: org.slug,
      eventSlug: event.slug,
      eventCode: event.eventCode,
      roundId,
      criteriaIds: [crit1, crit2],
      contestantIds: [con1, con2],
      judgeIds: [judge1Id, judge2Id],
      staffId: staff1Id,
      sheetIds: [sheet1, sheet2, sheet3, sheet4],
    };
  },
});


