## Task 4: Events CRUD

**Files:**
- Create: `convex/events.ts`
- Create: `convex-test/events.test.ts`
- Modify: `convex-test/setup.ts` (add `createOrgAndEvent`)

**Interfaces:**
- Consumes: `requirePermission`/`requireOrgMember` from `./lib/authz`; `requireEventMember`/`requireDraftEvent` from `./lib/eventAuthz`; `requireLimit` from `./lib/entitlements`; `incrementUsage` from `./lib/usage`; `writeAudit`; `appError`.
- Produces: `api.events.create({ orgSlug, name, slug? }) â†’ string` (event slug; creates default "Open" category; `event.create` + `maxEvents` enforced); `api.events.get({ orgSlug, eventSlug }) â†’ Doc<"events"> | null` (null on any failure); `api.events.listByOrg({ orgSlug }) â†’ Doc<"events">[]`; `api.events.update({ orgSlug, eventSlug, name?, description?, startDate?, endDate?, venue?, timezone?, decimalPrecision?, resultVisibility? })` (draft-only). Test helper `createOrgAndEvent(t, identity, { orgSlug, eventSlug, eventName? })` in setup.ts.

- [ ] **Step 1: Write failing tests â€” `convex-test/events.test.ts`**

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

- [ ] **Step 2: RED** â€” `npm test`. New tests fail (`api.events` undefined); prior 32 pass.

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

