# Phase 2 — Competition Config Engine (Design Spec)

**Project:** Tabulation SaaS (`tabulation-ai-powered`)
**Phase:** 2 of 7 (Competition Config Engine)
**Status:** Approved design — pending user review
**Date:** 2026-08-13
**Builds on:** Phase 1 Foundation (on `master` @ `10b11b1`)

---

## 0. Context

This spec is the second of seven decomposed phases. Phase 1 (Foundation) shipped auth,
multi-tenancy, RBAC, entitlements, audit, and the app shell. **Phase 2 builds the
generic, configurable competition-definition layer on top of that foundation** —
everything an administrator needs to fully configure an event and publish it to
judges — but stops short of score entry, tabulation, and results (Phase 3+).

**Phase 2 scope (confirmed):** events, categories, rounds, criteria + weights,
scoring-rule settings, contestants, judges, judge assignments, score-sheet
skeletons (structure only), event templates, config validation / readiness
checklist. **Out of Phase 2:** live score entry / autosave / submit (Phase 3),
simulation mode (later), bulk import (Phase 5), results/reporting (Phase 3-4).

### Decisions captured during brainstorm

| # | Decision | Choice |
|---|---|---|
| 1 | Phase boundary | Config engine only — no live scoring, no simulation. |
| 2 | Judges model | Org members (Phase 1 "Judge" role) + a `judges`/`judgeAssignments` table for assignment metadata. One identity system; reuses the invitation flow. |
| 3 | Criteria variation | Criteria + weights attach to ROUNDS; all categories in an event share the rounds/criteria and differ only in contestants + judge assignments. |
| 4 | Score range | Per-criterion (`minScore`/`maxScore`/`decimalPrecision`) + per-criterion `weight` (% of round); weights validate to 100% per round. |
| 5 | Templates | First-class `eventTemplates` table; instantiation SNAPSHOTS config into the event's own normalized rows. Built-in presets seeded. |
| 6 | Event lifecycle | `draft` → `ready` → `archived` only. Config freezes on leaving `draft`. Scoring/finalized states land in Phase 3. |
| 7 | Config data model | Approach 1: events/categories/rounds/criteria normalized as tables; `eventTemplates` store a serialized `configSnapshot` blob; full config-versioning deferred to Phase 3. |

### Phase 1 interfaces Phase 2 builds on

- **Tenant isolation pattern:** every new table carries `orgId`; helpers `requireOrgMember`/`requirePermission` return a typed `AuthCtx` (`{ user, org, membership, role, permissions, subscription }`).
- **Entitlement hooks:** `requireLimit(ctx, sub, "events"|"judges"|"contestants")` and `requireFeature(ctx, sub, "canCreateEvent")` exist; Phase 2 exercises them. Plans already declare `maxEvents`/`maxJudges`/`maxContestants`/`canCreateEvent`.
- **Audit:** `writeAudit(ctx, { orgId, actorId, action, resourceType, resourceId, before?, after? })`.
- **Typed errors:** `appError(code, message, context?)` with codes; the client error UX reads `.data.code`.
- **convex-test harness:** `setupTest()`, `seedAndProvision(t, identity)`, `.withIdentity(id).mutation/query(fnRef, args)` API.
- **RBAC:** roles "Event Admin"/"Tabulator"/"Judge"/"Staff" exist but currently hold only `organization.view` — Phase 2 extends their permission sets into the event domain.

**Phase 1 migration:** `invitations.eventId` changes `v.union(v.null(), v.string())` → `v.union(v.null(), v.id("events"))`. All existing values are `null`, so the change is safe. The Phase-2 marker comment on `schema.ts:69` is removed.

---

## 1. Data Model

All new tables carry `orgId` (or are reachable through an `eventId` that resolves to an
`orgId`) and follow Phase 1's index-naming convention. Hierarchy: an **event** owns its
**rounds** (each with **criteria**) and its **categories**; categories and rounds are
independent (categories group contestants + scope judges; they share the event's
rounds/criteria per Decision 3).

### Identity & structure

**`events`**
- `orgId: Id<"organizations">`
- `slug: string` (URL key, unique within org, lowercase)
- `name: string`, `description: string`
- `logoUrl?: string`, `bannerUrl?: string`
- `startDate?: number`, `endDate?: number` (ms since epoch)
- `venue?: string`, `timezone?: string`
- `status: union<"draft", "ready", "archived">`
- `decimalPrecision: number` (event-wide default for score display)
- `resultVisibility: union<"private", "organization", "public">`
- `branding: object<{ primaryColor?: string, secondaryColor?: string }>` (event override)
- `templateId?: Id<"eventTemplates">` (source template, nullable)
- `createdById: Id<"userProfiles">`
- Indexes: `by_org_id_and_slug`, `by_org_id_and_status`, `by_org_id`.

