import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

const BASE = { orgSlug: "acme", eventSlug: "gala" } as const;

function row(number: number, name = `Contestant ${number}`, category = "Open") {
  return { number, name, category };
}

async function listContestants(t: ReturnType<typeof setupTest>) {
  return t.withIdentity(aliceIdentity).query(api.contestants.list, { ...BASE });
}

// Mirrors configureValidEvent in lifecycle.test.ts: eventLifecycle.publish only
// succeeds for events passing readiness (round, criteria, contestant, judge).
async function configurePublishableEvent(t: ReturnType<typeof setupTest>) {
  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { ...BASE, name: "R" });
  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { ...BASE });
  const roundId = rounds[0]._id;
  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { ...BASE, roundId, name: "A", weight: 60, minScore: 0, maxScore: 10, decimalPrecision: 0 });
  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { ...BASE, roundId, name: "B", weight: 40, minScore: 0, maxScore: 10, decimalPrecision: 0 });
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { ...BASE, name: "Maria", number: 1 });
  const judgeAcc = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    ...BASE, kind: "judge", displayName: "Bob", username: "bob", password: "password123",
  });
  await t.withIdentity(aliceIdentity).mutation(api.accounts.addAssignment, {
    ...BASE, accountId: judgeAcc.accountId,
  });
}

describe("contestants.bulkAdd", () => {
  it("imports valid rows and returns the count", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const result = await t.withIdentity(aliceIdentity).mutation(api.contestants.bulkAdd, {
      ...BASE,
      rows: [row(1, "Maria"), row(2, "Nina", "Open"), { ...row(3, "Jo"), group: "Group A" }],
    });
    expect(result.added).toBe(3);
    const list = await listContestants(t);
    expect(list.length).toBe(3);
    expect(list.find((c) => c.number === 3)?.group).toBe("Group A");
  });

  it("resolves category names case-insensitively", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const result = await t.withIdentity(aliceIdentity).mutation(api.contestants.bulkAdd, {
      ...BASE,
      rows: [row(1, "Maria", "open")],
    });
    expect(result.added).toBe(1);
  });

  it("rejects an unknown category with a row index and rolls back", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.bulkAdd, {
        ...BASE,
        rows: [row(1, "Maria"), row(2, "Nina", "Does Not Exist")],
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR", context: { rowIndex: 2 } } });
    expect((await listContestants(t)).length).toBe(0);
  });

  it("rejects duplicates inside the file with CONFLICT", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.bulkAdd, {
        ...BASE,
        rows: [row(1, "Maria"), row(1, "Dup")],
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("rejects numbers already used in the event with CONFLICT", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { ...BASE, name: "Maria", number: 5 });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.bulkAdd, {
        ...BASE,
        rows: [row(5, "Dup")],
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("enforces the plan limit against current usage plus the whole import", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    // Free plan allows 20 contestants. 18 existing + 3 incoming = 21 > 20.
    await t.withIdentity(aliceIdentity).mutation(api.contestants.bulkAdd, {
      ...BASE,
      rows: Array.from({ length: 18 }, (_, i) => row(i + 1)),
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.bulkAdd, {
        ...BASE,
        rows: [row(19), row(20), row(21)],
      }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
    expect((await listContestants(t)).length).toBe(18);
  });

  it("rejects an empty import and imports over 500 rows", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.bulkAdd, { ...BASE, rows: [] }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("is locked once the event is published", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await configurePublishableEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { ...BASE });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.bulkAdd, {
        ...BASE,
        rows: [row(1, "Maria")],
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
