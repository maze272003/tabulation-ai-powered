import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

describe("autoAdvance and roundTelemetry", () => {
  it("calculates roundTelemetry correctly for in-progress and submitted sheets", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });

    // Round 1
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
      orgSlug: "acme",
      eventSlug: "gala",
      name: "Prelims",
      weight: 50,
    });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    const r1Id = rounds[0]._id;

    // Round 2
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
      orgSlug: "acme",
      eventSlug: "gala",
      name: "Finals",
      weight: 50,
    });

    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme",
      eventSlug: "gala",
      roundId: r1Id,
      name: "Performance",
      weight: 100,
      minScore: 0,
      maxScore: 100,
      decimalPrecision: 0,
    });

    const r2Id = (await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" }))[1]._id;
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme",
      eventSlug: "gala",
      roundId: r2Id,
      name: "Final Q&A",
      weight: 100,
      minScore: 0,
      maxScore: 100,
      decimalPrecision: 0,
    });

    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Alice", number: 1 });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Bob", number: 2 });

    const judgeAcc = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme",
      eventSlug: "gala",
      kind: "judge",
      displayName: "Judge 1",
      username: "judge1",
      password: "password123",
    });

    await t.withIdentity(aliceIdentity).mutation(api.accounts.addAssignment, {
      orgSlug: "acme",
      eventSlug: "gala",
      accountId: judgeAcc.accountId,
    });

    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });

    // Check telemetry before any submissions
    const telemetryInitial = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundTelemetry, {
      orgSlug: "acme",
      eventSlug: "gala",
      roundId: r1Id,
    });

    expect(telemetryInitial.totalSheets).toBe(2);
    expect(telemetryInitial.submittedSheets).toBe(0);
    expect(telemetryInitial.completionPercent).toBe(0);
    expect(telemetryInitial.isAllSubmitted).toBe(false);
    expect(telemetryInitial.laggingJudges.length).toBe(1);

    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });

    // Judge logs in and submits one sheet
    const loginRes = await t.action(api.eventAuth.login, {
      eventCode: ev!.eventCode,
      username: "judge1",
      password: "password123",
    });
    const sessionToken = loginRes.token;

    const mySheets = await t.query(api.enter.scoring.myAssignments, { sessionToken });
    const r1Sheets = mySheets.rounds.find((r) => r.roundId === r1Id)!.sheets;
    const criterion = (await t.query(api.enter.scoring.sheetDetail, {
      sessionToken,
      sheetId: r1Sheets[0].sheetId,
    })).criteria[0];

    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken,
      sheetId: r1Sheets[0].sheetId,
      values: { [criterion._id]: 95 },
    });

    const telemetryMid = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundTelemetry, {
      orgSlug: "acme",
      eventSlug: "gala",
      roundId: r1Id,
    });

    expect(telemetryMid.submittedSheets).toBe(1);
    expect(telemetryMid.completionPercent).toBe(50);
    expect(telemetryMid.isAllSubmitted).toBe(false);

    // Submit second sheet
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken,
      sheetId: r1Sheets[1].sheetId,
      values: { [criterion._id]: 80 },
    });

    const telemetryDone = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundTelemetry, {
      orgSlug: "acme",
      eventSlug: "gala",
      roundId: r1Id,
    });

    expect(telemetryDone.submittedSheets).toBe(2);
    expect(telemetryDone.completionPercent).toBe(100);
    expect(telemetryDone.isAllSubmitted).toBe(true);
    expect(telemetryDone.laggingJudges.length).toBe(0);

    // Close and publish round 1
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, {
      orgSlug: "acme",
      eventSlug: "gala",
      roundId: r1Id,
    });

    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, {
      orgSlug: "acme",
      eventSlug: "gala",
      roundId: r1Id,
    });

    // Auto advance to next round
    const advanceResult = await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.autoAdvanceNextRound, {
      orgSlug: "acme",
      eventSlug: "gala",
      roundId: r1Id,
    });

    expect(advanceResult.advanced).toBeGreaterThan(0);
    expect(advanceResult.nextRoundId).toBe(r2Id);
  });
});
