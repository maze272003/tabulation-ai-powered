import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aliceIdentity, createOrgAndEvent, prepareScoredEvent, setupTest } from "./setup";

const BASE = { orgSlug: "acme", eventSlug: "gala" } as const;
const TEST_PASSWORD = "password123";

type TestCtx = ReturnType<typeof setupTest>;

async function submitAll(
  t: TestCtx,
  sessionToken: string,
  criterionIds: Id<"criteria">[],
  values: number[][], // per contestant, per criterion
) {
  const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken });
  const sheets = [...mine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
  for (const [i, sheet] of sheets.entries()) {
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken,
      sheetId: sheet.sheetId,
      values: Object.fromEntries(criterionIds.map((id, k) => [id, values[i][k]])),
    });
  }
}

async function addStaffSession(t: TestCtx): Promise<string> {
  await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    ...BASE, kind: "staff", displayName: "Staff", username: "staff1", password: TEST_PASSWORD,
  });
  const event = await t.withIdentity(aliceIdentity).query(api.events.get, { ...BASE });
  const login = await t.action(api.eventAuth.login, {
    eventCode: event!.eventCode, username: "staff1", password: TEST_PASSWORD,
  });
  return login.token;
}

/**
 * Judge accounts can only be created while an event is draft, but
 * prepareScoredEvent publishes immediately. Integrity panels need >= 3
 * judges, so this mirrors prepareScoredEvent through the same public APIs
 * with the third judge created before publish.
 */
async function prepareThreeJudgePanel(
  t: TestCtx,
): Promise<{
  roundId: Id<"rounds">;
  criterionIds: Id<"criteria">[];
  judgeIds: { bob: Id<"eventAccounts">; carol: Id<"eventAccounts">; dave: Id<"eventAccounts"> };
  judgeSessions: { bob: string; carol: string; dave: string };
}> {
  await createOrgAndEvent(t, aliceIdentity, BASE);
  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { ...BASE, name: "R" });
  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { ...BASE });
  const roundId = rounds[0]._id;
  for (const [name, weight] of [["A", 60], ["B", 40]] as const) {
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      ...BASE, roundId, name, weight, minScore: 0, maxScore: 10, decimalPrecision: 0,
    });
  }
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { ...BASE, name: "Maria", number: 1 });
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { ...BASE, name: "Nina", number: 2 });

  const panel = [
    { displayName: "Bob", username: "bob" },
    { displayName: "Carol", username: "carol" },
    { displayName: "Dave", username: "dave" },
  ] as const;
  const accounts: Id<"eventAccounts">[] = [];
  for (const judge of panel) {
    const account = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      ...BASE, kind: "judge", displayName: judge.displayName, username: judge.username, password: TEST_PASSWORD,
    });
    await t.withIdentity(aliceIdentity).mutation(api.accounts.addAssignment, {
      ...BASE, accountId: account.accountId,
    });
    accounts.push(account.accountId);
  }
  await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { ...BASE });

  const event = await t.withIdentity(aliceIdentity).query(api.events.get, { ...BASE });
  const sessions: string[] = [];
  for (const judge of panel) {
    const login = await t.action(api.eventAuth.login, {
      eventCode: event!.eventCode, username: judge.username, password: TEST_PASSWORD,
    });
    sessions.push(login.token);
  }
  const withCriteria = await t.withIdentity(aliceIdentity).query(api.rounds.list, { ...BASE });
  const [bob, carol, dave] = accounts;
  const [bobSession, carolSession, daveSession] = sessions;
  return {
    roundId,
    criterionIds: withCriteria[0].criteria.map((c) => c._id as Id<"criteria">),
    judgeIds: { bob, carol, dave },
    judgeSessions: { bob: bobSession, carol: carolSession, dave: daveSession },
  };
}

describe("integrity surfaces", () => {
  it("roundMonitor includes a compact integrity summary", async () => {
    const t = setupTest();
    const ids = await prepareThreeJudgePanel(t);
    // Bob & Carol agree; Dave is +3 on everything (lenient).
    await submitAll(t, ids.judgeSessions.bob, ids.criterionIds, [[5, 5], [6, 6]]);
    await submitAll(t, ids.judgeSessions.carol, ids.criterionIds, [[5, 5], [6, 6]]);
    await submitAll(t, ids.judgeSessions.dave, ids.criterionIds, [[8, 8], [9, 9]]);

    const staffToken = await addStaffSession(t);

    const monitor = await t.query(api.enter.rounds.roundMonitor, {
      sessionToken: staffToken, roundId: ids.roundId,
    });
    expect(monitor.integrity.length).toBe(3);
    const daveEntry = monitor.integrity.find((i) => i.judgeId === ids.judgeIds.dave)!;
    expect(daveEntry.flags.some((f) => f.metric === "severity_bias")).toBe(true);
  });

  it("integrityReport returns full metrics for the review page", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const staffToken = await addStaffSession(t);
    const report = await t.query(api.enter.rounds.integrityReport, {
      sessionToken: staffToken, roundId: ids.roundId,
    });
    expect(report.roundName).toBe("R");
    expect(report.judges.length).toBe(2); // bob + carol
    expect(report.judges.every((j) => Array.isArray(j.flags))).toBe(true);
  });
});
