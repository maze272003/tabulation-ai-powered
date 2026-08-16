import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aliceIdentity, bobIdentity, prepareScoredEvent, setupTest } from "./setup";

async function submitJudgeScores(
  t: ReturnType<typeof setupTest>,
  sessionToken: string,
  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
  perContestant: number[][],
) {
  const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken });
  const sheets = [...mine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
  for (const [i, sheet] of sheets.entries()) {
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken,
      sheetId: sheet.sheetId,
      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
    });
  }
}

async function closeAndPublish(t: ReturnType<typeof setupTest>, roundId: Id<"rounds">) {
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId });
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId });
}

describe("publish, results, corrections, finalize", () => {
  it("publish is blocked by unresolved ties, then succeeds after a manual break", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[7, 7], [7, 7]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[7, 7], [7, 7]]);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "TIES_UNRESOLVED" } });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
    });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    const result = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(result.version).toBe(1);
    expect(result.reason).toBeUndefined();
    const maria = result.snapshot.categories[0].standings.find(
      (s: { contestantId: string }) => s.contestantId === ids.contestantIds[0],
    )!;
    expect(maria.rank).toBe(1);
    expect(maria.roundScore).toBe(70);
  });

  it("private results are for score.manage holders only; organization visibility opens them up", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
    await expect(
      t.withIdentity(bobIdentity).query(api.results.roundResults, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    const t2 = setupTest();
    const ids2 = await prepareScoredEvent(t2, { resultVisibility: "organization" });
    await submitJudgeScores(t2, ids2.judgeSessions.bob, ids2, [[8, 6], [5, 5]]);
    await submitJudgeScores(t2, ids2.judgeSessions.carol, ids2, [[9, 7], [5, 5]]);
    await closeAndPublish(t2, ids2.roundId);
    const asOwner = await t2.withIdentity(aliceIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids2.roundId,
    });
    expect(asOwner.snapshot.categories[0].standings.length).toBe(2);
  });

  it("corrections create version 2; finalization locks the event", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "  ",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "clerical verification",
    });
    const versions = await t.withIdentity(aliceIdentity).query(api.results.listRoundVersions, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const latest = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(latest.version).toBe(2);
    expect(latest.reason).toBe("clerical verification");
    await t.withIdentity(aliceIdentity).mutation(api.results.finalizeEvent, { orgSlug: "acme", eventSlug: "gala" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.status).toBe("finalized");
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "too late",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.archive, { orgSlug: "acme", eventSlug: "gala" });
  });

  it("corrections freeze inline overrides into snapshot decisions and standings", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t, {
      eliminationEnabled: true,
      qualifiesToNextRound: true,
      advancement: { mode: "top_count", count: 1, allowOverride: true },
    });
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    const aliceProfile = await t.withIdentity(aliceIdentity).query(api.auth.getCurrentUser, {});
    const aliceProfileId = aliceProfile!._id;
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "override reversal",
      overrides: [
        { contestantId: ids.contestantIds[0], action: "force_cut" },
        { contestantId: ids.contestantIds[1], action: "force_advance" },
      ],
    });
    const result = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(result.version).toBe(2);
    expect(result.snapshot.decisions.advancementOverrides).toEqual([
      { contestantId: ids.contestantIds[0], action: "force_cut", createdById: aliceProfileId, source: "correction" },
      { contestantId: ids.contestantIds[1], action: "force_advance", createdById: aliceProfileId, source: "correction" },
    ]);
    const standings = result.snapshot.categories[0].standings;
    const maria = standings.find((s: { contestantId: string }) => s.contestantId === ids.contestantIds[0])!;
    const nina = standings.find((s: { contestantId: string }) => s.contestantId === ids.contestantIds[1])!;
    expect(maria.advanced).toBe(false);
    expect(nina.advanced).toBe(true);
  });

  it("sequential publish and corrections allocate versions 1, 2, 3 without duplicates", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "first correction",
    });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "second correction",
    });
    const versions = await t.withIdentity(aliceIdentity).query(api.results.listRoundVersions, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    const latest = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(latest.version).toBe(3);
  });

  it("publish requires the round to be closed; scoring stops after publish", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob });
    expect(mine.rounds[0].status).toBe("published");
  });

  it("eventResults computes weighted final standings", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    const results = await t.withIdentity(aliceIdentity).query(api.results.eventResults, {
      orgSlug: "acme", eventSlug: "gala",
    });
    expect(results.rounds.length).toBe(1);
    expect(results.rounds[0].weight).toBe(100);
    expect(results.final.map((f: { contestantName: string }) => f.contestantName)).toEqual(["Maria", "Nina"]);
    expect(results.final[0].totalScore).toBe(77);
    expect(results.final[0].rank).toBe(1);
  });

  it("finalize requires every round published", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.results.finalizeEvent, { orgSlug: "acme", eventSlug: "gala" }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});
