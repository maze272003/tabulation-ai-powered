## Task 8: Judges and assignments

**Files:**
- Create: `convex/judges.ts`
- Create: `convex-test/judges.test.ts`

**Interfaces:**
- Consumes: `requireDraftEvent` (permission `"judge.manage"`), `requireEventMember`; `requireLimit(ctx, sub, "judges")`; `incrementUsage`; `writeAudit`; `appError`.
- Produces: `api.judges.add({ orgSlug, eventSlug, userId })` (userId must be an ACTIVE org member â€” VALIDATION_ERROR otherwise; unique per event â€” CONFLICT); `api.judges.remove({ orgSlug, eventSlug, judgeId })` (deletes the judge's assignments first); `api.judges.listWithAssignments({ orgSlug, eventSlug })` (judge doc + `user: {name,email,image}` + `assignments[]`); `api.judges.addAssignment({ orgSlug, eventSlug, judgeId, roundId?, categoryId?, criterionId? })` (all optional scope docs verified against the event); `api.judges.removeAssignment({ orgSlug, eventSlug, assignmentId })`.

- [ ] **Step 1: Write failing tests â€” `convex-test/judges.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, setupTest } from "./setup";

async function addBobAsJudgeMember(t: ReturnType<typeof setupTest>) {
  await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: "bob@example.com", roleName: "Judge" });
  const pending = await t.withIdentity(bobIdentity).query(api.invitations.listForUser, {});
  await t.withIdentity(bobIdentity).mutation(api.invitations.accept, { token: pending[0].token });
  const members = await t.withIdentity(aliceIdentity).query(api.members.list, { orgSlug: "acme" });
  return members.find((m: { email: string }) => m.email === "bob@example.com")!.userId;
}

describe("judges", () => {
  it("adds a judge from org members, unique per event", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const bobId = await addBobAsJudgeMember(t);
    await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: bobId });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: bobId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const list = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "gala" });
    expect(list.length).toBe(1);
    expect(list[0].user.email).toBe("bob@example.com");
  });

  it("refuses a non-member userId", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "gala", description: "x" });
    const fakeId = listAnyUserId(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: fakeId }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("adds and removes scoped assignments; IDOR on foreign judge", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "one" });
    const bobId = await addBobAsJudgeMember(t);
    await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "one", userId: bobId });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "one", name: "R" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "one" });
    const judges = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "one" });
    await t.withIdentity(aliceIdentity).mutation(api.judges.addAssignment, {
      orgSlug: "acme", eventSlug: "one", judgeId: judges[0]._id, roundId: rounds[0]._id,
    });
    const withAssignments = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "one" });
    expect(withAssignments[0].assignments.length).toBe(1);
    await t.withIdentity(aliceIdentity).mutation(api.judges.removeAssignment, {
      orgSlug: "acme", eventSlug: "one", assignmentId: withAssignments[0].assignments[0]._id,
    });
    const cleared = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "one" });
    expect(cleared[0].assignments.length).toBe(0);
  });
});
```
NOTE on the second test: `listAnyUserId(t)` is not a real helper. Since `judges.add` verifies org membership, a fake ID string will fail schema validation at the `v.id("userProfiles")` arg parse, not our VALIDATION_ERROR. Replace that test with one that uses Bob BEFORE he joins (provisioned but not a member):
```ts
  it("refuses a non-member userId", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const bobProfile = await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId: bobProfile }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
```
(Requires importing `bobIdentity` â€” already imported. `ensureUserProfile` returns the profile id.) Use the corrected version; drop the `api.events.update` filler line.

- [ ] **Step 2: RED** â€” `npm test`.

- [ ] **Step 3: Implement `convex/judges.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";

export const add = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), userId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage" });
    await requireLimit(ctx, eactx.subscription, "judges");
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_id_and_user_id", (q) => q.eq("orgId", eactx.org._id).eq("userId", args.userId))
      .unique();
    if (!membership || membership.status !== "active") {
      throw appError(ErrorCode.VALIDATION_ERROR, "User is not an active member of this organization");
    }
    const dup = await ctx.db
      .query("judges")
      .withIndex("by_event_id_and_user_id", (q) => q.eq("eventId", eactx.event._id).eq("userId", args.userId))
      .unique();
    if (dup) throw appError(ErrorCode.CONFLICT, "User is already a judge for this event");
    const id = await ctx.db.insert("judges", {
      orgId: eactx.org._id, eventId: eactx.event._id, userId: args.userId, status: "assigned",
    });
    await incrementUsage(ctx, eactx.org._id, "judges", 1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "judge.added",
      resourceType: "judge", resourceId: id, after: { userId: args.userId },
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), judgeId: v.id("judges") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage" });
    const judge = await ctx.db.get(args.judgeId);
    if (!judge || judge.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Judge not found");
    const assignments = await ctx.db.query("judgeAssignments").withIndex("by_judge_id", (q) => q.eq("judgeId", args.judgeId)).collect();
    for (const a of assignments) await ctx.db.delete(a._id);
    await ctx.db.delete(args.judgeId);
    await incrementUsage(ctx, eactx.org._id, "judges", -1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "judge.removed",
      resourceType: "judge", resourceId: args.judgeId,
    });
  },
});

export const listWithAssignments = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    const judges = await ctx.db.query("judges").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    return Promise.all(
      judges.map(async (j) => {
        const user = await ctx.db.get(j.userId);
        const assignments = await ctx.db.query("judgeAssignments").withIndex("by_judge_id", (q) => q.eq("judgeId", j._id)).collect();
        return { ...j, user: { name: user?.name ?? "", email: user?.email ?? "", image: user?.image ?? "" }, assignments };
      }),
    );
  },
});

export const addAssignment = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), judgeId: v.id("judges"),
    roundId: v.optional(v.id("rounds")), categoryId: v.optional(v.id("categories")), criterionId: v.optional(v.id("criteria")),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "judge.manage" });
    const judge = await ctx.db.get(args.judgeId);
    if (!judge || judge.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Judge not found");
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
      judgeId: args.judgeId, eventId: eactx.event._id,
      roundId: args.roundId, categoryId: args.categoryId, criterionId: args.criterionId,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "judge.assignment.added",
      resourceType: "judgeAssignment", resourceId: id,
      after: { judgeId: args.judgeId, roundId: args.roundId ?? null, categoryId: args.categoryId ?? null },
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

- [ ] **Step 4: GREEN + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/judges.ts convex-test/judges.test.ts
git commit -m "feat: judges and scoped assignments with IDOR guards"
```
Expected: 50/50 tests pass; typecheck exit 0.

---

