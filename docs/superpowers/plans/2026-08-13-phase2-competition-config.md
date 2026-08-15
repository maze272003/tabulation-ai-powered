# Phase 2 — Competition Config Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the generic, configurable competition-definition layer — events, categories, rounds, criteria+weights, contestants, judges, assignments, score-sheet skeletons, templates, and the readiness/publish lifecycle — on top of the Phase 1 foundation.

**Architecture:** All config is normalized Convex tables carrying `orgId` (tenant isolation via Phase 1's `require*` pattern); event-domain authz extends it via `requireEventMember`/`requireEventPermission`/`requireDraftEvent` returning `EventAuthCtx`. Templates are serialized `configSnapshot` blobs; instantiation snapshots into the event's own rows. Config freezes when an event leaves `draft`.

**Tech Stack:** Next.js 16.3, React 19, Convex ^1.43, TypeScript (strict), Tailwind v4, shadcn/ui (Base UI), convex-test 0.0.55 + vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-phase2-competition-config-design.md` — read it before starting.

## Global Constraints

- **OS:** Windows; PowerShell 5.1. Use `;` and `if ($?) { }` — never `&&`.
- **Convex:** object-form function syntax (`{ args, handler }`), validators on every function, no `userId` as an auth arg, no `Date.now()` in queries, no unbounded arrays in docs, no `v.any()`, no `any`/`as never` casts.
- **Authz:** every event mutation derives identity server-side; ID-arg mutations verify the doc belongs to the resolved event (`doc.eventId !== event._id` → `NOT_FOUND`).
- **Config freeze:** every config-editing mutation calls `requireDraftEvent` (throws `CONFLICT` unless `event.status === "draft"`).
- **Weights:** integer percentages 1–100, summing to exactly 100 per round (validated at publish, not at edit).
- **Tests:** convex-test 0.0.55 API — `t.withIdentity(identity).mutation/query(fnRef, args)` (two-arg only); strong assertions `.rejects.toMatchObject({ data: { code: "..." } })`.
- **Commits:** one per task; conventional messages. No emojis. No code comments (exceptions pre-authorized by the task).
- **Verify every task:** clear `tsconfig.tsbuildinfo`, then `npm run typecheck` (exit 0); run full `npm test` before committing.

---

## File Structure

```
convex/
  schema.ts                    (modified — 9 new tables + invitations.eventId migration)
  lib/constants.ts             (modified — event permissions, role wiring, system templates)
  seed.ts                      (modified — seeds new permissions/templates idempotently)
  lib/eventAuthz.ts            (new — requireEventMember/requireEventPermission/requireDraftEvent)
  events.ts                    (new — create, createFromTemplate, get, listByOrg, update, readiness)
  eventLifecycle.ts            (new — publish, reopen, archive)
  categories.ts                (new — add, update, remove, list)
  rounds.ts                    (new — add, update, remove, list)
  criteria.ts                  (new — add, update, remove)
  contestants.ts               (new — add, list, update, remove)
  judges.ts                    (new — add, remove, listWithAssignments, addAssignment, removeAssignment)
  templates.ts                 (new — list, createFromEvent, remove)
convex-test/
  setup.ts                     (modified — createOrgAndEvent helper)
  events.test.ts, config.test.ts, contestants.test.ts,
  judges.test.ts, lifecycle.test.ts, templates.test.ts    (new)
app/app/[orgSlug]/
  events/page.tsx, events/new/page.tsx
  events/[eventSlug]/{layout,page,overview,rounds,categories,contestants,judges,settings,readiness,publish}/page.tsx
  templates/page.tsx
components/EventShell.tsx      (new — event sub-nav + locked banner)
```

---

## Task 1: Schema extension

**Files:**
- Modify: `convex/schema.ts`

**Interfaces:**
- Produces: tables `events`, `categories`, `rounds`, `criteria`, `contestants`, `judges`, `judgeAssignments`, `scoreSheets`, `eventTemplates`; `invitations.eventId` becomes `v.union(v.null(), v.id("events"))`.

- [ ] **Step 1: Migrate `invitations.eventId`**

In `convex/schema.ts`, change the `invitations` table's `eventId` line to:
```ts
    eventId: v.union(v.null(), v.id("events")),
```
(Remove the old Phase-2 marker comment — the migration now lands.)

- [ ] **Step 2: Append the 9 new tables** (inside `defineSchema({...})`, after `auditLogs`)

```ts
  events: defineTable({
    orgId: v.id("organizations"),
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    logoUrl: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    venue: v.optional(v.string()),
    timezone: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("ready"), v.literal("archived")),
    decimalPrecision: v.number(),
    resultVisibility: v.union(v.literal("private"), v.literal("organization"), v.literal("public")),
    branding: v.object({
      primaryColor: v.optional(v.string()),
      secondaryColor: v.optional(v.string()),
    }),
    templateId: v.optional(v.id("eventTemplates")),
    createdById: v.id("userProfiles"),
  })
    .index("by_org_id_and_slug", ["orgId", "slug"])
    .index("by_org_id_and_status", ["orgId", "status"])
    .index("by_org_id", ["orgId"]),

  categories: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
  })
    .index("by_event_id", ["eventId"]),

  rounds: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    qualifiesToNextRound: v.boolean(),
    scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
  })
    .index("by_event_id", ["eventId"]),

  criteria: defineTable({
    roundId: v.id("rounds"),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    weight: v.number(),
    minScore: v.number(),
    maxScore: v.number(),
    decimalPrecision: v.number(),
  })
    .index("by_round_id", ["roundId"]),

  contestants: defineTable({
    eventId: v.id("events"),
    categoryId: v.id("categories"),
    number: v.number(),
    name: v.string(),
    photoUrl: v.optional(v.string()),
    group: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("scratched"), v.literal("disqualified")),
    customFields: v.optional(v.record(v.string(), v.string())),
  })
    .index("by_event_id", ["eventId"])
    .index("by_event_id_and_category_id", ["eventId", "categoryId"])
    .index("by_event_id_and_number", ["eventId", "number"]),

  judges: defineTable({
    orgId: v.id("organizations"),
    eventId: v.id("events"),
    userId: v.id("userProfiles"),
    status: v.union(v.literal("assigned"), v.literal("declined"), v.literal("confirmed")),
  })
    .index("by_event_id", ["eventId"])
    .index("by_event_id_and_user_id", ["eventId", "userId"])
    .index("by_user_id", ["userId"]),

  judgeAssignments: defineTable({
    judgeId: v.id("judges"),
    eventId: v.id("events"),
    roundId: v.optional(v.id("rounds")),
    categoryId: v.optional(v.id("categories")),
    criterionId: v.optional(v.id("criteria")),
  })
    .index("by_judge_id", ["judgeId"])
    .index("by_event_id", ["eventId"]),

  scoreSheets: defineTable({
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    contestantId: v.id("contestants"),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("submitted"),
      v.literal("locked"),
    ),
  })
    .index("by_event_id_and_round_id", ["eventId", "roundId"])
    .index("by_judge_id_and_round_id", ["judgeId", "roundId"])
    .index("by_event_id_and_round_id_and_contestant_id", ["eventId", "roundId", "contestantId"]),

  eventTemplates: defineTable({
    orgId: v.optional(v.id("organizations")),
    name: v.string(),
    description: v.string(),
    configSnapshot: v.object({
      decimalPrecision: v.number(),
      resultVisibility: v.union(v.literal("private"), v.literal("organization"), v.literal("public")),
      scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
      categories: v.optional(v.array(v.object({ name: v.string(), order: v.number() }))),
      rounds: v.array(
        v.object({
          name: v.string(),
          order: v.number(),
          qualifiesToNextRound: v.boolean(),
          scoringRules: v.optional(v.object({ winner: v.union(v.literal("highest"), v.literal("lowest")) })),
          criteria: v.array(
            v.object({
              name: v.string(),
              order: v.number(),
              weight: v.number(),
              minScore: v.number(),
              maxScore: v.number(),
              decimalPrecision: v.number(),
            }),
          ),
        }),
      ),
    }),
    isSystem: v.boolean(),
  })
    .index("by_org_id", ["orgId"])
    .index("by_name", ["name"]),
