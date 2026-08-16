import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

async function configureValidEvent(t: ReturnType<typeof setupTest>) {
  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const roundId = rounds[0]._id;
  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { orgSlug: "acme", eventSlug: "gala", roundId, name: "A", weight: 60, minScore: 0, maxScore: 10, decimalPrecision: 0 });
  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { orgSlug: "acme", eventSlug: "gala", roundId, name: "B", weight: 40, minScore: 0, maxScore: 10, decimalPrecision: 0 });
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
  const judgeAcc = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "Bob", username: "bob", password: "password123",
  });
  await t.withIdentity(aliceIdentity).mutation(api.accounts.addAssignment, {
    orgSlug: "acme", eventSlug: "gala", accountId: judgeAcc.accountId,
  });
}

describe("lifecycle", () => {
  it("blocks publish when readiness fails", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("publishes a valid event, generates sheets, freezes config; reopen deletes sheets", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await configureValidEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.status).toBe("ready");
    const sheetCount = await t.run(async (q) =>
      (await q.db.query("scoreSheets").collect()).filter((s) => s.eventId === ev!._id).length,
    );
    expect(sheetCount).toBe(1);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "Late" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.reopen, { orgSlug: "acme", eventSlug: "gala" });
    const after = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(after?.status).toBe("draft");
    const sheetsAfter = await t.run(async (q) =>
      (await q.db.query("scoreSheets").collect()).filter((s) => s.eventId === after!._id).length,
    );
    expect(sheetsAfter).toBe(0);
  });

  it("archives a ready event", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await configureValidEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.archive, { orgSlug: "acme", eventSlug: "gala" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.status).toBe("archived");
  });
});
