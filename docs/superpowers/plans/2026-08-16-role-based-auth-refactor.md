# Role-Based Auth & Event Access Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the email-invitation judge workflow with username+password+event-code access for judges/staff, reserving Google SSO for organizers (single admin per org).

**Architecture:** Parallel identity layer — new `eventAccounts` (username+PBKDF2 password per event) and `eventSessions` (token rows) tables; a public `eventAuth.login` action mints 24h tokens enforced by a `requireEventSession` helper in new `convex/enter/**` functions. Admins keep better-auth Google SSO through the existing `/app` chain. Email invitations are deleted.

**Tech Stack:** Convex 1.43 (mutations/actions/internalMutations), better-auth (Google only), Next.js 16 App Router, WebCrypto PBKDF2, vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-08-16-role-based-auth-design.md`

## Global Constraints

- Event code: 8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, unique, regenerable while `draft|ready` only.
- Passwords: PBKDF2-SHA256, 100,000 iterations, 16-byte salt, stored as `iterations.saltB64Url.hashB64Url`. Manual passwords >= 8 chars. Usernames: `/^[a-z0-9_.-]{3,32}$/`, lowercase, unique per event.
- Sessions: 32-byte hex token, 24h expiry, revocation = row delete. Lockout: 5 fails -> 15 min.
- Login error strings (verbatim): `"Event code does not exist or event has ended"`, `"Invalid event code or judge credentials"`, `"This account has been disabled."`, `"Account locked due to failed attempts. Try again later."`
- Cookie `event_session`: httpOnly, path `/enter`, SameSite=Lax, Secure in production, maxAge 86400.
- Login allowed only while `event.status === "ready"`. Staff+judge accounts both count against plan `maxJudges` (usage resource `"judges"`).
- WebCrypto (`crypto.subtle`) only in **actions** (hash/verify). All DB writes from actions go through `ctx.runMutation(internal....)` internal mutations (transactional, re-validate permissions).
- After any task that adds/removes public Convex functions, run `npx convex codegen` before `npm run test` / `npm run build`.
- Validation gates per task: `npm run build` (app/UI tasks), `npm run lint`, `npm test`. All green before commit.
- UI tasks (8, 9, 10) MUST load the `/ui-ux-pro-max` skill before writing UI code (project AGENTS.md rule).
- Convex code follows `convex/_generated/ai/guidelines.md`.
- Commit after every task. Never commit `.env.local`.

---

### Task 1: Event codes

**Files:**
- Create: `convex/lib/eventCode.ts`
- Create: `convex-test/eventCodes.test.ts`
- Modify: `convex/schema.ts` (events table), `convex/events.ts` (create, createFromTemplate, new `regenerateCode`)

**Interfaces:**
- Produces: `generateEventCode(): string`; `events.eventCode` field + `by_event_code` index; `events.regenerateCode(orgSlug, eventSlug) -> string`. Later tasks and the accounts UI rely on these.

- [ ] **Step 1: Write failing tests** — create `convex-test/eventCodes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, seedAndProvision, setupTest } from "./setup";

async function codeOf(t: ReturnType<typeof setupTest>, eventSlug: string): Promise<string> {
  const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug });
  return ev!.eventCode;
}

describe("event codes", () => {
  it("create assigns a unique 8-char code from the unambiguous alphabet", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    expect(await codeOf(t, "gala")).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("two events get different codes", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: "acme", slug: "acme" });
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "One", slug: "one" });
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "Two", slug: "two" });
    expect(await codeOf(t, "one")).not.toBe(await codeOf(t, "two"));
  });

  it("regenerateCode replaces the code; blocked once finalized", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const before = await codeOf(t, "gala");
    const next = await t.withIdentity(aliceIdentity).mutation(api.events.regenerateCode, { orgSlug: "acme", eventSlug: "gala" });
    expect(next).not.toBe(before);
    await t.run(async (q) => {
      const events = await q.db.query("events").collect();
      await q.db.patch(events[0]._id, { status: "finalized" });
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.regenerateCode, { orgSlug: "acme", eventSlug: "gala" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
```

- [ ] **Step 2: Run tests, verify failure** — `npx convex codegen; npx vitest run convex-test/eventCodes.test.ts` -> FAIL (`eventCode` missing / `regenerateCode` not a function).

- [ ] **Step 3: Implement.** Create `convex/lib/eventCode.ts`:

```ts
export const EVENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const EVENT_CODE_LENGTH = 8;

export function generateEventCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(EVENT_CODE_LENGTH));
  return Array.from(bytes, (b) => EVENT_CODE_ALPHABET[b % EVENT_CODE_ALPHABET.length]).join("");
}
```

In `convex/schema.ts`, events table: add `eventCode: v.string(),` after `slug: v.string(),` and add `.index("by_event_code", ["eventCode"])` to its index chain.

In `convex/events.ts`:
- Import `generateEventCode` from `./lib/eventCode`.
- Add helper after `slugify`:

```ts
const EVENT_CODE_ATTEMPTS = 5;

async function uniqueEventCode(ctx: QueryCtx): Promise<string> {
  for (let i = 0; i < EVENT_CODE_ATTEMPTS; i++) {
    const code = generateEventCode();
    const clash = await ctx.db
      .query("events")
      .withIndex("by_event_code", (q) => q.eq("eventCode", code))
      .unique();
    if (!clash) return code;
  }
  throw appError(ErrorCode.CONFLICT, "Could not allocate a unique event code");
}
```

- In `create`: before the insert add `const eventCode = await uniqueEventCode(ctx);` and include `eventCode,` in the insert object.
- In `createFromTemplate`: identical two additions.
- Append new mutation:

```ts
export const regenerateCode = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update",
    });
    if (eactx.event.status !== "draft" && eactx.event.status !== "ready") {
      throw appError(ErrorCode.CONFLICT, "Event code can no longer be regenerated");
    }
    const eventCode = await uniqueEventCode(ctx);
    await ctx.db.patch(eactx.event._id, { eventCode });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.code.regenerated",
      resourceType: "event", resourceId: eactx.event._id,
      before: { eventCode: eactx.event.eventCode }, after: { eventCode },
    });
    return eventCode;
  },
});
```

- [ ] **Step 4: Run tests, verify pass** — `npx convex codegen; npx vitest run convex-test/eventCodes.test.ts` -> PASS. Then `npm test` (full suite stays green).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: unique event codes with owner regeneration"`

---

### Task 2: Password hashing library

**Files:**
- Create: `convex/lib/password.ts`
- Create: `convex-test/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`; `verifyPassword(password: string, stored: string): Promise<boolean>`; `timingSafeDummyVerify(password: string): Promise<void>`; `MIN_PASSWORD_LENGTH = 8`; `USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/`. Used by Tasks 3-4.

- [ ] **Step 1: Write failing tests** — `convex-test/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, timingSafeDummyVerify, verifyPassword } from "../convex/lib/password";

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^100000\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong horse", stored)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed stored hashes without throwing", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "abc..")).toBe(false);
  });

  it("dummy verify resolves (timing equalization path)", async () => {
    await expect(timingSafeDummyVerify("anything")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run convex-test/password.test.ts` -> FAIL (module not found).

- [ ] **Step 3: Implement** — `convex/lib/password.ts`:

```ts
export const MIN_PASSWORD_LENGTH = 8;
export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
// Fixed salt so unknown-username logins burn the same PBKDF2 work as real ones.
const DUMMY_SALT_B64URL = "AAAAAAAAAAAAAAAAAAAAAA";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_ITERATIONS}.${toBase64Url(salt)}.${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iterationsRaw, saltB64, hashB64] = stored.split(".");
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 1 || !saltB64 || !hashB64) return false;
  const salt = fromBase64Url(saltB64);
  const expected = fromBase64Url(hashB64);
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await deriveBits(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function timingSafeDummyVerify(password: string): Promise<void> {
  await deriveBits(password, fromBase64Url(DUMMY_SALT_B64URL), PBKDF2_ITERATIONS);
}
```

- [ ] **Step 4: Run** — `npx vitest run convex-test/password.test.ts` -> PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: PBKDF2 password hashing library"`

---

### Task 3: Event accounts, sessions, and login

**Files:**
- Modify: `convex/schema.ts` (add `eventAccounts`, `eventSessions` tables — additive only)
- Create: `convex/lib/eventSession.ts`
- Create: `convex/eventAuth.ts`
- Create: `convex-test/eventAuth.test.ts`

**Interfaces:**
- Produces: table `eventAccounts { orgId, eventId, kind: "staff"|"judge", displayName, username, passwordHash, status: "active"|"disabled", failedAttempts, lockedUntil, createdById }` with indexes `by_event_id`, `by_event_id_and_username`, `by_event_id_and_kind`; table `eventSessions { token, accountId, eventId, expiresAt, lastSeenAt }` with `by_token`, `by_account_id`.
- Produces: `eventAuth.login(eventCode, username, password) -> {token, kind, displayName, eventName}` (action); `eventAuth.logout(sessionToken)` (mutation); `eventAuth.sessionInfo(sessionToken) -> {kind, displayName, eventName, expiresAt} | null` (query); `requireEventSession(ctx, {sessionToken, kind?, requireReadyEvent?}) -> {account, event, session}`; `touchSession(ctx, sessionId)`.

- [ ] **Step 1: Write failing tests** — `convex-test/eventAuth.test.ts`. Accounts are seeded directly via `t.run` (admin CRUD lands in Task 4):

```ts
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
    expect(info?.kind).toBe("judge");
  });

  it("rejects an unknown code with NOT_FOUND and the exact message", async () => {
    const t = setupTest();
    await seedReadyEventWithAccounts(t);
    await expect(
      t.action(api.eventAuth.login, { eventCode: "ZZZZZZZZ", username: "judge1", password: PASSWORD }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND", message: "Event code does not exist or event has ended" } });
  });

  it("rejects a draft event with NOT_FOUND", async () => {
    const t = setupTest();
    const ev = await seedReadyEventWithAccounts(t, "draft");
    await expect(
      t.action(api.eventAuth.login, { eventCode: ev.eventCode, username: "judge1", password: PASSWORD }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
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
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN", message: "This account has been disabled." } });
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
```

- [ ] **Step 2: Run** — `npx convex codegen; npx vitest run convex-test/eventAuth.test.ts` -> FAIL.

- [ ] **Step 3: Implement schema additions.** In `convex/schema.ts`, after the `judgeAssignments` table block add:

```ts
  eventAccounts: defineTable({
    orgId: v.id("organizations"),
    eventId: v.id("events"),
    kind: v.union(v.literal("staff"), v.literal("judge")),
    displayName: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled")),
    failedAttempts: v.number(),
    lockedUntil: v.union(v.null(), v.number()),
    createdById: v.id("userProfiles"),
  })
    .index("by_event_id", ["eventId"])
    .index("by_event_id_and_username", ["eventId", "username"])
    .index("by_event_id_and_kind", ["eventId", "kind"]),

  eventSessions: defineTable({
    token: v.string(),
    accountId: v.id("eventAccounts"),
    eventId: v.id("events"),
    expiresAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_account_id", ["accountId"]),
```

- [ ] **Step 4: Implement** `convex/lib/eventSession.ts`:

