import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { hashPassword } from "../convex/lib/password";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

const PASSWORD = "judge-pass-1";

async function seedReadyEventWithAccounts(t: ReturnType<typeof setupTest>, status: "draft" | "ready" = "ready") {
  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
  const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
  const hash = await hashPassword(PASSWORD);
  await t.run(async (q) => {
    if (status === "ready") await q.db.patch(ev!._id, { status: "ready" });
    await q.db.insert("eventAccounts", {
      orgId: ev!.orgId, eventId: ev!._id, kind: "judge", displayName: "Bob",
      username: "judge1", passwordHash: hash, status: "active",
      failedAttempts: 0, lockedUntil: null, createdById: ev!.createdById,
    });
  });
  return ev!;
}

async function accountId(t: ReturnType<typeof setupTest>, eventId: Id<"events">): Promise<Id<"eventAccounts">> {
  return t.run(async (q) => {
    const accounts = await q.db.query("eventAccounts").withIndex("by_event_id", (qq) => qq.eq("eventId", eventId)).collect();
    return accounts[0]._id;
  });
}

describe("eventAuth.login", () => {
  it("logs in a judge for a ready event and returns a session", async () => {
    const t = setupTest();
    const ev = await seedReadyEventWithAccounts(t);
    const res = await t.action(api.eventAuth.login, { eventCode: ev.eventCode, username: "Judge1", password: PASSWORD });
    expect(res.kind).toBe("judge");
    expect(res.displayName).toBe("Bob");
    expect(res.eventName).toBe("gala");
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);
    const info = await t.query(api.eventAuth.sessionInfo, { sessionToken: res.token });
    expect(info?.account.kind).toBe("judge");
    expect(info?.account.username).toBe("judge1");
    expect(info?.event.name).toBe("gala");
  });

  it("rejects an unknown code with NOT_FOUND and clear message", async () => {
    const t = setupTest();
    await seedReadyEventWithAccounts(t);
    await expect(
      t.action(api.eventAuth.login, { eventCode: "ZZZZZZZZ", username: "judge1", password: PASSWORD }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND", message: "Event code not found. Please check the code and try again." } });
  });

  it("rejects a draft event with CONFLICT and informative message", async () => {
    const t = setupTest();
    const ev = await seedReadyEventWithAccounts(t, "draft");
    await expect(
      t.action(api.eventAuth.login, { eventCode: ev.eventCode, username: "judge1", password: PASSWORD }),
    ).rejects.toMatchObject({
      data: {
        code: "CONFLICT",
        message: "This event has not started yet. Please wait for the organizer to start or publish the event.",
      },
    });
  });

  it("allows login to a finalized event to view results read-only", async () => {
    const t = setupTest();
    const ev = await seedReadyEventWithAccounts(t, "ready");
    await t.run(async (q) => {
      await q.db.patch(ev._id, { status: "finalized" });
    });
    const res = await t.action(api.eventAuth.login, { eventCode: ev.eventCode, username: "judge1", password: PASSWORD });
    expect(res.kind).toBe("judge");
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);
    const info = await t.query(api.eventAuth.sessionInfo, { sessionToken: res.token });
    expect(info?.event.status).toBe("finalized");
  });

  it("rejects unknown username and wrong password identically (UNAUTHENTICATED)", async () => {
    const t = setupTest();
    const ev = await seedReadyEventWithAccounts(t);
    const cases = [
      { eventCode: ev.eventCode, username: "ghost", password: PASSWORD },
      { eventCode: ev.eventCode, username: "judge1", password: "wrong-pass" },
    ];
    for (const args of cases) {
      await expect(t.action(api.eventAuth.login, args)).rejects.toMatchObject({
        data: { code: "UNAUTHENTICATED", message: "Invalid event code or judge credentials" },
      });
    }
  });

  it("locks the account after 5 failures, then rejects with FORBIDDEN", async () => {
    const t = setupTest();
    const ev = await seedReadyEventWithAccounts(t);
    for (let i = 0; i < 5; i++) {
      await expect(
        t.action(api.eventAuth.login, { eventCode: ev.eventCode, username: "judge1", password: "bad" }),
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
    }
    await expect(
      t.action(api.eventAuth.login, { eventCode: ev.eventCode, username: "judge1", password: PASSWORD }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN", message: "Account locked due to failed attempts. Try again later." } });
  });

  it("rejects a disabled account with FORBIDDEN", async () => {
    const t = setupTest();
    const ev = await seedReadyEventWithAccounts(t);
    const id = await accountId(t, ev._id);
    await t.run(async (q) => { await q.db.patch(id, { status: "disabled" }); });
    await expect(
      t.action(api.eventAuth.login, { eventCode: ev.eventCode, username: "judge1", password: PASSWORD }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN", message: "This account has been disabled. Please contact the event administrator." } });
  });

  it("logout revokes the session", async () => {
    const t = setupTest();
    const ev = await seedReadyEventWithAccounts(t);
    const res = await t.action(api.eventAuth.login, { eventCode: ev.eventCode, username: "judge1", password: PASSWORD });
    await t.mutation(api.eventAuth.logout, { sessionToken: res.token });
    expect(await t.query(api.eventAuth.sessionInfo, { sessionToken: res.token })).toBeNull();
  });

  it("expired session is rejected by sessionInfo", async () => {
    const t = setupTest();
    const ev = await seedReadyEventWithAccounts(t);
    const res = await t.action(api.eventAuth.login, { eventCode: ev.eventCode, username: "judge1", password: PASSWORD });
    await t.run(async (q) => {
      const sessions = await q.db.query("eventSessions").collect();
      await q.db.patch(sessions[0]._id, { expiresAt: Date.now() - 1 });
    });
    expect(await t.query(api.eventAuth.sessionInfo, { sessionToken: res.token })).toBeNull();
  });
});
