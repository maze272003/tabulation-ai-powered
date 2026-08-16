import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, carolIdentity, createOrgAndEvent, prepareScoredEvent, setupTest } from "./setup";

async function submitJudgeScores(
  t: ReturnType<typeof setupTest>,
  identity: typeof bobIdentity,
  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
  perContestant: number[][],
) {
  const mine = await t.withIdentity(identity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
  const sheets = [...mine.rounds[0].sheets].sort(
    (a, b) => a.contestantNumber - b.contestantNumber,
  );
  for (const [i, sheet] of sheets.entries()) {
    await t.withIdentity(identity).mutation(api.scoring.submitSheet, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId,
      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
    });
  }
}

describe("round lifecycle", () => {
  it("monitor shows statuses without any score payload", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    const monitor = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundMonitor, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(monitor.roundStatus).toBe("open");
    expect(monitor.sheets.length).toBe(4);
    expect(monitor.sheets.filter((s: { status: string }) => s.status === "submitted").length).toBe(2);
    expect(JSON.stringify(monitor)).not.toContain("draftValues");
    expect(JSON.stringify(monitor)).not.toContain("value");
  });

  it("closing blocks submits; reopening re-allows them", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    const carolMine = await t.withIdentity(carolIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
    const sheet = carolMine.rounds[0].sheets[0];
    const values = Object.fromEntries(ids.criterionIds.map((id) => [id, 7]));
    await expect(
      t.withIdentity(carolIdentity).mutation(api.scoring.submitSheet, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId, values,
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    await t.withIdentity(carolIdentity).mutation(api.scoring.submitSheet, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId, values,
    });
  });

  it("only score.manage holders run the round lifecycle", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme2", eventSlug: "gala2" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme2", eventSlug: "gala2", name: "R" });
    const otherRounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme2", eventSlug: "gala2" });
    await expect(
      t.withIdentity(aliceIdentity).query(api.roundAdmin.roundMonitor, { orgSlug: "acme", eventSlug: "gala", roundId: otherRounds[0]._id }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("closing twice conflicts; reopening an open round conflicts", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