```ts
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

export type EventSessionCtx = {
  account: Doc<"eventAccounts">;
  event: Doc<"events">;
  session: Doc<"eventSessions">;
};

export async function requireEventSession(
  ctx: QueryCtx,
  args: { sessionToken: string; kind?: "staff" | "judge"; requireReadyEvent?: boolean },
): Promise<EventSessionCtx> {
  const session = await ctx.db
    .query("eventSessions")
    .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
    .unique();
  if (!session || session.expiresAt <= Date.now()) {
    throw appError(ErrorCode.UNAUTHENTICATED, "Session expired — sign in again");
  }
  const account = await ctx.db.get(session.accountId);
  if (!account || account.status !== "active") {
    throw appError(ErrorCode.FORBIDDEN, "This account has been disabled.");
  }
  if (args.kind && account.kind !== args.kind) {
    throw appError(ErrorCode.FORBIDDEN, "Not allowed for this account type");
  }
  const event = await ctx.db.get(session.eventId);
  if (!event) throw appError(ErrorCode.NOT_FOUND, "Event not found");
  if (args.requireReadyEvent && event.status !== "ready") {
    throw appError(ErrorCode.CONFLICT, "Event is not in scoring state");
  }
  return { account, event, session };
}

export async function touchSession(ctx: MutationCtx, sessionId: Doc<"eventSessions">["_id"]): Promise<void> {
  await ctx.db.patch(sessionId, { lastSeenAt: Date.now() });
}
```

- [ ] **Step 5: Implement** `convex/eventAuth.ts`:

```ts
import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { appError, ErrorCode } from "./lib/errors";
import { timingSafeDummyVerify, verifyPassword } from "./lib/password";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export const login = action({
  args: { eventCode: v.string(), username: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<{ token: string; kind: string; displayName: string; eventName: string }> => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_event_code", (q) => q.eq("eventCode", args.eventCode.toUpperCase().trim()))
      .unique();
    if (!event || event.status !== "ready") {
      throw appError(ErrorCode.NOT_FOUND, "Event code does not exist or event has ended");
    }
    const username = args.username.toLowerCase().trim();
    const account = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_username", (q) => q.eq("eventId", event._id).eq("username", username))
      .unique();
    if (!account) {
      // Burn equivalent PBKDF2 work so unknown usernames are not distinguishable by timing.
      await timingSafeDummyVerify(args.password);
      throw appError(ErrorCode.UNAUTHENTICATED, "Invalid event code or judge credentials");
    }
    if (account.status === "disabled") {
      throw appError(ErrorCode.FORBIDDEN, "This account has been disabled.");
    }
    if (account.lockedUntil !== null && account.lockedUntil > Date.now()) {
      throw appError(ErrorCode.FORBIDDEN, "Account locked due to failed attempts. Try again later.");
    }
    if (!(await verifyPassword(args.password, account.passwordHash))) {
      await ctx.runMutation(internal.eventAuth.recordFailedAttempt, { accountId: account._id });
      throw appError(ErrorCode.UNAUTHENTICATED, "Invalid event code or judge credentials");
    }
    if (account.failedAttempts !== 0 || account.lockedUntil !== null) {
      await ctx.runMutation(internal.eventAuth.clearFailureCounters, { accountId: account._id });
    }
    return await ctx.runMutation(internal.eventAuth.createSession, {
      accountId: account._id, eventId: event._id,
    });
  },
});

export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const session = await ctx.db
      .query("eventSessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (session) await ctx.db.delete(session._id);
  },
});

export const sessionInfo = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ kind: string; displayName: string; eventName: string; expiresAt: number } | null> => {
    const session = await ctx.db
      .query("eventSessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (!session || session.expiresAt <= Date.now()) return null;
    const account = await ctx.db.get(session.accountId);
    const event = await ctx.db.get(session.eventId);
    if (!account || account.status !== "active" || !event) return null;
    return { kind: account.kind, displayName: account.displayName, eventName: event.name, expiresAt: session.expiresAt };
  },
});

export const recordFailedAttempt = internalMutation({
  args: { accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return;
    const failedAttempts = account.failedAttempts + 1;
    await ctx.db.patch(args.accountId, {
      failedAttempts,
      lockedUntil: failedAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : account.lockedUntil,
    });
  },
});

export const clearFailureCounters = internalMutation({
  args: { accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.accountId, { failedAttempts: 0, lockedUntil: null });
  },
});

export const createSession = internalMutation({
  args: { accountId: v.id("eventAccounts"), eventId: v.id("events") },
  handler: async (ctx, args): Promise<{ token: string; kind: string; displayName: string; eventName: string }> => {
    const account = await ctx.db.get(args.accountId);
    const event = await ctx.db.get(args.eventId);
    if (!account || !event) throw appError(ErrorCode.NOT_FOUND, "Account or event missing");
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const now = Date.now();
    await ctx.db.insert("eventSessions", {
      token, accountId: args.accountId, eventId: args.eventId,
      expiresAt: now + SESSION_TTL_MS, lastSeenAt: now,
    });
    return { token, kind: account.kind, displayName: account.displayName, eventName: event.name };
  },
});
```

- [ ] **Step 6: Run** — `npx convex codegen; npx vitest run convex-test/eventAuth.test.ts` -> PASS. Then `npm test`.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: event-scoped account sessions with lockout and timing-safe login"`

---

### Task 4: Admin account management CRUD

**Files:**
- Create: `convex/accounts.ts`
- Create: `convex-test/accounts.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `MIN_PASSWORD_LENGTH`, `USERNAME_PATTERN` (Task 2); `requireEventPermission`/`requireDraftEvent` (existing); `requireLimit`/`incrementUsage` (existing).
- Produces: `accounts.create` (action) `{orgSlug, eventSlug, kind, displayName, username?, password?} -> {accountId, username, password}`; `accounts.list` (query) `{orgSlug, eventSlug}`; `accounts.resetPassword` (action) `{orgSlug, eventSlug, accountId, password?} -> {password}`; `accounts.disable`, `accounts.enable`, `accounts.deleteAccount` (mutations). `addAssignment`/`removeAssignment` land in Task 6 (schema flip). Rule: judge accounts manageable only in `draft` events; staff in `draft|ready`; both kinds consume usage `"judges"`.

- [ ] **Step 1: Write failing tests** — `convex-test/accounts.test.ts`:

```ts
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
```

NOTE — deferred to Task 6: the "delete is blocked when the account has score sheets" test and the `judgeAssignments` enrichment of `accounts.list` both read `judgeId` fields that are still `Id<"judges">`-typed until the Task 6 schema flip; including them here would not typecheck. Task 6 adds them.

- [ ] **Step 2: Run** — `npx convex codegen; npx vitest run convex-test/accounts.test.ts` -> FAIL.

- [ ] **Step 3: Implement** `convex/accounts.ts`:

```ts
import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventPermission } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";
import { hashPassword, MIN_PASSWORD_LENGTH, USERNAME_PATTERN } from "./lib/password";

const AUTO_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const AUTO_PASSWORD_LENGTH = 10;

function generateAutoPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(AUTO_PASSWORD_LENGTH));
  return Array.from(bytes, (b) => AUTO_PASSWORD_ALPHABET[b % AUTO_PASSWORD_ALPHABET.length]).join("");
}

async function nextAutoUsername(ctx: QueryCtx, kind: "staff" | "judge", eventId: Id<"events">): Promise<string> {
  const existing = await ctx.db
    .query("eventAccounts")
    .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eventId).eq("kind", kind))
    .collect();
  const taken = new Set(existing.map((a) => a.username));
  let n = existing.length + 1;
  while (taken.has(`${kind}${n}`)) n++;
  return `${kind}${n}`;
}

async function revokeSessions(ctx: QueryCtx, accountId: Id<"eventAccounts">): Promise<void> {
  const sessions = await ctx.db
    .query("eventSessions")
    .withIndex("by_account_id", (q) => q.eq("accountId", accountId))
    .collect();
  for (const s of sessions) await ctx.db.delete(s._id);
}

export const create = action({
  args: {
    orgSlug: v.string(), eventSlug: v.string(),
    kind: v.union(v.literal("staff"), v.literal("judge")),
    displayName: v.string(),
    username: v.optional(v.string()), password: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ accountId: Id<"eventAccounts">; username: string; password: string }> => {
    const username = args.username?.toLowerCase().trim();
    if (username !== undefined && !USERNAME_PATTERN.test(username)) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Username must be 3-32 chars: a-z, 0-9, dot, dash, underscore");
    }
    if (args.password !== undefined && args.password.length < MIN_PASSWORD_LENGTH) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const event = await resolveEvent(ctx, args.orgSlug, args.eventSlug);
    const resolvedUsername = username ?? (await nextAutoUsername(ctx, args.kind, event._id));
    const password = args.password ?? generateAutoPassword();
    const passwordHash = await hashPassword(password);
    return await ctx.runMutation(internal.accounts.createAccount, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, kind: args.kind,
      displayName: args.displayName, username: resolvedUsername, password, passwordHash,
    });
  },
});

async function resolveEvent(ctx: QueryCtx, orgSlug: string, eventSlug: string): Promise<Doc<"events">> {
  const org = await ctx.db
    .query("organizations")
    .withIndex("by_slug", (q) => q.eq("slug", orgSlug))
    .unique();
  if (!org) throw appError(ErrorCode.NOT_FOUND, "Organization not found");
  const event = await ctx.db
    .query("events")
    .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", org._id).eq("slug", eventSlug))
    .unique();
  if (!event) throw appError(ErrorCode.NOT_FOUND, "Event not found");
  return event;
}

export const createAccount = internalMutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(),
    kind: v.union(v.literal("staff"), v.literal("judge")),
    displayName: v.string(), username: v.string(), password: v.string(), passwordHash: v.string(),
  },
  handler: async (ctx, args): Promise<{ accountId: Id<"eventAccounts">; username: string; password: string }> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    if (!args.displayName.trim()) throw appError(ErrorCode.VALIDATION_ERROR, "Display name is required");
    if (args.kind === "judge" && eactx.event.status !== "draft") {
      throw appError(ErrorCode.CONFLICT, "Judges can only be added while the event is a draft");
    }
    if (args.kind === "staff" && eactx.event.status !== "draft" && eactx.event.status !== "ready") {
      throw appError(ErrorCode.CONFLICT, "Staff can only be added before the event is finalized");
    }
    await requireLimit(ctx, eactx.subscription, "judges");
    const dup = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_username", (q) => q.eq("eventId", eactx.event._id).eq("username", args.username))
      .unique();
    if (dup) throw appError(ErrorCode.CONFLICT, "Username already taken for this event");
    const accountId = await ctx.db.insert("eventAccounts", {
      orgId: eactx.org._id, eventId: eactx.event._id, kind: args.kind,
      displayName: args.displayName.trim(), username: args.username, passwordHash: args.passwordHash,
      status: "active", failedAttempts: 0, lockedUntil: null, createdById: eactx.user._id,
    });
    await incrementUsage(ctx, eactx.org._id, "judges", 1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "eventAccount.created",
      resourceType: "eventAccount", resourceId: accountId,
      after: { kind: args.kind, username: args.username },
    });
    return { accountId, username: args.username, password: args.password };
  },
});

export const list = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const accounts = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    // NOTE: judgeAssignments enrichment is added in Task 6, after judgeAssignments.judgeId
    // is flipped to Id<"eventAccounts">.
    return accounts.map((a) => ({
      _id: a._id, kind: a.kind, displayName: a.displayName, username: a.username,
      status: a.status, lockedUntil: a.lockedUntil,
    }));
  },
});

export const resetPassword = action({
  args: { orgSlug: v.string(), eventSlug: v.string(), accountId: v.id("eventAccounts"), password: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ password: string }> => {
    if (args.password !== undefined && args.password.length < MIN_PASSWORD_LENGTH) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const password = args.password ?? generateAutoPassword();
    const passwordHash = await hashPassword(password);
    await ctx.runMutation(internal.accounts.resetPasswordInternal, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, accountId: args.accountId, passwordHash,
    });
    return { password };
  },
});

export const resetPasswordInternal = internalMutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), accountId: v.id("eventAccounts"), passwordHash: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.eventId !== eactx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Account not found");
    }
    await ctx.db.patch(args.accountId, { passwordHash: args.passwordHash, failedAttempts: 0, lockedUntil: null });
    await revokeSessions(ctx, args.accountId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "eventAccount.passwordReset",
      resourceType: "eventAccount", resourceId: args.accountId,
    });
  },
});

