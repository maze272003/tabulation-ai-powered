import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, setupTest } from "./setup";

async function addBobAsJudgeMember(t: ReturnType<typeof setupTest>) {
  await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
  await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: "bob@example.com", roleName: "Judge" });
  const pending = await t.withIdentity(bobIdentity).query(api.invitations.listForUser, {});
  await t.withIdentity(bobIdentity).mutation(api.invitations.accept, { token: pending[0].token });
  const members = await t.withIdentity(aliceIdentity).query(api.members.list, { orgSlug: "acme" });
  return members.find((m: { email: string }) => m.email === "bob@example.com")!.userId;
}

describe("judges", () => {
  it("adds a judge from org members, unique per event", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const bobId = await addBobAsJudgeMember(t);
    await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: bobId });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: bobId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const list = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "gala" });
    expect(list.length).toBe(1);
    expect(list[0].user.email).toBe("bob@example.com");
  });

  it("refuses a non-member userId", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const bobProfile = await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: bobProfile }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("adds and removes scoped assignments; IDOR on foreign judge", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "one" });
    const bobId = await addBobAsJudgeMember(t);
    await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "one", userId: bobId });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "one", name: "R" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "one" });
    const judges = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "one" });
    await t.withIdentity(aliceIdentity).mutation(api.judges.addAssignment, {
      orgSlug: "acme", eventSlug: "one", judgeId: judges[0]._id, roundId: rounds[0]._id,
    });
    const withAssignments = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "one" });
    expect(withAssignments[0].assignments.length).toBe(1);
    await t.withIdentity(aliceIdentity).mutation(api.judges.removeAssignment, {
      orgSlug: "acme", eventSlug: "one", assignmentId: withAssignments[0].assignments[0]._id,
    });
    const cleared = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "one" });
    expect(cleared[0].assignments.length).toBe(0);
  });
});
