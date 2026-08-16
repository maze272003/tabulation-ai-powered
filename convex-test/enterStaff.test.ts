import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, prepareScoredEvent, setupTest } from "./setup";

async function setupStaffAndJudges(t: ReturnType<typeof setupTest>, opts = {}) {
  const ids = await prepareScoredEvent(t, opts);
  const staffAcc = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    orgSlug: "acme", eventSlug: "gala", kind: "staff", displayName: "Sam Staff", username: "staff1", password: "password123",
  });
  const staffLogin = await t.action(api.eventAuth.login, {
    eventCode: ids.eventCode, username: "staff1", password: "password123",
  });
  return {
    ...ids,
    staffAccount: staffAcc,
    staffSession: staffLogin.token,
  };
}

describe("staff enter round and result operations", () => {
  it("staff lists rounds and monitors sheets", async () => {
    const t = setupTest();
    const env = await setupStaffAndJudges(t);
    const list = await t.query(api.enter.rounds.list, { sessionToken: env.staffSession });
    expect(list.length).toBe(1);
    expect(list[0].criteriaCount).toBe(2);
    expect(list[0].contestantCount).toBe(2);

    const monitor = await t.query(api.enter.rounds.roundMonitor, { sessionToken: env.staffSession, roundId: env.roundId });
    expect(monitor.roundStatus).toBe("open");
    expect(monitor.judges.length).toBe(2);
    expect(monitor.sheets.length).toBe(4);

    // Review of an open round is an expected empty state, not an error
    const openReview = await t.query(api.enter.rounds.roundReview, { sessionToken: env.staffSession, roundId: env.roundId });
    expect(openReview).toBeNull();
  });

  it("staff closes, reviews, tie-breaks, publishes, and corrects round", async () => {
    const t = setupTest();
    const env = await setupStaffAndJudges(t);

    // Bob and Carol score
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.bob });
    for (const s of bobMine.rounds[0].sheets) {
      await t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: env.judgeSessions.bob, sheetId: s.sheetId,
        values: { [env.criterionIds[0]]: 7, [env.criterionIds[1]]: 7 },
      });
    }
    const carolMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.carol });
    for (const s of carolMine.rounds[0].sheets) {
      await t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: env.judgeSessions.carol, sheetId: s.sheetId,
        values: { [env.criterionIds[0]]: 7, [env.criterionIds[1]]: 7 },
      });
    }

    // Staff closes round
    await t.mutation(api.enter.rounds.closeRound, { sessionToken: env.staffSession, roundId: env.roundId });

    // Staff reviews - surfaces unresolved tie
    const review = await t.query(api.enter.rounds.roundReview, { sessionToken: env.staffSession, roundId: env.roundId });
    if (!review) throw new Error("Expected review data after closing the round");
    expect(review.unresolvedTies.length).toBe(1);

    // Publishing blocked by ties
    await expect(
      t.mutation(api.enter.rounds.publishRound, { sessionToken: env.staffSession, roundId: env.roundId }),
    ).rejects.toMatchObject({ data: { code: "TIES_UNRESOLVED" } });

    // Staff adds tie break
    await t.mutation(api.enter.rounds.addTieBreak, {
      sessionToken: env.staffSession, roundId: env.roundId,
      tiedContestantIds: env.contestantIds, orderedIds: env.contestantIds,
    });

    // Staff publishes
    await t.mutation(api.enter.rounds.publishRound, { sessionToken: env.staffSession, roundId: env.roundId });

    // Staff checks published results
    const res = await t.query(api.enter.results.roundResults, { sessionToken: env.staffSession, roundId: env.roundId });
    expect(res.version).toBe(1);
    expect(res.snapshot.categories[0].standings[0].rank).toBe(1);

    // Staff corrects results
    await t.mutation(api.enter.rounds.correctResults, {
      sessionToken: env.staffSession, roundId: env.roundId, reason: "staff verification fix",
    });
    const versions = await t.query(api.enter.results.listRoundVersions, { sessionToken: env.staffSession, roundId: env.roundId });
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);

    // Staff checks eventResults and finalizes
    const eventRes = await t.query(api.enter.results.eventResults, { sessionToken: env.staffSession });
    expect(eventRes.final.length).toBe(2);

    await t.mutation(api.enter.results.finalizeEvent, { sessionToken: env.staffSession });
  });

  it("judge access to results obeys resultVisibility", async () => {
    const t = setupTest();
    // Default visibility is private
    const env = await setupStaffAndJudges(t);

    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.bob });
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.bob, sheetId: bobMine.rounds[0].sheets[0].sheetId,
      values: { [env.criterionIds[0]]: 8, [env.criterionIds[1]]: 6 },
    });
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.bob, sheetId: bobMine.rounds[0].sheets[1].sheetId,
      values: { [env.criterionIds[0]]: 7, [env.criterionIds[1]]: 5 },
    });

    const carolMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.carol });
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.carol, sheetId: carolMine.rounds[0].sheets[0].sheetId,
      values: { [env.criterionIds[0]]: 9, [env.criterionIds[1]]: 7 },
    });
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.carol, sheetId: carolMine.rounds[0].sheets[1].sheetId,
      values: { [env.criterionIds[0]]: 6, [env.criterionIds[1]]: 4 },
    });
    await t.mutation(api.enter.rounds.closeRound, { sessionToken: env.staffSession, roundId: env.roundId });
    await t.mutation(api.enter.rounds.publishRound, { sessionToken: env.staffSession, roundId: env.roundId });

    // Judge cannot view private results
    await expect(
      t.query(api.enter.results.roundResults, { sessionToken: env.judgeSessions.bob, roundId: env.roundId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

    // Setup second event with organization visibility
    const t2 = setupTest();
    const env2 = await setupStaffAndJudges(t2, { resultVisibility: "organization" });
    const bobMine2 = await t2.query(api.enter.scoring.myAssignments, { sessionToken: env2.judgeSessions.bob });
    await t2.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env2.judgeSessions.bob, sheetId: bobMine2.rounds[0].sheets[0].sheetId,
      values: { [env2.criterionIds[0]]: 8, [env2.criterionIds[1]]: 6 },
    });
    await t2.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env2.judgeSessions.bob, sheetId: bobMine2.rounds[0].sheets[1].sheetId,
      values: { [env2.criterionIds[0]]: 7, [env2.criterionIds[1]]: 5 },
    });

    const carolMine2 = await t2.query(api.enter.scoring.myAssignments, { sessionToken: env2.judgeSessions.carol });
    await t2.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env2.judgeSessions.carol, sheetId: carolMine2.rounds[0].sheets[0].sheetId,
      values: { [env2.criterionIds[0]]: 9, [env2.criterionIds[1]]: 7 },
    });
    await t2.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env2.judgeSessions.carol, sheetId: carolMine2.rounds[0].sheets[1].sheetId,
      values: { [env2.criterionIds[0]]: 6, [env2.criterionIds[1]]: 4 },
    });
    await t2.mutation(api.enter.rounds.closeRound, { sessionToken: env2.staffSession, roundId: env2.roundId });
    await t2.mutation(api.enter.rounds.publishRound, { sessionToken: env2.staffSession, roundId: env2.roundId });

    // Now judge can view results in organization-visible event
    const judgeRes = await t2.query(api.enter.results.roundResults, { sessionToken: env2.judgeSessions.bob, roundId: env2.roundId });
    expect(judgeRes.version).toBe(1);
    expect(judgeRes.snapshot.categories[0].standings.length).toBe(2);
  });
});
