import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, seedAndProvision, setupTest } from "./setup";

describe("billing plans", () => {
  it("seeds plans with PHP pricing", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    const plans = await t.query(api.plans.list, {});
    const byName = new Map(plans.map((p) => [p.name, p]));
    expect(byName.get("Free")?.priceCents).toBe(0);
    expect(byName.get("Starter")?.priceCents).toBe(49900);
    expect(byName.get("Pro")?.priceCents).toBe(149900);
    for (const plan of plans) {
      expect(plan.currency).toBe("PHP");
      expect(plan.billingInterval).toBe("monthly");
      expect(plan.isActive).toBe(true);
    }
  });
});
