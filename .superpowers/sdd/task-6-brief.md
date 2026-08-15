## Task 6: Criteria

**Files:**
- Create: `convex/criteria.ts`
- Modify: `convex-test/config.test.ts` (append criteria tests)

**Interfaces:**
- Consumes: `requireDraftEvent` (permission `"event.update"`) from `./lib/eventAuthz`; `writeAudit`; `appError`.
- Produces: `api.criteria.{add,update,remove}`. Edit-time validation: `weight` integer 1â€“100; `minScore < maxScore`; `decimalPrecision` integer 0â€“4; the criterion's round must belong to the resolved event (NOT_FOUND â€” cross-event IDOR guard). Weight-sum-to-100 is enforced at publish (Task 10), not here.

- [ ] **Step 1: Append failing tests to `convex-test/config.test.ts`**

```ts
describe("criteria", () => {
  it("adds criteria and validates ranges and weight bounds", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    const roundId = rounds[0]._id;
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId, name: "Beauty", weight: 50, minScore: 0, maxScore: 100, decimalPrecision: 0,
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
        orgSlug: "acme", eventSlug: "gala", roundId, name: "Bad", weight: 50, minScore: 100, maxScore: 0, decimalPrecision: 0,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
        orgSlug: "acme", eventSlug: "gala", roundId, name: "BadWeight", weight: 0, minScore: 0, maxScore: 10, decimalPrecision: 0,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("refuses criteria for a round belonging to a different event (IDOR)", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "one" });
    await t.withIdentity(aliceIdentity).mutation(api.organizations.changePlanGuard ?? api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" } as never).catch(() => {});
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "Two", slug: "two" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "one", name: "R1" });
    const roundsOne = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "one" });
    const r1 = roundsOne.find((r) => r.name === "R1")!;
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
        orgSlug: "acme", eventSlug: "two", roundId: r1._id, name: "X", weight: 50, minScore: 0, maxScore: 10, decimalPrecision: 0,
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
```
NOTE: the second test needs a second event, but Free plan `maxEvents = 1`. Replace the odd `changePlanGuard` line with the real Phase 1 endpoint:
```ts
await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
```
placed immediately after `createOrgAndEvent` (Alice is Org Owner, who holds `subscription.manage`). Use exactly that line â€” drop the `.catch(() => {})` and the `as never`.

- [ ] **Step 2: RED** â€” `npm test`.

- [ ] **Step 3: Implement `convex/criteria.ts`**

```ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireDraftEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

function validateCriterion(weight: number, minScore: number, maxScore: number, decimalPrecision: number) {
  if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
    throw appError(ErrorCode.VALIDATION_ERROR, "weight must be an integer between 1 and 100");
  }
  if (!(minScore < maxScore)) {
    throw appError(ErrorCode.VALIDATION_ERROR, "minScore must be less than maxScore");
  }
  if (!Number.isInteger(decimalPrecision) || decimalPrecision < 0 || decimalPrecision > 4) {
    throw appError(ErrorCode.VALIDATION_ERROR, "decimalPrecision must be an integer 0-4");
  }
}

async function requireRoundOfEvent(ctx: QueryCtx, roundId: Id<"rounds">, eventId: Id<"events">): Promise<Doc<"rounds">> {
  const round = await ctx.db.get(roundId);
  if (!round || round.eventId !== eventId) throw appError(ErrorCode.NOT_FOUND, "Round not found");
  return round;
}

export const add = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), name: v.string(),
    description: v.optional(v.string()), weight: v.number(), minScore: v.number(),
    maxScore: v.number(), decimalPrecision: v.number(),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    await requireRoundOfEvent(ctx, args.roundId, eactx.event._id);
    validateCriterion(args.weight, args.minScore, args.maxScore, args.decimalPrecision);
    const existing = await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", args.roundId)).collect();
    const id = await ctx.db.insert("criteria", {
      roundId: args.roundId,
      name: args.name.trim(),
      description: args.description,
      order: existing.length,
      weight: args.weight,
      minScore: args.minScore,
      maxScore: args.maxScore,
      decimalPrecision: args.decimalPrecision,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "criterion.added",
      resourceType: "criterion", resourceId: id, after: { name: args.name, weight: args.weight },
    });
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), criterionId: v.id("criteria"), name: v.optional(v.string()),
    description: v.optional(v.string()), weight: v.optional(v.number()), minScore: v.optional(v.number()),
    maxScore: v.optional(v.number()), decimalPrecision: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const criterion = await ctx.db.get(args.criterionId);
    if (!criterion) throw appError(ErrorCode.NOT_FOUND, "Criterion not found");
    await requireRoundOfEvent(ctx, criterion.roundId, eactx.event._id);
    const next = {
      weight: args.weight ?? criterion.weight,
      minScore: args.minScore ?? criterion.minScore,
      maxScore: args.maxScore ?? criterion.maxScore,
      decimalPrecision: args.decimalPrecision ?? criterion.decimalPrecision,
    };
    validateCriterion(next.weight, next.minScore, next.maxScore, next.decimalPrecision);
    const patch: Record<string, string | number> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.weight !== undefined) patch.weight = args.weight;
    if (args.minScore !== undefined) patch.minScore = args.minScore;
    if (args.maxScore !== undefined) patch.maxScore = args.maxScore;
    if (args.decimalPrecision !== undefined) patch.decimalPrecision = args.decimalPrecision;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.criterionId, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "criterion.updated",
      resourceType: "criterion", resourceId: args.criterionId,
      before: { weight: criterion.weight }, after: { weight: next.weight },
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), criterionId: v.id("criteria") },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update" });
    const criterion = await ctx.db.get(args.criterionId);
    if (!criterion) throw appError(ErrorCode.NOT_FOUND, "Criterion not found");
    await requireRoundOfEvent(ctx, criterion.roundId, eactx.event._id);
    await ctx.db.delete(args.criterionId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "criterion.removed",
      resourceType: "criterion", resourceId: args.criterionId, before: { name: criterion.name },
    });
  },
});
```

- [ ] **Step 4: GREEN + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/criteria.ts convex-test/config.test.ts
git commit -m "feat: criteria with range validation and cross-event IDOR guard"
```
Expected: 44/44 tests pass; typecheck exit 0.

---