export const disable = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Account not found");
    await ctx.db.patch(args.accountId, { status: "disabled" });
    await revokeSessions(ctx, args.accountId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "eventAccount.disabled",
      resourceType: "eventAccount", resourceId: args.accountId,
    });
  },
});

export const enable = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Account not found");
    await ctx.db.patch(args.accountId, { status: "active", failedAttempts: 0, lockedUntil: null });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "eventAccount.enabled",
      resourceType: "eventAccount", resourceId: args.accountId,
    });
  },
});

export const deleteAccount = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), accountId: v.id("eventAccounts") },
  handler: async (ctx, args): Promise<void> => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage",
    });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Account not found");
    // NOTE: the scoreSheets guard is added in Task 6, after scoreSheets.judgeId
    // is flipped to Id<"eventAccounts">.
    const assignments = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_judge_id", (q) => q.eq("judgeId", args.accountId))
      .collect();
    for (const a of assignments) await ctx.db.delete(a._id);
    await revokeSessions(ctx, args.accountId);
    await ctx.db.delete(args.accountId);
    await incrementUsage(ctx, eactx.org._id, "judges", -1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "eventAccount.deleted",
      resourceType: "eventAccount", resourceId: args.accountId,
      before: { username: account.username, kind: account.kind },
    });
  },
});
```

Implementation notes for the executor:
- If TS complains that action `ctx.db`/`QueryCtx` are incompatible for `resolveEvent`/`nextAutoUsername`/`revokeSessions`, type those helpers' `ctx` parameter as `Pick<QueryCtx, "db">` — action ctx satisfies it structurally.
- `by_judge_id_and_round_id` supports prefix equality on `judgeId` alone (index fields `[judgeId, roundId]`), which `deleteAccount` relies on.

- [ ] **Step 4: Run** — `npx convex codegen; npx vitest run convex-test/accounts.test.ts` -> PASS. Then `npm test`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: admin CRUD for event-scoped staff/judge accounts"`

---

### Task 5: Remove obsolete admin UI and SMTP plumbing

**Files:**
- Delete: `app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx`, `app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx`, `app/app/[orgSlug]/events/[eventSlug]/judges/page.tsx`, `app/app/[orgSlug]/members/page.tsx`, `app/invite/` (directory), `app/api/invitations/` (directory), `lib/mailer.ts`
- Modify: `components/EventShell.tsx`, `app/app/[orgSlug]/layout.tsx`, `middleware.ts`, `.env.example`, `.env.local`

**Interfaces:**
- Consumes: nothing new. Convex modules (`api.scoring`, `api.judges`, `api.invitations`, `api.members`) stay until Task 6 — deleting only their UI consumers keeps this task's build green.

- [ ] **Step 1: Delete the files** (PowerShell, from repo root):

```powershell
Remove-Item -Recurse -LiteralPath "app\app\[orgSlug]\events\[eventSlug]\scoring", "app\app\[orgSlug]\events\[eventSlug]\judges", "app\app\[orgSlug]\members", "app\invite", "app\api\invitations"
Remove-Item -LiteralPath "lib\mailer.ts"
```

- [ ] **Step 2: Update `components/EventShell.tsx`** — the nav array becomes (removes Judges + Scoring):

```ts
  const nav = [
    ["Overview", `${base}/overview`],
    ["Rounds", `${base}/rounds`],
    ["Categories", `${base}/categories`],
    ["Contestants", `${base}/contestants`],
    ["Readiness", `${base}/readiness`],
    ["Settings", `${base}/settings`],
    ["Results", `${base}/results`],
  ] as const;
```

- [ ] **Step 3: Update `app/app/[orgSlug]/layout.tsx`** — delete this line (Members nav):

```tsx
          <Link href={`/app/${orgSlug}/members`} className="block rounded px-2 py-1 hover:bg-accent">Members</Link>
```

- [ ] **Step 4: Update `middleware.ts`** — remove `/invite` from both the regex list and the matcher:

```ts
const PROTECTED = [/^\/app(\/|$)/, /^\/platform(\/|$)/];
```

```ts
  matcher: ["/app/:path*", "/platform/:path*"],
```

- [ ] **Step 5: Clean env examples** — delete the SMTP block from `.env.example` (the 5 `SMTP_*` lines plus the two comment lines above them). Delete the same block from `.env.local` (uncommitted housekeeping).

- [ ] **Step 6: Validate** — `npm run build && npm run lint && npm test` -> green (no app code references the deleted pages; Convex modules untouched).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "refactor: remove invitation/judge email UI and SMTP plumbing from admin app"`

---

### Task 6: Identity cutover — schema flip, enter/scoring, deletions, test rework

This is the core cutover; everything lands in one commit because the schema flip breaks the old modules at once.

**Files:**
- Modify: `convex/schema.ts`, `convex/lib/constants.ts`, `convex/lib/eventAuthz.ts`, `convex/lib/roundCompute.ts`, `convex/events.ts`, `convex/eventLifecycle.ts`, `convex/roundAdmin.ts`, `convex/accounts.ts`, `convex-test/setup.ts`, `convex-test/scoringEntry.test.ts`, `convex-test/publishResults.test.ts`, `convex-test/roundLifecycle3.test.ts`, `convex-test/reviewDecisions.test.ts`, `convex-test/events.test.ts`, `convex-test/lifecycle.test.ts`, `convex-test/phase3Schema.test.ts`, `convex-test/platform.test.ts` (+ `reads.test.ts` / `permissions3.test.ts` only if they fail)
- Create: `convex/lib/sheetValidation.ts`, `convex/enter/scoring.ts`
- Delete: `convex/judges.ts`, `convex/scoring.ts`, `convex/invitations.ts`, `convex/members.ts`, `convex-test/members.test.ts`, `convex-test/judges.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4 outputs; `loadRoundCompute` from `convex/lib/roundCompute`.
- Produces: `enter.scoring.myAssignments({sessionToken})`; `enter.scoring.sheetDetail({sessionToken, roundId, contestantId})`; `enter.scoring.saveDraft({sessionToken, sheetId, draftValues})`; `enter.scoring.submitSheet({sessionToken, sheetId, values})`; `accounts.addAssignment({orgSlug, eventSlug, accountId, roundId?, categoryId?, criterionId?})`; `accounts.removeAssignment({orgSlug, eventSlug, assignmentId})`; shared `checkValue(criterion, value)` in `lib/sheetValidation.ts`; setup `prepareScoredEvent` returning `{roundId, criterionIds, contestantIds, judgeIds: {bob, carol}, staffId, eventCode, tokens: {staff, bob, carol}}`.

- [ ] **Step 1: Flip the schema.** In `convex/schema.ts`:
  - `judgeAssignments.judgeId`: `v.id("judges")` -> `v.id("eventAccounts")`.
  - `scoreSheets.judgeId`: `v.id("judges")` -> `v.id("eventAccounts")`.
  - `scores`: replace `submittedById: v.id("userProfiles"),` with `submittedByAccountId: v.id("eventAccounts"),`.
  - `resultVersions`: `createdById: v.id("userProfiles")` -> `createdById: v.union(v.null(), v.id("userProfiles"))`, and add `createdByAccountId: v.optional(v.id("eventAccounts")),`.
  - Inside `resultVersions.snapshot`: `judgeParticipation[].judgeId` and `criterionScores[].dropped[].judgeId` change from `v.id("judges")` to `v.id("eventAccounts")`.
  - Delete the entire `judges:` table block and the entire `invitations:` table block.

- [ ] **Step 2: Trim roles** in `convex/lib/constants.ts` (keep `SYSTEM_PERMISSIONS` and `SYSTEM_PLANS` unchanged):

```ts
export const SYSTEM_ROLES = [
  { name: "Org Owner", description: "Full control over the organization" },
] as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Org Owner": ["organization.view", "organization.update", "organization.members.manage", "organization.delete", "audit.view", "subscription.view", "subscription.manage", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage", "score.manage", "result.view"],
};
```

- [ ] **Step 3: Delete legacy convex modules**:

```powershell
Remove-Item -LiteralPath "convex\judges.ts", "convex\scoring.ts", "convex\invitations.ts", "convex\members.ts"
```

- [ ] **Step 4: Create `convex/lib/sheetValidation.ts`** (extracted verbatim from old `scoring.ts`):

```ts
import type { Doc } from "../_generated/dataModel";

export function checkValue(criterion: Doc<"criteria">, value: number): string | null {
  if (value < criterion.minScore || value > criterion.maxScore) {
    return `${criterion.name} must be between ${criterion.minScore} and ${criterion.maxScore}`;
  }
  const factor = 10 ** criterion.decimalPrecision;
  if (Math.abs(value * factor - Math.round(value * factor)) > 1e-9) {
    return `${criterion.name} allows ${criterion.decimalPrecision} decimal(s)`;
  }
  return null;
}
```

- [ ] **Step 5: Create `convex/enter/scoring.ts`** — session-auth port of the old `scoring.ts` (judge kind, own sheets only):

```ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "../lib/errors";
import { requireEventSession, touchSession } from "../lib/eventSession";
import { checkValue } from "../lib/sheetValidation";
import { writeAudit } from "../lib/audit";

async function loadOwnSheet(
  ctx: QueryCtx,
  args: { sessionToken: string; sheetId: Id<"scoreSheets"> },
) {
  const sctx = await requireEventSession(ctx, {
    sessionToken: args.sessionToken, kind: "judge", requireReadyEvent: true,
  });
  const sheet = await ctx.db.get(args.sheetId);
  if (!sheet || sheet.eventId !== sctx.event._id || sheet.judgeId !== sctx.account._id) {
    throw appError(ErrorCode.NOT_FOUND, "Score sheet not found");
  }
  const round = await ctx.db.get(sheet.roundId);
  if (!round || round.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
  if (round.status !== "open") throw appError(ErrorCode.CONFLICT, "Round is not open for scoring");
  return { sctx, sheet, round };
}

export const myAssignments = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "judge", requireReadyEvent: true,
    });
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const out: {
      roundId: Id<"rounds">;
      name: string;
      order: number;
      status: Doc<"rounds">["status"];
      sheets: { sheetId: Id<"scoreSheets">; contestantId: Id<"contestants">; contestantName: string; contestantNumber: number; status: Doc<"scoreSheets">["status"] }[];
    }[] = [];
    for (const round of [...rounds].sort((a, b) => a.order - b.order)) {
      const sheets = await ctx.db
        .query("scoreSheets")
        .withIndex("by_judge_id_and_round_id", (q) => q.eq("judgeId", sctx.account._id).eq("roundId", round._id))
        .collect();
      out.push({
        roundId: round._id,
        name: round.name,
        order: round.order,
        status: round.status,
        sheets: sheets.map((s) => {
          const contestant = contestants.find((k) => k._id === s.contestantId);
          return {
            sheetId: s._id,
            contestantId: s.contestantId,
            contestantName: contestant?.name ?? "",
            contestantNumber: contestant?.number ?? 0,
            status: s.status,
          };
        }),
      });
    }
    return { judgeId: sctx.account._id, rounds: out };
  },
});

export const sheetDetail = query({
  args: { sessionToken: v.string(), roundId: v.id("rounds"), contestantId: v.id("contestants") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "judge", requireReadyEvent: true,
    });
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const contestant = await ctx.db.get(args.contestantId);
    if (!contestant || contestant.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    }
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id_and_contestant_id", (q) =>
        q.eq("eventId", sctx.event._id).eq("roundId", round._id).eq("contestantId", args.contestantId))
      .collect();
    const sheet = sheets.find((s) => s.judgeId === sctx.account._id) ?? null;
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    return { sheet, criteria: [...criteria].sort((a, b) => a.order - b.order), contestant };
  },
});

export const saveDraft = mutation({
  args: {
    sessionToken: v.string(), sheetId: v.id("scoreSheets"),
    draftValues: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const { sctx, sheet, round } = await loadOwnSheet(ctx, args);
    if (sheet.status !== "not_started" && sheet.status !== "in_progress") {
      throw appError(ErrorCode.CONFLICT, "Score sheet is already submitted");
    }
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    for (const [criterionId, value] of Object.entries(args.draftValues)) {
      const criterion = criteria.find((c) => c._id === criterionId);
      if (!criterion) throw appError(ErrorCode.VALIDATION_ERROR, "Unknown criterion in draft");
      const problem = checkValue(criterion, value);
      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
    }
    await ctx.db.patch(args.sheetId, { status: "in_progress", draftValues: args.draftValues });
    await touchSession(ctx, sctx.session._id);
  },
});

export const submitSheet = mutation({
  args: {
    sessionToken: v.string(), sheetId: v.id("scoreSheets"),
    values: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const { sctx, sheet, round } = await loadOwnSheet(ctx, args);
    if (sheet.status !== "not_started" && sheet.status !== "in_progress") {
      throw appError(ErrorCode.CONFLICT, "Score sheet is already submitted");
    }
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    const assignments = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_judge_id", (q) => q.eq("judgeId", sctx.account._id))
      .collect();
    const scoped = assignments.filter((a) => a.roundId === undefined || a.roundId === round._id);
    const scopedCriterionIds = scoped
      .filter((a) => a.criterionId !== undefined)
      .map((a) => a.criterionId!);
    const required = scopedCriterionIds.length > 0
      ? criteria.filter((c) => scopedCriterionIds.includes(c._id))
      : criteria;
    for (const criterion of required) {
      const value = args.values[criterion._id];
      if (value === undefined) {
        throw appError(ErrorCode.VALIDATION_ERROR, `${criterion.name} is missing`);
      }
      const problem = checkValue(criterion, value);
      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
    }
    const now = Date.now();
    for (const criterion of required) {
      await ctx.db.insert("scores", {
        sheetId: sheet._id,
        eventId: sctx.event._id,
        roundId: round._id,
        judgeId: sctx.account._id,
        contestantId: sheet.contestantId,
        criterionId: criterion._id,
        value: args.values[criterion._id],
        submittedAt: now,
        submittedByAccountId: sctx.account._id,
      });
    }
    await ctx.db.patch(sheet._id, { status: "submitted", draftValues: undefined });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "score.submitted",
      resourceType: "scoreSheet", resourceId: sheet._id,
      after: {
        roundId: round._id, contestantId: sheet.contestantId, criteria: required.length,
        accountKind: sctx.account.kind, accountName: sctx.account.displayName,
      },
    });
  },
});
```

