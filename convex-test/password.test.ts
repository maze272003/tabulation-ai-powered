import { describe, expect, it } from "vitest";
import { hashPassword, timingSafeDummyVerify, verifyPassword } from "../convex/lib/password";

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^100000\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong horse", stored)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed stored hashes without throwing", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "abc..")).toBe(false);
  });

  it("dummy verify resolves (timing equalization path)", async () => {
    await expect(timingSafeDummyVerify("anything")).resolves.toBeUndefined();
  });
});
