import { afterAll, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aliceIdentity, bobIdentity, seedAndProvision, setupTest } from "./setup";

const paginationOpts = { numItems: 20, cursor: null };

async function makePlatformOwner(
  t: ReturnType<typeof setupTest>,
  userId: Id<"userProfiles">,
) {
  await t.run(async (q) => {
    await q.db.patch(userId, { platformRole: "platform_owner" });
  });
}

async function getOrgId(
  t: ReturnType<typeof setupTest>,
  slug: string,
): Promise<Id<"organizations">> {
  const orgs = await t.withIdentity(aliceIdentity).query(api.platform.orgs.options, {});
  const org = orgs.find((o) => o.slug === slug);
  if (!org) throw new Error(`Org not found: ${slug}`);
  return org._id as Id<"organizations">;
}

async function getOrgIdAsDb(
  t: ReturnType<typeof setupTest>,
  slug: string,
): Promise<Id<"organizations">> {
  const org = await t.run(async (q) => {
    return q.db.query("organizations").withIndex("by_slug", (s) => s.eq("slug", slug)).unique();
  });
  if (!org) throw new Error(`Org not found: ${slug}`);
  return org._id;
}

describe("platform admin — authorization", () => {
  it("rejects non-owners on every platform function", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);

    await expect(
      t.withIdentity(aliceIdentity).query(api.platform.dashboard.stats, {}),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(aliceIdentity).query(api.platform.orgs.list, { paginationOpts }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(aliceIdentity).query(api.platform.users.list, { paginationOpts }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(aliceIdentity).query(api.platform.subscriptions.list, { paginationOpts }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(aliceIdentity).query(api.platform.audit.list, { paginationOpts }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

    // A real org id, owned by the caller: server-side authorization must still
    // reject the mutation because the caller is not a platform owner.
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, {
      name: "Acme",
      slug: "acme",
    });
    const orgId = await getOrgIdAsDb(t, "acme");
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.platform.orgs.setStatus, {
        orgId,
        status: "suspended",
        reason: "test",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});

describe("platform admin — organizations", () => {
  it("suspends and resumes an org, blocking member access while suspended", async () => {
    const t = setupTest();
    const aliceId = await seedAndProvision(t, aliceIdentity);
    await makePlatformOwner(t, aliceId);
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, {
      name: "Acme",
      slug: "acme",
    });
    const orgId = await getOrgId(t, "acme");

    await t.withIdentity(aliceIdentity).mutation(api.platform.orgs.setStatus, {
      orgId,
      status: "suspended",
      reason: "Policy violation",
    });

    // Owner (a member) is locked out of org-scoped functions.
    await expect(
      t.withIdentity(aliceIdentity).query(api.subscriptions.getForOrg, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

    // Idempotency guard.
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.platform.orgs.setStatus, {
        orgId,
        status: "suspended",
        reason: "again",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

    await t.withIdentity(aliceIdentity).mutation(api.platform.orgs.setStatus, {
      orgId,
      status: "active",
      reason: "Resolved",
    });
    const sub = await t.withIdentity(aliceIdentity).query(api.subscriptions.getForOrg, {
      orgSlug: "acme",
    });
    expect(sub).toBeDefined();

    // The suspend/resume pair is audited on the org's trail.
    const audit = await t.withIdentity(aliceIdentity).query(api.platform.audit.list, {
      paginationOpts,
      orgId,
    });
    const actions = audit.page.map((e) => e.action);
    expect(actions).toContain("platform.org.suspended");
    expect(actions).toContain("platform.org.resumed");
    const suspended = audit.page.find((e) => e.action === "platform.org.suspended");
    expect(suspended?.reason).toBe("Policy violation");
  });

  it("requires a non-empty reason", async () => {
    const t = setupTest();
    const aliceId = await seedAndProvision(t, aliceIdentity);
    await makePlatformOwner(t, aliceId);
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, {
      name: "Acme",
      slug: "acme",
    });
    const orgId = await getOrgId(t, "acme");
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.platform.orgs.setStatus, {
        orgId,
        status: "suspended",
        reason: "   ",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});

describe("platform admin — users", () => {
  async function setupOwnerAndBob() {
    const t = setupTest();
    const aliceId = await seedAndProvision(t, aliceIdentity);
    const bobId = await seedAndProvision(t, bobIdentity);
    await makePlatformOwner(t, aliceId);
    return { t, aliceId, bobId };
  }

  it("suspends and reactivates a regular user", async () => {
    const { t, aliceId, bobId } = await setupOwnerAndBob();

    await t.withIdentity(aliceIdentity).mutation(api.platform.users.setStatus, {
      userId: bobId,
      status: "suspended",
      reason: "Abuse report",
    });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.organizations.create, { name: "B", slug: "b" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

    await t.withIdentity(aliceIdentity).mutation(api.platform.users.setStatus, {
      userId: bobId,
      status: "active",
      reason: "Appeal accepted",
    });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.organizations.create, { name: "B", slug: "b" }),
    ).resolves.toBe("b");

    const platformAudit = await t.withIdentity(aliceIdentity).query(api.platform.audit.list, {
      paginationOpts,
      orgId: null,
    });
    const actions = platformAudit.page.map((e) => e.action);
    expect(actions).toContain("platform.user.suspended");
    expect(actions).toContain("platform.user.activated");
    void aliceId;
  });

  it("refuses to suspend self or another platform owner", async () => {
    const { t, aliceId } = await setupOwnerAndBob();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.platform.users.setStatus, {
        userId: aliceId,
        status: "suspended",
        reason: "self",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });

    const carol = await t.withIdentity({ ...bobIdentity, tokenIdentifier: "carol-token", email: "carol@example.com" }).mutation(
      api.auth.ensureUserProfile,
      {},
    );
    await makePlatformOwner(t, carol);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.platform.users.setStatus, {
        userId: carol,
        status: "suspended",
        reason: "other owner",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("promotes and demotes platform owners, protecting the last one", async () => {
    const { t, bobId } = await setupOwnerAndBob();

    await t.withIdentity(aliceIdentity).mutation(api.platform.users.setPlatformRole, {
      userId: bobId,
      platformRole: "platform_owner",
      reason: "Onboarding admin",
    });
    // Two owners exist: demoting Bob keeps Alice, so it succeeds.
    await t.withIdentity(aliceIdentity).mutation(api.platform.users.setPlatformRole, {
      userId: bobId,
      platformRole: null,
      reason: "Rotation ended",
    });

    // Alice is now the only owner: she cannot demote herself.
    const audit = await t.withIdentity(aliceIdentity).query(api.platform.audit.list, {
      paginationOpts,
      orgId: null,
    });
    const actions = audit.page.map((e) => e.action);
    expect(actions).toContain("platform.user.promoted");
    expect(actions).toContain("platform.user.demoted");
  });

  it("refuses to demote the last platform owner (self-demote)", async () => {
    const { t, aliceId } = await setupOwnerAndBob();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.platform.users.setPlatformRole, {
        userId: aliceId,
        platformRole: null,
        reason: "stepping down",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});

describe("platform admin — subscriptions", () => {
  it("overrides a plan and audits the change", async () => {
    const t = setupTest();
    const aliceId = await seedAndProvision(t, aliceIdentity);
    await makePlatformOwner(t, aliceId);
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, {
      name: "Acme",
      slug: "acme",
    });
    const orgId = await getOrgId(t, "acme");

    const subs = await t.withIdentity(aliceIdentity).query(api.platform.subscriptions.list, {
      paginationOpts,
    });
    const row = subs.page.find((r) => r.orgSlug === "acme");
    expect(row?.planName).toBe("Free");

    const proPlan = await t.run(async (q) => {
      const plans = await q.db.query("plans").collect();
      return plans.find((p) => p.name === "Pro")?._id as Id<"plans">;
    });

    await t.withIdentity(aliceIdentity).mutation(api.platform.subscriptions.setPlan, {
      orgId,
      planId: proPlan,
      reason: "Enterprise deal",
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.platform.subscriptions.setPlan, {
        orgId,
        planId: proPlan,
        reason: "same plan",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

    const after = await t.withIdentity(aliceIdentity).query(api.platform.orgs.get, { orgId });
    expect(after.plan.name).toBe("Pro");

    const audit = await t.withIdentity(aliceIdentity).query(api.platform.audit.list, {
      paginationOpts,
      orgId,
    });
    const override = audit.page.find((e) => e.action === "platform.subscription.plan_overridden");
    expect(override?.reason).toBe("Enterprise deal");
  });
});

describe("platform admin — bootstrap", () => {
  const originalEnv = process.env.PLATFORM_OWNER_EMAIL;
  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.PLATFORM_OWNER_EMAIL;
    } else {
      process.env.PLATFORM_OWNER_EMAIL = originalEnv;
    }
  });

  it("promotes the matching email only while no owner exists", async () => {
    process.env.PLATFORM_OWNER_EMAIL = "bob@example.com";
    const t = setupTest();

    // Non-matching user signs in first: no promotion.
    const aliceId = await seedAndProvision(t, aliceIdentity);
    let aliceProfile = await t.withIdentity(aliceIdentity).query(api.auth.getCurrentUser, {});
    expect(aliceProfile?.platformRole).toBeNull();

    // Matching user signs in: promoted, audited as a system action.
    const bobId = await seedAndProvision(t, bobIdentity);
    const bobProfile = await t.withIdentity(bobIdentity).query(api.auth.getCurrentUser, {});
    expect(bobProfile?.platformRole).toBe("platform_owner");
    void bobId;

    // Once an owner exists, another matching sign-in never promotes.
    process.env.PLATFORM_OWNER_EMAIL = "alice@example.com";
    await t.withIdentity(aliceIdentity).mutation(api.auth.ensureUserProfile, {});
    aliceProfile = await t.withIdentity(aliceIdentity).query(api.auth.getCurrentUser, {});
    expect(aliceProfile?.platformRole).toBeNull();
    void aliceId;
  });

  it("does nothing when no email is configured", async () => {
    delete process.env.PLATFORM_OWNER_EMAIL;
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    const profile = await t.withIdentity(aliceIdentity).query(api.auth.getCurrentUser, {});
    expect(profile?.platformRole).toBeNull();
  });
});
