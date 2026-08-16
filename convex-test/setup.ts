/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
import { api } from "../convex/_generated/api";
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

type ScoredEventOpts = {
  advancement?: { mode: "none" | "top_count" | "top_percent" | "manual"; count?: number; percent?: number; allowOverride: boolean };
  qualifiesToNextRound?: boolean;
  dropHighLow?: boolean;
  resultVisibility?: "private" | "organization" | "public";
};

export async function prepareScoredEvent(
  t: ReturnType<typeof setupTest>,
  opts: ScoredEventOpts = {},
): Promise<{
  roundId: Id<"rounds">;
  criterionIds: Id<"criteria">[];
  contestantIds: Id<"contestants">[];
  judgeIds: { bob: Id<"judges">; carol: Id<"judges"> };
}> {
  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
  await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
  await t.withIdentity(carolIdentity).mutation(api.auth.ensureUserProfile, {});
  const eventPatch: Record<string, unknown> = {};
  if (opts.dropHighLow !== undefined) eventPatch.scoringRules = { dropHighLow: opts.dropHighLow };
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
  for (const identity of [bobIdentity, carolIdentity]) {
    await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: identity.email, roleName: "Judge" });
    const pending = await t.withIdentity(identity).query(api.invitations.listForUser, {});
    await t.withIdentity(identity).mutation(api.invitations.accept, { token: pending[0].token });
  }
  const members = await t.withIdentity(aliceIdentity).query(api.members.list, { orgSlug: "acme" });
  const bobId = members.find((m: { email: string }) => m.email === "bob@example.com")!.userId;
  const carolId = members.find((m: { email: string }) => m.email === "carol@example.com")!.userId;
  for (const userId of [bobId, carolId]) {
    await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId });
  }
  const judges = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "gala" });
  for (const judge of judges) {
    await t.withIdentity(aliceIdentity).mutation(api.judges.addAssignment, { orgSlug: "acme", eventSlug: "gala", judgeId: judge._id });
  }
  await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
  const after = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const contestants = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
  const orderedContestants = [...contestants].sort((a, b) => a.number - b.number);
  return {
    roundId,
    criterionIds: after[0].criteria.map((c) => c._id as Id<"criteria">),
    contestantIds: orderedContestants.map((k) => k._id as Id<"contestants">),
    judgeIds: {
      bob: judges.find((j: { userId: string }) => j.userId === bobId)!._id,
      carol: judges.find((j: { userId: string }) => j.userId === carolId)!._id,
    },
  };
}
