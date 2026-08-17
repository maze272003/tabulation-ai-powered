import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import {
  aliceIdentity,
  bobIdentity,
  grantPaidPlan,
  seedAndProvision,
  setupTest,
} from "./setup";

async function paidOrg() {
  const t = setupTest();
  const ctx = await grantPaidPlan(t, "Starter");
  return { t, orgSlug: ctx.orgSlug };
}

describe("subscriptions changePlan/resume", () => {
  it("schedules cancellation to Free via changePlan", async () => {
    const { t, orgSlug } = await paidOrg();
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.subscriptions.changePlan, { orgSlug, planName: "Free" });
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug });
    expect(sub?.subscription.cancelAtPeriodEnd).toBe(true);
    expect(sub?.subscription.planId).not.toBeNull();
  });

  it("rejects paid plans (must use checkout) and no-op switches", async () => {
    const { t, orgSlug } = await paidOrg();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, {
        orgSlug,
        planName: "Pro",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, {
        orgSlug,
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("resume clears cancelAtPeriodEnd and CONFLICTs when nothing to resume", async () => {
    const { t, orgSlug } = await paidOrg();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.resume, { orgSlug }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.subscriptions.changePlan, { orgSlug, planName: "Free" });
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.resume, { orgSlug });
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug });
    expect(sub?.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it("requires subscription.manage permission", async () => {
    const { t, orgSlug } = await paidOrg();
    await seedAndProvision(t, bobIdentity);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.subscriptions.changePlan, { orgSlug, planName: "Free" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.subscriptions.resume, { orgSlug }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
