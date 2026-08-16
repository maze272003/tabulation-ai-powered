import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { createOrgAndEvent, prepareScoredEvent, setupTest, aliceIdentity } from "./setup";

describe("score entry", () => {
  it("judge sees only their own sheets", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob });
    const carolMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.carol });
    expect(bobMine.rounds[0].sheets.length).toBe(2);
    expect(carolMine.rounds[0].sheets.length).toBe(2);
    expect(new Set([...bobMine.rounds[0].sheets, ...carolMine.rounds[0].sheets].map((s) => s.sheetId)).size).toBe(4);
  });

  it("saves a draft and marks in_progress", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob });
    const sheets = bobMine.rounds[0].sheets;
    await t.mutation(api.enter.scoring.saveDraft, {
      sessionToken: ids.judgeSessions.bob,
      sheetId: sheets[0].sheetId,
      draftValues: { [ids.criterionIds[0]]: 7 },
    });
    const detail = await t.query(api.enter.scoring.sheetDetail, {
      sessionToken: ids.judgeSessions.bob,
      roundId: ids.roundId,
      contestantId: sheets[0].contestantId,
    });
    expect(detail.sheet?.status).toBe("in_progress");
    expect(detail.sheet?.draftValues?.[ids.criterionIds[0]]).toBe(7);
  });

  it("rejects out-of-range drafts", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob });
    const sheets = bobMine.rounds[0].sheets;
    await expect(
      t.mutation(api.enter.scoring.saveDraft, {
        sessionToken: ids.judgeSessions.bob,
        sheetId: sheets[0].sheetId,
        draftValues: { [ids.criterionIds[0]]: 11 },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("submits a complete sheet immutably", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob });
    const sheets = bobMine.rounds[0].sheets;
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: ids.judgeSessions.bob,
      sheetId: sheets[0].sheetId,
      values: { [ids.criterionIds[0]]: 8, [ids.criterionIds[1]]: 6 },
    });
    const detail = await t.query(api.enter.scoring.sheetDetail, {
      sessionToken: ids.judgeSessions.bob,
      roundId: ids.roundId,
      contestantId: sheets[0].contestantId,
    });
    expect(detail.sheet?.status).toBe("submitted");
    expect(detail.sheet?.draftValues).toBeUndefined();
    const scoreRows = await t.run(async (q) =>
      (await q.db.query("scores").withIndex("by_sheet_id", (sq) => sq.eq("sheetId", sheets[0].sheetId)).collect()).length,
    );
    expect(scoreRows).toBe(2);
    await expect(
      t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: ids.judgeSessions.bob,
        sheetId: sheets[0].sheetId,
        values: { [ids.criterionIds[0]]: 1, [ids.criterionIds[1]]: 1 },
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await expect(
      t.mutation(api.enter.scoring.saveDraft, {
        sessionToken: ids.judgeSessions.bob,
        sheetId: sheets[0].sheetId,
        draftValues: {},
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("incomplete submit is rejected", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob });
    const sheets = bobMine.rounds[0].sheets;
    await expect(
      t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: ids.judgeSessions.bob,
        sheetId: sheets[0].sheetId,
        values: { [ids.criterionIds[0]]: 8 },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("judges cannot touch each other's sheets", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const carolMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.carol });
    const carolSheet = carolMine.rounds[0].sheets[0].sheetId;
    await expect(
      t.mutation(api.enter.scoring.saveDraft, {
        sessionToken: ids.judgeSessions.bob,
        sheetId: carolSheet,
        draftValues: { [ids.criterionIds[0]]: 5 },
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("non-judges and unauthenticated are refused", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob });
    const sheets = bobMine.rounds[0].sheets;
    await expect(
      t.mutation(api.enter.scoring.saveDraft, {
        sessionToken: "invalid-token",
        sheetId: sheets[0].sheetId,
        draftValues: {},
      }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });

  it("sheetDetail rejects ids from a foreign event", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "other", eventSlug: "gala2" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "other", eventSlug: "gala2", name: "R" });
    const otherRounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "other", eventSlug: "gala2" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, {
      orgSlug: "other", eventSlug: "gala2", name: "Zoe", number: 1,
    });
    const otherContestants = await t.withIdentity(aliceIdentity).query(api.contestants.list, {
      orgSlug: "other", eventSlug: "gala2",
    });
    await expect(
      t.query(api.enter.scoring.sheetDetail, {
        sessionToken: ids.judgeSessions.bob,
        roundId: otherRounds[0]._id,
        contestantId: ids.contestantIds[0],
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    await expect(
      t.query(api.enter.scoring.sheetDetail, {
        sessionToken: ids.judgeSessions.bob,
        roundId: ids.roundId,
        contestantId: otherContestants[0]._id,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("accepts decimal scores (e.g. 59.1 or 8.5) and enforces precision", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobMine = await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob });
    const sheet = bobMine.rounds[0].sheets[0];

    // Save draft with decimals
    await t.mutation(api.enter.scoring.saveDraft, {
      sessionToken: ids.judgeSessions.bob,
      sheetId: sheet.sheetId,
      draftValues: { [ids.criterionIds[0]]: 8.5, [ids.criterionIds[1]]: 7.25 },
    });

    const draftDetail = await t.query(api.enter.scoring.sheetDetail, {
      sessionToken: ids.judgeSessions.bob,
      sheetId: sheet.sheetId,
    });
    expect(draftDetail.sheet?.draftValues?.[ids.criterionIds[0]]).toBe(8.5);
    expect(draftDetail.sheet?.draftValues?.[ids.criterionIds[1]]).toBe(7.25);

    // Submit with decimal scores
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: ids.judgeSessions.bob,
      sheetId: sheet.sheetId,
      values: { [ids.criterionIds[0]]: 8.5, [ids.criterionIds[1]]: 7.25 },
    });

    const submittedDetail = await t.query(api.enter.scoring.sheetDetail, {
      sessionToken: ids.judgeSessions.bob,
      sheetId: sheet.sheetId,
    });
    expect(submittedDetail.sheet?.status).toBe("submitted");
    expect(submittedDetail.scores?.length).toBe(2);
    expect(submittedDetail.scores?.find((s) => s.criterionId === ids.criterionIds[0])?.value).toBe(8.5);
  });
});