- [ ] **Step 6: Append assignments to `convex/accounts.ts`** (port of old `judges.addAssignment`/`removeAssignment`; add `requireDraftEvent` to the `./lib/eventAuthz` import):

```ts
export const addAssignment = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), accountId: v.id("eventAccounts"),
    roundId: v.optional(v.id("rounds")), categoryId: v.optional(v.id("categories")), criterionId: v.optional(v.id("criteria")),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage" });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Account not found");
    if (account.kind !== "judge") throw appError(ErrorCode.VALIDATION_ERROR, "Assignments apply to judge accounts only");
    if (args.roundId) {
      const r = await ctx.db.get(args.roundId);
      if (!r || r.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }
    if (args.categoryId) {
      const c = await ctx.db.get(args.categoryId);
      if (!c || c.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
    }
    if (args.criterionId) {
      const cr = await ctx.db.get(args.criterionId);
      if (!cr) throw appError(ErrorCode.NOT_FOUND, "Criterion not found");
      const r = await ctx.db.get(cr.roundId);
      if (!r || r.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Criterion not found");
    }
    const id = await ctx.db.insert("judgeAssignments", {
      judgeId: args.accountId, eventId: eactx.event._id,
      roundId: args.roundId, categoryId: args.categoryId, criterionId: args.criterionId,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "judge.assignment.added",
      resourceType: "judgeAssignment", resourceId: id,
      after: { accountId: args.accountId, roundId: args.roundId ?? null, categoryId: args.categoryId ?? null },
    });
  },
});

export const removeAssignment = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), assignmentId: v.id("judgeAssignments") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage" });
    const a = await ctx.db.get(args.assignmentId);
    if (!a || a.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Assignment not found");
    await ctx.db.delete(args.assignmentId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "judge.assignment.removed",
      resourceType: "judgeAssignment", resourceId: args.assignmentId,
    });
  },
});
```

- [ ] **Step 7: Switch judge consumers to eventAccounts.**
  - `convex/lib/eventAuthz.ts`: delete the `requireJudgeRow` function entirely.
  - `convex/accounts.ts` `list`: now that `judgeAssignments.judgeId` is `Id<"eventAccounts">`, restore the enrichment (replaces the Task 4 NOTE):

```ts
    return Promise.all(
      accounts.map(async (a) => ({
        _id: a._id, kind: a.kind, displayName: a.displayName, username: a.username,
        status: a.status, lockedUntil: a.lockedUntil,
        assignments: await ctx.db
          .query("judgeAssignments")
          .withIndex("by_judge_id", (q) => q.eq("judgeId", a._id))
          .collect(),
      })),
    );
```

  - `convex/accounts.ts` `deleteAccount`: restore the sheet guard after the account lookup (replaces the Task 4 NOTE):

```ts
    const sheet = await ctx.db
      .query("scoreSheets")
      .withIndex("by_judge_id_and_round_id", (q) => q.eq("judgeId", args.accountId))
      .first();
    if (sheet) throw appError(ErrorCode.CONFLICT, "Account has score sheets and cannot be deleted");
```

  - Append to `convex-test/accounts.test.ts` (test deferred from Task 4):

```ts
  it("delete is blocked when the account has score sheets (CONFLICT)", async () => {
    const t = setupTest();
    await setupDraft(t);
    const res = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      orgSlug: "acme", eventSlug: "gala", kind: "judge", displayName: "A", username: "judge1", password: "pass-12345",
    });
    await t.run(async (q) => {
      const events = await q.db.query("events").collect();
      await q.db.insert("scoreSheets", {
        eventId: events[0]._id, roundId: (await q.db.query("rounds").collect())[0]._id,
        judgeId: res.accountId, contestantId: (await q.db.query("contestants").collect())[0]._id, status: "not_started",
      });
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.accounts.deleteAccount, { orgSlug: "acme", eventSlug: "gala", accountId: res.accountId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
```

  - `convex/events.ts` `computeReadiness` — replace the `judges` query:

```ts
  const judges = await ctx.db
    .query("eventAccounts")
    .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eventId).eq("kind", "judge"))
    .collect();
```

  - `convex/eventLifecycle.ts` `publish` — same replacement (only judge-kind accounts generate sheets):

```ts
    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", eactx.event._id).eq("kind", "judge"))
      .collect();
```

  - `convex/roundAdmin.ts` `roundMonitor` — replace the judges query with the same judge-kind query, then the loop building `judgesOut` becomes:

```ts
    const judgesOut: { judgeId: Id<"eventAccounts">; name: string }[] = [];
    for (const j of judges) {
      judgesOut.push({ judgeId: j._id, name: j.displayName });
    }
```

  - `convex/lib/roundCompute.ts`:
    - Replace the `judges` query (~line 52) with the judge-kind `eventAccounts` query scoped to `eactx.event._id`.
    - `RoundComputeResult.judgeParticipation` type: `{ judgeId: Id<"eventAccounts">; sheetsSubmitted: number; sheetsTotal: number }[]`. Where participation rows are built from judge rows, the account `_id` maps directly.
    - Narrow ctx params so session callers (Task 7) can pass `{ event }`: change `loadRoundCompute(ctx, eactx: EventAuthCtx, ...)` to `eactx: Pick<EventAuthCtx, "event">`, and in `convex/lib/eventAuthz.ts` change `loadRound(ctx, eactx: EventAuthCtx, ...)` to `eactx: Pick<EventAuthCtx, "event">` (loadRound only uses `eactx.event._id`).

- [ ] **Step 8: Rework `convex-test/setup.ts`.** Keep `setupTest`, `seedAndProvision`, the three identities, `createOrgAndEvent`, and `ScoredEventOpts` unchanged. Delete the old `prepareScoredEvent` body (invitations/judges flow) and replace with:

```ts
export const ACCOUNT_PASSWORDS = { bob: "bob-judge-01", carol: "carol-judge-01", staff: "staff-enter-01" } as const;

export type PreparedScoredEvent = {
  roundId: Id<"rounds">;
  criterionIds: Id<"criteria">[];
  contestantIds: Id<"contestants">[];
  judgeIds: { bob: Id<"eventAccounts">; carol: Id<"eventAccounts"> };
  staffId: Id<"eventAccounts">;
  eventCode: string;
  tokens: { staff: string; bob: string; carol: string };
};

export async function prepareScoredEvent(
  t: ReturnType<typeof setupTest>,
  opts: ScoredEventOpts = {},
): Promise<PreparedScoredEvent> {
  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
  const eventPatch: Record<string, unknown> = {};
  if (opts.dropHighLow !== undefined) eventPatch.scoringRules = { dropHighLow: opts.dropHighLow };
  if (opts.eliminationEnabled !== undefined) eventPatch.eliminationEnabled = opts.eliminationEnabled;
  if (opts.resultVisibility !== undefined) eventPatch.resultVisibility = opts.resultVisibility;
  if (Object.keys(eventPatch).length > 0) {
    await t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "gala", ...eventPatch });
  }
  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
    orgSlug: "acme", eventSlug: "gala", name: "R",
    qualifiesToNextRound: opts.qualifiesToNextRound,
    advancement: opts.advancement,
  });
  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const roundId = rounds[0]._id;
  for (const [name, weight] of [["A", 60], ["B", 40]] as const) {
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId, name, weight, minScore: 0, maxScore: 10, decimalPrecision: 0,
    });
  }
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Nina", number: 2 });

  const bobAccount = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    orgSlug: "acme", eventSlug: "gala", kind: "judge",
    displayName: "Bob", username: "judge1", password: ACCOUNT_PASSWORDS.bob,
  });
  const carolAccount = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    orgSlug: "acme", eventSlug: "gala", kind: "judge",
    displayName: "Carol", username: "judge2", password: ACCOUNT_PASSWORDS.carol,
  });
  const staffAccount = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    orgSlug: "acme", eventSlug: "gala", kind: "staff",
    displayName: "Stella", username: "staff1", password: ACCOUNT_PASSWORDS.staff,
  });
  for (const accountId of [bobAccount.accountId, carolAccount.accountId]) {
    await t.withIdentity(aliceIdentity).mutation(api.accounts.addAssignment, { orgSlug: "acme", eventSlug: "gala", accountId });
  }
  await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
  const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
  const login = (username: string, password: string) =>
    t.action(api.eventAuth.login, { eventCode: ev!.eventCode, username, password });
  const staffTok = await login("staff1", ACCOUNT_PASSWORDS.staff);
  const bobTok = await login("judge1", ACCOUNT_PASSWORDS.bob);
  const carolTok = await login("judge2", ACCOUNT_PASSWORDS.carol);
  const after = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const contestants = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
  const orderedContestants = [...contestants].sort((a, b) => a.number - b.number);
  return {
    roundId,
    criterionIds: after[0].criteria.map((c) => c._id as Id<"criteria">),
    contestantIds: orderedContestants.map((k) => k._id as Id<"contestants">),
    judgeIds: { bob: bobAccount.accountId, carol: carolAccount.accountId },
    staffId: staffAccount.accountId,
    eventCode: ev!.eventCode,
    tokens: { staff: staffTok.token, bob: bobTok.token, carol: carolTok.token },
  };
}
```

Also delete the two `ensureUserProfile` calls for bob/carol inside the old helper (bob/carol are no longer Google users). Keep the exported identities — some tests still use them as non-member Google identities.