**`categories`**
- `eventId: Id<"events">`, `name: string`, `description?: string`, `order: number`
- Index `by_event_id`.

**`rounds`**
- `eventId: Id<"events">`, `name: string`, `description?: string`, `order: number`
- `qualifiesToNextRound: boolean` (elimination flag)
- `scoringRules?: object<{ winner: union<"highest", "lowest"> }>` (round override)
- Index `by_event_id`.

**`criteria`**
- `roundId: Id<"rounds">`, `name: string`, `description?: string`, `order: number`
- `weight: number` (integer % of round total)
- `minScore: number`, `maxScore: number`, `decimalPrecision: number`
- Index `by_round_id`.

### Participants

**`contestants`**
- `eventId: Id<"events">`, `categoryId: Id<"categories">`
- `number: number` (unique within event)
- `name: string`, `photoUrl?: string`, `group?: string` (e.g. age division)
- `status: union<"active", "scratched", "disqualified">`
- `customFields: v.record(v.string(), v.string())` (flexible string→string map for §18 metadata; bounded, optional values omitted)
- Indexes: `by_event_id`, `by_event_id_and_category_id`, `by_event_id_and_number`.

**`judges`** (links a userProfile to a judging role for one event)
- `orgId: Id<"organizations">`, `eventId: Id<"events">`, `userId: Id<"userProfiles">`
- `status: union<"assigned", "declined", "confirmed">`
- Indexes: `by_event_id`, `by_event_id_and_user_id` (unique), `by_user_id`.

**`judgeAssignments`** (scopes a judge to what they may score)
- `judgeId: Id<"judges">`, `eventId: Id<"events">`
- `roundId?: Id<"rounds">` (null = all rounds)
- `categoryId?: Id<"categories">` (null = all categories)
- `criterionId?: Id<"criteria">` (null = all criteria in scope)
- Indexes: `by_judge_id`, `by_event_id`.

**`scoreSheets`** (skeleton; Phase 3 fills scores)
- `eventId`, `roundId`, `judgeId`, `contestantId`
- `status: union<"not_started", "in_progress", "submitted", "locked">`
- Indexes: `by_event_id_and_round_id`, `by_judge_id_and_round_id`, `by_event_id_and_round_id_and_contestant_id`.

### Templates

**`eventTemplates`**
- `orgId?: Id<"organizations">` (null = system / built-in)
- `name: string`, `description: string`
- `configSnapshot: object<{ ... }>` (the serialized rounds/criteria/weights/scoringRules; shape in §5)
- `isSystem: boolean`
- Indexes: `by_org_id`, `by_name`.

### Migration

`invitations.eventId: v.union(v.null(), v.id("events"))` (was `v.string()`). Existing rows are null.

### Key schema decisions

- **Weights are integer percentages**, summed exactly per round (no float drift).
- `customFields` on contestants is `v.record(v.string(), v.string())` — flexible, string→string only (no nested objects), bounded; Phase 5 bulk import populates it.
- `scoreSheets` rows are generated eagerly on `draft → ready` (one per judge × round × contestant). If the product count risks Convex transaction limits, generation batches via `ctx.scheduler.runAfter(0, internal.events.continueGenerateSheets, ...)` (an implementation note, not a separate table).
- No `v.any()` anywhere; `configSnapshot` is a precise `v.object`.

---

## 2. Permissions Extension

New event-domain permissions added to `SYSTEM_PERMISSIONS` (in `convex/lib/constants.ts`)
and wired into `ROLE_PERMISSIONS`:

- `event.create`, `event.view`, `event.update`, `event.delete`, `event.publish`, `event.archive`
- `contestant.manage`, `judge.manage`

**Role wiring (extends Phase 1):**
| Role | Event-domain permissions |
|---|---|
| Org Owner, Org Admin | all `event.*` + `contestant.manage` + `judge.manage` |
| Event Admin | `event.create`/`view`/`update`/`publish`/`archive` + `contestant.manage` + `judge.manage` |
| Staff | `event.view` + `contestant.manage` |
| Tabulator, Judge, Viewer | `event.view` |

The seed mutation (`seedReferenceData`) is extended to be idempotent over these new
permissions + role-permission links. The Phase 1 "Owner assignment" guard (only
`organizations.create` / ownership transfer may grant the Org Owner role) is preserved
unchanged — event-domain role assignment does NOT touch org roles.

---

## 3. Authorization Helpers (`convex/lib/eventAuthz.ts`)

