/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
import { api } from "../convex/_generated/api";
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
