## Task 9: Readiness checklist

**Files:**
- Modify: `convex/events.ts` (append `computeReadiness` + `readiness` query)
- Modify: `convex-test/config.test.ts` (append readiness tests)

**Interfaces:**
- Produces: exported `computeReadiness(ctx: QueryCtx, eventId: Id<"events">): Promise<ReadinessCheck[]>` where `ReadinessCheck = { item: string; passed: boolean; detail: string }` (Task 10 imports it); `api.events.readiness({ orgSlug, eventSlug }) â†’ ReadinessCheck[]`. The 7 items (ids): `rounds.exist`, `rounds.criteria`, `rounds.weights`, `criteria.ranges`, `categories.exist`, `contestants.exist`, `judges.exist`.

- [ ] **Step 1: Append failing tests to `convex-test/config.test.ts`**

```ts
describe("readiness", () => {
  it("fails an empty event with specific items", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const checks = await t.withIdentity(aliceIdentity).query(api.events.readiness, { orgSlug: "acme", eventSlug: "gala" });
    const failed = checks.filter((c) => !c.passed).map((c) => c.item);
    expect(failed).toContain("rounds.exist");
    expect(failed).toContain("contestants.exist");
    expect(failed).toContain("judges.exist");
    expect(failed).not.toContain("categories.exist");
  });

  it("flags weights that do not sum to 100", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId: rounds[0]._id, name: "A", weight: 40, minScore: 0, maxScore: 10, decimalPrecision: 0,
    });
    const checks = await t.withIdentity(aliceIdentity).query(api.events.readiness, { orgSlug: "acme", eventSlug: "gala" });
    const weights = checks.find((c) => c.item === "rounds.weights");
    expect(weights?.passed).toBe(false);
  });
});
```

- [ ] **Step 2: RED** â€” `npm test`.

- [ ] **Step 3: Append to `convex/events.ts`**

Extend the type imports at the top:
```ts
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
```
(`mutation, query` are already value imports â€” keep them.) Append:

```ts
export type ReadinessCheck = { item: string; passed: boolean; detail: string };

export async function computeReadiness(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<ReadinessCheck[]> {
  const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();
  const categories = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();
  const contestants = await ctx.db.query("contestants").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();
  const judges = await ctx.db.query("judges").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();
  const assignments = await ctx.db.query("judgeAssignments").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect();

  const criteriaPerRound = await Promise.all(
    rounds.map((r) => ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", r._id)).collect()),
  );

  const emptyRounds = rounds.filter((_, i) => criteriaPerRound[i].length === 0);
  const badSums = rounds.filter((_, i) => {
    const total = criteriaPerRound[i].reduce((sum, c) => sum + c.weight, 0);
    return total !== 100;
  });
  const badRanges = criteriaPerRound.flat().filter((c) => !(c.minScore < c.maxScore));
  const activeContestants = contestants.filter((c) => c.status === "active");
  const judgesWithAssignments = judges.filter((j) => assignments.some((a) => a.judgeId === j._id));

  return [
    { item: "rounds.exist", passed: rounds.length >= 1, detail: `${rounds.length} round(s)` },
    { item: "rounds.criteria", passed: emptyRounds.length === 0, detail: emptyRounds.length === 0 ? "all rounds have criteria" : `${emptyRounds.length} round(s) without criteria` },
    { item: "rounds.weights", passed: badSums.length === 0, detail: badSums.length === 0 ? "all weights sum to 100" : `${badSums.length} round(s) with weights not summing to 100` },
    { item: "criteria.ranges", passed: badRanges.length === 0, detail: badRanges.length === 0 ? "all ranges valid" : `${badRanges.length} criterion/criteria with invalid ranges` },
    { item: "categories.exist", passed: categories.length >= 1, detail: `${categories.length} categor(y/ies)` },
    { item: "contestants.exist", passed: activeContestants.length >= 1, detail: `${activeContestants.length} active contestant(s)` },
    { item: "judges.exist", passed: judgesWithAssignments.length >= 1, detail: `${judgesWithAssignments.length} judge(s) with assignments` },
  ];
}

export const readiness = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args): Promise<ReadinessCheck[]> => {
    const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
    return computeReadiness(ctx, eactx.event._id);
  },
});
```

- [ ] **Step 4: GREEN + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/events.ts convex-test/config.test.ts
git commit -m "feat: readiness checklist query"
```
Expected: 52/52 tests pass; typecheck exit 0.

---