Building on Phase 1's `requireOrgMember`:

- `resolveEventBySlug(ctx, { orgSlug, eventSlug })` → `{ event, org }` (throws `NOT_FOUND`).
- `loadEvent(ctx, eventId)` (private) — resolves the event and verifies `event.orgId === actx.org._id`; prevents cross-event IDOR within the same org.
- `requireEventMember(ctx, { orgSlug, eventSlug })` → **`EventAuthCtx`** = `{ ...AuthCtx, event }` (any active org member can view an event in their org).
- `requireEventPermission(ctx, { orgSlug, eventSlug, permission })` → `EventAuthCtx` (checks an event-domain permission).
- `requireDraftEvent(ctx, { orgSlug, eventSlug })` → `EventAuthCtx` — asserts `event.status === "draft"`; throws `CONFLICT` otherwise. **Every config-editing mutation calls this** (the config-freeze gate).

Usage pattern (mirrors Phase 1):
```ts
const actx = await requireDraftEvent(ctx, { orgSlug, eventSlug });
await requireLimit(ctx, actx.subscription, "contestants");
// ... mutate ...
await writeAudit(ctx, { orgId: actx.org._id, actorId: actx.user._id, action: "contestant.added", ... });
```

---

## 4. Event Lifecycle & Config Validation

**States:** `draft` → `ready` → `archived` (Decision 6).

- **`draft`** — fully editable (config, contestants, judges, assignments). No score sheets exist.
- **`ready`** — config frozen (`requireDraftEvent` blocks edits). Score-sheet skeletons generated. Judges see their assignments.
- **`archived`** — read-only.

**Transitions** (each audited):
- `draft → ready` (`event.publish`): run the readiness checklist; on pass, generate `scoreSheets` (one per judge × round × contestant, status `not_started`); patch event status.
- `ready → draft` (`event.publish`): **delete** generated `scoreSheets`; patch status back to `draft`; re-enables editing.
- `ready → archived` (`event.archive`).
- Un-archive is deferred (rare).

**Readiness checklist (§53)** — exposed as a query returning `{ item: string, passed: boolean, detail: string }[]`; the same logic runs inside `draft → ready` and throws `VALIDATION_ERROR` with `{ failures: [...] }` on any failure:

1. ≥ 1 round exists
2. each round has ≥ 1 criterion
3. criterion weights **sum to exactly 100** within each round
4. each criterion has `minScore < maxScore` and `decimalPrecision ≥ 0`
5. ≥ 1 category exists (a default "Open" category is auto-created on event creation if none)
6. ≥ 1 contestant exists
7. ≥ 1 judge exists with ≥ 1 assignment

---

## 5. Templates

**`eventTemplates.configSnapshot` shape** (a precise `v.object`):
```ts
{
  decimalPrecision: number,
  resultVisibility: union<"private", "organization", "public">,
  scoringRules?: object<{ winner: union<"highest", "lowest"> }>,
  categories?: array<{ name: string, order: number }>,   // optional; default = single "Open"
  rounds: array<{
    name: string, order: number, qualifiesToNextRound: boolean, scoringRules?: object<{ winner: ... }>,
    criteria: array<{ name: string, order: number, weight: number, minScore: number, maxScore: number, decimalPrecision: number }>,
  }>,
}
```
Categories' structure is included; contestants/judges are per-event, not in templates.

**Instantiation** — `events.createFromTemplate({ orgSlug, eventSlug, name, templateId })`:
1. `requirePermission("event.create")` + `requireLimit("events")` + slug-uniqueness check (`CONFLICT`).
2. Deserialize template `configSnapshot` → insert event (`status: draft`) → insert categories (or default "Open") → insert rounds + criteria.
3. `incrementUsage("events", 1)` + `writeAudit`.

**Built-in presets** seeded via an extended `seedReferenceData` (system templates, `orgId: null`, `isSystem: true`):
- **Pageant** — Preliminary round: Beauty 30 / Personality 20 / Talent 20 / Q&A 30.
- **Singing** — Final round: Vocal Quality 40 / Stage Presence 20 / Musicality 20 / Audience Impact 20.
- **Quiz** — Quiz Bee round: Correct Answers 70 / Speed 20 / Bonus 10.

**Save-as-template** — `templates.createFromEvent({ orgSlug, eventSlug, templateName })`: any `event.create` holder snapshots a **draft** event's rounds/criteria/categories into a new `eventTemplates.configSnapshot` blob (`orgId` = current org, `isSystem: false`).

**Versioning** — instantiated events own their normalized config rows; later template edits never affect them (§71 satisfied structurally). Full across-edit config versioning lands in Phase 3 with result finalization.