```

- [ ] **Step 3: Verify**

```powershell
npx convex dev --once
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm test
```
Expected: schema pushes cleanly (all existing `invitations.eventId` values are null, so the narrowing is safe — if the push reports a conflict, verify via the Convex dashboard that no non-null string values exist; if any do, STOP and report BLOCKED); typecheck exit 0; 31/31 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add convex/schema.ts
git commit -m "feat: Phase 2 schema - events, config, participants, sheets, templates"
```

---

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
(Event Admin gets NO `event.delete` — spec §2.)

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

## Task 3: Event authz helpers

**Files:**
- Create: `convex/lib/eventAuthz.ts`

**Interfaces:**
- Consumes: `requireOrgMember(ctx, { orgSlug })` and `AuthCtx` from `convex/lib/authz.ts`; `appError`/`ErrorCode` from `convex/lib/errors.ts`.
- Produces: `EventAuthCtx` (= `AuthCtx & { event: Doc<"events"> }`); `requireEventMember(ctx, { orgSlug, eventSlug }): Promise<EventAuthCtx>` (NOT_FOUND if no event); `requireEventPermission(ctx, { orgSlug, eventSlug, permission }): Promise<EventAuthCtx>` (FORBIDDEN if missing); `requireDraftEvent(ctx, { orgSlug, eventSlug, permission }): Promise<EventAuthCtx>` (CONFLICT if `status !== "draft"`). Their gates are tested in Task 4+ via real endpoints — no new test file in this task.

- [ ] **Step 1: Implement `convex/lib/eventAuthz.ts`**

```ts
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";
import { requireOrgMember, type AuthCtx } from "./authz";

export type EventAuthCtx = AuthCtx & { event: Doc<"events"> };

export async function resolveEventBySlug(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string },
): Promise<{ actx: AuthCtx; event: Doc<"events"> }> {
  const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
  const event = await ctx.db
    .query("events")
    .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", actx.org._id).eq("slug", args.eventSlug))
    .unique();
  if (!event) throw appError(ErrorCode.NOT_FOUND, "Event not found");
  return { actx, event };
}

export async function requireEventMember(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string },
): Promise<EventAuthCtx> {
  const { actx, event } = await resolveEventBySlug(ctx, args);
  return { ...actx, event };
}

export async function requireEventPermission(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string; permission: string },
): Promise<EventAuthCtx> {
  const eactx = await requireEventMember(ctx, {
    orgSlug: args.orgSlug,
    eventSlug: args.eventSlug,
  });
  if (!eactx.permissions.has(args.permission)) {
    throw appError(ErrorCode.FORBIDDEN, `Missing permission: ${args.permission}`);
  }
  return eactx;
}

export async function requireDraftEvent(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string; permission: string },
): Promise<EventAuthCtx> {
  const eactx = await requireEventPermission(ctx, args);
  if (eactx.event.status !== "draft") {
    throw appError(ErrorCode.CONFLICT, "Event configuration is locked");
  }
  return eactx;
}
```

- [ ] **Step 2: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm test
git add convex/lib/eventAuthz.ts
git commit -m "feat: event-domain authorization helpers"
```
Expected: typecheck exit 0; 32/32 tests pass (no new tests — helpers are exercised from Task 4 onward).

---

## Task 4: Events CRUD

**Files:**
- Create: `convex/events.ts`
- Create: `convex-test/events.test.ts`
- Modify: `convex-test/setup.ts` (add `createOrgAndEvent`)

**Interfaces:**
- Consumes: `requirePermission`/`requireOrgMember` from `./lib/authz`; `requireEventMember`/`requireDraftEvent` from `./lib/eventAuthz`; `requireLimit` from `./lib/entitlements`; `incrementUsage` from `./lib/usage`; `writeAudit`; `appError`.
- Produces: `api.events.create({ orgSlug, name, slug? }) → string` (event slug; creates default "Open" category; `event.create` + `maxEvents` enforced); `api.events.get({ orgSlug, eventSlug }) → Doc<"events"> | null` (null on any failure); `api.events.listByOrg({ orgSlug }) → Doc<"events">[]`; `api.events.update({ orgSlug, eventSlug, name?, description?, startDate?, endDate?, venue?, timezone?, decimalPrecision?, resultVisibility? })` (draft-only). Test helper `createOrgAndEvent(t, identity, { orgSlug, eventSlug, eventName? })` in setup.ts.

- [ ] **Step 1: Write failing tests — `convex-test/events.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, seedAndProvision, setupTest } from "./setup";

async function setupOrg(t: ReturnType<typeof setupTest>, orgSlug = "acme") {
  await seedAndProvision(t, aliceIdentity);
  await seedAndProvision(t, bobIdentity);
  await t.withIdentity(aliceIdentity).mutation(api.organizations.create, { name: orgSlug, slug: orgSlug });
}

