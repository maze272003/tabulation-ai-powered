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

describe("signatures backend", () => {
  it("registers and retrieves a signature specimen for a judge", async () => {
    const t = setupTest();
    const env = await setupStaffAndJudges(t);

    const validSvg = "M10 10 L50 50 Q70 80 100 100";
    await t.mutation(api.signatures.registerSignatureSpecimen, {
      sessionToken: env.judgeSessions.bob,
      svgPath: validSvg,
      signatureType: "drawn",
      titleOrAffiliation: "Senior Judge",
    });

    const specimen = await t.query(api.signatures.getSignatureSpecimen, {
      sessionToken: env.judgeSessions.bob,
    });

    expect(specimen.signatureSpecimen).toBe(validSvg);
    expect(specimen.signatureType).toBe("drawn");
    expect(specimen.titleOrAffiliation).toBe("Senior Judge");
    expect(specimen.signatureRegisteredAt).toBeTypeOf("number");
  });

  it("rejects invalid or malicious SVG path content", async () => {
    const t = setupTest();
    const env = await setupStaffAndJudges(t);

    await expect(
      t.mutation(api.signatures.registerSignatureSpecimen, {
        sessionToken: env.judgeSessions.bob,
        svgPath: "<script>alert(1)</script>",
        signatureType: "drawn",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("authorizes a round and computes deterministic scoresHash", async () => {
    const t = setupTest();
    const env = await setupStaffAndJudges(t);
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: env.judgeSessions.bob });
    const sheets = bobMine.rounds[0].sheets;

    // Submit all sheets for Bob
    for (const sheet of sheets) {
      await t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: env.judgeSessions.bob,
        sheetId: sheet.sheetId,
        values: { [env.criterionIds[0]]: 8, [env.criterionIds[1]]: 7 },
      });
    }

    const validSvg = "M10 20 L30 40";
    const result = await t.mutation(api.signatures.authorizeRound, {
      sessionToken: env.judgeSessions.bob,
      roundId: env.roundId,
      svgPath: validSvg,
      signatureType: "drawn",
      judgeNotes: "All contestants evaluated strictly.",
    });

    expect(result.signatureId).toBeDefined();
    expect(result.scoresHash).toBeTypeOf("string");
    expect(result.scoresHash.length).toBe(64); // SHA-256 hex string

    // Check certification status query
    const status = await t.query(api.signatures.getRoundCertificationStatus, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
    });

    expect(status.judges.length).toBeGreaterThan(0);
    const bobStatus = status.judges.find((j: any) => j.name === "Bob" || j.displayName === "Bob");
    expect(bobStatus?.status).toBe("signed");
    expect(bobStatus?.scoresHash).toBe(result.scoresHash);
  });

  it("allows staff to nudge a judge and record emergency override", async () => {
    const t = setupTest();
    const env = await setupStaffAndJudges(t);

    const status = await t.query(api.signatures.getRoundCertificationStatus, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
    });
    const carol = status.judges.find((j: any) => j.name === "Carol" || j.displayName === "Carol")!;

    // Nudge Carol
    await t.mutation(api.signatures.nudgeJudge, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
      judgeId: carol.judgeId,
      message: "Please submit your scores",
    });

    // Override Carol's signature
    await t.mutation(api.signatures.overrideJudgeSignature, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
      judgeId: carol.judgeId,
      reason: "Judge tablet battery depleted. Physical paper signed.",
    });

    const updatedStatus = await t.query(api.signatures.getRoundCertificationStatus, {
      sessionToken: env.staffSession,
      roundId: env.roundId,
    });
    const carolUpdated = updatedStatus.judges.find((j: any) => j.judgeId === carol.judgeId);
    expect(carolUpdated?.status).toBe("overridden");
    expect(carolUpdated?.overrideReason).toContain("Judge tablet battery depleted");
  });
});
