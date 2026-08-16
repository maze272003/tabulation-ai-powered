import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aliceIdentity, bobIdentity, carolIdentity, prepareScoredEvent, setupTest } from "./setup";

async function submitJudgeScores(
  t: ReturnType<typeof setupTest>,
  identity: typeof bobIdentity | typeof carolIdentity,
  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
  perContestant: number[][],
) {
  const mine = await t.withIdentity(identity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
  const sheets = [...mine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
  for (const [i, sheet] of sheets.entries()) {
    await t.withIdentity(identity).mutation(api.scoring.submitSheet, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId,
      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
    });
  }
}

async function closeRound(t: ReturnType<typeof setupTest>, roundId: Id<"rounds">) {
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId });
}

describe("review & decisions", () => {
  it("review refuses while the round is open, works when closed", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await expect(
      t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await closeRound(t, ids.roundId);
    const review = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    const maria = review.standings.find((s: { contestantName: string }) => s.contestantName === "Maria")!;
    const nina = review.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")!;
    expect(maria.rank).toBe(1);
    expect(maria.roundScore).toBe(77);
    expect(nina.rank).toBe(2);
    expect(nina.roundScore).toBe(50);
    expect(review.unresolvedTies).toEqual([]);
  });

  it("review requires score.manage", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await closeRound(t, ids.roundId);
    await expect(
      t.withIdentity(bobIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("identical scores surface an unresolved tie; a manual break resolves it", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[7, 7], [7, 7]]);
    await submitJudgeScores(t, carolIdentity, ids, [[7, 7], [7, 7]]);
    await closeRound(t, ids.roundId);
    const before = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(before.unresolvedTies.length).toBe(1);
    expect(before.unresolvedTies[0].names.sort()).toEqual(["Maria", "Nina"]);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
    });
    const after = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(after.unresolvedTies).toEqual([]);
    expect(after.standings.find((s: { contestantName: string }) => s.contestantName === "Maria")?.rank).toBe(1);
    expect(after.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.rank).toBe(2);
    expect(after.tieBreaks.length).toBe(1);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.removeTieBreak, {
      orgSlug: "acme", eventSlug: "gala", tieBreakId: after.tieBreaks[0]._id,
    });
    const reverted = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(reverted.unresolvedTies.length).toBe(1);
  });

  it("tie breaks validate the window and the permutation", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
        tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await closeRound(t, ids.roundId);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
        tiedContestantIds: ids.contestantIds, orderedIds: [ids.contestantIds[0]],
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("rejects an overlapping tie break for already-covered contestants", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[7, 7], [7, 7]]);
    await submitJudgeScores(t, carolIdentity, ids, [[7, 7], [7, 7]]);
    await closeRound(t, ids.roundId);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
        tiedContestantIds: ids.contestantIds,
        orderedIds: [ids.contestantIds[1], ids.contestantIds[0]],
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const review = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(review.tieBreaks.length).toBe(1);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.removeTieBreak, {
      orgSlug: "acme", eventSlug: "gala", tieBreakId: review.tieBreaks[0]._id,
    });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      tiedContestantIds: ids.contestantIds,
      orderedIds: [ids.contestantIds[1], ids.contestantIds[0]],
    });
    const after = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(after.tieBreaks.length).toBe(1);
  });

  it("tie breaks with disjoint groups coexist; partial overlap is rejected until the covering break is removed", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.reopen, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Omar", number: 3 });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Pat", number: 4 });
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
    const roster = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
    const omar = roster.find((k: { name: string }) => k.name === "Omar")!._id as Id<"contestants">;
    const pat = roster.find((k: { name: string }) => k.name === "Pat")!._id as Id<"contestants">;
    await submitJudgeScores(t, bobIdentity, ids, [[7, 7], [7, 7], [3, 3], [4, 4]]);
    await submitJudgeScores(t, carolIdentity, ids, [[7, 7], [7, 7], [3, 3], [4, 4]]);
    await closeRound(t, ids.roundId);
    const [maria, nina] = ids.contestantIds;
    const addBreak = (tiedContestantIds: Id<"contestants">[], orderedIds: Id<"contestants">[]) =>
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, tiedContestantIds, orderedIds,
      });
    await addBreak([maria, nina], [maria, nina]);
    await expect(addBreak([nina, omar], [nina, omar])).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await addBreak([omar, pat], [omar, pat]);
    const review = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(review.tieBreaks.length).toBe(2);
    const firstBreak = review.tieBreaks.find((b: { tiedContestantIds: string[] }) => b.tiedContestantIds.includes(maria))!;
    const disjointBreak = review.tieBreaks.find((b: { tiedContestantIds: string[] }) => b.tiedContestantIds.includes(pat))!;
    for (const breakId of [firstBreak._id, disjointBreak._id]) {
      await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.removeTieBreak, {
        orgSlug: "acme", eventSlug: "gala", tieBreakId: breakId,
      });
    }
    await addBreak([nina, omar], [nina, omar]);
    const afterRemoval = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(afterRemoval.tieBreaks.length).toBe(1);
  });

  it("advancement preview honors top_count and overrides", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t, {
      qualifiesToNextRound: true,
      advancement: { mode: "top_count", count: 1, allowOverride: true },
    });
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await closeRound(t, ids.roundId);
    const review = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(review.standings.find((s: { contestantName: string }) => s.contestantName === "Maria")?.advancement).toBe(true);
    expect(review.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.advancement).toBe(false);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      contestantId: ids.contestantIds[1], action: "force_advance",
    });
    const overridden = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(overridden.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.advancement).toBe(true);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.removeAdvancementOverride, {
      orgSlug: "acme", eventSlug: "gala", overrideId: overridden.overrides[0]._id,
    });
    const reverted = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(reverted.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.advancement).toBe(false);
  });

  it("overrides are refused when not allowed or elimination is off", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t, {
      qualifiesToNextRound: true,
      advancement: { mode: "top_count", count: 1, allowOverride: false },
    });
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await closeRound(t, ids.roundId);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
        contestantId: ids.contestantIds[0], action: "force_advance",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    const t2 = setupTest();
    const ids2 = await prepareScoredEvent(t2, {
      eliminationEnabled: false,
      qualifiesToNextRound: true,
      advancement: { mode: "top_count", count: 1, allowOverride: true },
    });
    await submitJudgeScores(t2, bobIdentity, ids2, [[8, 6], [5, 5]]);
    await closeRound(t2, ids2.roundId);
    await expect(
      t2.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids2.roundId,
        contestantId: ids2.contestantIds[0], action: "force_advance",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("publish and corrections allocate strictly increasing versions without duplicates", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await closeRound(t, ids.roundId);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
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
  });

  it("snapshots freeze persisted and correction-time overrides with their source", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t, {
      qualifiesToNextRound: true,
      advancement: { mode: "top_count", count: 1, allowOverride: true },
    });
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await closeRound(t, ids.roundId);
    const members = await t.withIdentity(aliceIdentity).query(api.members.list, { orgSlug: "acme" });
    const aliceProfileId = members.find((m: { email: string }) => m.email === "alice@example.com")!.userId;
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      contestantId: ids.contestantIds[1], action: "force_advance",
    });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    const published = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(published.snapshot.decisions.advancementOverrides).toEqual([
      { contestantId: ids.contestantIds[1], action: "force_advance", createdById: aliceProfileId, source: "persisted" },
    ]);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "override reversal",
      overrides: [{ contestantId: ids.contestantIds[0], action: "force_cut" }],
    });
    const corrected = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(corrected.version).toBe(2);
    expect(corrected.snapshot.decisions.advancementOverrides).toEqual([
      { contestantId: ids.contestantIds[1], action: "force_advance", createdById: aliceProfileId, source: "persisted" },
      { contestantId: ids.contestantIds[0], action: "force_cut", createdById: aliceProfileId, source: "correction" },
    ]);
    const standings = corrected.snapshot.categories[0].standings;
    const maria = standings.find((s: { contestantId: string }) => s.contestantId === ids.contestantIds[0])!;
    const nina = standings.find((s: { contestantId: string }) => s.contestantId === ids.contestantIds[1])!;
    expect(maria.advanced).toBe(false);
    expect(nina.advanced).toBe(true);
  });
});
