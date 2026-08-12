import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, setupTest } from "./setup";

describe("sanity", () => {
  it("returns null for anonymous getCurrentUser", async () => {
    const t = setupTest();
    const result = await t.query(api.auth.getCurrentUser, {});
    expect(result).toBeNull();
  });

  it("provisions a profile for an authenticated user", async () => {
    const t = setupTest().withIdentity(aliceIdentity);
    await t.mutation(api.auth.ensureUserProfile, {});
    const result = await t.query(api.auth.getCurrentUser, {});
    expect(result?.email).toBe("alice@example.com");
  });
});
