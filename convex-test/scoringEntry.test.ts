import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, carolIdentity, prepareScoredEvent, setupTest } from "./setup";

async function bobSheets(t: ReturnType<typeof setupTest>) {
  const mine = await t.withIdentity(bobIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
  return mine.rounds[0].sheets;
}

describe("score entry", () => {
  it("judge sees only their own sheets", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);
    const bobList = await bobSheets(t);
    const carolMine = await t.withIdentity(carolIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
    expect(bobList.length).toBe(2);
    expect(carolMine.rounds[0].sheets.length).toBe(2);
    expect(new Set([...bobList, ...carolMine.rounds[0].sheets].map((s) => s.sheetId)).size).toBe(4);
  });

  it("saves a draft and marks in_progress", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
      draftValues: { [ids.criterionIds[0]]: 7 },
    });
    const detail = await t.withIdentity(bobIdentity).query(api.scoring.sheetDetail, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, contestantId: sheets[0].contestantId,
    });
    expect(detail.sheet?.status).toBe("in_progress");
    expect(detail.sheet?.draftValues?.[ids.criterionIds[0]]).toBe(7);
  });

  it("rejects out-of-range drafts", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
        draftValues: { [ids.criterionIds[0]]: 11 },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("submits a complete sheet immutably", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await t.withIdentity(bobIdentity).mutation(api.scoring.submitSheet, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
      values: { [ids.criterionIds[0]]: 8, [ids.criterionIds[1]]: 6 },
    });
    const detail = await t.withIdentity(bobIdentity).query(api.scoring.sheetDetail, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, contestantId: sheets[0].contestantId,
    });
    expect(detail.sheet?.status).toBe("submitted");
    expect(detail.sheet?.draftValues).toBeUndefined();
    const scoreRows = await t.run(async (q) =>
      (await q.db.query("scores").withIndex("by_sheet_id", (sq) => sq.eq("sheetId", sheets[0].sheetId)).collect()).length,
    );
    expect(scoreRows).toBe(2);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.submitSheet, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
        values: { [ids.criterionIds[0]]: 1, [ids.criterionIds[1]]: 1 },
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId, draftValues: {},
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("incomplete submit is rejected", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.submitSheet, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
        values: { [ids.criterionIds[0]]: 8 },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("judges cannot touch each other's sheets", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const carolMine = await t.withIdentity(carolIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
    const carolSheet = carolMine.rounds[0].sheets[0].sheetId;
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
        orgSlug: "acme", eventSlug: "gala", sheetId: carolSheet,
        draftValues: { [ids.criterionIds[0]]: 5 },
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("non-judges and unauthenticated are refused", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.scoring.saveDraft, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId, draftValues: {},
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.mutation(api.scoring.saveDraft, { orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId, draftValues: {} }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });

  it("sheetDetail rejects ids from a foreign event", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: "other", slug: "other" });
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "other", name: "gala2", slug: "gala2" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "other", eventSlug: "gala2", name: "R" });
    const otherRounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "other", eventSlug: "gala2" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, {
      orgSlug: "other", eventSlug: "gala2", name: "Zoe", number: 1,
    });
    const otherContestants = await t.withIdentity(aliceIdentity).query(api.contestants.list, {
      orgSlug: "other", eventSlug: "gala2",
    });
    await expect(
      t.withIdentity(bobIdentity).query(api.scoring.sheetDetail, {
        orgSlug: "acme", eventSlug: "gala", roundId: otherRounds[0]._id, contestantId: ids.contestantIds[0],
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    await expect(
      t.withIdentity(bobIdentity).query(api.scoring.sheetDetail, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, contestantId: otherContestants[0]._id,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
