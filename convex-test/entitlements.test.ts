import { describe, expect, it } from "vitest";
import { hasFeature, hasLimit } from "../convex/lib/entitlements";

describe("entitlements (pure)", () => {
  const plan = {
    features: { canExportReports: false, canCreateEvent: true },
    limits: { maxMembers: 5, maxEvents: 1 },
  } as const;

  it("hasFeature reads the boolean flag", () => {
    expect(hasFeature(plan, "canCreateEvent")).toBe(true);
    expect(hasFeature(plan, "canExportReports")).toBe(false);
    expect(hasFeature(plan, "canUseApi")).toBe(false);
  });

  it("hasLimit is true below the ceiling, false at/over it", () => {
    expect(hasLimit(plan, "maxMembers", 4)).toBe(true);
    expect(hasLimit(plan, "maxMembers", 5)).toBe(false);
    expect(hasLimit(plan, "maxMembers", 99)).toBe(false);
  });
});
