/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const testModules = import.meta.glob("../convex/**/*.ts");

export function setupTest() {
  return convexTest(schema, testModules);
}

export async function seedAndProvision(
  t: ReturnType<typeof setupTest>,
  identity: Partial<UserIdentity>,
) {
  await t.mutation(api.seed.seedReferenceData, {});
  return t.withIdentity(identity).mutation(api.auth.ensureUserProfile, {});
}

export const aliceIdentity = {
  tokenIdentifier: "alice-token",
  subject: "alice-subject",
  name: "Alice",
  email: "alice@example.com",
  pictureUrl: "https://example.com/a.png",
  issuer: "https://tabulation.example.com",
} as const;

export const bobIdentity = {
  tokenIdentifier: "bob-token",
  subject: "bob-subject",
  name: "Bob",
  email: "bob@example.com",
  pictureUrl: "https://example.com/b.png",
  issuer: "https://tabulation.example.com",
} as const;

export const carolIdentity = {
  tokenIdentifier: "carol-token",
  subject: "carol-subject",
  name: "Carol",
  email: "carol@example.com",
  pictureUrl: "https://example.com/c.png",
  issuer: "https://tabulation.example.com",
} as const;

export async function createOrgAndEvent(
  t: ReturnType<typeof setupTest>,
  identity: Partial<UserIdentity>,
  opts: { orgSlug: string; eventSlug: string; eventName?: string },
): Promise<void> {
  await seedAndProvision(t, identity);
  await t.withIdentity(identity).mutation(api.organizations.create, {
    name: opts.orgSlug,
    slug: opts.orgSlug,
  });
  await t.withIdentity(identity).mutation(api.events.create, {
    orgSlug: opts.orgSlug,
    name: opts.eventName ?? opts.eventSlug,
    slug: opts.eventSlug,
  });
}

const VIEWER_ROLE_NAME = "Viewer";
const VIEWER_ROLE_PERMISSIONS = ["organization.view", "event.view", "result.view"] as const;

/**
 * Adds `identity` to the org with a read-only "Viewer" system role that lacks
 * `documents.manage`, so tests can assert permission-gated rejections for
 * otherwise valid members. The role mirrors the SYSTEM_ROLES seeding pattern
 * and is created idempotently via direct DB access (`t.run`).
 */
export async function addOrgMemberWithoutDocumentsManage(
  t: ReturnType<typeof setupTest>,
  orgSlug: string,
  identity: Partial<UserIdentity>,
): Promise<void> {
  const tokenIdentifier = identity.tokenIdentifier;
  if (!tokenIdentifier) throw new Error("identity.tokenIdentifier is required");
  // ensureUserProfile also (re)seeds reference data, so the Viewer permissions exist.
  await t.withIdentity(identity).mutation(api.auth.ensureUserProfile, {});
  await t.run(async (ctx) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", orgSlug))
      .unique();
    if (!org) throw new Error(`Organization not found: ${orgSlug}`);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (!profile) throw new Error(`Profile not provisioned for ${tokenIdentifier}`);

    let roleId = (
      await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", VIEWER_ROLE_NAME))
        .unique()
    )?._id;
    if (roleId === undefined) {
      roleId = await ctx.db.insert("roles", {
        name: VIEWER_ROLE_NAME,
        scope: "organization",
        isSystem: true,
        description: "Read-only access to organization data",
      });
      for (const permissionName of VIEWER_ROLE_PERMISSIONS) {
        const permission = await ctx.db
          .query("permissions")
          .withIndex("by_name", (q) => q.eq("name", permissionName))
          .unique();
        if (!permission) throw new Error(`Permission not seeded: ${permissionName}`);
        await ctx.db.insert("rolePermissions", { roleId, permissionId: permission._id });
      }
    }

    const existingMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_id_and_user_id", (q) => q.eq("orgId", org._id).eq("userId", profile._id))
      .unique();
    if (existingMembership) {
      await ctx.db.patch(existingMembership._id, { roleId });
      return;
    }
    await ctx.db.insert("organizationMembers", {
      userId: profile._id,
      orgId: org._id,
      roleId,
      status: "active",
      joinedAt: Date.now(),
    });
  });
}

type ScoredEventOpts = {
  advancement?: { mode: "none" | "top_count" | "top_percent" | "manual"; count?: number; percent?: number; allowOverride: boolean };
  qualifiesToNextRound?: boolean;
  dropHighLow?: boolean;
  eliminationEnabled?: boolean;
  resultVisibility?: "private" | "organization" | "public";
};

