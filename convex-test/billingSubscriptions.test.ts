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

  it("supports user-scoped cancelMine and resumeMine", async () => {
    const { t } = await paidOrg();
    // Alice is on Starter
    const initial = await t.withIdentity(aliceIdentity).query(api.subscriptions.getMine, {});
    expect(initial.plan?.name).toBe("Starter");
    expect(initial.subscription.cancelAtPeriodEnd).toBe(false);

    // Cancel Alice's subscription
    const cancelResult = await t.withIdentity(aliceIdentity).mutation(api.subscriptions.cancelMine, {});
    expect(cancelResult.success).toBe(true);

    const cancelled = await t.withIdentity(aliceIdentity).query(api.subscriptions.getMine, {});
    expect(cancelled.subscription.cancelAtPeriodEnd).toBe(true);

    // Calling cancelMine again should conflict
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.cancelMine, {}),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

    // Resume Alice's subscription
    const resumeResult = await t.withIdentity(aliceIdentity).mutation(api.subscriptions.resumeMine, {});
    expect(resumeResult.success).toBe(true);

    const resumed = await t.withIdentity(aliceIdentity).query(api.subscriptions.getMine, {});
    expect(resumed.subscription.cancelAtPeriodEnd).toBe(false);

    // Calling resumeMine when not cancelled should conflict
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.resumeMine, {}),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

    // User on Free plan (Bob) cannot cancel
    await seedAndProvision(t, bobIdentity);
    await t.withIdentity(bobIdentity).mutation(api.organizations.create, {
      name: "Bob Org",
      slug: "bob-org",
    });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.subscriptions.cancelMine, {}),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});

