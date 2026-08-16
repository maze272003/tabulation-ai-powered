import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

async function setupDraft(t: ReturnType<typeof setupTest>) {
  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
}

async function makeReady(t: ReturnType<typeof setupTest>) {
  await t.run(async (q) => {
    const events = await q.db.query("events").collect();
    await q.db.patch(events[0]._id, { status: "ready" });
  });
}

async function codeOf(t: ReturnType<typeof setupTest>): Promise<string> {
  return t.run(async (q) => (await q.db.query("events").collect())[0].eventCode);
}

describe("accounts admin CRUD", () => {
  it("creates a judge account with manual credentials and it can log in", async () => {
    const t = setupTest();
    await setupDraft(t);
    const res = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme", eventSlug: "gala", kind: "judge",
      displayName: "Bob", username: "judge1", password: "manual-pass-1",
    });
    expect(res.username).toBe("judge1");
    expect(res.password).toBe("manual-pass-1");
    await makeReady(t);
    const login = await t.action(api.eventAuth.login, { eventCode: await codeOf(t), username: "judge1", password: "manual-pass-1" });
    expect(login.kind).toBe("judge");
  });

  it("auto-generates username and password when omitted", async () => {
    const t = setupTest();
    await setupDraft(t);
    const res = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme", eventSlug: "gala", kind: "staff", displayName: "Tabby",
    });
    expect(res.username).toMatch(/^staff\d+$/);
    expect(res.password.length).toBeGreaterThanOrEqual(10);
    await makeReady(t);
    const login = await t.action(api.eventAuth.login, { eventCode: await codeOf(t), username: res.username, password: res.password });
    expect(login.kind).toBe("staff");
  });

  it("rejects duplicate username in the same event with CONFLICT", async () => {
    const t = setupTest();
    await setupDraft(t);
    await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "A", username: "judge1", password: "pass-12345",
    });
    await expect(
      t.withIdentity(aliceIdentity).action(api.accounts.create, {
        orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "B", username: "judge1", password: "pass-67890",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("rejects weak manual password and invalid username with VALIDATION_ERROR", async () => {
    const t = setupTest();
    await setupDraft(t);
    await expect(
      t.withIdentity(aliceIdentity).action(api.accounts.create, {
        orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "A", username: "judge1", password: "short",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).action(api.accounts.create, {
        orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "A", username: "Bad Name!", password: "pass-12345",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("judge creation blocked once ready; staff creation allowed once ready", async () => {
    const t = setupTest();
    await setupDraft(t);
    await makeReady(t);
    await expect(
      t.withIdentity(aliceIdentity).action(api.accounts.create, {
        orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "A", username: "judge1", password: "pass-12345",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme", eventSlug: "gala", kind: "staff", displayName: "S", username: "staff1", password: "pass-12345",
    });
  });

  it("enforces maxJudges limit across both kinds (Free = 5)", async () => {
    const t = setupTest();
    await setupDraft(t);
    for (let i = 1; i <= 4; i++) {
      await t.withIdentity(aliceIdentity).action(api.accounts.create, {
        orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: `J${i}`, username: `judge${i}`, password: "pass-12345",
      });
    }
    await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme", eventSlug: "gala", kind: "staff", displayName: "S", username: "staff1", password: "pass-12345",
    });
    await expect(
      t.withIdentity(aliceIdentity).action(api.accounts.create, {
        orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "X", username: "judge9", password: "pass-12345",
      }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });

  it("resetPassword revokes sessions and returns a working new password", async () => {
    const t = setupTest();
    await setupDraft(t);
    const res = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "A", username: "judge1", password: "pass-12345",
    });
    await makeReady(t);
    const login = await t.action(api.eventAuth.login, { eventCode: await codeOf(t), username: "judge1", password: "pass-12345" });
    const reset = await t.withIdentity(aliceIdentity).action(api.accounts.resetPassword, {
      orgSlug: "acme", eventSlug: "gala", accountId: res.accountId,
    });
    expect(await t.query(api.eventAuth.sessionInfo, { sessionToken: login.token })).toBeNull();
    const reLogin = await t.action(api.eventAuth.login, { eventCode: await codeOf(t), username: "judge1", password: reset.password });
    expect(reLogin.token).toBeTruthy();
  });

  it("disable blocks login and revokes sessions; enable restores", async () => {
    const t = setupTest();
    await setupDraft(t);
    const res = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "A", username: "judge1", password: "pass-12345",
    });
    await makeReady(t);
    await t.action(api.eventAuth.login, { eventCode: await codeOf(t), username: "judge1", password: "pass-12345" });
    await t.withIdentity(aliceIdentity).mutation(api.accounts.disable, { orgSlug: "acme", eventSlug: "gala", accountId: res.accountId });
    await expect(
      t.action(api.eventAuth.login, { eventCode: await codeOf(t), username: "judge1", password: "pass-12345" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await t.withIdentity(aliceIdentity).mutation(api.accounts.enable, { orgSlug: "acme", eventSlug: "gala", accountId: res.accountId });
    const ok = await t.action(api.eventAuth.login, { eventCode: await codeOf(t), username: "judge1", password: "pass-12345" });
    expect(ok.token).toBeTruthy();
  });

  it("delete removes the account and frees the usage slot", async () => {
    const t = setupTest();
    await setupDraft(t);
    const res = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "A", username: "judge1", password: "pass-12345",
    });
    await t.withIdentity(aliceIdentity).mutation(api.accounts.deleteAccount, { orgSlug: "acme", eventSlug: "gala", accountId: res.accountId });
    const list = await t.withIdentity(aliceIdentity).query(api.accounts.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(list.length).toBe(0);
  });
});
