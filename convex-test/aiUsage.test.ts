import { describe, expect, it } from "vitest";
import { resolveDailyQuotaCount } from "../convex/lib/aiUsage";

describe("resolveDailyQuotaCount", () => {
  it("starts at 1 for a fresh resource", () => {
    expect(resolveDailyQuotaCount(null, null, "2026-08-17", 20)).toBe(1);
  });

  it("increments within the same day and blocks at the limit", () => {
    expect(resolveDailyQuotaCount(5, "2026-08-17", "2026-08-17", 20)).toBe(6);
    expect(() => resolveDailyQuotaCount(20, "2026-08-17", "2026-08-17", 20)).toThrowError(
      expect.objectContaining({
        data: expect.objectContaining({ code: "LIMIT_EXCEEDED" }),
      }),
    );
  });

  it("resets when the period key is from an earlier day", () => {
    expect(resolveDailyQuotaCount(20, "2026-08-16", "2026-08-17", 20)).toBe(1);
  });
});
