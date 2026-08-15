import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, setupTest } from "./setup";

async function configureValidEvent(t: ReturnType<typeof setupTest>) {
  await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const roundId = rounds[0]._id;
  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { orgSlug: "acme", eventSlug: "gala", roundId, name: "A", weight: 60, minScore: 0, maxScore: 10, decimalPrecision: 0 });
  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { orgSlug: "acme", eventSlug: "gala", roundId, name: "B", weight: 40, minScore: 0, maxScore: 10, decimalPrecision: 0 });
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
  await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: "bob@example.com", roleName: "Judge" });
  const pending = await t.withIdentity(bobIdentity).query(api.invitations.listForUser, {});
  await t.withIdentity(bobIdentity).mutation(api.invitations.accept, { token: pending[0].token });
  const members = await t.withIdentity(aliceIdentity).query(api.members.list, { orgSlug: "acme" });
  const bobId = members.find((m: { email: string }) => m.email === "bob@example.com")!.userId;
  await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: bobId });
  const judges = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "gala" });
  await t.withIdentity(aliceIdentity).mutation(api.judges.addAssignment, { orgSlug: "acme", eventSlug: "gala", judgeId: judges[0]._id });
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
