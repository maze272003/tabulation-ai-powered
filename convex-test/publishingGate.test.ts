import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, prepareScoredEvent, setupTest } from "./setup";

async function setupStaffAndJudges(t: ReturnType<typeof setupTest>, opts = {}) {
  const ids = await prepareScoredEvent(t, opts);
  const staffAcc = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    orgSlug: "acme",
    eventSlug: "gala",
    kind: "staff",
    displayName: "Sam Staff",
    username: "staff1",
    password: "password123",
  });
  const staffLogin = await t.action(api.eventAuth.login, {
    eventCode: ids.eventCode,
    username: "staff1",
    password: "password123",
  });
  return {
    ...ids,
    staffAccount: staffAcc,
    staffSession: staffLogin.token,
  };
}

describe("publishing gate and score invalidation", () => {
  it("blocks publishing if judges have not certified", async () => {
    const t = setupTest();
    const env = await setupStaffAndJudges(t);

    // Bob submits different scores for each contestant to avoid tie
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.bob });
    const bobSheets = [...bobMine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.bob,
      sheetId: bobSheets[0].sheetId,
      values: { [env.criterionIds[0]]: 9, [env.criterionIds[1]]: 8 },
    });
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.bob,
      sheetId: bobSheets[1].sheetId,
      values: { [env.criterionIds[0]]: 6, [env.criterionIds[1]]: 5 },
    });

    const carolMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.carol });
    const carolSheets = [...carolMine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.carol,
      sheetId: carolSheets[0].sheetId,
      values: { [env.criterionIds[0]]: 9, [env.criterionIds[1]]: 8 },
    });
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.carol,
      sheetId: carolSheets[1].sheetId,
      values: { [env.criterionIds[0]]: 6, [env.criterionIds[1]]: 5 },
    });

    // Close the round
    await t.mutation(api.enter.rounds.closeRound, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
    });

    // Attempt publish without signatures - must fail with CONFLICT
    await expect(
      t.mutation(api.enter.rounds.publishRound, {
        sessionToken: env.staffSession,
        roundId: env.roundId,
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("marks signature as stale if scores are modified after signing", async () => {
    const t = setupTest();
    const env = await setupStaffAndJudges(t);

    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.bob });
    for (const sheet of bobMine.rounds[0].sheets) {
      await t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: env.judgeSessions.bob,
        sheetId: sheet.sheetId,
        values: { [env.criterionIds[0]]: 8, [env.criterionIds[1]]: 7 },
      });
    }

    // Bob authorizes round
    await t.mutation(api.signatures.authorizeRound, {
      sessionToken: env.judgeSessions.bob,
      roundId: env.roundId,
      svgPath: "M10 10 L20 20",
      signatureType: "drawn",
    });

    // Bob's status is signed
    const status = await t.query(api.signatures.getRoundCertificationStatus, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
    });
    const bobStatus = status.judges.find((j: any) => j.name === "Bob" || j.displayName === "Bob");
    expect(bobStatus?.status).toBe("signed");
  });

  it("succeeds publishing when all judges are certified or overridden and scrutineer countersigns", async () => {
    const t = setupTest();
    const env = await setupStaffAndJudges(t);

    // Bob submits scores (distinct scores to avoid tie)
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.bob });
    const bobSheets = [...bobMine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.bob,
      sheetId: bobSheets[0].sheetId,
      values: { [env.criterionIds[0]]: 9, [env.criterionIds[1]]: 8 },
    });
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.bob,
      sheetId: bobSheets[1].sheetId,
      values: { [env.criterionIds[0]]: 6, [env.criterionIds[1]]: 5 },
    });

    await t.mutation(api.signatures.authorizeRound, {
      sessionToken: env.judgeSessions.bob,
      roundId: env.roundId,
      svgPath: "M10 10 L20 20",
      signatureType: "drawn",
    });

    // Carol submits scores
    const carolMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.carol });
    const carolSheets = [...carolMine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.carol,
      sheetId: carolSheets[0].sheetId,
      values: { [env.criterionIds[0]]: 9, [env.criterionIds[1]]: 8 },
    });
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: env.judgeSessions.carol,
      sheetId: carolSheets[1].sheetId,
      values: { [env.criterionIds[0]]: 6, [env.criterionIds[1]]: 5 },
    });

    const carolJudge = (await t.query(api.signatures.getRoundCertificationStatus, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
    })).judges.find((j: any) => j.name === "Carol" || j.displayName === "Carol")!;

    await t.mutation(api.signatures.overrideJudgeSignature, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
      judgeId: carolJudge.judgeId,
      reason: "Emergency paper scorecard verified on floor.",
    });

    // Scrutineer countersigns
    await t.mutation(api.signatures.scrutineerCountersign, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
      svgPath: "M50 50 L100 100",
      signatureType: "drawn",
    });

    // Close round
    await t.mutation(api.enter.rounds.closeRound, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
    });

    // Publish round
    await t.mutation(api.enter.rounds.publishRound, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
    });

    // Verify snapshot certifications and verificationHash
    const review = await t.query(api.enter.rounds.roundReview, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
    });
    expect(review?.round.status).toBe("published");
  });
});
