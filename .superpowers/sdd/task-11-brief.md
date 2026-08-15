## Task 11: Templates

**Files:**
- Create: `convex/templates.ts`
- Modify: `convex/events.ts` (append `createFromTemplate`)
- Create: `convex-test/templates.test.ts`

**Interfaces:**
- Consumes: `requirePermission` (org-level, `"event.create"`) and `requireOrgMember` from `./lib/authz`; `requireDraftEvent` from `./lib/eventAuthz`; `requireLimit`/`incrementUsage`; `writeAudit`; `appError`; `slugify` (already in events.ts).
- Produces: `api.templates.list({ orgSlug })` (system + org templates); `api.events.createFromTemplate({ orgSlug, name, slug?, templateId }) â†’ string`; `api.templates.createFromEvent({ orgSlug, eventSlug, name, description? })` (draft events only); `api.templates.remove({ orgSlug, templateId })` (org-owned only â€” system templates FORBIDDEN; foreign org templates NOT_FOUND).

- [ ] **Step 1: Write failing tests â€” `convex-test/templates.test.ts`**

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
(`seedAndProvision` â€” called inside `createOrgAndEvent` â€” already runs `seedReferenceData`, so system templates exist without an extra seed call. The `changePlan` upgrade to Pro is required BEFORE instantiation because Free allows only 1 event and `createOrgAndEvent` already created one.)

- [ ] **Step 2: RED** â€” `npm test`.

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
Note: `createFromEvent`'s snapshot omits the optional top-level `scoringRules` key entirely (undefined keys are simply not set) â€” the `v.object` validator allows that for `v.optional` fields.

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