export async function prepareScoredEvent(
  t: ReturnType<typeof setupTest>,
  opts: ScoredEventOpts = {},
): Promise<{
  eventCode: string;
  roundId: Id<"rounds">;
  criterionIds: Id<"criteria">[];
  contestantIds: Id<"contestants">[];
  judgeIds: { bob: Id<"eventAccounts">; carol: Id<"eventAccounts"> };
  judgeSessions: { bob: string; carol: string };
}> {
  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
  const eventPatch: Record<string, unknown> = {};
  if (opts.dropHighLow !== undefined) eventPatch.scoringRules = { dropHighLow: opts.dropHighLow };
  if (opts.eliminationEnabled !== undefined) eventPatch.eliminationEnabled = opts.eliminationEnabled;
  if (opts.resultVisibility !== undefined) eventPatch.resultVisibility = opts.resultVisibility;
  if (Object.keys(eventPatch).length > 0) {
    await t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "gala", ...eventPatch });
  }
  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
    orgSlug: "acme", eventSlug: "gala", name: "R",
    qualifiesToNextRound: opts.qualifiesToNextRound,
    advancement: opts.advancement,
  });
  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const roundId = rounds[0]._id;
  for (const [name, weight] of [["A", 60], ["B", 40]] as const) {
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId, name, weight, minScore: 0, maxScore: 10, decimalPrecision: 0,
    });
  }
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Nina", number: 2 });
  
  const bobAcc = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "Bob", username: "bob", password: "password123",
  });
  const carolAcc = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "Carol", username: "carol", password: "password123",
  });
  await t.withIdentity(aliceIdentity).mutation(api.accounts.addAssignment, {
    orgSlug: "acme", eventSlug: "gala", accountId: bobAcc.accountId,
  });
  await t.withIdentity(aliceIdentity).mutation(api.accounts.addAssignment, {
    orgSlug: "acme", eventSlug: "gala", accountId: carolAcc.accountId,
  });

  await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });

  const eventDoc = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
  const eventCode = eventDoc!.eventCode;

  const bobLogin = await t.action(api.eventAuth.login, {
    eventCode, username: "bob", password: "password123",
  });
  const carolLogin = await t.action(api.eventAuth.login, {
    eventCode, username: "carol", password: "password123",
  });

  const after = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const contestants = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
  const orderedContestants = [...contestants].sort((a, b) => a.number - b.number);
  return {
    eventCode,
    roundId,
    criterionIds: after[0].criteria.map((c) => c._id as Id<"criteria">),
    contestantIds: orderedContestants.map((k) => k._id as Id<"contestants">),
    judgeIds: {
      bob: bobAcc.accountId,
      carol: carolAcc.accountId,
    },
    judgeSessions: {
      bob: bobLogin.token,
      carol: carolLogin.token,
    },
  };
}

let checkoutCounter = 0;

export async function createOrgWithPendingCheckout(
  t: ReturnType<typeof setupTest>,
  opts: { planName?: string; sessionSuffix?: string } = {},
): Promise<{
  orgSlug: string;
  paymentId: string;
  checkoutSessionId: string;
  amountCents: number;
}> {
  const orgSlug = "acme";
  // Safe to call multiple times per test (e.g. renewals): only bootstrap once.
  const existing = await t
    .withIdentity(aliceIdentity)
    .query(api.organizations.get, { orgSlug });
  if (existing === null) {
    await createOrgAndEvent(t, aliceIdentity, { orgSlug, eventSlug: "gala" });
  }
  checkoutCounter += 1;
  const suffix = opts.sessionSuffix ?? `auto${checkoutCounter}`;
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          data: {
            id: `cs_test_${suffix}`,
            attributes: { checkout_url: `https://checkout.paymongo.com/test/${suffix}` },
          },
        }),
        { status: 200 },
      ),
  );
  vi.stubEnv("PAYMONGO_SECRET_KEY", `sk_test_${suffix}`);
  try {
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, {
        orgSlug,
        planName: opts.planName ?? "Starter",
      });
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
  const active = await t
    .withIdentity(aliceIdentity)
    .query(api.billing.payments.getActiveCheckout, { orgSlug });
  if (!active) throw new Error("pending checkout not found after createCheckout");
  return {
    orgSlug,
    paymentId: active.paymentId,
    checkoutSessionId: `cs_test_${suffix}`,
    amountCents: active.amountCents,
  };
}

/**
 * Grants a paid plan through the REAL path (checkout + paid webhook) so tests
 * exercise the same state production reaches. Replaces the old
 * `subscriptions.changePlan`-based setup.
 */
export async function grantPaidPlan(
  t: ReturnType<typeof setupTest>,
  planName: "Starter" | "Pro",
): Promise<{ orgSlug: string; checkoutSessionId: string; amountCents: number }> {
  const ctx = await createOrgWithPendingCheckout(t, { planName });
  const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
    eventId: `evt_grant_${planName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType: "checkout_session.payment.paid",
    checkoutSessionId: ctx.checkoutSessionId,
    referenceNumber: null,
    paidAmount: ctx.amountCents,
  });
  if (outcome !== "applied") throw new Error(`grantPaidPlan failed: ${outcome}`);
  return ctx;
}
