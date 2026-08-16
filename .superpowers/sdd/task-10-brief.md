## Task 10: Lifecycle â€” publish, reopen, archive

**Files:**
- Create: `convex/eventLifecycle.ts`
- Create: `convex-test/lifecycle.test.ts`

**Interfaces:**
- Consumes: `requireEventPermission` from `./lib/eventAuthz`; `computeReadiness` from `./events`; `writeAudit`; `appError`.
- Produces: `api.eventLifecycle.publish({ orgSlug, eventSlug })` (draftâ†’ready; readiness failures â†’ VALIDATION_ERROR with `{ failures }` context; generates scoreSheets for judges Ã— rounds Ã— active contestants, status `not_started`); `api.eventLifecycle.reopen({ orgSlug, eventSlug })` (readyâ†’draft; deletes ALL event scoreSheets); `api.eventLifecycle.archive({ orgSlug, eventSlug })` (readyâ†’archived).

- [ ] **Step 1: Write failing tests â€” `convex-test/lifecycle.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, setupTest } from "./setup";

async function configureValidEvent(t: ReturnType<typeof setupTest>) {
  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const roundId = rounds[0]._id;
  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { orgSlug: "acme", eventSlug: "gala", roundId, name: "A", weight: 60, minScore: 0, maxScore: 10, decimalPrecision: 0 });
  await t.withIdentity(aliceIdentity).mutation(api.criteria.add, { orgSlug: "acme", eventSlug: "gala", roundId, name: "B", weight: 40, minScore: 0, maxScore: 10, decimalPrecision: 0 });
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
  await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: "bob@example.com", roleName: "Judge" });
  const pending = await t.withIdentity(bobIdentity).query(api.invitations.listForUser, {});
  await t.withIdentity(bobIdentity).mutation(api.invitations.accept, { token: pending[0].token });
  const members = await t.withIdentity(aliceIdentity).query(api.members.list, { orgSlug: "acme" });
  const bobId = members.find((m: { email: string }) => m.email === "bob@example.com")!.userId;
  await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: bobId });
  const judges = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "gala" });
  await t.withIdentity(aliceIdentity).mutation(api.judges.addAssignment, { orgSlug: "acme", eventSlug: "gala", judgeId: judges[0]._id });
}

describe("lifecycle", () => {
  it("blocks publish when readiness fails", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("publishes a valid event, generates sheets, freezes config; reopen deletes sheets", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await configureValidEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.status).toBe("ready");
    const sheetCount = await t.run(async (q) =>
      (await q.db.query("scoreSheets").collect()).filter((s) => s.eventId === ev!._id).length,
    );
    expect(sheetCount).toBe(1);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "Late" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.reopen, { orgSlug: "acme", eventSlug: "gala" });
    const after = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(after?.status).toBe("draft");
    const sheetsAfter = await t.run(async (q) =>
      (await q.db.query("scoreSheets").collect()).filter((s) => s.eventId === after!._id).length,
    );
    expect(sheetsAfter).toBe(0);
  });

  it("archives a ready event", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await configureValidEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.archive, { orgSlug: "acme", eventSlug: "gala" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.status).toBe("archived");
  });
});
```

- [ ] **Step 2: RED** â€” `npm test`.

- [ ] **Step 3: Implement `convex/eventLifecycle.ts`**

```ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventPermission } from "./lib/eventAuthz";
import { computeReadiness } from "./events";
import { writeAudit } from "./lib/audit";

export const publish = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.publish" });
    if (eactx.event.status !== "draft") {
      throw appError(ErrorCode.CONFLICT, "Only draft events can be published");
    }
    const checks = await computeReadiness(ctx, eactx.event._id);
    const failures = checks.filter((c) => !c.passed);
    if (failures.length > 0) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Event is not ready to publish", { failures });
    }
    const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const judges = await ctx.db.query("judges").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const contestants = await ctx.db.query("contestants").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const active = contestants.filter((c) => c.status === "active");
    let generated = 0;
    for (const judge of judges) {
      for (const round of rounds) {
        for (const contestant of active) {
          await ctx.db.insert("scoreSheets", {
            eventId: eactx.event._id, roundId: round._id, judgeId: judge._id,
            contestantId: contestant._id, status: "not_started",
          });
          generated++;
        }
      }
    }
    await ctx.db.patch(eactx.event._id, { status: "ready" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.published",
      resourceType: "event", resourceId: eactx.event._id,
      before: { status: "draft" }, after: { status: "ready", scoreSheetsGenerated: generated },
    });
  },
});

export const reopen = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.publish" });
    if (eactx.event.status !== "ready") {
      throw appError(ErrorCode.CONFLICT, "Only ready events can be reopened");
    }
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    for (const s of sheets) await ctx.db.delete(s._id);
    await ctx.db.patch(eactx.event._id, { status: "draft" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.reopened",
      resourceType: "event", resourceId: eactx.event._id,
      before: { status: "ready" }, after: { status: "draft", scoreSheetsDeleted: sheets.length },
    });
  },
});

export const archive = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.archive" });
    if (eactx.event.status !== "ready") {
      throw appError(ErrorCode.CONFLICT, "Only ready events can be archived");
    }
    await ctx.db.patch(eactx.event._id, { status: "archived" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.archived",
      resourceType: "event", resourceId: eactx.event._id,
      before: { status: "ready" }, after: { status: "archived" },
    });
  },
});
```
Note: `reopen`'s `.withIndex("by_event_id_and_round_id", q => q.eq("eventId", ...))` binds only the index prefix â€” valid Convex.

- [ ] **Step 4: GREEN + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/eventLifecycle.ts convex-test/lifecycle.test.ts
git commit -m "feat: publish/reopen/archive lifecycle with sheet generation"
```
Expected: 55/55 tests pass; typecheck exit 0.

---

