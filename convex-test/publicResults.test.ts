import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aliceIdentity, prepareScoredEvent, setupTest } from "./setup";

const BASE = { orgSlug: "acme", eventSlug: "gala" } as const;

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

async function publishRound(t: ReturnType<typeof setupTest>, roundId: Id<"rounds">) {
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { ...BASE, roundId });
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { ...BASE, roundId });
}

describe("publicResults.get", () => {
  it("returns null for private events even when published", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t); // default visibility: private
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await publishRound(t, ids.roundId);
    await expect(t.query(api.publicResults.get, { eventCode: ids.eventCode })).resolves.toBeNull();
  });

  it("returns only published rounds with projected fields for public events", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t, { resultVisibility: "public" });
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await publishRound(t, ids.roundId);

    const result = await t.query(api.publicResults.get, { eventCode: ids.eventCode });
    if (result === null) throw new Error("Expected results for a public event");
    expect(result.event.name).toBe("gala");
    expect(result.categories.length).toBe(1);
    expect(result.rounds.length).toBe(1);
    const standings = result.rounds[0].categories[0].standings;
    expect(standings.length).toBe(2);
    // Projection check: only number/name/photoUrl/rank/roundScore/advanced.
    expect(Object.keys(standings[0]).sort()).toEqual(
      ["advanced", "name", "number", "photoUrl", "rank", "roundScore"].sort(),
    );
    expect(standings.some((s: { rank: number | null }) => s.rank === 1)).toBe(true);
  });

  it("omits rounds that are not yet published", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t, { resultVisibility: "public" });
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    // Close but do not publish.
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { ...BASE, roundId: ids.roundId });
    const result = await t.query(api.publicResults.get, { eventCode: ids.eventCode });
    if (result === null) throw new Error("Expected results for a public event");
    expect(result.rounds).toEqual([]);
  });

  it("returns null for unknown event codes", async () => {
    const t = setupTest();
    await expect(t.query(api.publicResults.get, { eventCode: "NOPE42" })).resolves.toBeNull();
  });
});
