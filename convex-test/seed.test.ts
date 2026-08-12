import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { setupTest } from "./setup";

describe("seed", () => {
  it("runs idempotently without error", async () => {
    const t = setupTest();
    await t.mutation(api.seed.seedReferenceData, {});
    await t.mutation(api.seed.seedReferenceData, {});
  });
  it("seedAndProvision creates a profile after seeding", async () => {
    const t = setupTest();
    const { aliceIdentity, seedAndProvision } = await import("./setup");
    await seedAndProvision(t, aliceIdentity);
    const profile = await t.withIdentity(aliceIdentity).query(api.auth.getCurrentUser, {});
    expect(profile?.email).toBe("alice@example.com");
  });
});
