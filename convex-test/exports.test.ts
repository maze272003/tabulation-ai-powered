import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aliceIdentity, bobIdentity, grantPaidPlan, prepareScoredEvent, setupTest } from "./setup";

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

describe("results.exportData", () => {
  it("is blocked without the canExportReports feature (Free plan)", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await publishRound(t, ids.roundId);
    await expect(
      t.withIdentity(aliceIdentity).query(api.results.exportData, { ...BASE }),
    ).rejects.toMatchObject({ data: { code: "FEATURE_UNAVAILABLE" } });
  });

  it("exports standings and per-judge scorecards once entitled", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
    await publishRound(t, ids.roundId);
    await grantPaidPlan(t, "Starter");

    const data = await t.withIdentity(aliceIdentity).query(api.results.exportData, { ...BASE });
    expect(data.event.name).toBe("gala");
    expect(data.standings.length).toBe(2);
    const first = data.standings.find((s) => s.number === 1)!;
    expect(first.name).toBe("Maria");
    expect(first.rank).toBe(1);
    expect(first.roundScores.length).toBe(1);
    expect(first.total).toBeGreaterThan(0);

    // 2 judges x 2 contestants x 2 criteria = 8 scorecard rows.
    expect(data.scorecards.length).toBe(8);
    const sample = data.scorecards[0];
    expect(Object.keys(sample).sort()).toEqual(
      ["contestant", "criterion", "dropped", "judge", "number", "round", "value"].sort(),
    );
    expect(data.scorecards.every((row: { dropped: boolean }) => row.dropped === false)).toBe(true);
  });

  it("denies non-members", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);
    await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
    await expect(
      t.withIdentity(bobIdentity).query(api.results.exportData, { ...BASE }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
