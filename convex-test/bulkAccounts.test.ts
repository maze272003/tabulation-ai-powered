import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

const BASE = { orgSlug: "acme", eventSlug: "gala" } as const;

async function listAccounts(t: ReturnType<typeof setupTest>) {
  return t.withIdentity(aliceIdentity).query(api.accounts.list, { ...BASE });
}

describe("accounts.bulkCreate", () => {
  it("bulk-creates judges with generated credentials and assignments", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const result = await t.withIdentity(aliceIdentity).action(api.accounts.bulkCreate, {
      ...BASE,
      kind: "judge",
      entries: [{ displayName: "Bob" }, { displayName: "Carol" }],
    });
    expect(result.accounts.length).toBe(2);
    expect(result.accounts.map((a) => a.username)).toEqual(["bob", "carol"]);
    for (const account of result.accounts) {
      expect(account.password.length).toBeGreaterThanOrEqual(8);
    }
    const list = await listAccounts(t);
    expect(list.length).toBe(2);
    // Judge accounts each get a base judgeAssignment, mirroring single create.
    expect(list.every((a) => (a.assignments?.length ?? 0) === 1)).toBe(true);
  });

  it("dedupes auto-generated usernames against existing and within the batch", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      ...BASE, kind: "judge", displayName: "Bob", username: "bob", password: "password123",
    });
    const result = await t.withIdentity(aliceIdentity).action(api.accounts.bulkCreate, {
      ...BASE,
      kind: "judge",
      entries: [{ displayName: "Bob" }, { displayName: "Bob" }],
    });
    expect(result.accounts.map((a) => a.username)).toEqual(["bob-2", "bob-3"]);
  });

  it("rejects explicit duplicate usernames with CONFLICT and rolls back", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).action(api.accounts.bulkCreate, {
        ...BASE,
        kind: "judge",
        entries: [{ displayName: "A", username: "dup" }, { displayName: "B", username: "dup" }],
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    expect((await listAccounts(t)).length).toBe(0);
  });

  it("enforces the judges plan limit across the whole batch", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    // Free plan allows 5 judges total.
    await expect(
      t.withIdentity(aliceIdentity).action(api.accounts.bulkCreate, {
        ...BASE,
        kind: "judge",
        entries: Array.from({ length: 6 }, (_, i) => ({ displayName: `Judge ${i + 1}` })),
      }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
    expect((await listAccounts(t)).length).toBe(0);
  });

  it("rejects invalid explicit usernames", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).action(api.accounts.bulkCreate, {
        ...BASE,
        kind: "judge",
        entries: [{ displayName: "A", username: "BAD NAME!" }],
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("rejects an empty display name with a row index", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).action(api.accounts.bulkCreate, {
        ...BASE,
        kind: "judge",
        entries: [{ displayName: "  " }],
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR", context: { rowIndex: 1 } } });
  });
});