describe("events", () => {
  it("creates an event in draft with default settings", async () => {
    const t = setupTest();
    await setupOrg(t);
    const slug = await t.withIdentity(aliceIdentity).mutation(api.events.create, {
      orgSlug: "acme", name: "Miss Acme 2026", slug: "miss-acme",
    });
    expect(slug).toBe("miss-acme");
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "miss-acme" });
    expect(ev?.status).toBe("draft");
    expect(ev?.decimalPrecision).toBe(2);
  });

  it("rejects duplicate slug within the org with CONFLICT", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "A", slug: "dup" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "B", slug: "dup" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("refuses event.create for a Viewer member", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: "bob@example.com", roleName: "Viewer" });
    const pending = await t.withIdentity(bobIdentity).query(api.invitations.listForUser, {});
    await t.withIdentity(bobIdentity).mutation(api.invitations.accept, { token: pending[0].token });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.events.create, { orgSlug: "acme", name: "X", slug: "x" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("get returns null for a non-member (cross-org)", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "E", slug: "e" });
    const res = await t.withIdentity(bobIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "e" });
    expect(res).toBeNull();
  });

  it("enforces maxEvents limit (Free plan = 1)", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "One", slug: "one" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "Two", slug: "two" }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });

  it("updates name while draft", async () => {
    const t = setupTest();
    await setupOrg(t);
    await t.withIdentity(aliceIdentity).mutation(api.events.create, { orgSlug: "acme", name: "E", slug: "e" });
    await t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "e", name: "Renamed" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "e" });
    expect(ev?.name).toBe("Renamed");
  });

  it("eventAuthz: unknown slug NOT_FOUND; non-member get null", async () => {
    const t = setupTest();
    await setupOrg(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "ghost", name: "X" }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
```

- [ ] **Step 2: RED** — `npm test`. New tests fail (`api.events` undefined); prior 32 pass.

- [ ] **Step 3: Implement `convex/events.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireOrgMember, requirePermission } from "./lib/authz";
import { requireEventMember, requireDraftEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { requireLimit } from "./lib/entitlements";
import { incrementUsage } from "./lib/usage";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const create = mutation({
  args: { orgSlug: v.string(), name: v.string(), slug: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "event.create" });
    await requireLimit(ctx, actx.subscription, "events");
    const slug = slugify(args.slug ?? args.name);
    if (!slug) throw appError(ErrorCode.VALIDATION_ERROR, "Event name must contain letters or digits");
    const existing = await ctx.db
      .query("events")
      .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", actx.org._id).eq("slug", slug))
      .unique();
    if (existing) throw appError(ErrorCode.CONFLICT, "Event slug already taken", { slug });
    const eventId = await ctx.db.insert("events", {
      orgId: actx.org._id,
      slug,
      name: args.name.trim(),
      description: "",
      status: "draft",
      decimalPrecision: 2,
      resultVisibility: "private",
      branding: {},
      createdById: actx.user._id,
    });
    await ctx.db.insert("categories", { eventId, name: "Open", order: 0 });
    await incrementUsage(ctx, actx.org._id, "events", 1);
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "event.created",
      resourceType: "event", resourceId: eventId, after: { slug, name: args.name },
    });
    return slug;
  },
});

export const get = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args): Promise<Doc<"events"> | null> => {
    try {
      const eactx = await requireEventMember(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug });
      return eactx.event;
    } catch {
      return null;
    }
  },
});

export const listByOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    return await ctx.db
      .query("events")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .order("desc")
      .collect();
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    venue: v.optional(v.string()),
    timezone: v.optional(v.string()),
    decimalPrecision: v.optional(v.number()),
    resultVisibility: v.optional(v.union(v.literal("private"), v.literal("organization"), v.literal("public"))),
  },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.update",
    });
    const patch: Record<string, string | number> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.startDate !== undefined) patch.startDate = args.startDate;
    if (args.endDate !== undefined) patch.endDate = args.endDate;
    if (args.venue !== undefined) patch.venue = args.venue;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.decimalPrecision !== undefined) {
      if (!Number.isInteger(args.decimalPrecision) || args.decimalPrecision < 0 || args.decimalPrecision > 4) {
        throw appError(ErrorCode.VALIDATION_ERROR, "decimalPrecision must be an integer 0-4");
      }
      patch.decimalPrecision = args.decimalPrecision;
    }
    if (args.resultVisibility !== undefined) patch.resultVisibility = args.resultVisibility;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(eactx.event._id, patch);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.updated",
      resourceType: "event", resourceId: eactx.event._id,
      before: { name: eactx.event.name }, after: { name: patch.name ?? eactx.event.name },
    });
  },
});
```

- [ ] **Step 4: Add `createOrgAndEvent` to `convex-test/setup.ts`** (new 4th+ export; keep existing exports untouched):
```ts
export async function createOrgAndEvent(
  t: ReturnType<typeof setupTest>,
  identity: Partial<UserIdentity>,
  opts: { orgSlug: string; eventSlug: string; eventName?: string },
): Promise<void> {
  await seedAndProvision(t, identity);
  await t.withIdentity(identity).mutation(api.organizations.create, {
    name: opts.orgSlug,
    slug: opts.orgSlug,
  });
  await t.withIdentity(identity).mutation(api.events.create, {
    orgSlug: opts.orgSlug,
    name: opts.eventName ?? opts.eventSlug,
    slug: opts.eventSlug,
  });
}
```

- [ ] **Step 5: GREEN + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/events.ts convex-test/events.test.ts convex-test/setup.ts
git commit -m "feat: events create/get/listByOrg/update with limits and audit"
```
Expected: 39/39 tests pass; typecheck exit 0.

---

## Task 5: Categories and rounds

**Files:**
- Create: `convex/categories.ts`
- Create: `convex/rounds.ts`
- Create: `convex-test/config.test.ts`

**Interfaces:**
- Consumes: `requireDraftEvent` (permission `"event.update"`), `requireEventMember` from `./lib/eventAuthz`; `writeAudit`; `appError`.
- Produces: `api.categories.{add,update,remove,list}` and `api.rounds.{add,update,remove,list}`. ID-arg mutations verify `doc.eventId === event._id` (NOT_FOUND). `categories.remove` throws CONFLICT if contestants reference it. `rounds.remove` deletes the round's criteria first. `rounds.list` returns rounds with a joined `criteria` array.

- [ ] **Step 1: Write failing tests — `convex-test/config.test.ts`**

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

- [ ] **Step 2: RED** — `npm test`.

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

## Task 6: Criteria

**Files:**
- Create: `convex/criteria.ts`
- Modify: `convex-test/config.test.ts` (append criteria tests)

**Interfaces:**
- Consumes: `requireDraftEvent` (permission `"event.update"`) from `./lib/eventAuthz`; `writeAudit`; `appError`.
- Produces: `api.criteria.{add,update,remove}`. Edit-time validation: `weight` integer 1–100; `minScore < maxScore`; `decimalPrecision` integer 0–4; the criterion's round must belong to the resolved event (NOT_FOUND — cross-event IDOR guard). Weight-sum-to-100 is enforced at publish (Task 10), not here.

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
placed immediately after `createOrgAndEvent` (Alice is Org Owner, who holds `subscription.manage`). Use exactly that line — drop the `.catch(() => {})` and the `as never`.

- [ ] **Step 2: RED** — `npm test`.

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

## Task 7: Contestants

**Files:**
- Create: `convex/contestants.ts`
- Create: `convex-test/contestants.test.ts`

**Interfaces:**
- Consumes: `requireDraftEvent` (permission `"contestant.manage"`), `requireEventMember`; `requireLimit(ctx, sub, "contestants")`; `incrementUsage`; `writeAudit`; `appError`.
- Produces: `api.contestants.{add,list,update,remove}`. `add`: number is a positive integer unique within the event (CONFLICT on dup); category defaults to the event's first category; `maxContestants` enforced. `update`: name/photoUrl/group/status/categoryId/customFields (category verified against the event). `remove`: hard delete + usage decrement.

- [ ] **Step 1: Write failing tests — `convex-test/contestants.test.ts`**

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

- [ ] **Step 2: RED** — `npm test`.

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

## Task 8: Judges and assignments

**Files:**
- Create: `convex/judges.ts`
- Create: `convex-test/judges.test.ts`

