## Task 5: Categories and rounds

**Files:**
- Create: `convex/categories.ts`
- Create: `convex/rounds.ts`
- Create: `convex-test/config.test.ts`

**Interfaces:**
- Consumes: `requireDraftEvent` (permission `"event.update"`), `requireEventMember` from `./lib/eventAuthz`; `writeAudit`; `appError`.
- Produces: `api.categories.{add,update,remove,list}` and `api.rounds.{add,update,remove,list}`. ID-arg mutations verify `doc.eventId === event._id` (NOT_FOUND). `categories.remove` throws CONFLICT if contestants reference it. `rounds.remove` deletes the round's criteria first. `rounds.list` returns rounds with a joined `criteria` array.

- [ ] **Step 1: Write failing tests â€” `convex-test/config.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

describe("categories and rounds", () => {
  it("adds and lists categories in order", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.categories.add, { orgSlug: "acme", eventSlug: "gala", name: "Juniors" });
    const cats = await t.withIdentity(aliceIdentity).query(api.categories.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(cats.map((c) => c.name)).toEqual(["Open", "Juniors"]);
  });

  it("adds rounds and lists them with criteria joined", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "Preliminary" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "Final" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(rounds.map((r) => r.name)).toEqual(["Preliminary", "Final"]);
    expect(Array.isArray(rounds[0].criteria)).toBe(true);
  });

  it("unknown event slug yields NOT_FOUND", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.categories.add, { orgSlug: "acme", eventSlug: "nope", name: "X" }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
```

- [ ] **Step 2: RED** â€” `npm test`.

- [ ] **Step 3: Implement `convex/categories.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

export const add = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const existing = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const id = await ctx.db.insert("categories", {
      eventId: eactx.event._id,
      name: args.name.trim(),
      description: args.description,
      order: existing.length,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "category.added",
      resourceType: "category", resourceId: id, after: { name: args.name },
    });
  },
});

export const update = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), categoryId: v.id("categories"), name: v.optional(v.string()), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const cat = await ctx.db.get(args.categoryId);
    if (!cat || cat.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
    const patch: { name?: string; description?: string } = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.categoryId, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "category.updated",
      resourceType: "category", resourceId: args.categoryId, before: { name: cat.name }, after: patch,
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const cat = await ctx.db.get(args.categoryId);
    if (!cat || cat.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Category not found");
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id_and_category_id", (q) => q.eq("eventId", eactx.event._id).eq("categoryId", args.categoryId))
      .first();
    if (contestants) throw appError(ErrorCode.CONFLICT, "Category still has contestants");
    await ctx.db.delete(args.categoryId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "category.removed",
      resourceType: "category", resourceId: args.categoryId, before: { name: cat.name },
    });
  },
});

export const list = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    return await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
  },
});
```

- [ ] **Step 4: Implement `convex/rounds.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent, requireEventMember } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

export const add = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), name: v.string(),
    description: v.optional(v.string()), qualifiesToNextRound: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const existing = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const id = await ctx.db.insert("rounds", {
      eventId: eactx.event._id,
      name: args.name.trim(),
      description: args.description,
      order: existing.length,
      qualifiesToNextRound: args.qualifiesToNextRound ?? false,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.added",
      resourceType: "round", resourceId: id, after: { name: args.name },
    });
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"),
    name: v.optional(v.string()), description: v.optional(v.string()),
    qualifiesToNextRound: v.optional(v.boolean()),
    scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.qualifiesToNextRound !== undefined) patch.qualifiesToNextRound = args.qualifiesToNextRound;
    if (args.scoringRules !== undefined) patch.scoringRules = args.scoringRules;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.roundId, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.updated",
      resourceType: "round", resourceId: args.roundId, before: { name: round.name }, after: patch,
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const criteria = await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", args.roundId)).collect();
    for (const c of criteria) await ctx.db.delete(c._id);
    await ctx.db.delete(args.roundId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.removed",
      resourceType: "round", resourceId: args.roundId, before: { name: round.name, criteriaDeleted: criteria.length },
    });
  },
});

export const list = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    return Promise.all(
      rounds.map(async (r) => ({
        ...r,
        criteria: await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", r._id)).collect(),
      })),
    );
  },
});
```

- [ ] **Step 5: GREEN + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/categories.ts convex/rounds.ts convex-test/config.test.ts
git commit -m "feat: categories and rounds with draft gating and cascade delete"
```
Expected: 42/42 tests pass; typecheck exit 0.

---