- [ ] **Step 9: Rewrite `convex-test/scoringEntry.test.ts`** — full new content:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { prepareScoredEvent, setupTest } from "./setup";

async function sheetOf(t: ReturnType<typeof setupTest>, token: string, index = 0) {
  const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken: token });
  return mine.rounds[0].sheets[index];
}

describe("enter.scoring (judge sessions)", () => {
  it("lists assignments and saves drafts", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    const sheet = await sheetOf(t, p.tokens.bob);
    await t.mutation(api.enter.scoring.saveDraft, {
      sessionToken: p.tokens.bob, sheetId: sheet.sheetId,
      draftValues: { [p.criterionIds[0]]: 7 },
    });
    const detail = await t.query(api.enter.scoring.sheetDetail, {
      sessionToken: p.tokens.bob, roundId: p.roundId, contestantId: p.contestantIds[0],
    });
    expect(detail.sheet?.status).toBe("in_progress");
    expect(detail.sheet?.draftValues?.[p.criterionIds[0]]).toBe(7);
  });

  it("submits a sheet and blocks resubmission with CONFLICT", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    const sheet = await sheetOf(t, p.tokens.bob);
    const values = { [p.criterionIds[0]]: 8, [p.criterionIds[1]]: 9 };
    await t.mutation(api.enter.scoring.submitSheet, { sessionToken: p.tokens.bob, sheetId: sheet.sheetId, values });
    await expect(
      t.mutation(api.enter.scoring.submitSheet, { sessionToken: p.tokens.bob, sheetId: sheet.sheetId, values }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("judge cannot submit another judge's sheet (NOT_FOUND)", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    const bobSheet = await sheetOf(t, p.tokens.bob);
    await expect(
      t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: p.tokens.carol, sheetId: bobSheet.sheetId,
        values: { [p.criterionIds[0]]: 1, [p.criterionIds[1]]: 2 },
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("staff token cannot enter scores (FORBIDDEN)", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    const sheet = await sheetOf(t, p.tokens.bob);
    await expect(
      t.mutation(api.enter.scoring.saveDraft, { sessionToken: p.tokens.staff, sheetId: sheet.sheetId, draftValues: {} }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("bogus session token is UNAUTHENTICATED", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);
    await expect(
      t.query(api.enter.scoring.myAssignments, { sessionToken: "0".repeat(64) }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });

  it("validates values against criteria ranges", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    const sheet = await sheetOf(t, p.tokens.bob);
    await expect(
      t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: p.tokens.bob, sheetId: sheet.sheetId,
        values: { [p.criterionIds[0]]: 11, [p.criterionIds[1]]: 5 },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("draft submission blocked once round is closed (CONFLICT)", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    const sheet = await sheetOf(t, p.tokens.bob);
    await t.run(async (q) => {
      const rounds = await q.db.query("rounds").collect();
      await q.db.patch(rounds[0]._id, { status: "closed" });
    });
    await expect(
      t.mutation(api.enter.scoring.saveDraft, { sessionToken: p.tokens.bob, sheetId: sheet.sheetId, draftValues: {} }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
```

- [ ] **Step 10: Adapt the remaining test files.** Mechanical pattern — every occurrence of:

```ts
const mine = await t.withIdentity(<identity>).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
```
becomes:
```ts
const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken: <token> });
```
and every:
```ts
await t.withIdentity(<identity>).mutation(api.scoring.submitSheet, { orgSlug: "acme", eventSlug: "gala", sheetId: X, values: Y });
```
becomes:
```ts
await t.mutation(api.enter.scoring.submitSheet, { sessionToken: <token>, sheetId: X, values: Y });
```
Mapping: `bobIdentity` -> `p.tokens.bob`, `carolIdentity` -> `p.tokens.carol`. Tests already destructure the setup result (variously named); keep their local names — the returned shape keeps `roundId`/`criterionIds`/`contestantIds`/`judgeIds` keys and adds `staffId`/`eventCode`/`tokens`.

File-by-file:
  - `convex-test/publishResults.test.ts`: apply the pattern; the `api.members.list` block (~line 118) that resolves `aliceProfileId` from member emails becomes `const bobId = p.judgeIds.bob;` (use setup-provided ids wherever the old member lookup fed identity-based scoring calls). After editing, grep the file for `api.members` — must be 0 matches.
  - `convex-test/roundLifecycle3.test.ts`: same pattern (bob <-> `p.tokens.bob`, carol <-> `p.tokens.carol`).
  - `convex-test/reviewDecisions.test.ts`: same pattern; members lookup (~line 255) -> `p.judgeIds`.
  - `convex-test/events.test.ts`: delete the test `"refuses event.create for a Viewer member"` (multi-member roles no longer exist). No other invitation usage. Grep for `invitations` after edit — must be 0 matches.
  - `convex-test/lifecycle.test.ts`: in `configureValidEvent`, delete line 6 (`ensureUserProfile` for bob), the `bobIdentity` import, and replace lines 13-20 with:

```ts
  const account = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    orgSlug: "acme", eventSlug: "gala", kind: "judge",
    displayName: "Bob", username: "judge1", password: "bob-judge-01",
  });
  await t.withIdentity(aliceIdentity).mutation(api.accounts.addAssignment, {
    orgSlug: "acme", eventSlug: "gala", accountId: account.accountId,
  });
```

  - `convex-test/phase3Schema.test.ts`: same replacement inside `configureMinimalEvent` (keep `return roundId;`), delete the bob `ensureUserProfile` line and unused `bobIdentity` import.
  - `convex-test/platform.test.ts`: `api.members.list` usages (~lines 95, 112) assert member visibility. Replace with owner-only org assertions, keeping surrounding expectations intact:

```ts
const aliceMine = await t.withIdentity(aliceIdentity).query(api.organizations.listMine, {});
expect(aliceMine.length).toBe(1);
const bobMine = await t.withIdentity(bobIdentity).query(api.organizations.listMine, {});
expect(bobMine.length).toBe(0);
```

    Read the surrounding test first and keep every non-members assertion unchanged. Grep for `api.members` after — 0 matches.
  - `convex-test/reads.test.ts` + `convex-test/permissions3.test.ts`: run `npx vitest run convex-test/reads.test.ts convex-test/permissions3.test.ts` first. If green, leave untouched. If failures reference deleted modules or the 7-role seed, apply the same substitutions (role count assertions -> exactly one org role `"Org Owner"`; member reads -> `organizations.listMine`).
  - Delete `convex-test/members.test.ts` and `convex-test/judges.test.ts` (coverage replaced by `accounts.test.ts`).

- [ ] **Step 11: Run the full suite** — `npx convex codegen; npm test` -> ALL PASS. Then grep for stragglers:

```powershell
Select-String -Path "convex-test\*.ts", "app\**\*.tsx", "app\**\*.ts", "components\*.tsx" -Pattern "api\.(judges|members|invitations)\.|api\.scoring\." | Measure-Object | Select-Object -ExpandProperty Count
```

Expected: 0.

- [ ] **Step 12: Validate** — `npm run build && npm run lint && npm test` -> green.

- [ ] **Step 13: Commit** — `git add -A && git commit -m "feat!: replace judge invitations with event-scoped accounts and session-based scoring"`

---

### Task 7: Staff enter functions (rounds + results)

**Files:**
- Create: `convex/enter/rounds.ts`, `convex/enter/results.ts`, `convex/lib/eventResults.ts`, `convex-test/enterStaff.test.ts`
- Modify: `convex/results.ts` (use the extracted helper)

**Interfaces:**
- Consumes: `requireEventSession`/`touchSession`; `loadRoundCompute` + `buildSnapshot` from `lib/roundCompute` (now accepting `Pick<EventAuthCtx, "event">`).
- Produces: `enter.rounds.roundsOverview({sessionToken})`; `enter.rounds.roundMonitor({sessionToken, roundId})`; `enter.rounds.closeRound({sessionToken, roundId})`; `enter.rounds.reopenRound({sessionToken, roundId})`; `enter.rounds.reviewRound({sessionToken, roundId})`; `enter.rounds.publishRound({sessionToken, roundId})`; `enter.rounds.reopenSheet({sessionToken, sheetId})`; `enter.results.eventResults({sessionToken})`; shared `computeEventResults(ctx, event)` + `latestVersion(ctx, roundId)` in `lib/eventResults.ts`.

- [ ] **Step 1: Write failing tests** — `convex-test/enterStaff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { prepareScoredEvent, setupTest } from "./setup";

async function submitAll(
  t: ReturnType<typeof setupTest>, token: string,
  criterionIds: string[], a: number, b: number,
) {
  const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken: token });
  for (const sheet of mine.rounds[0].sheets) {
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: token, sheetId: sheet.sheetId,
      values: { [criterionIds[0]]: a, [criterionIds[1]]: b },
    });
  }
}

describe("enter.rounds (staff sessions)", () => {
  it("judge token cannot run staff ops (FORBIDDEN)", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    await expect(
      t.query(api.enter.rounds.roundsOverview, { sessionToken: p.tokens.bob }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("staff monitors rounds, closes, reopens, reviews, publishes", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    const overview = await t.query(api.enter.rounds.roundsOverview, { sessionToken: p.tokens.staff });
    expect(overview.rounds.length).toBe(1);
    expect(overview.rounds[0].status).toBe("open");

    await submitAll(t, p.tokens.bob, p.criterionIds, 8, 9);
    await submitAll(t, p.tokens.carol, p.criterionIds, 7, 8);

    const monitor = await t.query(api.enter.rounds.roundMonitor, { sessionToken: p.tokens.staff, roundId: p.roundId });
    expect(monitor.roundStatus).toBe("open");
    expect(monitor.judges.map((j: { name: string }) => j.name).sort()).toEqual(["Bob", "Carol"]);

    await t.mutation(api.enter.rounds.closeRound, { sessionToken: p.tokens.staff, roundId: p.roundId });
    await t.mutation(api.enter.rounds.reopenRound, { sessionToken: p.tokens.staff, roundId: p.roundId });
    await t.mutation(api.enter.rounds.closeRound, { sessionToken: p.tokens.staff, roundId: p.roundId });

    const review = await t.query(api.enter.rounds.reviewRound, { sessionToken: p.tokens.staff, roundId: p.roundId });
    expect(review.round.status).toBe("closed");
    expect(review.standings.length).toBe(2);

    await t.mutation(api.enter.rounds.publishRound, { sessionToken: p.tokens.staff, roundId: p.roundId });
    const results = await t.query(api.enter.results.eventResults, { sessionToken: p.tokens.staff });
    expect(results.rounds.length).toBe(1);
    expect(results.final.length).toBe(2);
  });

  it("reopenSheet resets a submitted sheet and deletes its scores", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    await submitAll(t, p.tokens.bob, p.criterionIds, 8, 9);
    const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken: p.tokens.bob });
    const sheetId = mine.rounds[0].sheets[0].sheetId;
    await t.mutation(api.enter.rounds.reopenSheet, { sessionToken: p.tokens.staff, sheetId });
    const after = await t.query(api.enter.scoring.myAssignments, { sessionToken: p.tokens.bob });
    expect(after.rounds[0].sheets[0].status).toBe("in_progress");
    const scoreCount = await t.run(async (q) => (await q.db.query("scores").collect()).length);
    expect(scoreCount).toBe(0);
  });

  it("reopenSheet is blocked on a closed round (CONFLICT)", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    await submitAll(t, p.tokens.bob, p.criterionIds, 8, 9);
    await t.mutation(api.enter.rounds.closeRound, { sessionToken: p.tokens.staff, roundId: p.roundId });
    const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken: p.tokens.bob });
    await expect(
      t.mutation(api.enter.rounds.reopenSheet, { sessionToken: p.tokens.staff, sheetId: mine.rounds[0].sheets[0].sheetId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("publishRound with unresolved ties throws TIES_UNRESOLVED", async () => {
    const t = setupTest();
    const p = await prepareScoredEvent(t);
    // Identical totals for both contestants force a tie (submitAll uses the
    // same {a,b} for every sheet of a judge).
    await submitAll(t, p.tokens.bob, p.criterionIds, 8, 8);
    await submitAll(t, p.tokens.carol, p.criterionIds, 8, 8);
    await t.mutation(api.enter.rounds.closeRound, { sessionToken: p.tokens.staff, roundId: p.roundId });
    await expect(
      t.mutation(api.enter.rounds.publishRound, { sessionToken: p.tokens.staff, roundId: p.roundId }),
    ).rejects.toMatchObject({ data: { code: "TIES_UNRESOLVED" } });
  });
});
```

Note: the tie test requires both contestants to have identical totals — `submitAll` submits identical values for every sheet, which achieves this. If `lib/tabulation` resolves such ties automatically (check `tieBreaks` semantics), keep values identical for both contestants AND both judges — that is the requirement; adjust only if a single-judge pattern is needed to force the tie.

- [ ] **Step 2: Run** — `npx convex codegen; npx vitest run convex-test/enterStaff.test.ts` -> FAIL.

- [ ] **Step 3: Extract `convex/lib/eventResults.ts`** — move the body of `results.ts` `eventResults` (from `const rounds = ...` through the final `return {...};`) plus the `latestVersion` helper, renaming `eactx.event` -> `event`:

```ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { computeEventFinal, type RoundStandingSummary, type StandingRow } from "./tabulation";

export async function latestVersion(ctx: QueryCtx, roundId: Id<"rounds">): Promise<Doc<"resultVersions"> | null> {
  const versions = await ctx.db
    .query("resultVersions")
    .withIndex("by_round_id", (q) => q.eq("roundId", roundId))
    .collect();
  return versions.reduce<Doc<"resultVersions"> | null>(
    (best, v) => (best === null || v.version > best.version ? v : best),
    null,
  );
}

export async function computeEventResults(ctx: QueryCtx, event: Doc<"events">) {
  // EXACT body moved from convex/results.ts eventResults, with every
  // `eactx.event` reference renamed to `event` and `eactx.event._id` to
  // `event._id`. Return shape unchanged.
}
```

Then `convex/results.ts` `eventResults` becomes:

```ts
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    return computeEventResults(ctx, eactx.event);
  },
```

Import `computeEventResults` from `./lib/eventResults`; remove the local `latestVersion` only if nothing else in the file uses it (check `roundResults`/`listRoundVersions` — they use inline reduces; if they don't call `latestVersion`, delete the local helper).

- [ ] **Step 4: Implement `convex/enter/rounds.ts`:**

```ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "../lib/errors";
import { requireEventSession, touchSession } from "../lib/eventSession";
import { buildSnapshot, loadRoundCompute } from "../lib/roundCompute";
import { writeAudit } from "../lib/audit";

const accountTag = (kind: string, name: string) => `${kind}:${name}`;

export const roundsOverview = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, { sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true });
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const out: { roundId: Id<"rounds">; name: string; status: string; submitted: number; total: number }[] = [];
    for (const round of [...rounds].sort((a, b) => a.order - b.order)) {
      const sheets = await ctx.db
        .query("scoreSheets")
        .withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", sctx.event._id).eq("roundId", round._id))
        .collect();
      out.push({
        roundId: round._id, name: round.name, status: round.status,
        submitted: sheets.filter((s) => s.status === "submitted" || s.status === "locked").length,
        total: sheets.length,
      });
    }
    return { eventName: sctx.event.name, rounds: out };
  },
});

export const roundMonitor = query({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, { sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true });
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", sctx.event._id).eq("kind", "judge"))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", sctx.event._id).eq("roundId", round._id))
      .collect();
    return {
      roundStatus: round.status,
      judges: judges.map((j) => ({ judgeId: j._id, name: j.displayName })),
      contestants: contestants.map((k) => ({ contestantId: k._id, name: k.name, number: k.number })),
      sheets: sheets.map((s) => ({ judgeId: s.judgeId, contestantId: s.contestantId, status: s.status })),
    };
  },
});