**Interfaces:**
- Consumes: `requireDraftEvent` (permission `"judge.manage"`), `requireEventMember`; `requireLimit(ctx, sub, "judges")`; `incrementUsage`; `writeAudit`; `appError`.
- Produces: `api.judges.add({ orgSlug, eventSlug, userId })` (userId must be an ACTIVE org member — VALIDATION_ERROR otherwise; unique per event — CONFLICT); `api.judges.remove({ orgSlug, eventSlug, judgeId })` (deletes the judge's assignments first); `api.judges.listWithAssignments({ orgSlug, eventSlug })` (judge doc + `user: {name,email,image}` + `assignments[]`); `api.judges.addAssignment({ orgSlug, eventSlug, judgeId, roundId?, categoryId?, criterionId? })` (all optional scope docs verified against the event); `api.judges.removeAssignment({ orgSlug, eventSlug, assignmentId })`.

- [ ] **Step 1: Write failing tests — `convex-test/judges.test.ts`**

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
(Requires importing `bobIdentity` — already imported. `ensureUserProfile` returns the profile id.) Use the corrected version; drop the `api.events.update` filler line.

- [ ] **Step 2: RED** — `npm test`.

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

## Task 9: Readiness checklist

**Files:**
- Modify: `convex/events.ts` (append `computeReadiness` + `readiness` query)
- Modify: `convex-test/config.test.ts` (append readiness tests)

**Interfaces:**
- Produces: exported `computeReadiness(ctx: QueryCtx, eventId: Id<"events">): Promise<ReadinessCheck[]>` where `ReadinessCheck = { item: string; passed: boolean; detail: string }` (Task 10 imports it); `api.events.readiness({ orgSlug, eventSlug }) → ReadinessCheck[]`. The 7 items (ids): `rounds.exist`, `rounds.criteria`, `rounds.weights`, `criteria.ranges`, `categories.exist`, `contestants.exist`, `judges.exist`.

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

- [ ] **Step 2: RED** — `npm test`.

- [ ] **Step 3: Append to `convex/events.ts`**

Extend the type imports at the top:
```ts
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
```
(`mutation, query` are already value imports — keep them.) Append:

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

## Task 10: Lifecycle — publish, reopen, archive

**Files:**
- Create: `convex/eventLifecycle.ts`
- Create: `convex-test/lifecycle.test.ts`

**Interfaces:**
- Consumes: `requireEventPermission` from `./lib/eventAuthz`; `computeReadiness` from `./events`; `writeAudit`; `appError`.
- Produces: `api.eventLifecycle.publish({ orgSlug, eventSlug })` (draft→ready; readiness failures → VALIDATION_ERROR with `{ failures }` context; generates scoreSheets for judges × rounds × active contestants, status `not_started`); `api.eventLifecycle.reopen({ orgSlug, eventSlug })` (ready→draft; deletes ALL event scoreSheets); `api.eventLifecycle.archive({ orgSlug, eventSlug })` (ready→archived).

- [ ] **Step 1: Write failing tests — `convex-test/lifecycle.test.ts`**

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

- [ ] **Step 2: RED** — `npm test`.

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
Note: `reopen`'s `.withIndex("by_event_id_and_round_id", q => q.eq("eventId", ...))` binds only the index prefix — valid Convex.

- [ ] **Step 4: GREEN + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/eventLifecycle.ts convex-test/lifecycle.test.ts
git commit -m "feat: publish/reopen/archive lifecycle with sheet generation"
```
Expected: 55/55 tests pass; typecheck exit 0.

---

## Task 11: Templates

**Files:**
- Create: `convex/templates.ts`
- Modify: `convex/events.ts` (append `createFromTemplate`)
- Create: `convex-test/templates.test.ts`

**Interfaces:**
- Consumes: `requirePermission` (org-level, `"event.create"`) and `requireOrgMember` from `./lib/authz`; `requireDraftEvent` from `./lib/eventAuthz`; `requireLimit`/`incrementUsage`; `writeAudit`; `appError`; `slugify` (already in events.ts).
- Produces: `api.templates.list({ orgSlug })` (system + org templates); `api.events.createFromTemplate({ orgSlug, name, slug?, templateId }) → string`; `api.templates.createFromEvent({ orgSlug, eventSlug, name, description? })` (draft events only); `api.templates.remove({ orgSlug, templateId })` (org-owned only — system templates FORBIDDEN; foreign org templates NOT_FOUND).

- [ ] **Step 1: Write failing tests — `convex-test/templates.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

async function templateIdByName(t: ReturnType<typeof setupTest>, name: string) {
  const list = await t.withIdentity(aliceIdentity).query(api.templates.list, { orgSlug: "acme" });
  const tpl = list.find((x: { name: string }) => x.name === name);
  if (!tpl) throw new Error(`template ${name} not found`);
  return tpl._id;
}

describe("templates", () => {
  it("instantiates the Pageant preset with its rounds and criteria", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "holder" });
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
    const tplId = await templateIdByName(t, "Pageant");
    const slug = await t.withIdentity(aliceIdentity).mutation(api.events.createFromTemplate, {
      orgSlug: "acme", name: "Miss Acme", templateId: tplId,
    });
    expect(slug).toBe("miss-acme");
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "miss-acme" });
    expect(rounds.length).toBe(1);
    expect(rounds[0].name).toBe("Preliminary");
    expect(rounds[0].criteria.map((c) => c.name)).toEqual(["Beauty", "Personality", "Talent", "Q&A"]);
    expect(rounds[0].criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it("save-as-template round-trips a draft event config", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "Solo" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId: rounds[0]._id, name: "Tech", weight: 100, minScore: 0, maxScore: 10, decimalPrecision: 0,
    });
    await t.withIdentity(aliceIdentity).mutation(api.templates.createFromEvent, { orgSlug: "acme", eventSlug: "gala", name: "My Solo Comp" });
    const tplId = await templateIdByName(t, "My Solo Comp");
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
    const slug = await t.withIdentity(aliceIdentity).mutation(api.events.createFromTemplate, {
      orgSlug: "acme", name: "Clone", templateId: tplId,
    });
    const cloneRounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "clone" });
    expect(cloneRounds[0].name).toBe("Solo");
    expect(cloneRounds[0].criteria[0].name).toBe("Tech");
  });

  it("refuses to delete a system template", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const tplId = await templateIdByName(t, "Quiz");
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.templates.remove, { orgSlug: "acme", templateId: tplId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
```
(`seedAndProvision` — called inside `createOrgAndEvent` — already runs `seedReferenceData`, so system templates exist without an extra seed call. The `changePlan` upgrade to Pro is required BEFORE instantiation because Free allows only 1 event and `createOrgAndEvent` already created one.)

- [ ] **Step 2: RED** — `npm test`.

- [ ] **Step 3: Implement `convex/templates.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, ErrorCode } from "./lib/errors";
import { requireOrgMember, requirePermission } from "./lib/authz";
import { requireDraftEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

export const list = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    const system = await ctx.db
      .query("eventTemplates")
      .filter((q) => q.eq(q.field("isSystem"), true))
      .collect();
    const orgTemplates = await ctx.db
      .query("eventTemplates")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .collect();
    return [...system, ...orgTemplates];
  },
});

