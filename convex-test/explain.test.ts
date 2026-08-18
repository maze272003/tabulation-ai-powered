import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, prepareScoredEvent, setupTest } from "./setup";

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

async function setupPublishedRound(t: ReturnType<typeof setupTest>) {
  const ids = await prepareScoredEvent(t);
  await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
  await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { ...BASE, roundId: ids.roundId });
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { ...BASE, roundId: ids.roundId });
  return { ids };
}

describe("results.explain", () => {
  it("serves cached explanations without touching the LLM", async () => {
    const t = setupTest();
    const { ids } = await setupPublishedRound(t);

    // Seed the cache directly through the internal mutation (no GEMINI_API_KEY needed):
    // storeExplanation upserts keyed to the exact version the action read,
    // same as the production path (explainContext -> storeExplanation).
    const context = await t.withIdentity(aliceIdentity).query(internal.results.explainContext, {
      ...BASE, roundId: ids.roundId, contestantId: ids.contestantIds[0],
    });
    expect(context.cachedExplanation).toBeNull();
    const stored = await t.withIdentity(aliceIdentity).mutation(internal.results.storeExplanation, {
      ...BASE, roundId: ids.roundId,
      contestantId: ids.contestantIds[0],
      explanation: "Cached: Maria ranked first on weighted criteria.",
      model: "test",
      versionId: context.versionId,
    });
    expect(stored).toBeTruthy();

    const result = await t.withIdentity(aliceIdentity).action(api.results.explain, {
      ...BASE, roundId: ids.roundId, contestantId: ids.contestantIds[0],
    });
    expect(result.cached).toBe(true);
    expect(result.explanation).toContain("Cached");
  });

  it("returns UPSTREAM when uncached and no GEMINI_API_KEY is configured", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const t = setupTest();
      const { ids } = await setupPublishedRound(t);
      await expect(
        t.withIdentity(aliceIdentity).action(api.results.explain, {
          ...BASE, roundId: ids.roundId, contestantId: ids.contestantIds[0],
        }),
      ).rejects.toMatchObject({ data: { code: "UPSTREAM" } });
    } finally {
      if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
    }
  });

  it("denies non-members", async () => {
    const t = setupTest();
    const { ids } = await setupPublishedRound(t);
    await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
    await expect(
      t.withIdentity(bobIdentity).action(api.results.explain, {
        ...BASE, roundId: ids.roundId, contestantId: ids.contestantIds[0],
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