---

## 6. UI Architecture (Event Control Center, §54)

Routes extend Phase 1's `/app/[orgSlug]/...`:
```
/app/[orgSlug]/events                              events list (draft/ready/archived tabs) + "New event"
/app/[orgSlug]/events/new                          create: pick template or blank
/app/[orgSlug]/events/[eventSlug]                  → redirect to /overview
/app/[orgSlug]/events/[eventSlug]/overview         status, readiness summary, counts
/app/[orgSlug]/events/[eventSlug]/rounds           rounds + criteria editor (weights, ranges)
/app/[orgSlug]/events/[eventSlug]/categories       categories editor
/app/[orgSlug]/events/[eventSlug]/contestants      list + manual add (bulk import = Phase 5)
/app/[orgSlug]/events/[eventSlug]/judges           invite (reuses Phase 1 flow) + assignments
/app/[orgSlug]/events/[eventSlug]/settings         name/dates/venue/visibility/branding
/app/[orgSlug]/events/[eventSlug]/readiness        live checklist
/app/[orgSlug]/events/[eventSlug]/publish          draft→ready review + confirm
/app/[orgSlug]/templates                           org template library (list/create/delete)
```

**Event shell:** extends the org shell with an event-scoped sub-nav (Overview, Rounds,
Categories, Contestants, Judges, Settings, Readiness). The config-edit UI is gated by
`requireDraftEvent` — a "Locked" banner renders when `status !== "draft"` (with a
"Reopen" action for `event.publish` holders). Permission-lacking controls are hidden
(server enforces regardless). Error UX reads `.data.code` (Phase 1 convention).

---

## 7. Testing & Acceptance

**Tests** (convex-test, Phase 1 harness + API patterns):
- **Authz:** every public event mutation — unauthenticated / non-org-member / member-without-permission / cross-org slug IDOR / **cross-event IDOR within the same org** all throw with the correct `.data.code`.
- **Config freeze:** editing a `ready` event → `CONFLICT`; `draft` edits succeed.
- **Weight validation:** publish fails when round weights ≠ 100; succeeds when they do.
- **Readiness:** blocks publish when missing rounds/criteria/contestants/judges; passes when complete.
- **Lifecycle:** `draft→ready` generates `scoreSheets` (count = judges × rounds × contestants); `ready→draft` deletes them.
- **Templates:** instantiate Pageant preset → correct rounds/criteria; save-as-template round-trips; editing a template doesn't change an already-instantiated event.
- **Limits:** the (`maxEvents`+1)th create → `LIMIT_EXCEEDED`.

**Acceptance — Phase 2 is "done" when:**
1. An Event Admin creates an event (blank or Pageant/Singing/Quiz template).
2. Configures rounds+criteria+weights, categories, contestants, judges+assignments.
3. The readiness checklist validates (weights sum, completeness) and blocks publish on failure.
4. Publish (draft→ready) freezes config + generates score-sheet skeletons.
5. Cross-org and cross-event access is refused (verified by test).
6. `maxEvents` limit → upsell, not crash.
7. Save-as-template + re-instantiate round-trips.
8. Reopen (ready→draft) deletes sheets + re-enables editing.
9. `npm run typecheck && npm run lint && npm run build` pass; the convex-test suite is green; the `convex-authz` scan is clean for the new functions.

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| Score-sheet generation volume (judges × rounds × contestants) | Batch via `ctx.scheduler.runAfter(0, internal.events.continueGenerateSheets, { cursor })` if a single transaction risks Convex limits. Validate against Free plan caps first. |
| `invitations.eventId` v.string→v.id migration | Landing the schema change before any invitation references an event; existing data is all-null (safe). |
| Weight-sum float drift | Weights are integer percentages, summed exactly; tolerance only for display rounding. |
| Cross-event IDOR within an org | `loadEvent` verifies `event.orgId === actx.org._id`; tested explicitly. |
| Config-edit surface is large | Every editor mutation funnels through `requireDraftEvent` + `requireEventPermission`; the freeze is one gate, applied uniformly. |

---

## 8. Open items deferred to implementation planning

Noted here so the plan can address them; they do not change the design:
- Concrete `customFields` shape + UI for editing them (Phase 2 minimal: free-form key/value; richer in Phase 5).
- Judge assignment UI granularity (round/category/criterion scoping) — full matrix vs. simplified defaults.
- Bulk score-sheet generation batching threshold (when to switch from inline to scheduled).
- Whether `events` slug uniqueness is enforced app-layer only (Phase 1 org-slug limitation applies identically — Convex has no DB unique constraint; `get` uses `.unique()` fail-safe).