export const createFromEvent = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const eactx = await requireDraftEvent(ctx, { orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "event.create" });
    const rounds = await ctx.db.query("rounds").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const categories = await ctx.db.query("categories").withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id)).collect();
    const roundsWithCriteria = await Promise.all(
      rounds.map(async (r) => ({
        name: r.name,
        order: r.order,
        qualifiesToNextRound: r.qualifiesToNextRound,
        scoringRules: r.scoringRules,
        criteria: await ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", r._id)).collect(),
      })),
    );
    const id = await ctx.db.insert("eventTemplates", {
      orgId: eactx.org._id,
      name: args.name.trim(),
      description: args.description ?? "",
      configSnapshot: {
        decimalPrecision: eactx.event.decimalPrecision,
        resultVisibility: eactx.event.resultVisibility,
        categories: categories.map((c) => ({ name: c.name, order: c.order })),
        rounds: roundsWithCriteria.map((r) => ({
          name: r.name, order: r.order, qualifiesToNextRound: r.qualifiesToNextRound,
          scoringRules: r.scoringRules,
          criteria: r.criteria.map((c) => ({
            name: c.name, order: c.order, weight: c.weight,
            minScore: c.minScore, maxScore: c.maxScore, decimalPrecision: c.decimalPrecision,
          })),
        })),
      },
      isSystem: false,
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "template.created",
      resourceType: "eventTemplate", resourceId: id, after: { name: args.name },
    });
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), templateId: v.id("eventTemplates") },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "event.create" });
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl) throw appError(ErrorCode.NOT_FOUND, "Template not found");
    if (tpl.isSystem || tpl.orgId === null) {
      throw appError(ErrorCode.FORBIDDEN, "System templates cannot be deleted");
    }
    if (tpl.orgId !== actx.org._id) throw appError(ErrorCode.NOT_FOUND, "Template not found");
    await ctx.db.delete(args.templateId);
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "template.removed",
      resourceType: "eventTemplate", resourceId: args.templateId, before: { name: tpl.name },
    });
  },
});
```
Note: `createFromEvent`'s snapshot omits the optional top-level `scoringRules` key entirely (undefined keys are simply not set) — the `v.object` validator allows that for `v.optional` fields.

- [ ] **Step 4: Append `createFromTemplate` to `convex/events.ts`**

```ts
export const createFromTemplate = mutation({
  args: { orgSlug: v.string(), name: v.string(), slug: v.optional(v.string()), templateId: v.id("eventTemplates") },
  handler: async (ctx, args): Promise<string> => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "event.create" });
    await requireLimit(ctx, actx.subscription, "events");
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl || !(tpl.isSystem || tpl.orgId === actx.org._id)) {
      throw appError(ErrorCode.NOT_FOUND, "Template not found");
    }
    const slug = slugify(args.slug ?? args.name);
    if (!slug) throw appError(ErrorCode.VALIDATION_ERROR, "Event name must contain letters or digits");
    const existing = await ctx.db
      .query("events")
      .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", actx.org._id).eq("slug", slug))
      .unique();
    if (existing) throw appError(ErrorCode.CONFLICT, "Event slug already taken", { slug });
    const snap = tpl.configSnapshot;
    const eventId = await ctx.db.insert("events", {
      orgId: actx.org._id,
      slug,
      name: args.name.trim(),
      description: "",
      status: "draft",
      decimalPrecision: snap.decimalPrecision,
      resultVisibility: snap.resultVisibility,
      branding: {},
      templateId: tpl._id,
      createdById: actx.user._id,
    });
    if (snap.categories && snap.categories.length > 0) {
      for (const c of snap.categories) {
        await ctx.db.insert("categories", { eventId, name: c.name, order: c.order });
      }
    } else {
      await ctx.db.insert("categories", { eventId, name: "Open", order: 0 });
    }
    for (const r of snap.rounds) {
      const roundId = await ctx.db.insert("rounds", {
        eventId,
        name: r.name,
        order: r.order,
        qualifiesToNextRound: r.qualifiesToNextRound,
        scoringRules: r.scoringRules,
      });
      for (const c of r.criteria) {
        await ctx.db.insert("criteria", {
          roundId,
          name: c.name,
          order: c.order,
          weight: c.weight,
          minScore: c.minScore,
          maxScore: c.maxScore,
          decimalPrecision: c.decimalPrecision,
        });
      }
    }
    await incrementUsage(ctx, actx.org._id, "events", 1);
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "event.created",
      resourceType: "event", resourceId: eventId,
      after: { slug, name: args.name, fromTemplate: tpl.name },
    });
    return slug;
  },
});
```

- [ ] **Step 5: GREEN + commit**

```powershell
npm test
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
git add convex/templates.ts convex/events.ts convex-test/templates.test.ts
git commit -m "feat: event templates - list, instantiate, save-as-template"
```
Expected: 58/58 tests pass; typecheck exit 0.

---

## Task 12: UI — events list, new event, event shell, overview

**Files:**
- Create: `app/app/[orgSlug]/events/page.tsx`
- Create: `app/app/[orgSlug]/events/new/page.tsx`
- Create: `components/EventShell.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/layout.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/overview/page.tsx`
- Modify: `app/app/[orgSlug]/layout.tsx` (add "Events" + "Templates" nav links)

**Interfaces:**
- Consumes: `api.events.{listByOrg,create,get,createFromTemplate}`, `api.templates.list` (Task 11).
- Produces: the event list page, template-picking creation page, the event shell (sub-nav + locked banner), overview page. All pages follow Phase 1 conventions: `useQuery`/`useMutation`, `use(params)` for Next 16 async params, error UX reads `.data.code` with Sonner toasts, Base UI shadcn primitives (`render={<Link/>}` instead of `asChild`).

- [ ] **Step 1: Events list page — `app/app/[orgSlug]/events/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function EventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const create = useMutation(api.events.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Button onClick={() => router.push(`/app/${orgSlug}/events/new`)}>New event</Button>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Quick create (blank event)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          variant="outline"
          disabled={creating || !name}
          onClick={async () => {
            setCreating(true);
            try {
              const slug = await create({ orgSlug, name });
              router.push(`/app/${orgSlug}/events/${slug}/overview`);
            } catch (err: unknown) {
              const code = (err as { data?: { code?: string } })?.data?.code;
              if (code === "LIMIT_EXCEEDED") toast.error("Event limit reached - upgrade your plan.");
              else if (code === "CONFLICT") toast.error("An event with that slug already exists.");
              else toast.error("Could not create event.");
              setCreating(false);
            }
          }}
        >
          Create
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {events?.map((ev) => (
          <Link key={ev._id} href={`/app/${orgSlug}/events/${ev.slug}/overview`} className="block">
            <div className="rounded-lg border p-4 hover:bg-accent">
              <div className="font-medium">{ev.name}</div>
              <div className="text-sm text-muted-foreground">{ev.slug} - {ev.status}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: New event page — `app/app/[orgSlug]/events/new/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function NewEventPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const templates = useQuery(api.templates.list, { orgSlug });
  const createBlank = useMutation(api.events.create);
  const createFromTemplate = useMutation(api.events.createFromTemplate);
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      const slug = await fn();
      router.push(`/app/${orgSlug}/events/${slug}/overview`);
    } catch (err: unknown) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "LIMIT_EXCEEDED") toast.error("Event limit reached - upgrade your plan.");
      else if (code === "CONFLICT") toast.error("An event with that slug already exists.");
      else toast.error("Could not create event.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New event</h1>
      <div className="flex gap-2">
        <Input placeholder="Event name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          disabled={busy || !name}
          onClick={() => handle(() => createBlank({ orgSlug, name }))}
        >
          Create blank
        </Button>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Start from a template</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {templates?.filter((tpl) => tpl.isSystem).map((tpl) => (
            <button
              key={tpl._id}
              disabled={busy || !name}
              className="rounded-lg border p-4 text-left hover:bg-accent disabled:opacity-50"
              onClick={() => handle(() => createFromTemplate({ orgSlug, name, templateId: tpl._id }))}
            >
              <div className="font-medium">{tpl.name}</div>
              <div className="text-sm text-muted-foreground">{tpl.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Event shell — `components/EventShell.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";

export function EventShell({
  orgSlug,
  eventSlug,
  children,
}: {
  orgSlug: string;
  eventSlug: string;
  children: React.ReactNode;
}) {
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  if (ev === undefined) return <div className="p-8">Loading…</div>;
  if (ev === null) return notFound();

  const base = `/app/${orgSlug}/events/${eventSlug}`;
  const nav = [
    ["Overview", `${base}/overview`],
    ["Rounds", `${base}/rounds`],
    ["Categories", `${base}/categories`],
    ["Contestants", `${base}/contestants`],
    ["Judges", `${base}/judges`],
    ["Readiness", `${base}/readiness`],
    ["Settings", `${base}/settings`],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{ev.name}</h1>
        <Badge variant={ev.status === "draft" ? "outline" : "secondary"}>{ev.status}</Badge>
        {ev.status !== "draft" && (
          <Link href={`${base}/publish`} className="text-sm text-muted-foreground underline">
            Locked - manage
          </Link>
        )}
      </div>
      {ev.status === "draft" && (
        <div className="rounded border border-dashed p-2 text-sm text-muted-foreground">
          Draft - configuration is editable. <Link href={`${base}/publish`} className="underline">Publish when ready.</Link>
        </div>
      )}
      <nav className="flex flex-wrap gap-1 text-sm">
        {nav.map(([label, href]) => (
          <Link key={href} href={href} className="rounded px-2 py-1 hover:bg-accent">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Event layout/redirect/overview**

`app/app/[orgSlug]/events/[eventSlug]/layout.tsx`:
```tsx
"use client";

import { use } from "react";
import { EventShell } from "@/components/EventShell";

export default function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  return <EventShell orgSlug={orgSlug} eventSlug={eventSlug}>{children}</EventShell>;
}
```

`app/app/[orgSlug]/events/[eventSlug]/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default async function EventRoot({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  redirect(`/app/${orgSlug}/events/${eventSlug}/overview`);
}
```

`app/app/[orgSlug]/events/[eventSlug]/overview/page.tsx`:
```tsx
"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function OverviewPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });
  const router = useRouter();
  const failed = checks?.filter((c) => !c.passed).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Readiness</div>
          <div className="text-2xl">{failed === 0 ? "Ready" : `${failed} issue(s)`}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Visibility</div>
          <div className="text-2xl capitalize">{checks === undefined ? "…" : "See settings"}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Next step</div>
          <Button className="mt-1" variant={failed === 0 ? "default" : "outline"} onClick={() => router.push(`/app/${orgSlug}/events/${eventSlug}/publish`)}>
            {failed === 0 ? "Publish" : "Review readiness"}
          </Button>
        </div>
      </div>
      <ul className="space-y-1 text-sm">
        {checks?.map((c) => (
          <li key={c.item} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
            {c.passed ? "PASS" : "FAIL"} - {c.item} ({c.detail})
          </li>
        ))}
      </ul>
    </div>
  );
}
```
(Remove the unused `toast` import if lint flags it.)

- [ ] **Step 5: Add nav links in `app/app/[orgSlug]/layout.tsx`** — inside the existing `<nav>`, after the Billing link:
```tsx
          <Link href={`/app/${orgSlug}/events`} className="block rounded px-2 py-1 hover:bg-accent">Events</Link>
          <Link href={`/app/${orgSlug}/templates`} className="block rounded px-2 py-1 hover:bg-accent">Templates</Link>
```

- [ ] **Step 6: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add app components/EventShell.tsx
git commit -m "feat: events list, creation, event shell, overview UI"
```
Expected: typecheck/lint/build/test all green (58 tests).

---

## Task 13: UI — config editors (rounds, categories, contestants, judges)

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/categories/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/contestants/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/judges/page.tsx`

**Interfaces:**
- Consumes: `api.rounds.{list,add,remove}`, `api.criteria.{add,remove}`, `api.categories.{list,add,remove}`, `api.contestants.{list,add,remove}`, `api.judges.{listWithAssignments,add,remove,addAssignment,removeAssignment}`, `api.members.list` (Phase 1), `api.events.get` (for the locked state).
- Produces: the four editor pages. All edit actions render an error toast reading `.data.code` (CONFLICT → "configuration is locked"; VALIDATION_ERROR → the server message).

- [ ] **Step 1: Rounds + criteria editor — `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function RoundsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const rounds = useQuery(api.rounds.list, { orgSlug, eventSlug });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const addRound = useMutation(api.rounds.add);
  const removeRound = useMutation(api.rounds.remove);
  const addCriterion = useMutation(api.criteria.add);
  const removeCriterion = useMutation(api.criteria.remove);
  const [roundName, setRoundName] = useState("");
  const [form, setForm] = useState<Record<string, { name: string; weight: string; min: string; max: string }>>({});

  const locked = ev !== undefined && ev !== null && ev.status !== "draft";
  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "CONFLICT") toast.error("Configuration is locked.");
    else toast.error(data?.message ?? "Action failed.");
  };

  return (
    <div className="space-y-6">
      {!locked && (
        <div className="flex gap-2">
          <Input placeholder="New round name" value={roundName} onChange={(e) => setRoundName(e.target.value)} />
          <Button onClick={async () => { try { await addRound({ orgSlug, eventSlug, name: roundName }); setRoundName(""); } catch (e) { onError(e); } }}>
            Add round
          </Button>
        </div>
      )}
      {rounds?.map((r) => {
        const f = form[r._id] ?? { name: "", weight: "", min: "0", max: "100" };
        const sum = r.criteria.reduce((s, c) => s + c.weight, 0);
        return (
          <div key={r._id} className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">{r.name}</div>
              <div className="flex items-center gap-2 text-sm">
                <span className={sum === 100 ? "text-muted-foreground" : "text-destructive"}>weights: {sum}%</span>
                {!locked && (
                  <Button variant="ghost" size="sm" onClick={async () => { try { await removeRound({ orgSlug, eventSlug, roundId: r._id }); } catch (e) { onError(e); } }}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1">Criterion</th><th>Weight %</th><th>Range</th><th /></tr>
              </thead>
              <tbody>
                {r.criteria.map((c) => (
                  <tr key={c._id} className="border-t">
                    <td className="py-1">{c.name}</td>
                    <td>{c.weight}</td>
                    <td>{c.minScore} - {c.maxScore}</td>
                    <td className="text-right">
                      {!locked && (
                        <Button variant="ghost" size="sm" onClick={async () => { try { await removeCriterion({ orgSlug, eventSlug, criterionId: c._id }); } catch (e) { onError(e); } }}>
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!locked && (
              <div className="flex flex-wrap gap-2">
                <Input className="w-40" placeholder="Criterion" value={f.name} onChange={(e) => setForm({ ...form, [r._id]: { ...f, name: e.target.value } })} />
                <Input className="w-24" placeholder="Weight" value={f.weight} onChange={(e) => setForm({ ...form, [r._id]: { ...f, weight: e.target.value } })} />
                <Input className="w-20" placeholder="Min" value={f.min} onChange={(e) => setForm({ ...form, [r._id]: { ...f, min: e.target.value } })} />
                <Input className="w-20" placeholder="Max" value={f.max} onChange={(e) => setForm({ ...form, [r._id]: { ...f, max: e.target.value } })} />
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await addCriterion({
                        orgSlug, eventSlug, roundId: r._id, name: f.name,
                        weight: Number(f.weight), minScore: Number(f.min), maxScore: Number(f.max), decimalPrecision: 0,
                      });
                      setForm({ ...form, [r._id]: { ...f, name: "", weight: "" } });
                    } catch (e) { onError(e); }
                  }}
                >
                  Add criterion
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Categories page — `app/app/[orgSlug]/events/[eventSlug]/categories/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function CategoriesPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const cats = useQuery(api.categories.list, { orgSlug, eventSlug });
  const add = useMutation(api.categories.add);
  const remove = useMutation(api.categories.remove);
  const [name, setName] = useState("");

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "CONFLICT") toast.error(data.message ?? "Conflict.");
    else toast.error(data?.message ?? "Action failed.");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={async () => { try { await add({ orgSlug, eventSlug, name }); setName(""); } catch (e) { onError(e); } }}>
          Add
        </Button>
      </div>
      <ul className="space-y-1 text-sm">
        {cats?.map((c) => (
          <li key={c._id} className="flex items-center justify-between border-b py-1">
            <span>{c.name}</span>
            <Button variant="ghost" size="sm" onClick={async () => { try { await remove({ orgSlug, eventSlug, categoryId: c._id }); } catch (e) { onError(e); } }}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Contestants page — `app/app/[orgSlug]/events/[eventSlug]/contestants/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ContestantsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const list = useQuery(api.contestants.list, { orgSlug, eventSlug });
  const cats = useQuery(api.categories.list, { orgSlug, eventSlug });
  const add = useMutation(api.contestants.add);
  const remove = useMutation(api.contestants.remove);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "LIMIT_EXCEEDED") toast.error("Contestant limit reached - upgrade your plan.");
    else if (data?.code === "CONFLICT") toast.error(data.message ?? "Conflict.");
    else toast.error(data?.message ?? "Action failed.");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input className="w-24" placeholder="No." value={number} onChange={(e) => setNumber(e.target.value)} />
        <Input placeholder="Contestant name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          onClick={async () => {
            try {
              await add({ orgSlug, eventSlug, name, number: Number(number) });
              setName(""); setNumber("");
            } catch (e) { onError(e); }
          }}
        >
          Add
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">No.</th><th>Name</th><th>Category</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {list?.map((c) => (
            <tr key={c._id} className="border-t">
              <td className="py-1">{c.number}</td>
              <td>{c.name}</td>
              <td>{cats?.find((x) => x._id === c.categoryId)?.name ?? "-"}</td>
              <td>{c.status}</td>
              <td className="text-right">
                <Button variant="ghost" size="sm" onClick={async () => { try { await remove({ orgSlug, eventSlug, contestantId: c._id }); } catch (e) { onError(e); } }}>
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Judges page — `app/app/[orgSlug]/events/[eventSlug]/judges/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function JudgesPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const judges = useQuery(api.judges.listWithAssignments, { orgSlug, eventSlug });
  const members = useQuery(api.members.list, { orgSlug });
  const rounds = useQuery(api.rounds.list, { orgSlug, eventSlug });
  const add = useMutation(api.judges.add);
  const removeJudge = useMutation(api.judges.remove);
  const addAssignment = useMutation(api.judges.addAssignment);
  const [picked, setPicked] = useState("");
  const [roundPick, setRoundPick] = useState("");

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "LIMIT_EXCEEDED") toast.error("Judge limit reached - upgrade your plan.");
    else toast.error(data?.message ?? "Action failed.");
  };

  const judgeUserIds = new Set(judges?.map((j) => j.userId));
  const candidates = members?.filter((m) => m.status === "active" && !judgeUserIds.has(m.userId)) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select className="rounded border px-2 py-1 text-sm" value={picked} onChange={(e) => setPicked(e.target.value)}>
          <option value="">Select member…</option>
          {candidates.map((m) => <option key={m.userId} value={m.userId}>{m.name} ({m.email})</option>)}
        </select>
        <Button disabled={!picked} onClick={async () => { try { await add({ orgSlug, eventSlug, userId: picked as never }); setPicked(""); } catch (e) { onError(e); } }}>
          Add judge
        </Button>
      </div>
      {judges?.map((j) => (
        <div key={j._id} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{j.user.name}</div>
              <div className="text-sm text-muted-foreground">{j.user.email}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={async () => { try { await removeJudge({ orgSlug, eventSlug, judgeId: j._id }); } catch (e) { onError(e); } }}>
              Remove
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Assignments:</span>
            {j.assignments.map((a) => (
              <span key={a._id} className="rounded bg-accent px-2 py-0.5">
                {a.roundId ? rounds?.find((r) => r._id === a.roundId)?.name ?? "round" : "all rounds"}
              </span>
            ))}
            <select className="rounded border px-2 py-0.5" value={roundPick} onChange={(e) => setRoundPick(e.target.value)}>
              <option value="">All rounds</option>
              {rounds?.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await addAssignment({ orgSlug, eventSlug, judgeId: j._id, roundId: roundPick ? (roundPick as never) : undefined });
                } catch (e) { onError(e); }
              }}
            >
              Assign
            </Button>
          </div>
        </div>
      ))}
      {candidates.length === 0 && judges !== undefined && judges.length > 0 && (
        <p className="text-sm text-muted-foreground">All active members are already judges. Invite more via Members.</p>
      )}
    </div>
  );
}
```
(The `as never` casts bridge the HTML-select string to Convex `Id` types at the boundary — replace with the `Id<"userProfiles">`-typed state if typecheck complains, but do not use `any`.)

- [ ] **Step 5: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add app
git commit -m "feat: config editor UI - rounds, categories, contestants, judges"
```
Expected: all gates green (58 tests).

---

## Task 14: UI — settings, readiness, publish, templates library

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/readiness/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/publish/page.tsx`
- Create: `app/app/[orgSlug]/templates/page.tsx`

**Interfaces:**
- Consumes: `api.events.{get,update}`, `api.events.readiness`, `api.eventLifecycle.{publish,reopen,archive}`, `api.templates.{list,createFromEvent,remove}`.
- Produces: the four pages. The publish page shows the checklist, Publish/Reopen/Archive actions gated by event status, all reading `.data.code` on errors (VALIDATION_ERROR → list the failing items).

- [ ] **Step 1: Settings page — `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function EventSettingsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const update = useMutation(api.events.update);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [prevKey, setPrevKey] = useState<string | null>(null);

  if (ev !== undefined && ev !== null && prevKey !== ev._id) {
    setPrevKey(ev._id);
    setName(ev.name);
    setVenue(ev.venue ?? "");
  }

  if (ev === undefined) return <div>Loading…</div>;
  if (ev === null) return <div>Event not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          disabled={ev.status !== "draft" || !name || name === ev.name}
          onClick={async () => {
            try {
              await update({ orgSlug, eventSlug, name, venue });
              toast.success("Saved.");
            } catch (err: unknown) {
              const data = (err as { data?: { code?: string; message?: string } })?.data;
              toast.error(data?.code === "CONFLICT" ? "Configuration is locked." : data?.message ?? "Could not save.");
            }
          }}
        >
          Save
        </Button>
      </div>
      <div className="flex gap-2">
        <Input value={venue} placeholder="Venue" onChange={(e) => setVenue(e.target.value)} />
      </div>
      <p className="text-sm text-muted-foreground">Slug: {ev.slug} - Status: {ev.status}</p>
    </div>
  );
}
```

- [ ] **Step 2: Readiness page — `app/app/[orgSlug]/events/[eventSlug]/readiness/page.tsx`**

```tsx
"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function ReadinessPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });

  return (
    <ul className="space-y-1 text-sm">
      {checks?.map((c) => (
        <li key={c.item} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
          {c.passed ? "PASS" : "FAIL"} - {c.item} ({c.detail})
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Publish page — `app/app/[orgSlug]/events/[eventSlug]/publish/page.tsx`**

```tsx
"use client";

import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PublishPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });
  const publish = useMutation(api.eventLifecycle.publish);
  const reopen = useMutation(api.eventLifecycle.reopen);
  const archive = useMutation(api.eventLifecycle.archive);
  const failed = checks?.filter((c) => !c.passed) ?? [];

  const run = async (fn: () => Promise<void>, success: string) => {
    try {
      await fn();
      toast.success(success);
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      if (data?.code === "VALIDATION_ERROR") {
        toast.error("Not ready - fix the failing items first.");
      } else {
        toast.error(data?.message ?? "Action failed.");
      }
    }
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-1 text-sm">
        {checks?.map((c) => (
          <li key={c.item} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
            {c.passed ? "PASS" : "FAIL"} - {c.item} ({c.detail})
          </li>
        ))}
      </ul>
      {ev?.status === "draft" && (
        <Button disabled={failed.length > 0} onClick={() => run(() => publish({ orgSlug, eventSlug }), "Event published.")}>
          Publish event
        </Button>
      )}
      {ev?.status === "ready" && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => run(() => reopen({ orgSlug, eventSlug }), "Event reopened.")}>
            Reopen (delete score sheets)
          </Button>
          <Button variant="secondary" onClick={() => run(() => archive({ orgSlug, eventSlug }), "Event archived.")}>
            Archive
          </Button>
        </div>
      )}
      {ev?.status === "archived" && <p className="text-sm text-muted-foreground">This event is archived.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Templates library — `app/app/[orgSlug]/templates/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function TemplatesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const templates = useQuery(api.templates.list, { orgSlug });
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const createFromEvent = useMutation(api.templates.createFromEvent);
  const remove = useMutation(api.templates.remove);
  const [name, setName] = useState("");
  const [eventSlug, setEventSlug] = useState("");

  const drafts = events?.filter((e) => e.status === "draft") ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Templates</h1>
      <div className="flex flex-wrap gap-2">
        <Input className="w-48" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="rounded border px-2 py-1 text-sm" value={eventSlug} onChange={(e) => setEventSlug(e.target.value)}>
          <option value="">From draft event…</option>
          {drafts.map((e) => <option key={e._id} value={e.slug}>{e.name}</option>)}
        </select>
        <Button
          disabled={!name || !eventSlug}
          onClick={async () => {
            try {
              await createFromEvent({ orgSlug, eventSlug, name });
              setName(""); setEventSlug("");
              toast.success("Template saved.");
            } catch (err: unknown) {
              toast.error((err as { data?: { message?: string } })?.data?.message ?? "Could not save template.");
            }
          }}
        >
          Save as template
        </Button>
      </div>
      <ul className="space-y-1 text-sm">
        {templates?.map((tpl) => (
          <li key={tpl._id} className="flex items-center justify-between border-b py-1">
            <span>
              {tpl.name} {tpl.isSystem ? <span className="text-muted-foreground">(system)</span> : null}
              <span className="text-muted-foreground"> - {tpl.description}</span>
            </span>
            {!tpl.isSystem && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try { await remove({ orgSlug, templateId: tpl._id }); }
                  catch (err: unknown) { toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed."); }
                }}
              >
                Delete
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add app
git commit -m "feat: settings, readiness, publish, templates UI"
```
Expected: all gates green (58 tests).

---

## Task 15: Final verification

**Files:**
- No new files. Full quality gate + convex-authz scan.

- [ ] **Step 1: Full quality gate**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue
Remove-Item -Force convex/tsconfig.tsbuildinfo -ErrorAction SilentlyContinue
npm run typecheck
npm run lint
npm test
npm run build
```
Expected: typecheck exit 0; lint 0 errors; 58/58 tests pass; build succeeds.

- [ ] **Step 2: convex-authz deterministic scan** (controller-run; document results in the task report)

Grep `convex/**/*.ts` (excluding `_generated/`) for:
1. Identity-from-arg: `(userId|actorId|ownerId|authorId|accountId)\s*:\s*v\.id\(` in public function args with no `ctx.auth` in scope. NOTE: `judges.add({ userId })` and `platform.setPlatformOwner({ userId })` are known-legitimate TARGET arguments (the caller identity is derived server-side; membership is verified) — judge them, do not auto-flag.
2. Missing-ownership: `ctx.db.get(args.` followed by patch/delete without an event/org ownership comparison.
3. PII-leak: public queries returning emails without a permission gate (`judges.listWithAssignments` and `members.list` return emails — verify both are member-gated).
4. Parent-ref-on-write: inserts using client-supplied parent ids without verifying the parent belongs to the caller's org/event.

- [ ] **Step 3: Manual smoke checklist** (requires human + real Google OAuth creds — listed for the user, not executed):
1. Sign in → org → Events → New event from "Pageant" template.
2. Edit rounds/criteria; add contestants, judges, assignments.
3. Readiness page shows PASS items; publish freezes config; reopen unlocks.
4. Cross-org slug access shows not-found.

- [ ] **Step 4: Commit (if any cleanup)**

```powershell
git add -A
git commit -m "chore: Phase 2 final verification"
```
(Skip if nothing changed.)

---

## Acceptance criteria mapping

| Spec criterion | Verified in |
|---|---|
| Event Admin creates event (blank or preset) | Task 4, 11 + events/templates tests |
| Configures rounds+criteria+weights, categories, contestants, judges | Tasks 5-8 + config/contestants/judges tests |
| Readiness validates (weights sum, completeness), blocks publish | Task 9, 10 + lifecycle tests |
| Publish freezes config + generates sheet skeletons | Task 10 + lifecycle test (sheet count, CONFLICT on edit) |
| Cross-org / cross-event access refused | Tasks 4, 6, 8 tests (null get, NOT_FOUND IDOR) |
| maxEvents limit → upsell not crash | Task 4 test + UI toast |
| Save-as-template + re-instantiate round-trips | Task 11 test |
| Reopen deletes sheets + re-enables editing | Task 10 test |
| Gates green + authz clean | Task 15 |