export const closeRound = mutation({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, { sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true });
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    if (round.status !== "open") throw appError(ErrorCode.CONFLICT, "Only open rounds can be closed");
    await ctx.db.patch(round._id, { status: "closed" });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.closed",
      resourceType: "round", resourceId: round._id,
      before: { status: "open" },
      after: { status: "closed", by: accountTag(sctx.account.kind, sctx.account.displayName) },
    });
  },
});

export const reopenRound = mutation({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, { sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true });
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    if (round.status !== "closed") throw appError(ErrorCode.CONFLICT, "Only closed rounds can be reopened");
    await ctx.db.patch(round._id, { status: "open" });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.reopened",
      resourceType: "round", resourceId: round._id,
      before: { status: "closed" },
      after: { status: "open", by: accountTag(sctx.account.kind, sctx.account.displayName) },
    });
  },
});

export const reviewRound = query({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, { sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true });
    const result = await loadRoundCompute(ctx, { event: sctx.event }, args.roundId);
    if (result.round.status !== "closed") throw appError(ErrorCode.CONFLICT, "Close the round before review");
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const nameOf = (id: Id<"contestants">) => contestants.find((k) => k._id === id)?.name ?? "";
    return {
      round: {
        name: result.round.name, status: result.round.status,
        advancement: result.round.advancement, qualifiesToNextRound: result.round.qualifiesToNextRound,
      },
      eliminationEnabled: sctx.event.eliminationEnabled,
      standings: result.standings.map((s) => ({
        contestantId: s.contestantId, contestantName: nameOf(s.contestantId),
        categoryId: s.categoryId, status: s.status, roundScore: s.roundScore,
        criterionScores: s.criterionScores, rank: s.rank, tieResolvedBy: s.tieResolvedBy,
        advancement: result.advancement.get(s.contestantId) ?? null,
      })),
      unresolvedTies: result.unresolvedTies.map((u) => ({
        categoryId: u.categoryId, contestantIds: u.contestantIds, names: u.contestantIds.map(nameOf),
      })),
    };
  },
});

export const publishRound = mutation({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, { sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true });
    const result = await loadRoundCompute(ctx, { event: sctx.event }, args.roundId);
    if (result.round.status !== "closed") throw appError(ErrorCode.CONFLICT, "Only closed rounds can be published");
    if (result.unresolvedTies.length > 0) {
      throw appError(ErrorCode.TIES_UNRESOLVED, "Resolve all ties before publishing", {
        ties: result.unresolvedTies,
      });
    }
    const existing = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    // OCC serializes version allocation, mirroring roundAdmin.publishRound.
    const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const now = Date.now();
    await ctx.db.insert("resultVersions", {
      eventId: sctx.event._id, roundId: args.roundId, version,
      snapshot: buildSnapshot(result, now, sctx.event.decimalPrecision),
      createdById: null, createdByAccountId: sctx.account._id,
      createdAt: now,
    });
    await ctx.db.patch(args.roundId, { status: "published" });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "round.published",
      resourceType: "round", resourceId: args.roundId,
      before: { status: "closed" },
      after: { status: "published", version, by: accountTag(sctx.account.kind, sctx.account.displayName) },
    });
  },
});

export const reopenSheet = mutation({
  args: { sessionToken: v.string(), sheetId: v.id("scoreSheets") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, { sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true });
    const sheet = await ctx.db.get(args.sheetId);
    if (!sheet || sheet.eventId !== sctx.event._id) throw appError(ErrorCode.NOT_FOUND, "Score sheet not found");
    if (sheet.status !== "submitted" && sheet.status !== "locked") {
      throw appError(ErrorCode.CONFLICT, "Only submitted sheets can be reopened");
    }
    const round = await ctx.db.get(sheet.roundId);
    if (!round || round.status !== "open") {
      throw appError(ErrorCode.CONFLICT, "Reopen the round before reopening sheets");
    }
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_sheet_id", (q) => q.eq("sheetId", args.sheetId))
      .collect();
    for (const s of scores) await ctx.db.delete(s._id);
    await ctx.db.patch(args.sheetId, { status: "in_progress", draftValues: undefined });
    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId, actorId: null, action: "scoreSheet.reopened",
      resourceType: "scoreSheet", resourceId: args.sheetId,
      before: { status: sheet.status },
      after: { status: "in_progress", by: accountTag(sctx.account.kind, sctx.account.displayName) },
    });
  },
});
```

- [ ] **Step 5: Implement `convex/enter/results.ts`:**

```ts
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireEventSession } from "../lib/eventSession";
import { computeEventResults } from "../lib/eventResults";

export const eventResults = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, { sessionToken: args.sessionToken, kind: "staff", requireReadyEvent: true });
    return computeEventResults(ctx, sctx.event);
  },
});
```

Note: admin `roundAdmin.publishRound`/`correctResults` keep setting `createdById: eactx.user._id` — the schema accepts both attribution forms.

- [ ] **Step 6: Run** — `npx convex codegen; npx vitest run convex-test/enterStaff.test.ts convex-test/publishResults.test.ts convex-test/reviewDecisions.test.ts` -> PASS. Then `npm test`.

- [ ] **Step 7: Validate** — `npm run build && npm run lint && npm test` -> green.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat: staff session functions for round ops, sheet reopen, and results"`

---

### Task 8: Login API routes, middleware, dual-tab sign-in

**REQUIRED:** load the `/ui-ux-pro-max` skill before writing UI code.

**Files:**
- Create: `app/api/auth/judge-login/route.ts`, `app/api/auth/judge-logout/route.ts`
- Modify: `middleware.ts`, `app/sign-in/page.tsx`

**Interfaces:**
- Consumes: `api.eventAuth.login`/`logout` (Task 3); `NEXT_PUBLIC_CONVEX_URL`.
- Produces: `POST /api/auth/judge-login {eventCode, username, password} -> {ok: true, kind, displayName, eventName}` + `event_session` cookie; `POST /api/auth/judge-logout -> {ok: true}` + cleared cookie. Middleware protects `/enter/**`.

- [ ] **Step 1: Create `app/api/auth/judge-login/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const SESSION_COOKIE = "event_session";
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

interface JudgeLoginBody {
  eventCode?: unknown;
  username?: unknown;
  password?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: JudgeLoginBody;
  try {
    body = (await request.json()) as JudgeLoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { eventCode, username, password } = body;
  if (
    typeof eventCode !== "string" || eventCode.trim() === "" ||
    typeof username !== "string" || username.trim() === "" ||
    typeof password !== "string" || password === ""
  ) {
    return NextResponse.json({ error: "eventCode, username and password are required" }, { status: 400 });
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  try {
    const session = await convex.action(api.eventAuth.login, {
      eventCode: eventCode.trim(), username, password,
    });
    const response = NextResponse.json({
      ok: true, kind: session.kind, displayName: session.displayName, eventName: session.eventName,
    });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/enter",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    const data = (error as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "NOT_FOUND" || data?.code === "UNAUTHENTICATED") {
      return NextResponse.json({ error: data.message ?? "Invalid event code or judge credentials" }, { status: 401 });
    }
    if (data?.code === "FORBIDDEN") {
      return NextResponse.json({ error: data.message ?? "Account not allowed" }, { status: 403 });
    }
    console.error("[judge-login] failed:", error);
    return NextResponse.json({ error: "Could not sign in" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/auth/judge-logout/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const SESSION_COOKIE = "event_session";

export async function POST(request: Request): Promise<NextResponse> {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (token) {
    try {
      const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
      await convex.mutation(api.eventAuth.logout, { sessionToken: token });
    } catch (error) {
      // Logout is idempotent server-side (row delete); a failed call still
      // clears the cookie, so log and continue.
      console.error("[judge-logout] failed:", error);
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/enter", maxAge: 0 });
  return response;
}
```

