## Task 7: Contestants

**Files:**
- Create: `convex/contestants.ts`
- Create: `convex-test/contestants.test.ts`

**Interfaces:**
- Consumes: `requireDraftEvent` (permission `"contestant.manage"`), `requireEventMember`; `requireLimit(ctx, sub, "contestants")`; `incrementUsage`; `writeAudit`; `appError`.
- Produces: `api.contestants.{add,list,update,remove}`. `add`: number is a positive integer unique within the event (CONFLICT on dup); category defaults to the event's first category; `maxContestants` enforced. `update`: name/photoUrl/group/status/categoryId/customFields (category verified against the event). `remove`: hard delete + usage decrement.

- [ ] **Step 1: Write failing tests â€” `convex-test/contestants.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

describe("contestants", () => {
  it("adds contestants with unique numbers and lists them", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Jo", number: 2 });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Dup", number: 1 }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const list = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(list.length).toBe(2);
  });

  it("enforces maxContestants (Free = 20)", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    for (let i = 1; i <= 20; i++) {
      await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: `C${i}`, number: i });
    }
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Over", number: 21 }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });

  it("updates status and removes with usage decrement round-trip", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
    const list = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
    const id = list[0]._id;
    await t.withIdentity(aliceIdentity).mutation(api.contestants.update, { orgSlug: "acme", eventSlug: "gala", contestantId: id, status: "scratched" });
    await t.withIdentity(aliceIdentity).mutation(api.contestants.remove, { orgSlug: "acme", eventSlug: "gala", contestantId: id });
    const after = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(after.length).toBe(0);
    await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Back", number: 1 });
  });
});
```

- [ ] **Step 2: RED** â€” `npm test`.

- [ ] **Step 3: Implement `convex/contestants.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";

export const add = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), name: v.string(), number: v.number(),
    categoryId: v.optional(v.id("categories")), photoUrl: v.optional(v.string()),
    group: v.optional(v.string()), customFields: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "contestant.manage" });
    await requireLimit(ctx, eactx.subscription, "contestants");
    if (!Number.isInteger(args.number) || args.number < 1) {
      throw appError(ErrorCode.VALIDATION_ERROR, "number must be a positive integer");
    }
    const dup = await ctx.db
      .query("contestants")
      .withIndex("by_event_id_and_number", (q) => q.eq("eventId", eactx.event._id).eq("number", args.number))
      .unique();
    if (dup) throw appError(ErrorCode.CONFLICT, "Contestant number already used", { number: args.number });
    let categoryId = args.categoryId;
    if (categoryId) {
      const cat = await ctx.db.get(categoryId);
      if (!cat || cat.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
    } else {
      const first = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).first();
      if (!first) throw appError(ErrorCode.VALIDATION_ERROR, "Event has no categories");
      categoryId = first._id;
    }
    const id = await ctx.db.insert("contestants", {
      eventId: eactx.event._id,
      categoryId,
      number: args.number,
      name: args.name.trim(),
      photoUrl: args.photoUrl,
      group: args.group,
      status: "active",
      customFields: args.customFields,
    });
    await incrementUsage(ctx, eactx.org._id, "contestants", 1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "contestant.added",
      resourceType: "contestant", resourceId: id, after: { name: args.name, number: args.number },
    });
  },
});

export const list = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    return await ctx.db.query("contestants").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), contestantId: v.id("contestants"),
    name: v.optional(v.string()), photoUrl: v.optional(v.string()), group: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("scratched"), v.literal("disqualified"))),
    categoryId: v.optional(v.id("categories")), customFields: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "contestant.manage" });
    const c = await ctx.db.get(args.contestantId);
    if (!c || c.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.photoUrl !== undefined) patch.photoUrl = args.photoUrl;
    if (args.group !== undefined) patch.group = args.group;
    if (args.status !== undefined) patch.status = args.status;
    if (args.categoryId !== undefined) {
      const cat = await ctx.db.get(args.categoryId);
      if (!cat || cat.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
      patch.categoryId = args.categoryId;
    }
    if (args.customFields !== undefined) patch.customFields = args.customFields;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.contestantId, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "contestant.updated",
      resourceType: "contestant", resourceId: args.contestantId, before: { status: c.status }, after: patch,
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), contestantId: v.id("contestants") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "contestant.manage" });
    const c = await ctx.db.get(args.contestantId);
    if (!c || c.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    await ctx.db.delete(args.contestantId);
    await incrementUsage(ctx, eactx.org._id, "contestants", -1);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "contestant.removed",
      resourceType: "contestant", resourceId: args.contestantId, before: { name: c.name },
    });
  },
});
```

- [ ] **Step 4: GREEN + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/contestants.ts convex-test/contestants.test.ts
git commit -m "feat: contestants with number uniqueness and plan limits"
```
Expected: 47/47 tests pass; typecheck exit 0.

---

