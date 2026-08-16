## Task 2: Permissions, role wiring, system templates

**Files:**
- Modify: `convex/lib/constants.ts`
- Modify: `convex/seed.ts`
- Modify: `convex-test/seed.test.ts` (append 1 test)

**Interfaces:**
- Produces: `SYSTEM_PERMISSIONS` gains 8 event-domain permissions; `ROLE_PERMISSIONS` rewired; `SYSTEM_TEMPLATES` exported; `seedReferenceData` seeds templates idempotently.

- [ ] **Step 1: Extend `convex/lib/constants.ts`**

Append to `SYSTEM_PERMISSIONS` (before `] as const`):
```ts
  { name: "event.create", category: "event", description: "Create events" },
  { name: "event.view", category: "event", description: "View events" },
  { name: "event.update", category: "event", description: "Update event configuration" },
  { name: "event.delete", category: "event", description: "Delete events" },
  { name: "event.publish", category: "event", description: "Publish and reopen events" },
  { name: "event.archive", category: "event", description: "Archive events" },
  { name: "contestant.manage", category: "contestant", description: "Manage contestants" },
  { name: "judge.manage", category: "judge", description: "Manage judges and assignments" },
```

Replace `ROLE_PERMISSIONS` entirely:
```ts
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Org Owner": ["organization.view", "organization.update", "organization.members.manage", "organization.delete", "audit.view", "subscription.view", "subscription.manage", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage"],
  "Org Admin": ["organization.view", "organization.update", "organization.members.manage", "audit.view", "subscription.view", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage"],
  "Event Admin": ["organization.view", "subscription.view", "event.create", "event.view", "event.update", "event.publish", "event.archive", "contestant.manage", "judge.manage"],
  "Tabulator": ["organization.view", "event.view"],
  "Judge": ["organization.view", "event.view"],
  "Staff": ["organization.view", "event.view", "contestant.manage"],
  "Viewer": ["organization.view", "event.view"],
};
```
(Event Admin gets NO `event.delete` â€” spec Â§2.)

Append after `SYSTEM_PLANS`:
```ts
export const SYSTEM_TEMPLATES = [
  {
    name: "Pageant",
    description: "Classic beauty pageant with a weighted preliminary round",
    configSnapshot: {
      decimalPrecision: 2,
      resultVisibility: "private",
      rounds: [
        {
          name: "Preliminary",
          order: 0,
          qualifiesToNextRound: false,
          criteria: [
            { name: "Beauty", order: 0, weight: 30, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Personality", order: 1, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Talent", order: 2, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Q&A", order: 3, weight: 30, minScore: 0, maxScore: 100, decimalPrecision: 0 },
          ],
        },
      ],
    },
  },
  {
    name: "Singing",
    description: "Singing competition with a weighted final round",
    configSnapshot: {
      decimalPrecision: 2,
      resultVisibility: "private",
      rounds: [
        {
          name: "Final",
          order: 0,
          qualifiesToNextRound: false,
          criteria: [
            { name: "Vocal Quality", order: 0, weight: 40, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Stage Presence", order: 1, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Musicality", order: 2, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Audience Impact", order: 3, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 0 },
          ],
        },
      ],
    },
  },
  {
    name: "Quiz",
    description: "Quiz bee with correctness-weighted scoring",
    configSnapshot: {
      decimalPrecision: 0,
      resultVisibility: "private",
      rounds: [
        {
          name: "Quiz Bee",
          order: 0,
          qualifiesToNextRound: false,
          criteria: [
            { name: "Correct Answers", order: 0, weight: 70, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Speed", order: 1, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Bonus", order: 2, weight: 10, minScore: 0, maxScore: 100, decimalPrecision: 0 },
          ],
        },
      ],
    },
  },
] as const;
```

- [ ] **Step 2: Extend `convex/seed.ts`**

Update the import:
```ts
import { ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS, SYSTEM_ROLES, SYSTEM_TEMPLATES } from "./lib/constants";
```
Append this loop at the end of `seedReferenceData`'s handler (after the plans loop):
```ts
    for (const tpl of SYSTEM_TEMPLATES) {
      const existing = await ctx.db
        .query("eventTemplates")
        .filter((q) => q.eq(q.field("name"), tpl.name) && q.eq(q.field("isSystem"), true))
        .first();
      if (!existing) {
        await ctx.db.insert("eventTemplates", {
          orgId: null,
          name: tpl.name,
          description: tpl.description,
          configSnapshot: tpl.configSnapshot,
          isSystem: true,
        });
      }
    }
```

- [ ] **Step 3: Append the seed test to `convex-test/seed.test.ts`** (inside the existing `describe`):
```ts
    it("seeds system templates idempotently", async () => {
      const t = setupTest();
      await t.mutation(api.seed.seedReferenceData, {});
      await t.mutation(api.seed.seedReferenceData, {});
      const count = await t.run(async (q) => {
        const all = await q.db.query("eventTemplates").collect();
        return all.filter((x) => x.isSystem).length;
      });
      expect(count).toBe(3);
    });
```

- [ ] **Step 4: Verify + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/lib/constants.ts convex/seed.ts convex-test/seed.test.ts
git commit -m "feat: event-domain permissions, role wiring, system templates"
```
Expected: 32/32 tests pass; typecheck exit 0.

---