- [ ] **Step 3: Update `middleware.ts`** — protect `/enter` with the cookie and keep `/app`/`/platform` behavior:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const SSO_PROTECTED = [/^\/app(\/|$)/, /^\/platform(\/|$)/];
const ENTER_PROTECTED = /^\/enter(\/|$)/;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (ENTER_PROTECTED.test(pathname)) {
    if (req.cookies.get("event_session")?.value) return NextResponse.next();
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  if (!SSO_PROTECTED.some((re) => re.test(pathname))) return NextResponse.next();

  if (getSessionCookie(req)) return NextResponse.next();

  const signIn = new URL("/sign-in", req.url);
  signIn.searchParams.set("next", pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*", "/enter/:path*"],
};
```

- [ ] **Step 4: Rebuild `app/sign-in/page.tsx`** as the dual-tab login:

```tsx
"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

type Tab = "judge" | "organizer";

function SignInContent() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next") ?? "/app";
  const [tab, setTab] = useState<Tab>("judge");
  const [eventCode, setEventCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ssoPending, setSsoPending] = useState(false);

  const canEnter = eventCode.trim() !== "" && username.trim() !== "" && password !== "";

  const enterEvent = async () => {
    setEntering(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/judge-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventCode: eventCode.trim(), username: username.trim(), password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not sign in.");
        return;
      }
      router.push("/enter");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setEntering(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Sign in to Tabulation</h1>
      <div role="tablist" aria-label="Sign-in type" className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          role="tab"
          aria-selected={tab === "judge"}
          onClick={() => { setTab("judge"); setError(null); }}
          className={`rounded-md px-4 py-1.5 text-sm ${tab === "judge" ? "bg-background shadow" : "text-muted-foreground"}`}
        >
          Judge Access
        </button>
        <button
          role="tab"
          aria-selected={tab === "organizer"}
          onClick={() => { setTab("organizer"); setError(null); }}
          className={`rounded-md px-4 py-1.5 text-sm ${tab === "organizer" ? "bg-background shadow" : "text-muted-foreground"}`}
        >
          Organizer Portal
        </button>
      </div>

      {tab === "judge" ? (
        <form
          className="w-full max-w-sm space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (canEnter && !entering) void enterEvent(); }}
        >
          <div className="space-y-1">
            <Label htmlFor="event-code">Event Code</Label>
            <Input
              id="event-code" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              value={eventCode} onChange={(e) => setEventCode(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={!canEnter || entering}>
            {entering ? "Entering…" : "Enter Event"}
          </Button>
        </form>
      ) : (
        <div className="w-full max-w-sm space-y-3">
          <Button
            className="w-full"
            disabled={ssoPending}
            onClick={async () => {
              setSsoPending(true);
              await signIn.social({ provider: "google", callbackURL: next });
            }}
          >
            Continue with Google
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            For event organizers and subscription holders only.
          </p>
        </div>
      )}
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}
```

- [ ] **Step 5: Validate** — `npm run build && npm run lint && npm test` -> green.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: dual-tab sign-in and event-session API routes with /enter middleware"`

---

### Task 9: /enter UI for judges and staff

**REQUIRED:** load the `/ui-ux-pro-max` skill before writing UI code.

**Files:**
- Create: `app/enter/layout.tsx`, `components/enter/EnterShell.tsx`, `app/enter/page.tsx`, `app/enter/scoring/[roundId]/[contestantId]/page.tsx`, `app/enter/rounds/[roundId]/page.tsx`, `app/enter/rounds/[roundId]/review/page.tsx`, `app/enter/results/page.tsx`

**Interfaces:**
- Consumes: `api.eventAuth.sessionInfo`, `api.enter.scoring.*`, `api.enter.rounds.*`, `api.enter.results.eventResults`; cookie `event_session` (set by Task 8); existing tabulation components (`Num`, `StatusBadge`, `StatusDot`, `EmptyState`, `TableSkeleton`, `SaveIndicator`, `sheetStatusLabel`).
- Produces: `/enter` (role-router landing), `/enter/scoring/[roundId]/[contestantId]` (judge entry), `/enter/rounds/[roundId]` (staff monitor), `/enter/rounds/[roundId]/review` (staff review + publish + sheet reopen), `/enter/results` (staff results + print).

- [ ] **Step 1: Create `app/enter/layout.tsx`** (server component; cookie gate on top of middleware):

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EnterShell } from "@/components/enter/EnterShell";

export default async function EnterLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get("event_session")?.value;
  if (!token) redirect("/sign-in");
  return <EnterShell sessionToken={token}>{children}</EnterShell>;
}
```

- [ ] **Step 2: Create `components/enter/EnterShell.tsx`** (client; provides session context):

```tsx
"use client";

import { createContext, useContext } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/tabulation/StateBlock";

const SessionTokenContext = createContext<string>("");
export const useSessionToken = () => useContext(SessionTokenContext);

export function EnterShell({ sessionToken, children }: { sessionToken: string; children: React.ReactNode }) {
  const router = useRouter();
  const info = useQuery(api.eventAuth.sessionInfo, { sessionToken });

  const exit = async () => {
    await fetch("/api/auth/judge-logout", { method: "POST" });
    router.push("/sign-in");
  };

  return (
    <SessionTokenContext.Provider value={sessionToken}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-2">
          <div className="flex items-baseline gap-3">
            <span className="font-semibold">{info?.eventName ?? "…"}</span>
            {info && (
              <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase tracking-wide">{info.kind}</span>
            )}
            {info && <span className="text-sm text-muted-foreground">{info.displayName}</span>}
          </div>
          <Button variant="outline" size="sm" onClick={() => void exit()}>Exit</Button>
        </header>
        <main className="p-4 md:p-8">
          {info === undefined ? <TableSkeleton rows={4} cols={3} /> : info === null ? (
            <p className="text-sm text-muted-foreground">Session expired — please sign in again.</p>
          ) : children}
        </main>
      </div>
    </SessionTokenContext.Provider>
  );
}
```

- [ ] **Step 3: Create `app/enter/page.tsx`** (role router — judge assignments or staff rounds overview):

```tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StatusBadge } from "@/components/tabulation/StatusBadge";
import { Num } from "@/components/tabulation/Num";
import { useSessionToken } from "@/components/enter/EnterShell";

export default function EnterPage() {
  const sessionToken = useSessionToken();
  const info = useQuery(api.eventAuth.sessionInfo, { sessionToken });
  const mine = useQuery(api.enter.scoring.myAssignments, { sessionToken });
  const overview = useQuery(api.enter.rounds.roundsOverview, { sessionToken });

  if (info === undefined) return null;

  if (info.kind === "judge") {
    if (mine === undefined) return null;
    return (
      <div className="space-y-6">
        {mine.rounds.map((round) => {
          const submitted = round.sheets.filter((s) => s.status === "submitted" || s.status === "locked").length;
          return (
            <section key={round.roundId} className="space-y-2 rounded-lg border p-4" aria-label={round.name}>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-medium">
                  {round.name} <StatusBadge kind="round" status={round.status} />
                </h2>
                <span className="text-xs text-muted-foreground">
                  <Num value={submitted} /> / <Num value={round.sheets.length} /> submitted
                </span>
              </div>
              <ul className="divide-y">
                {round.sheets.map((sheet) => {
                  const actionable = round.status === "open" && sheet.status !== "submitted" && sheet.status !== "locked";
                  return (
                    <li key={sheet.sheetId} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="font-mono tabular-nums text-muted-foreground">#{sheet.contestantNumber}</span>
                      <span>{sheet.contestantName}</span>
                      {actionable ? (
                        <Link className="underline underline-offset-4" href={`/enter/scoring/${round.roundId}/${sheet.contestantId}`}>
                          {sheet.status === "in_progress" ? "Continue" : "Score"}
                        </Link>
                      ) : (
                        <StatusBadge kind="sheet" status={sheet.status} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  if (overview === undefined) return null;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link className="text-sm underline underline-offset-4" href="/enter/results">Results &amp; print</Link>
      </div>
      {overview.rounds.map((round) => (
        <Link
          key={round.roundId}
          href={`/enter/rounds/${round.roundId}`}
          className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent"
        >
          <span className="flex items-center gap-2 font-medium">
            {round.name} <StatusBadge kind="round" status={round.status} />
          </span>
          <span className="text-xs text-muted-foreground">
            <Num value={round.submitted} /> / <Num value={round.total} /> submitted
          </span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `app/enter/scoring/[roundId]/[contestantId]/page.tsx`** — port the deleted admin score-entry page (`app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx` from git history: `git show HEAD~<n>:...` or reuse the version removed in Task 5) with these exact substitutions:
  - Params: only `roundId` and `contestantId` (no orgSlug/eventSlug).
  - `const sessionToken = useSessionToken();` from `@/components/enter/EnterShell`.
  - Queries/mutations: `api.enter.scoring.sheetDetail` / `myAssignments` / `saveDraft` / `submitSheet`, all called as `{ sessionToken, ... }` (no orgSlug/eventSlug args anywhere).
  - All hrefs `/app/${orgSlug}/events/${eventSlug}/scoring...` -> `/enter` (back link) and `/enter/scoring/...` (none needed beyond back).
  - Keep the autosave (800 ms debounce), validation, locked/closed views, and submit summary exactly as the original — this is a mechanical port of the file retired in Task 5.

- [ ] **Step 5: Create `app/enter/rounds/[roundId]/page.tsx`** — staff monitor (port of the admin monitor page with substitutions):
  - Param: only `roundId`.
  - `useQuery(api.enter.rounds.roundMonitor, { sessionToken, roundId: roundId as Id<"rounds"> })`.
  - `closeRound`/`reopenRound` -> `api.enter.rounds.closeRound` / `reopenRound` with `{ sessionToken, roundId }`.
  - Remove the `BlackoutNotice` include only if it is admin-specific — check its props; if generic, keep it.
  - "Review & publish" link href -> `/enter/rounds/${roundId}/review`.
  - Keep the progress bar, judge-by-contestant grid, tooltips, legend, and the close confirmation dialog (`ConfirmDialog`) exactly as the original.

- [ ] **Step 6: Create `app/enter/rounds/[roundId]/review/page.tsx`**:

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Num } from "@/components/tabulation/Num";
import { useSessionToken } from "@/components/enter/EnterShell";

export default function EnterReviewPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = use(params);
  const sessionToken = useSessionToken();
  const review = useQuery(api.enter.rounds.reviewRound, { sessionToken, roundId: roundId as Id<"rounds"> });
  const publishRound = useMutation(api.enter.rounds.publishRound);
  const [busy, setBusy] = useState(false);

  if (review === undefined) return null;
  if (review instanceof Error) {
    return <p className="text-sm text-destructive">{review.message}</p>;
  }

  const publish = async () => {
    setBusy(true);
    try {
      await publishRound({ sessionToken, roundId: roundId as Id<"rounds"> });
      toast.success("Round published.");
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      toast.error(data?.code === "TIES_UNRESOLVED" ? "Resolve all ties before publishing." : data?.message ?? "Could not publish.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{review.round.name} — review</h2>
        <Button disabled={busy} onClick={() => void publish()}>Publish round</Button>
      </div>
      {review.unresolvedTies.length > 0 && (
        <p role="alert" className="rounded border border-destructive/50 p-2 text-sm text-destructive">
          Unresolved tie{review.unresolvedTies.length > 1 ? "s" : ""}:{" "}
          {review.unresolvedTies.map((u) => u.names.join(" vs ")).join("; ")}. Ask the organizer to break ties.
        </p>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">Standings</caption>
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">Rank</th><th>Contestant</th><th className="text-right">Score</th></tr>
        </thead>
        <tbody>
          {review.standings.map((s) => (
            <tr key={s.contestantId} className="border-t">
              <td className="py-1"><Num value={s.rank ?? 0} /></td>
              <td>{s.contestantName}</td>
              <td className="text-right tabular-nums"><Num value={s.roundScore ?? 0} precision={2} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Note: tie-break/override editing stays organizer-only (admin `/app` round review page) — staff sees the alert and the standings. If you also want per-sheet reopen buttons here (spec: staff reviews + reopens sheets), append a sheets section querying `api.enter.rounds.roundMonitor` and a `reopenSheet` mutation button per submitted sheet — reuse the pattern from `publish` above with `api.enter.rounds.reopenSheet({ sessionToken, sheetId })`. Sheet ids come from `roundMonitor`'s `sheets` array joined against `roundMonitor.judges`/`contestants` for labels.

- [ ] **Step 7: Create `app/enter/results/page.tsx`**:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Num } from "@/components/tabulation/Num";
import { useSessionToken } from "@/components/enter/EnterShell";

export default function EnterResultsPage() {
  const sessionToken = useSessionToken();
  const results = useQuery(api.enter.results.eventResults, { sessionToken });

  if (results === undefined) return null;
  if (results instanceof Error) {
    return <p className="text-sm text-destructive">{results.message}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-lg font-semibold">Final results</h2>
        <Button variant="outline" onClick={() => window.print()}>Print</Button>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Final standings</caption>
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">Rank</th><th>Contestant</th><th className="text-right">Total</th></tr>
        </thead>
        <tbody>
          {results.final.map((row) => (
            <tr key={row.contestantId} className="border-t">
              <td className="py-1"><Num value={row.rank} /></td>
              <td>{row.contestantName}</td>
              <td className="text-right tabular-nums"><Num value={row.totalScore} precision={2} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 8: Validate** — `npm run build && npm run lint && npm test` -> green. Manually verify in `npm run dev` if a deployment is available: judge login lands on assignments; staff login lands on rounds overview; `/enter` without cookie redirects to `/sign-in` (middleware).

- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat: /enter area for judge scoring and staff round operations"`

---

### Task 10: Admin accounts page and event-code panel

**REQUIRED:** load the `/ui-ux-pro-max` skill before writing UI code.

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/accounts/page.tsx`, `components/tabulation/CredentialsDialog.tsx`
- Modify: `components/EventShell.tsx` (nav), `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx` (event-code panel)

**Interfaces:**
- Consumes: `api.accounts.*` (Task 4/6), `api.events.regenerateCode` (Task 1), `api.rounds.list`.
- Produces: Accounts management page (create staff/judge with manual or auto credentials, one-time credentials dialog, disable/enable/reset/delete, judge round assignments) and the Settings event-code panel (show/copy/regenerate).

- [ ] **Step 1: Create `components/tabulation/CredentialsDialog.tsx`** — a small modal (reuse the `ConfirmDialog` visual pattern) that shows username + password once with a copy button:

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function CredentialsDialog({
  open, onClose, username, password,
}: { open: boolean; onClose: () => void; username: string; password: string }) {
  if (!open) return null;
  const copy = () => void navigator.clipboard.writeText(`Event code aside — username: ${username} password: ${password}`);
  return (
    <div role="dialog" aria-modal="true" aria-label="Account credentials" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-background p-6 shadow-lg">
        <h3 className="font-semibold">Credentials — shown once</h3>
        <p className="text-sm text-muted-foreground">Share these now; the password cannot be recovered.</p>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Username</dt><dd className="font-mono">{username}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Password</dt><dd className="font-mono">{password}</dd></div>
        </dl>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={copy}>Copy</Button>
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/app/[orgSlug]/events/[eventSlug]/accounts/page.tsx`**:

```tsx
"use client";

import { use, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CredentialsDialog } from "@/components/tabulation/CredentialsDialog";

export default function AccountsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const accounts = useQuery(api.accounts.list, { orgSlug, eventSlug });
  const rounds = useQuery(api.rounds.list, { orgSlug, eventSlug });
  const create = useAction(api.accounts.create);
  const resetPassword = useAction(api.accounts.resetPassword);
  const disable = useMutation(api.accounts.disable);
  const enable = useMutation(api.accounts.enable);
  const remove = useMutation(api.accounts.deleteAccount);
  const addAssignment = useMutation(api.accounts.addAssignment);

  const [kind, setKind] = useState<"judge" | "staff">("judge");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [autoMode, setAutoMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [roundPicks, setRoundPicks] = useState<Record<string, Id<"rounds"> | "">>({});

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "LIMIT_EXCEEDED") toast.error("Account limit reached — upgrade your plan.");
    else toast.error(data?.message ?? "Action failed.");
  };

  const createAccount = async () => {
    setBusy(true);
    try {
      const res = await create({
        orgSlug, eventSlug, kind,
        displayName: displayName.trim(),
        username: autoMode || username.trim() === "" ? undefined : username.trim(),
        password: autoMode || password === "" ? undefined : password,
      });
      setCreds({ username: res.username, password: res.password });
      setDisplayName(""); setUsername(""); setPassword("");
    } catch (err) { onError(err); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border p-4" aria-label="Create account">
        <h3 className="font-medium">Add {kind === "judge" ? "judge" : "staff"} account</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="acc-kind">Type</Label>
            <select
              id="acc-kind"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={kind} onChange={(e) => setKind(e.target.value as "judge" | "staff")}
            >
              <option value="judge">Judge</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-name">Display name</Label>
            <Input id="acc-name" className="w-48" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <Label className="flex items-center gap-2 font-normal">
            <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} />
            Auto-generate credentials
          </Label>
        </div>
        {!autoMode && (
          <div className="flex flex-wrap gap-2">
            <div className="space-y-1">
              <Label htmlFor="acc-username">Username</Label>
              <Input id="acc-username" className="w-44" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-password">Password</Label>
              <Input id="acc-password" className="w-44" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
        )}
        <Button disabled={busy || displayName.trim() === ""} onClick={() => void createAccount()}>
          {busy ? "Creating…" : "Create account"}
        </Button>
      </section>

      {accounts?.map((a) => {
        const roundPick = roundPicks[a._id] ?? "";
        return (
          <div key={a._id} className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{a.displayName}</span>{" "}
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">{a.kind}</span>{" "}
                <span className="font-mono text-sm text-muted-foreground">{a.username}</span>{" "}
                {a.status === "disabled" && <span className="text-xs text-destructive">disabled</span>}
                {a.lockedUntil !== null && a.lockedUntil > Date.now() && (
                  <span className="text-xs text-destructive">locked</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={async () => {
                  try {
                    const res = await resetPassword({ orgSlug, eventSlug, accountId: a._id });
                    setCreds({ username: a.username, password: res.password });
                  } catch (err) { onError(err); }
                }}>Reset password</Button>
                {a.status === "active" ? (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    try { await disable({ orgSlug, eventSlug, accountId: a._id }); } catch (err) { onError(err); }
                  }}>Disable</Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    try { await enable({ orgSlug, eventSlug, accountId: a._id }); } catch (err) { onError(err); }
                  }}>Enable</Button>
                )}
                <Button variant="ghost" size="sm" onClick={async () => {
                  try { await remove({ orgSlug, eventSlug, accountId: a._id }); } catch (err) { onError(err); }
                }}>Delete</Button>
              </div>
            </div>
            {a.kind === "judge" && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Assignments:</span>
                {a.assignments.map((as) => (
                  <span key={as._id} className="rounded bg-accent px-2 py-0.5">
                    {as.roundId ? rounds?.find((r) => r._id === as.roundId)?.name ?? "round" : "all rounds"}
                  </span>
                ))}
                <select
                  className="rounded border px-2 py-0.5"
                  value={roundPick}
                  onChange={(e) => setRoundPicks({ ...roundPicks, [a._id]: e.target.value as Id<"rounds"> | "" })}
                >
                  <option value="">All rounds</option>
                  {rounds?.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
                <Button
                  size="sm" variant="outline"
                  onClick={async () => {
                    try {
                      await addAssignment({
                        orgSlug, eventSlug, accountId: a._id,
                        roundId: roundPick === "" ? undefined : roundPick,
                      });
                      setRoundPicks({ ...roundPicks, [a._id]: "" });
                    } catch (err) { onError(err); }
                  }}
                >
                  Assign
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <CredentialsDialog
        open={creds !== null}
        onClose={() => setCreds(null)}
        username={creds?.username ?? ""}
        password={creds?.password ?? ""}
      />
    </div>
  );
}
```

- [ ] **Step 3: Update `components/EventShell.tsx`** — insert `["Accounts", `${base}/accounts`],` after the Contestants entry in the nav array (Task 5's version).

- [ ] **Step 4: Add the event-code panel to `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx`** — after the venue Input block, insert:

```tsx
      <div className="space-y-2 rounded-lg border p-4">
        <h3 className="font-medium">Event code</h3>
        <p className="text-sm text-muted-foreground">
          Judges and staff sign in with this code, their username, and password.
        </p>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-3 py-1.5 font-mono text-lg tracking-widest">{ev.eventCode}</code>
          <Button
            variant="outline" size="sm"
            onClick={() => void navigator.clipboard.writeText(ev.eventCode).then(() => toast.success("Copied."))}
          >
            Copy
          </Button>
          <Button
            variant="outline" size="sm"
            disabled={ev.status !== "draft" && ev.status !== "ready"}
            onClick={async () => {
              try {
                await regenerate({ orgSlug, eventSlug });
                toast.success("Event code regenerated. Share the new code.");
              } catch (err: unknown) {
                const data = (err as { data?: { code?: string; message?: string } })?.data;
                toast.error(data?.message ?? "Could not regenerate.");
              }
            }}
          >
            Regenerate
          </Button>
        </div>
      </div>
```

and add near the other hooks: `const regenerate = useMutation(api.events.regenerateCode);`.

- [ ] **Step 5: Validate** — `npm run build && npm run lint && npm test` -> green.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: admin accounts management and event-code panel"`

---

### Task 11: Final validation and cleanup

**Files:**
- Modify: `package.json` (remove nodemailer), `.env.local` (verify no SMTP), plan checkboxes

- [ ] **Step 1: Uninstall nodemailer** — `npm uninstall nodemailer @types/nodemailer` (mailer deleted in Task 5).

- [ ] **Step 2: Verify no dangling references**:

```powershell
Select-String -Path "convex\*.ts", "convex\lib\*.ts", "app\**\*.tsx", "lib\*.ts", "components\*.tsx" -Pattern "nodemailer|SMTP_|mailer|invitations|judges\.ts|api\.judges|api\.members|api\.scoring" | Measure-Object | Select-Object -ExpandProperty Count
```

Expected: 0 (run from repo root; the Select-String path wildcards may need `-Recurse` via `Get-ChildItem` piping on PowerShell 5.1 — use whatever finds the files).

- [ ] **Step 3: Full gate** — `npx convex codegen; npm run build; npm run lint; npm test` -> all green.

- [ ] **Step 4: Refresh Graphify context** (AGENTS.md requires it after significant changes): `npm run graphify:build`.

- [ ] **Step 5: Update this plan** — tick all checkboxes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: finalize role-based auth refactor, remove nodemailer, refresh graphify"`

---

## Self-Review Notes (already applied)

- **Spec coverage:** dual-tab login (Task 8), event codes (1), judge/staff accounts + credentials UX (4, 10), login endpoint + scoped sessions (3, 8), Google SSO organizer-only (8 + roles trim in 6), invitation removal (5, 6), schema/data layer (6), middleware (8), `/enter` UI (9), staff tabulator powers (7), print (9), cleanup + SMTP removal (5, 11).
- **Type consistency:** `Id<"eventAccounts">` used consistently for judge references after the Task 6 flip (judgeAssignments, scoreSheets, scores.submittedByAccountId, resultVersions snapshot). `prepareScoredEvent` return keys match every consuming test task. `enter.*` function names match between Tasks 6/7 and the Task 9 UI.
- **Sequencing invariant:** Tasks 1-4 are additive (suite stays green after each). Task 5 deletes only UI consumers. Task 6 is the single breaking cutover. Tasks 7-11 build upward from it.






