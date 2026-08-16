# Phase 3 — Tabulation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic tabulation engine — judge score entry, pure scoring core (drop-hi/lo aggregation, weighting, ranking, tie cascade, advancement), round lifecycle with blackout-before-publish, immutable versioned results, event finalization — plus the judge/tabulator/results UI and the deferred Phase 2 admin UI.

**Architecture:** Pure deterministic scoring core in `convex/lib/tabulation.ts` (plain data in → standings out, no Convex I/O, unit-testable). Mutations load config + scores, run the core, and persist immutable `resultVersions` snapshots at round publish/correction. No standings query exists for unpublished rounds (structural blackout). Scores are write-once; corrections create superseding versions. Phase 2 UI (existing plan tasks 12–15) is executed first as Task 1.

**Tech Stack:** Next.js 16.3, React 19, Convex ^1.43, TypeScript (strict), Tailwind v4, shadcn/ui (Base UI), convex-test 0.0.55 + vitest (`environment: "edge-runtime"`).

**Spec:** `docs/superpowers/specs/2026-08-16-phase3-tabulation-engine-design.md` — read it before starting.

> **Status (2026-08-16): COMPLETE.** Tasks 1–11 executed (commits `90f0e2d`..`cc3a0a5`); Tasks 12–14 superseded by `2026-08-16-phase3-ui-ux-modules.md` (do not execute); Task 15 verified via the whole-branch review (`.superpowers/sdd/reports/final-review.md`) — Important findings I-1..I-3 fixed in `4e99062`; deferred Minors M-1..M-7 fixed in `dabf3d6`, `f03c167`, `6a832ca`, `5eda360`. Final gate: typecheck/lint/build green, 144/144 tests. Individual checkboxes were left unchecked during execution; this status block is the authoritative record.

## Global Constraints

- **OS:** Windows; PowerShell 5.1. Use `;` and `if ($?) { }` — never `&&`.
- **Convex:** object-form function syntax (`{ args, handler }`), validators on every function, no `userId` as an auth arg, no `Date.now()` in queries, no unbounded arrays in docs, no `v.any()`, no `any`/`as never` casts (`as Id<...>` type assertions are allowed). Read `convex/_generated/ai/guidelines.md` before Convex work.
- **Authz:** every mutation derives identity server-side; ID-arg mutations verify the doc belongs to the resolved event (`NOT_FOUND` on mismatch). Judge score mutations verify `sheet.judgeId` matches the caller's judges row (`NOT_FOUND`).
- **Immutability:** nothing ever patches or deletes `scores` or `resultVersions` rows.
- **Blackout:** no pre-publish query returns score values or standings; the monitor returns statuses/counts only.
- **Determinism:** the core sorts inputs by id, computes at fixed internal precision (`roundToPrecision(v, 6)`), rounds only for display/snapshot emission.
- **UI tasks:** use the `/ui-ux-pro-max` skill; follow Phase 1/2 page conventions (`useQuery`/`useMutation`, `use(params)`, Sonner toasts reading `.data.code`, existing shadcn primitives). Validate loading/empty/error/success states.
- **Tests:** convex-test 0.0.55 API — `t.withIdentity(identity).mutation/query(fnRef, args)` (two-arg only); strong assertions `.rejects.toMatchObject({ data: { code: "..." } })`. Pure-core tests import `../convex/lib/tabulation` directly (no harness).
- **Commits:** one per task; conventional messages. No emojis. No code comments (exceptions pre-authorized by the task).
- **Verify every task:** clear `tsconfig.tsbuildinfo`, then `npm run typecheck` (exit 0); run full `npm test` before committing.
- **Dev-data note:** new schema fields are required on paper; existing docs in a deployed dev database predate them. Dev data is disposable — if `npx convex dev` reports issues, clear the affected tables in the Convex dashboard. Test DBs are always fresh.

---

## File Structure

```
convex/
  schema.ts                    (modified — events/rounds/scoreSheets/eventTemplates fields; new tables scores/resultVersions/advancementOverrides/tieBreaks)
  lib/constants.ts             (modified — score.enter/score.manage/result.view + role wiring)
  lib/errors.ts                (modified — TIES_UNRESOLVED code)
  lib/tabulation.ts            (new — pure core: aggregation, weighting, ranking, ties, advancement, event final)
  lib/roundCompute.ts          (new — loads core inputs from ctx, builds snapshots)
  lib/eventAuthz.ts            (modified — requireJudgeRow, requireReadyEvent, loadRound)
  events.ts                    (modified — scoringRules/eliminationEnabled on create/update/template; readiness extension)
  eventLifecycle.ts            (modified — reopen guard, archive from finalized)
  rounds.ts                    (modified — weight/status/advancement on add/update)
  templates.ts                 (modified — snapshot new fields)
  scoring.ts                   (new — myAssignments, sheetDetail, saveDraft, submitSheet)
  roundAdmin.ts                (new — roundMonitor, closeRound, reopenRound, roundReview, tie/override mutations, publishRound, correctResults)
  results.ts                   (new — roundResults, listRoundVersions, eventResults, finalizeEvent)
convex-test/
  setup.ts                     (modified — carolIdentity, prepareScoredEvent)
  phase3Schema.test.ts         (new)
  permissions3.test.ts         (new)
  tabulationCore.test.ts       (new — pure)
  scoringEntry.test.ts         (new)
  roundLifecycle3.test.ts      (new)
  reviewDecisions.test.ts      (new)
  publishResults.test.ts       (new)
app/app/[orgSlug]/events/[eventSlug]/
  scoring/page.tsx             (new — judge home)
  scoring/[roundId]/[contestantId]/page.tsx (new — score entry form)
  rounds/[roundId]/monitor/page.tsx         (new — tabulator progress grid)
  rounds/[roundId]/review/page.tsx          (new — standings, ties, advancement, publish)
  results/page.tsx             (new — published results + finalize + correction)
  rounds/page.tsx              (modified — weight + advancement editor, monitor/review links)
  settings/page.tsx            (modified — scoring rules section)
components/EventShell.tsx      (modified — Scoring + Results nav)
```

---

## Task 1: Phase 2 UI gate

**Files:**
- Execute only; no new files authored by this task.

**Interfaces:**
- Consumes: `docs/superpowers/plans/2026-08-13-phase2-competition-config.md` Tasks 12–15 (fully specced there — UI pages, EventShell, editors, final verification).
- Produces: the Event Control Center UI (`app/app/[orgSlug]/events/**`, `components/EventShell.tsx`, `app/app/[orgSlug]/templates/page.tsx`) that Phase 3 UI tasks extend.

- [ ] **Step 1: Execute Phase 2 plan Task 12** — events list, new event, EventShell, overview, per that plan's steps (standard subagent dispatch with a brief pointing at that task).

- [ ] **Step 2: Execute Phase 2 plan Task 13** — config editors (rounds, categories, contestants, judges).

- [ ] **Step 3: Execute Phase 2 plan Task 14** — settings, readiness, publish, templates library.

- [ ] **Step 4: Execute Phase 2 plan Task 15** — final verification.

- [ ] **Step 5: Verify the gate**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
```

Expected: all green. Record the passing test count in the task report — later tasks compare against it as the baseline.

- [ ] **Step 6: Commit** — per-task commits happen inside the Phase 2 execution; no separate commit here unless fixes were needed.

---

## Task 2: Schema extension + writer defaults

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/events.ts`, `convex/rounds.ts`, `convex/templates.ts`
- Test: `convex-test/phase3Schema.test.ts`

**Interfaces:**
- Produces (schema): `events.status` gains `"finalized"`; `events.scoringRules: { dropHighLow: boolean }`; `events.eliminationEnabled: boolean`; `rounds.weight: number` (integer 0–100), `rounds.status: "open"|"closed"|"published"`, `rounds.advancement: { mode: "none"|"top_count"|"top_percent"|"manual", count?: number, percent?: number, allowOverride: boolean }`; `scoreSheets.draftValues?: Record<string, number>`; `eventTemplates.configSnapshot` gains optional `eliminationEnabled`, `scoringRules: { dropHighLow }`, `rounds[].weight?`, `rounds[].advancement?`. New tables `scores`, `resultVersions`, `advancementOverrides`, `tieBreaks` (field-for-field in Step 3).
- Produces (mutations): `events.create`/`createFromTemplate` write the new event fields (defaults `{ dropHighLow: false }` / `true`); `rounds.add` accepts optional `weight` (default: first round 100, later 0) and optional `advancement` (default `{ mode: "none", allowOverride: true }`) and writes `status: "open"`; `rounds.update` accepts `weight` + `advancement` with validation; `events.update` accepts `scoringRules` + `eliminationEnabled`.

- [ ] **Step 1: Write the failing tests** — `convex-test/phase3Schema.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

describe("phase3 schema defaults", () => {
  it("new events get default scoring rules and elimination", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.scoringRules).toEqual({ dropHighLow: false });
    expect(ev?.eliminationEnabled).toBe(true);
  });

  it("first round defaults weight 100/open, second 0", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R1" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R2" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(rounds.map((r) => [r.name, r.weight, r.status, r.advancement.mode])).toEqual([
      ["R1", 100, "open", "none"],
      ["R2", 0, "open", "none"],
    ]);
  });

  it("round weight and advancement update and validate", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R" });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    const roundId = rounds[0]._id;
    await t.withIdentity(aliceIdentity).mutation(api.rounds.update, {
      orgSlug: "acme", eventSlug: "gala", roundId, weight: 60,
      advancement: { mode: "top_count", count: 5, allowOverride: true },
    });
    const after = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    expect(after[0].weight).toBe(60);
    expect(after[0].advancement).toEqual({ mode: "top_count", count: 5, allowOverride: true });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.rounds.update, {
        orgSlug: "acme", eventSlug: "gala", roundId, advancement: { mode: "top_count", allowOverride: true },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.rounds.update, { orgSlug: "acme", eventSlug: "gala", roundId, weight: 101 }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("events.update handles scoring rules and elimination", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.events.update, {
      orgSlug: "acme", eventSlug: "gala", scoringRules: { dropHighLow: true }, eliminationEnabled: false,
    });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.scoringRules).toEqual({ dropHighLow: true });
    expect(ev?.eliminationEnabled).toBe(false);
  });

  it("save-as-template round-trips phase 3 fields", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.events.update, {
      orgSlug: "acme", eventSlug: "gala", scoringRules: { dropHighLow: true }, eliminationEnabled: false,
    });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
      orgSlug: "acme", eventSlug: "gala", name: "R", weight: 100,
      advancement: { mode: "top_percent", percent: 50, allowOverride: false },
    });
    const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId: rounds[0]._id, name: "C", weight: 100, minScore: 0, maxScore: 10, decimalPrecision: 0,
    });
    await t.withIdentity(aliceIdentity).mutation(api.templates.createFromEvent, { orgSlug: "acme", eventSlug: "gala", name: "T3" });
    const tpls = await t.withIdentity(aliceIdentity).query(api.templates.list, { orgSlug: "acme" });
    const tpl = tpls.find((x) => x.name === "T3")!;
    expect(tpl.configSnapshot.eliminationEnabled).toBe(false);
    expect(tpl.configSnapshot.scoringRules).toEqual({ dropHighLow: true });
    expect(tpl.configSnapshot.rounds[0].weight).toBe(100);
    await t.withIdentity(aliceIdentity).mutation(api.events.createFromTemplate, { orgSlug: "acme", name: "G2", slug: "g2", templateId: tpl._id });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "g2" });
    expect(ev?.eliminationEnabled).toBe(false);
    expect(ev?.scoringRules).toEqual({ dropHighLow: true });
    const r2 = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "g2" });
    expect(r2[0].weight).toBe(100);
    expect(r2[0].advancement).toEqual({ mode: "top_percent", percent: 50, allowOverride: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/phase3Schema.test.ts`
Expected: FAIL (missing fields / wrong defaults).

- [ ] **Step 3: Modify `convex/schema.ts`**

In `events`: extend the status union and add fields after `resultVisibility`:

```ts
    status: v.union(v.literal("draft"), v.literal("ready"), v.literal("finalized"), v.literal("archived")),
    scoringRules: v.object({ dropHighLow: v.boolean() }),
    eliminationEnabled: v.boolean(),
```

In `rounds`: add after `qualifiesToNextRound`:

```ts
    weight: v.number(),
    status: v.union(v.literal("open"), v.literal("closed"), v.literal("published")),
    advancement: v.object({
      mode: v.union(v.literal("none"), v.literal("top_count"), v.literal("top_percent"), v.literal("manual")),
      count: v.optional(v.number()),
      percent: v.optional(v.number()),
      allowOverride: v.boolean(),
    }),
```

In `scoreSheets`: add after `status`:

```ts
    draftValues: v.optional(v.record(v.string(), v.number())),
```

In `eventTemplates.configSnapshot`: add after `resultVisibility`:

```ts
      eliminationEnabled: v.optional(v.boolean()),
      scoringRules: v.optional(v.object({ dropHighLow: v.boolean() })),
```

and inside the `rounds` array element object, after `qualifiesToNextRound`:

```ts
          weight: v.optional(v.number()),
          advancement: v.optional(v.object({
            mode: v.union(v.literal("none"), v.literal("top_count"), v.literal("top_percent"), v.literal("manual")),
            count: v.optional(v.number()),
            percent: v.optional(v.number()),
            allowOverride: v.boolean(),
          })),
```

Append four new tables between `scoreSheets` and `eventTemplates`:

```ts
  scores: defineTable({
    sheetId: v.id("scoreSheets"),
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    contestantId: v.id("contestants"),
    criterionId: v.id("criteria"),
    value: v.number(),
    submittedAt: v.number(),
    submittedById: v.id("userProfiles"),
  })
    .index("by_sheet_id", ["sheetId"])
    .index("by_event_id_and_round_id", ["eventId", "roundId"])
    .index("by_event_id_and_round_id_and_contestant_id", ["eventId", "roundId", "contestantId"]),

  resultVersions: defineTable({
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    version: v.number(),
    snapshot: v.object({
      computedAt: v.number(),
      decimalPrecision: v.number(),
      categories: v.array(v.object({
        categoryId: v.id("categories"),
        standings: v.array(v.object({
          contestantId: v.id("contestants"),
          status: v.union(v.literal("active"), v.literal("scratched"), v.literal("disqualified")),
          rank: v.union(v.null(), v.number()),
          roundScore: v.union(v.null(), v.number()),
          criterionScores: v.array(v.object({
            criterionId: v.id("criteria"),
            avgRaw: v.number(),
            contribution: v.number(),
            dropped: v.array(v.object({ judgeId: v.id("judges"), value: v.number() })),
          })),
          tieResolvedBy: v.union(v.literal("none"), v.literal("criteria_cascade"), v.literal("judge_firsts"), v.literal("manual")),
          advanced: v.union(v.null(), v.boolean()),
        })),
      })),
      judgeParticipation: v.array(v.object({
        judgeId: v.id("judges"),
        sheetsSubmitted: v.number(),
        sheetsTotal: v.number(),
      })),
      decisions: v.object({
        tieBreaks: v.array(v.object({
          tiedContestantIds: v.array(v.id("contestants")),
          orderedIds: v.array(v.id("contestants")),
          createdById: v.id("userProfiles"),
        })),
        advancementOverrides: v.array(v.object({
          contestantId: v.id("contestants"),
          action: v.string(),
          createdById: v.id("userProfiles"),
        })),
      }),
    }),
    createdById: v.id("userProfiles"),
    createdAt: v.number(),
    reason: v.optional(v.string()),
  })
    .index("by_round_id", ["roundId"])
    .index("by_event_id", ["eventId"]),

  advancementOverrides: defineTable({
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    contestantId: v.id("contestants"),
    action: v.union(v.literal("force_advance"), v.literal("force_cut")),
    createdById: v.id("userProfiles"),
    createdAt: v.number(),
  })
    .index("by_round_id", ["roundId"])
    .index("by_event_id_and_contestant_id", ["eventId", "contestantId"]),

  tieBreaks: defineTable({
    eventId: v.id("events"),
    roundId: v.id("rounds"),
    tiedContestantIds: v.array(v.id("contestants")),
    orderedIds: v.array(v.id("contestants")),
    createdById: v.id("userProfiles"),
    createdAt: v.number(),
  })
    .index("by_round_id", ["roundId"])
    .index("by_event_id", ["eventId"]),
```

- [ ] **Step 4: Update writers**

`convex/events.ts` — in `create`'s insert, after `resultVisibility: "private",` add:

```ts
      scoringRules: { dropHighLow: false },
      eliminationEnabled: true,
```

Add the helper next to `slugify`:

```ts
function defaultRoundWeight(index: number, total: number): number {
  if (total === 1) return 100;
  const base = Math.floor(100 / total);
  return index === total - 1 ? 100 - base * (total - 1) : base;
}
```

In `createFromTemplate`'s event insert, after `resultVisibility: snap.resultVisibility,` add:

```ts
      scoringRules: snap.scoringRules ?? { dropHighLow: false },
      eliminationEnabled: snap.eliminationEnabled ?? true,
```

and replace the rounds loop with:

```ts
    for (const [i, r] of snap.rounds.entries()) {
      const roundId = await ctx.db.insert("rounds", {
        eventId,
        name: r.name,
        order: r.order,
        qualifiesToNextRound: r.qualifiesToNextRound,
        scoringRules: r.scoringRules,
        weight: r.weight ?? defaultRoundWeight(i, snap.rounds.length),
        status: "open",
        advancement: r.advancement ?? { mode: "none", allowOverride: true },
      });
```

(criteria insert loop inside remains unchanged; close the `for` as before.)

In `update`: widen `const patch: Record<string, string | number>` to `Record<string, unknown>`; add args after `resultVisibility`:

```ts
    scoringRules: v.optional(v.object({ dropHighLow: v.boolean() })),
    eliminationEnabled: v.optional(v.boolean()),
```

and handler lines after the `resultVisibility` handling:

```ts
    if (args.scoringRules !== undefined) patch.scoringRules = args.scoringRules;
    if (args.eliminationEnabled !== undefined) patch.eliminationEnabled = args.eliminationEnabled;
```

`convex/rounds.ts` — add a shared validator argument block to both `add` and `update`:

```ts
const advancementArgs = {
  mode: v.union(v.literal("none"), v.literal("top_count"), v.literal("top_percent"), v.literal("manual")),
  count: v.optional(v.number()),
  percent: v.optional(v.number()),
  allowOverride: v.boolean(),
};

function validateAdvancement(a: { mode: string; count?: number; percent?: number }): void {
  if (a.mode === "top_count" && !(Number.isInteger(a.count) && (a.count ?? 0) >= 1)) {
    throw appError(ErrorCode.VALIDATION_ERROR, "top_count advancement requires count >= 1");
  }
  if (a.mode === "top_percent" && !((a.percent ?? 0) >= 1 && (a.percent ?? 0) <= 100)) {
    throw appError(ErrorCode.VALIDATION_ERROR, "top_percent advancement requires percent 1-100");
  }
}
```

In `add`: extend args with `weight: v.optional(v.number())` and `advancement: v.optional(v.object(advancementArgs))`; call `if (args.advancement) validateAdvancement(args.advancement);` before insert; insert:

```ts
    const id = await ctx.db.insert("rounds", {
      eventId: eactx.event._id,
      name: args.name.trim(),
      description: args.description,
      order: existing.length,
      qualifiesToNextRound: args.qualifiesToNextRound ?? false,
      weight: args.weight ?? (existing.length === 0 ? 100 : 0),
      status: "open",
      advancement: args.advancement ?? { mode: "none", allowOverride: true },
    });
```

In `update`: add args `weight: v.optional(v.number())` and `advancement: v.optional(v.object(advancementArgs))`; handler additions before the empty-patch early return:

```ts
    if (args.weight !== undefined) {
      if (!Number.isInteger(args.weight) || args.weight < 0 || args.weight > 100) {
        throw appError(ErrorCode.VALIDATION_ERROR, "weight must be an integer 0-100");
      }
      patch.weight = args.weight;
    }
    if (args.advancement !== undefined) {
      validateAdvancement(args.advancement);
      patch.advancement = args.advancement;
    }
```

`convex/templates.ts` — in `createFromEvent`: extend each `roundsWithCriteria` entry with `weight: r.weight, advancement: r.advancement,` (and pass them through in the snapshot's rounds mapping), and add to the snapshot object after `resultVisibility`:

```ts
        eliminationEnabled: eactx.event.eliminationEnabled,
        scoringRules: eactx.event.scoringRules,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run convex-test/phase3Schema.test.ts` → PASS. Then the full gate:

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm test
```

- [ ] **Step 6: Commit**

```powershell
git add convex/schema.ts convex/events.ts convex/rounds.ts convex/templates.ts convex-test/phase3Schema.test.ts
git commit -m "feat: phase 3 schema - scores, result versions, decisions, round weights and advancement"
```

---

## Task 3: Readiness & lifecycle gating

**Files:**
- Modify: `convex/events.ts` (computeReadiness), `convex/eventLifecycle.ts`
- Test: `convex-test/phase3Schema.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `rounds.weight` / `rounds.advancement` / `rounds.status` from Task 2.
- Produces: readiness items `rounds.weightsSum` (round weights must sum to exactly 100) and `rounds.advancement` (params valid); `eventLifecycle.reopen` throws `CONFLICT` once any sheet is `submitted`/`locked` or any round is beyond `open`; `archive` accepts `ready` and `finalized` events. `eventLifecycle.publish` inherits the new checks automatically (it runs `computeReadiness`).

- [ ] **Step 1: Append failing tests** to `convex-test/phase3Schema.test.ts`

Add a local helper first (copy of `configureValidEvent` from `convex-test/lifecycle.test.ts:5-21`):

```ts
async function configureMinimalEvent(t: ReturnType<typeof setupTest>) {
  const { bobIdentity } = await import("./setup");
  await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
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
  return roundId;
}

describe("readiness & lifecycle gating", () => {
  it("multi-round weights must sum to 100", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R1", weight: 60 });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, { orgSlug: "acme", eventSlug: "gala", name: "R2", weight: 60 });
    const checks = await t.withIdentity(aliceIdentity).query(api.events.readiness, { orgSlug: "acme", eventSlug: "gala" });
    expect(checks.find((c) => c.item === "rounds.weightsSum")?.passed).toBe(false);
    await t.withIdentity(aliceIdentity).mutation(api.rounds.update, { orgSlug: "acme", eventSlug: "gala", roundId: (await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" }))[1]._id, weight: 40 });
    const after = await t.withIdentity(aliceIdentity).query(api.events.readiness, { orgSlug: "acme", eventSlug: "gala" });
    expect(after.find((c) => c.item === "rounds.weightsSum")?.passed).toBe(true);
  });

  it("bad advancement config fails readiness", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
      orgSlug: "acme", eventSlug: "gala", name: "R",
      advancement: { mode: "top_percent", percent: 150, allowOverride: true },
    });
    const checks = await t.withIdentity(aliceIdentity).query(api.events.readiness, { orgSlug: "acme", eventSlug: "gala" });
    expect(checks.find((c) => c.item === "rounds.advancement")?.passed).toBe(false);
  });

  it("reopen is blocked once a sheet is submitted", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await configureMinimalEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
    await t.run(async (q) => {
      const sheets = await q.db.query("scoreSheets").collect();
      await q.db.patch(sheets[0]._id, { status: "submitted" });
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.reopen, { orgSlug: "acme", eventSlug: "gala" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("reopen is blocked once a round is closed", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await configureMinimalEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
    await t.run(async (q) => {
      const rounds = await q.db.query("rounds").collect();
      await q.db.patch(rounds[0]._id, { status: "closed" });
    });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.reopen, { orgSlug: "acme", eventSlug: "gala" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
```

(Import `bobIdentity` from `./setup` at the top of the file instead of the inline dynamic import in `configureMinimalEvent`.)

- [ ] **Step 2: Run** `npx vitest run convex-test/phase3Schema.test.ts` → new tests FAIL (missing readiness items; reopen succeeds where it must not).

- [ ] **Step 3: Implement**

`convex/events.ts` — in `computeReadiness`, after the `badRanges` line add:

```ts
  const weightSum = rounds.reduce((s, r) => s + r.weight, 0);
  const badAdvancement = rounds.filter(
    (r) =>
      (r.advancement.mode === "top_count" && !(Number.isInteger(r.advancement.count) && (r.advancement.count ?? 0) >= 1)) ||
      (r.advancement.mode === "top_percent" && !((r.advancement.percent ?? 0) >= 1 && (r.advancement.percent ?? 0) <= 100)),
  );
```

and append two checks to the returned array:

```ts
    { item: "rounds.weightsSum", passed: weightSum === 100, detail: weightSum === 100 ? "round weights sum to 100" : `round weights sum to ${weightSum}, expected 100` },
    { item: "rounds.advancement", passed: badAdvancement.length === 0, detail: badAdvancement.length === 0 ? "advancement rules valid" : `${badAdvancement.length} round(s) with invalid advancement config` },
```

`convex/eventLifecycle.ts` — in `reopen`, after the status guard add:

```ts
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    if (rounds.some((r) => r.status !== "open")) {
      throw appError(ErrorCode.CONFLICT, "Round scoring has started");
    }
```

and after the sheets query add:

```ts
    if (sheets.some((s) => s.status === "submitted" || s.status === "locked")) {
      throw appError(ErrorCode.CONFLICT, "Scores have been submitted");
    }
```

In `archive`, replace the status guard with:

```ts
    if (eactx.event.status !== "ready" && eactx.event.status !== "finalized") {
      throw appError(ErrorCode.CONFLICT, "Only ready or finalized events can be archived");
    }
```

(and use `before: { status: eactx.event.status }` in its audit to stay accurate for both origins).

- [ ] **Step 4: Run** the file, then the full gate.

- [ ] **Step 5: Commit**

```powershell
git add convex/events.ts convex/eventLifecycle.ts convex-test/phase3Schema.test.ts
git commit -m "feat: readiness round-weight checks, scoring-safe reopen guard, archive from finalized"
```

---

## Task 4: Permissions & role wiring

**Files:**
- Modify: `convex/lib/constants.ts`
- Test: `convex-test/permissions3.test.ts`

**Interfaces:**
- Produces: permissions `score.enter`, `score.manage`, `result.view` seeded and wired — Org Owner/Org Admin/Event Admin/Tabulator get `score.manage` + `result.view`; Judge gets `score.enter` + `result.view`; Staff/Viewer get `result.view`. `convex/seed.ts` needs no change (it iterates the constants generically).

- [ ] **Step 1: Write the failing test** — `convex-test/permissions3.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, seedAndProvision, setupTest } from "./setup";

const EXPECTED: Record<string, string[]> = {
  "Org Owner": ["score.manage", "result.view"],
  "Org Admin": ["score.manage", "result.view"],
  "Event Admin": ["score.manage", "result.view"],
  Tabulator: ["score.manage", "result.view"],
  Judge: ["score.enter", "result.view"],
  Staff: ["result.view"],
  Viewer: ["result.view"],
};

describe("score permissions wiring", () => {
  it("seeds new permissions and role links", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    const result = await t.run(async (q) => {
      const perms = await q.db.query("permissions").collect();
      const roles = await q.db.query("roles").collect();
      const out: Record<string, string[]> = {};
      for (const role of roles) {
        const links = await q.db
          .query("rolePermissions")
          .withIndex("by_role_id", (q2) => q2.eq("roleId", role._id))
          .collect();
        out[role.name] = links
          .map((l) => perms.find((p) => p._id === l.permissionId)!.name)
          .filter((n) => n === "score.enter" || n === "score.manage" || n === "result.view")
          .sort();
      }
      return { out, permNames: perms.map((p) => p.name) };
    });
    for (const [role, perms] of Object.entries(EXPECTED)) {
      expect(result.out[role]).toEqual([...perms].sort());
    }
    expect(result.permNames).toContain("score.enter");
    expect(result.permNames).toContain("score.manage");
    expect(result.permNames).toContain("result.view");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run convex-test/permissions3.test.ts` → FAIL (permissions absent).

- [ ] **Step 3: Implement** — in `convex/lib/constants.ts`, append to `SYSTEM_PERMISSIONS`:

```ts
  { name: "score.enter", category: "score", description: "Enter and submit own score sheets" },
  { name: "score.manage", category: "score", description: "Run rounds, publish results, finalize events" },
  { name: "result.view", category: "result", description: "View published results" },
```

and update `ROLE_PERMISSIONS`:

```ts
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Org Owner": ["organization.view", "organization.update", "organization.members.manage", "organization.delete", "audit.view", "subscription.view", "subscription.manage", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage", "score.manage", "result.view"],
  "Org Admin": ["organization.view", "organization.update", "organization.members.manage", "audit.view", "subscription.view", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage", "score.manage", "result.view"],
  "Event Admin": ["organization.view", "subscription.view", "event.create", "event.view", "event.update", "event.publish", "event.archive", "contestant.manage", "judge.manage", "score.manage", "result.view"],
  "Tabulator": ["organization.view", "event.view", "score.manage", "result.view"],
  "Judge": ["organization.view", "event.view", "score.enter", "result.view"],
  "Staff": ["organization.view", "event.view", "contestant.manage", "result.view"],
  "Viewer": ["organization.view", "event.view", "result.view"],
};
```

- [ ] **Step 4: Run** the file, then the full gate (all prior tests must stay green — the wiring widens access only).

- [ ] **Step 5: Commit** — `git commit -m "feat: score and result permissions with role wiring"`

---

## Task 5: Core — aggregation & weighting

**Files:**
- Create: `convex/lib/tabulation.ts`
- Test: `convex-test/tabulationCore.test.ts`

**Interfaces:**
- Produces (exact; consumed by Tasks 6–7 and `lib/roundCompute.ts`):

```ts
roundToPrecision(value: number, precision: number): number
aggregateJudgeValues(entries: { judgeId: Id<"judges">; value: number }[], dropHighLow: boolean): { avg: number; dropped: { judgeId: Id<"judges">; value: number }[] }
computeContestantCriteria(contestantId: Id<"contestants">, criteria: CoreCriterion[], scores: CoreScoreRow[], dropHighLow: boolean, decimalPrecision: number): CriterionResult[]
computeRoundScore(results: CriterionResult[]): number
```

with types `CoreCriterion = { id: Id<"criteria">; weight: number; minScore: number; maxScore: number }`, `CoreContestant = { id: Id<"contestants">; categoryId: Id<"categories">; status: "active" | "scratched" | "disqualified" }`, `CoreScoreRow = { judgeId; contestantId; criterionId; value }`, `CriterionResult = { criterionId: Id<"criteria">; avgRaw: number; contribution: number; dropped: { judgeId: Id<"judges">; value: number }[] }`.

- [ ] **Step 1: Create `convex/lib/tabulation.ts`** (pure — type imports only)

```ts
import type { Id } from "../_generated/dataModel";

export type CoreCriterion = { id: Id<"criteria">; weight: number; minScore: number; maxScore: number };

export type CoreContestant = {
  id: Id<"contestants">;
  categoryId: Id<"categories">;
  status: "active" | "scratched" | "disqualified";
};

export type CoreScoreRow = {
  judgeId: Id<"judges">;
  contestantId: Id<"contestants">;
  criterionId: Id<"criteria">;
  value: number;
};

export type CriterionResult = {
  criterionId: Id<"criteria">;
  avgRaw: number;
  contribution: number;
  dropped: { judgeId: Id<"judges">; value: number }[];
};

export function roundToPrecision(value: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function aggregateJudgeValues(
  entries: { judgeId: Id<"judges">; value: number }[],
  dropHighLow: boolean,
): { avg: number; dropped: { judgeId: Id<"judges">; value: number }[] } {
  const sorted = [...entries].sort((a, b) => a.value - b.value || (a.judgeId < b.judgeId ? -1 : 1));
  let used = sorted;
  let dropped: { judgeId: Id<"judges">; value: number }[] = [];
  if (dropHighLow && sorted.length >= 3) {
    dropped = [sorted[0], sorted[sorted.length - 1]];
    used = sorted.slice(1, -1);
  }
  const avg = used.reduce((s, e) => s + e.value, 0) / used.length;
  return { avg, dropped };
}

export function computeContestantCriteria(
  contestantId: Id<"contestants">,
  criteria: CoreCriterion[],
  scores: CoreScoreRow[],
  dropHighLow: boolean,
  decimalPrecision: number,
): CriterionResult[] {
  return [...criteria]
    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))
    .map((c) => {
      const entries = scores
        .filter((s) => s.contestantId === contestantId && s.criterionId === c.id)
        .map((s) => ({ judgeId: s.judgeId, value: s.value }));
      const { avg, dropped } = aggregateJudgeValues(entries, dropHighLow);
      const contribution = c.maxScore === 0 ? 0 : roundToPrecision((avg / c.maxScore) * c.weight, 6);
      return { criterionId: c.id, avgRaw: roundToPrecision(avg, decimalPrecision), contribution, dropped };
    });
}

export function computeRoundScore(results: CriterionResult[]): number {
  return roundToPrecision(results.reduce((s, r) => s + r.contribution, 0), 6);
}
```

- [ ] **Step 2: Write tests** — `convex-test/tabulationCore.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import {
  aggregateJudgeValues, computeContestantCriteria, computeRoundScore, roundToPrecision,
} from "../convex/lib/tabulation";

const j = (s: string) => s as Id<"judges">;
const c = (s: string) => s as Id<"criteria">;
const p = (s: string) => s as Id<"contestants">;

describe("aggregation", () => {
  it("averages all judges when dropping is on but only 2 judges", () => {
    const r = aggregateJudgeValues([{ judgeId: j("j1"), value: 1 }, { judgeId: j("j2"), value: 3 }], true);
    expect(r.avg).toBe(2);
    expect(r.dropped).toEqual([]);
  });

  it("drops one high and one low at 3 judges", () => {
    const r = aggregateJudgeValues(
      [{ judgeId: j("j1"), value: 5 }, { judgeId: j("j2"), value: 9 }, { judgeId: j("j3"), value: 7 }],
      true,
    );
    expect(r.avg).toBe(7);
    expect(r.dropped.map((d) => d.value).sort()).toEqual([5, 9]);
  });

  it("drops exactly one high and one low beyond 3 judges", () => {
    const r = aggregateJudgeValues(
      [{ judgeId: j("j1"), value: 1 }, { judgeId: j("j2"), value: 2 }, { judgeId: j("j3"), value: 8 }, { judgeId: j("j4"), value: 9 }],
      true,
    );
    expect(r.avg).toBe(5);
    expect(r.dropped.length).toBe(2);
  });

  it("no drop when disabled", () => {
    const r = aggregateJudgeValues(
      [{ judgeId: j("j1"), value: 5 }, { judgeId: j("j2"), value: 9 }, { judgeId: j("j3"), value: 7 }],
      false,
    );
    expect(r.avg).toBeCloseTo(7, 10);
    expect(r.dropped).toEqual([]);
  });
});

describe("weighting", () => {
  it("weights and normalizes across different max scores", () => {
    const criteria = [
      { id: c("cr1"), weight: 60, minScore: 0, maxScore: 10 },
      { id: c("cr2"), weight: 40, minScore: 0, maxScore: 20 },
    ];
    const scores = [
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 8 },
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: 15 },
    ];
    const results = computeContestantCriteria(p("k1"), criteria, scores, false, 2);
    expect(computeRoundScore(results)).toBeCloseTo(48 + 30, 6);
    expect(results[0].avgRaw).toBe(8);
    expect(results[1].avgRaw).toBe(15);
  });

  it("judge participation is per criterion", () => {
    const criteria = [{ id: c("cr1"), weight: 100, minScore: 0, maxScore: 10 }];
    const scores = [
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: 4 },
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr1"), value: 8 },
    ];
    const results = computeContestantCriteria(p("k1"), criteria, scores, true, 0);
    expect(results[0].avgRaw).toBe(6);
    expect(results[0].dropped).toEqual([]);
  });

  it("roundToPrecision rounds half up", () => {
    expect(roundToPrecision(7.335, 2)).toBe(7.34);
    expect(roundToPrecision(7.5, 0)).toBe(8);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run convex-test/tabulationCore.test.ts` → PASS. Full gate (`typecheck` + `npm test`).

- [ ] **Step 4: Commit**

```powershell
git add convex/lib/tabulation.ts convex-test/tabulationCore.test.ts
git commit -m "feat: tabulation core aggregation and weighting"
```

---

## Task 6: Core — ranking & tie cascade

**Files:**
- Modify: `convex/lib/tabulation.ts` (append)
- Test: `convex-test/tabulationCore.test.ts` (append)

**Interfaces:**
- Consumes: Task 5 types/functions.
- Produces:

```ts
type RoundComputeInput = {
  winner: "highest" | "lowest";
  dropHighLow: boolean;
  decimalPrecision: number;
  criteria: CoreCriterion[];
  contestants: CoreContestant[];
  scores: CoreScoreRow[];
  manualTieBreaks: { tiedContestantIds: Id<"contestants">[]; orderedIds: Id<"contestants">[] }[];
};
type StandingRow = {
  contestantId: Id<"contestants">;
  categoryId: Id<"categories">;
  status: "active" | "scratched" | "disqualified";
  roundScore: number | null;
  criterionScores: CriterionResult[];
  rank: number | null;
  tieResolvedBy: "none" | "criteria_cascade" | "judge_firsts" | "manual";
};
type UnresolvedTie = { categoryId: Id<"categories">; contestantIds: Id<"contestants">[] };
computeRoundStandings(input: RoundComputeInput): { standings: StandingRow[]; unresolvedTies: UnresolvedTie[] }
```

- [ ] **Step 1: Append failing tests** to `convex-test/tabulationCore.test.ts`

```ts
import { computeRoundStandings } from "../convex/lib/tabulation";

const cat = (s: string) => s as Id<"categories">;

function fixture(marks: { k1: [number, number]; k2: [number, number] }) {
  return {
    winner: "highest" as const,
    dropHighLow: false,
    decimalPrecision: 2,
    criteria: [
      { id: c("cr1"), weight: 60, minScore: 0, maxScore: 10 },
      { id: c("cr2"), weight: 40, minScore: 0, maxScore: 10 },
    ],
    contestants: [
      { id: p("k1"), categoryId: cat("A"), status: "active" as const },
      { id: p("k2"), categoryId: cat("A"), status: "active" as const },
    ],
    scores: [
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr1"), value: marks.k1[0] },
      { judgeId: j("j1"), contestantId: p("k1"), criterionId: c("cr2"), value: marks.k1[1] },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr1"), value: marks.k2[0] },
      { judgeId: j("j1"), contestantId: p("k2"), criterionId: c("cr2"), value: marks.k2[1] },
    ],
    manualTieBreaks: [],
  };
}

describe("ranking & ties", () => {
  it("ranks by weighted score, highest first", () => {
    const { standings, unresolvedTies } = computeRoundStandings(fixture({ k1: [9, 9], k2: [5, 5] }));
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(2);
    expect(unresolvedTies).toEqual([]);
    expect(standings.find((s) => s.contestantId === p("k1"))?.tieResolvedBy).toBe("none");
  });

  it("lowest-wins inverts ranking", () => {
    const { standings } = computeRoundStandings({ ...fixture({ k1: [9, 9], k2: [5, 5] }), winner: "lowest" });
    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(1);
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(2);
  });

  it("resolves equal totals via criteria cascade (higher weight first)", () => {
    const { standings, unresolvedTies } = computeRoundStandings(fixture({ k1: [10, 5], k2: [8, 8] }));
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
    expect(standings.find((s) => s.contestantId === p("k1"))?.tieResolvedBy).toBe("criteria_cascade");
    expect(unresolvedTies).toEqual([]);
  });

  it("flags fully tied contestants as unresolved without a manual break", () => {
    const { standings, unresolvedTies } = computeRoundStandings(fixture({ k1: [8, 8], k2: [8, 8] }));
    expect(unresolvedTies.length).toBe(1);
    expect([...unresolvedTies[0].contestantIds].sort()).toEqual([p("k1"), p("k2")].sort());
    expect(standings.every((s) => s.rank === 1)).toBe(true);
  });

  it("judge firsts resolve ties before manual breaks", () => {
    const input = fixture({ k1: [8, 8], k2: [8, 8] });
    input.scores.push(
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr1"), value: 9 },
      { judgeId: j("j2"), contestantId: p("k1"), criterionId: c("cr2"), value: 7 },
      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr1"), value: 7 },
      { judgeId: j("j2"), contestantId: p("k2"), criterionId: c("cr2"), value: 9 },
    );
    const { standings, unresolvedTies } = computeRoundStandings(input);
    expect(unresolvedTies).toEqual([]);
    const k1 = standings.find((s) => s.contestantId === p("k1"))!;
    expect(k1.rank).toBe(1);
    expect(k1.tieResolvedBy).toBe("judge_firsts");
  });

  it("manual tie breaks resolve identical totals", () => {
    const input = fixture({ k1: [8, 8], k2: [8, 8] });
    input.manualTieBreaks = [{ tiedContestantIds: [p("k1"), p("k2")], orderedIds: [p("k2"), p("k1")] }];
    const { standings, unresolvedTies } = computeRoundStandings(input);
    expect(unresolvedTies).toEqual([]);
    expect(standings.find((s) => s.contestantId === p("k2"))?.rank).toBe(1);
    expect(standings.find((s) => s.contestantId === p("k2"))?.tieResolvedBy).toBe("manual");
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(2);
  });

  it("excludes scratched and disqualified from ranking", () => {
    const input = fixture({ k1: [9, 9], k2: [5, 5] });
    input.contestants = [
      { id: p("k1"), categoryId: cat("A"), status: "active" },
      { id: p("k2"), categoryId: cat("A"), status: "disqualified" },
    ];
    const { standings } = computeRoundStandings(input);
    const k2 = standings.find((s) => s.contestantId === p("k2"))!;
    expect(k2.rank).toBeNull();
    expect(k2.roundScore).toBeNull();
    expect(k2.criterionScores).toEqual([]);
    expect(standings.find((s) => s.contestantId === p("k1"))?.rank).toBe(1);
  });

  it("deterministic across repeated runs", () => {
    const input = fixture({ k1: [8, 8], k2: [8, 8] });
    input.manualTieBreaks = [{ tiedContestantIds: [p("k1"), p("k2")], orderedIds: [p("k2"), p("k1")] }];
    const a = computeRoundStandings(input);
    const b = computeRoundStandings(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
```

- [ ] **Step 2: Run** → FAIL (`computeRoundStandings` is not exported).

- [ ] **Step 3: Implement** — append to `convex/lib/tabulation.ts`

```ts
export type RoundComputeInput = {
  winner: "highest" | "lowest";
  dropHighLow: boolean;
  decimalPrecision: number;
  criteria: CoreCriterion[];
  contestants: CoreContestant[];
  scores: CoreScoreRow[];
  manualTieBreaks: { tiedContestantIds: Id<"contestants">[]; orderedIds: Id<"contestants">[] }[];
};

export type StandingRow = {
  contestantId: Id<"contestants">;
  categoryId: Id<"categories">;
  status: CoreContestant["status"];
  roundScore: number | null;
  criterionScores: CriterionResult[];
  rank: number | null;
  tieResolvedBy: "none" | "criteria_cascade" | "judge_firsts" | "manual";
};

export type UnresolvedTie = { categoryId: Id<"categories">; contestantIds: Id<"contestants">[] };

type WorkRow = StandingRow & { firsts: number; manualRank: number };

function judgeFirsts(
  tied: Id<"contestants">[],
  scores: CoreScoreRow[],
  winner: "highest" | "lowest",
): Map<Id<"contestants">, number> {
  const totals = new Map<string, number>();
  const judges = new Set<Id<"judges">>();
  for (const s of scores) {
    if (!tied.includes(s.contestantId)) continue;
    judges.add(s.judgeId);
    const key = `${s.judgeId}|${s.contestantId}`;
    totals.set(key, (totals.get(key) ?? 0) + s.value);
  }
  const firsts = new Map<Id<"contestants">, number>();
  for (const judge of [...judges].sort()) {
    let best: Id<"contestants"> | null = null;
    let bestTotal = 0;
    for (const contestant of [...tied].sort()) {
      const total = totals.get(`${judge}|${contestant}`) ?? 0;
      if (best === null || (winner === "highest" ? total > bestTotal : total < bestTotal)) {
        best = contestant;
        bestTotal = total;
      }
    }
    if (best !== null) firsts.set(best, (firsts.get(best) ?? 0) + 1);
  }
  return firsts;
}

function manualRankFor(contestantId: Id<"contestants">, breaks: RoundComputeInput["manualTieBreaks"]): number {
  for (const b of breaks) {
    const idx = b.orderedIds.indexOf(contestantId);
    if (idx !== -1) return idx;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function computeRoundStandings(input: RoundComputeInput): {
  standings: StandingRow[];
  unresolvedTies: UnresolvedTie[];
} {
  const rows: WorkRow[] = input.contestants
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((k) => {
      const rankable = k.status === "active";
      const criterionScores = rankable
        ? computeContestantCriteria(k.id, input.criteria, input.scores, input.dropHighLow, input.decimalPrecision)
        : [];
      return {
        contestantId: k.id,
        categoryId: k.categoryId,
        status: k.status,
        roundScore: rankable ? computeRoundScore(criterionScores) : null,
        criterionScores,
        rank: null,
        tieResolvedBy: "none" as const,
        firsts: 0,
        manualRank: Number.MAX_SAFE_INTEGER,
      };
    });

  const dir = input.winner === "highest" ? 1 : -1;
  const unresolvedTies: UnresolvedTie[] = [];
  const byCategory = new Map<Id<"categories">, WorkRow[]>();
  for (const row of rows) {
    const list = byCategory.get(row.categoryId) ?? [];
    list.push(row);
    byCategory.set(row.categoryId, list);
  }

  for (const [categoryId, categoryRows] of byCategory) {
    const rankable = categoryRows.filter((r) => r.roundScore !== null);
    for (const r of categoryRows) {
      if (r.roundScore === null) r.rank = null;
    }
    rankable.sort((a, b) => (b.roundScore! - a.roundScore!) * dir || (a.contestantId < b.contestantId ? -1 : 1));

    let index = 0;
    while (index < rankable.length) {
      let end = index;
      while (end + 1 < rankable.length && rankable[end + 1].roundScore === rankable[index].roundScore) end += 1;
      const group = rankable.slice(index, end + 1);
      if (group.length === 1) {
        group[0].rank = index + 1;
        group[0].tieResolvedBy = "none";
      } else {
        const firsts = judgeFirsts(group.map((g) => g.contestantId), input.scores, input.winner);
        for (const g of group) {
          g.firsts = firsts.get(g.contestantId) ?? 0;
          g.manualRank = manualRankFor(g.contestantId, input.manualTieBreaks);
        }
        group.sort((a, b) => {
          for (let i = 0; i < Math.min(a.criterionScores.length, b.criterionScores.length); i += 1) {
            const diff = (b.criterionScores[i].contribution - a.criterionScores[i].contribution) * dir;
            if (diff !== 0) return diff;
          }
          if (a.firsts !== b.firsts) return (b.firsts - a.firsts) * dir;
          if (a.manualRank !== b.manualRank) return a.manualRank - b.manualRank;
          return a.contestantId < b.contestantId ? -1 : 1;
        });
        let separatedBy: WorkRow["tieResolvedBy"] = "manual";
        let anySeparation = group.length > 1;
        for (let i = 1; i < group.length; i += 1) {
          const a = group[i - 1];
          const b = group[i];
          let tier: WorkRow["tieResolvedBy"] | null = null;
          for (let k = 0; k < Math.min(a.criterionScores.length, b.criterionScores.length); k += 1) {
            if (a.criterionScores[k].contribution !== b.criterionScores[k].contribution) {
              tier = "criteria_cascade";
              break;
            }
          }
          if (!tier && a.firsts !== b.firsts) tier = "judge_firsts";
          if (!tier && a.manualRank !== b.manualRank) tier = "manual";
          if (!tier) {
            anySeparation = false;
            break;
          }
          separatedBy = tier;
        }
        if (anySeparation) {
          for (const g of group) {
            g.rank = index + group.indexOf(g) + 1;
            g.tieResolvedBy = separatedBy;
          }
        } else {
          unresolvedTies.push({ categoryId, contestantIds: group.map((g) => g.contestantId).sort() });
          for (const g of group) {
            g.rank = index + 1;
            g.tieResolvedBy = "none";
          }
        }
      }
      index = end + 1;
    }
  }

  return {
    standings: rows.map((r) => ({
      contestantId: r.contestantId,
      categoryId: r.categoryId,
      status: r.status,
      roundScore: r.roundScore,
      criterionScores: r.criterionScores,
      rank: r.rank,
      tieResolvedBy: r.tieResolvedBy,
    })),
    unresolvedTies,
  };
}
```

(The explicit field mapping avoids unused-variable lint from rest destructuring.)

- [ ] **Step 4: Run** `npx vitest run convex-test/tabulationCore.test.ts` → PASS. Full gate.

- [ ] **Step 5: Commit** — `git commit -m "feat: tabulation core ranking with tie cascade"`

---

## Task 7: Core — advancement & event final

**Files:**
- Modify: `convex/lib/tabulation.ts` (append)
- Test: `convex-test/tabulationCore.test.ts` (append)

**Interfaces:**
- Consumes: `StandingRow` from Task 6.
- Produces:

```ts
type AdvancementConfig = { enabled: boolean; mode: "none" | "top_count" | "top_percent" | "manual"; count: number | null; percent: number | null; allowOverride: boolean };
type AdvancementOverrideRow = { contestantId: Id<"contestants">; action: "force_advance" | "force_cut" };
applyAdvancement(standings: StandingRow[], config: AdvancementConfig, overrides: AdvancementOverrideRow[]): Map<Id<"contestants">, boolean | null>
type RoundStandingSummary = { roundId: Id<"rounds">; order: number; weight: number; standings: StandingRow[]; advancement: Record<string, boolean | null> };
type FinalStandingRow = { contestantId: Id<"contestants">; categoryId: Id<"categories">; totalScore: number; eliminatedInRoundOrder: number | null; rank: number };
computeEventFinal(rounds: RoundStandingSummary[], decimalPrecision: number): FinalStandingRow[]
```

- [ ] **Step 1: Append failing tests** to `convex-test/tabulationCore.test.ts`

```ts
import { applyAdvancement, computeEventFinal, type StandingRow } from "../convex/lib/tabulation";

const rd = (s: string) => s as Id<"rounds">;

function standingRow(id: string, rank: number | null, categoryId = "A"): StandingRow {
  return {
    contestantId: p(id),
    categoryId: cat(categoryId),
    status: "active",
    roundScore: rank === null ? null : 100 - rank,
    criterionScores: [],
    rank,
    tieResolvedBy: "none",
  };
}

describe("advancement", () => {
  const standings = [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 3), standingRow("k4", 4)];

  it("disabled advancement returns all null", () => {
    const m = applyAdvancement(standings, { enabled: false, mode: "top_count", count: 2, percent: null, allowOverride: true }, []);
    expect([...m.values()].every((v) => v === null)).toBe(true);
  });

  it("top_count advances first N ranked", () => {
    const m = applyAdvancement(standings, { enabled: true, mode: "top_count", count: 2, percent: null, allowOverride: true }, []);
    expect(m.get(p("k1"))).toBe(true);
    expect(m.get(p("k2"))).toBe(true);
    expect(m.get(p("k3"))).toBe(false);
    expect(m.get(p("k4"))).toBe(false);
  });

  it("top_percent uses ceiling", () => {
    const m = applyAdvancement(
      [...standings, standingRow("k5", 5), standingRow("k6", 6)],
      { enabled: true, mode: "top_percent", count: null, percent: 50, allowOverride: true },
      [],
    );
    expect(m.get(p("k3"))).toBe(true);
    expect(m.get(p("k4"))).toBe(false);
  });

  it("manual mode advances nobody automatically", () => {
    const m = applyAdvancement(standings, { enabled: true, mode: "manual", count: null, percent: null, allowOverride: true }, []);
    expect(m.get(p("k1"))).toBe(false);
    expect(m.get(p("k4"))).toBe(false);
  });

  it("overrides force through the computed cut", () => {
    const m = applyAdvancement(
      standings,
      { enabled: true, mode: "top_count", count: 2, percent: null, allowOverride: true },
      [{ contestantId: p("k4"), action: "force_advance" }, { contestantId: p("k1"), action: "force_cut" }],
    );
    expect(m.get(p("k4"))).toBe(true);
    expect(m.get(p("k1"))).toBe(false);
  });
});

describe("event final", () => {
  it("combines round scores by weight and ranks survivors first", () => {
    const rounds = [
      {
        roundId: rd("rd1"), order: 0, weight: 40,
        standings: [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 3)],
        advancement: { [p("k1")]: true, [p("k2")]: true, [p("k3")]: false },
      },
      {
        roundId: rd("rd2"), order: 1, weight: 60,
        standings: [standingRow("k1", 2), standingRow("k2", 1)],
        advancement: { [p("k1")]: null, [p("k2")]: null },
      },
    ];
    const final = computeEventFinal(rounds, 2);
    const k1 = final.find((f) => f.contestantId === p("k1"))!;
    const k3 = final.find((f) => f.contestantId === p("k3"))!;
    expect(k1.totalScore).toBeCloseTo((99 * 40 + 98 * 60) / 100, 6);
    expect(k1.eliminatedInRoundOrder).toBeNull();
    expect(k3.eliminatedInRoundOrder).toBe(0);
    expect(k1.rank).toBeLessThan(k3.rank);
  });

  it("eliminated contestants rank by later elimination then score", () => {
    const rounds = [{
      roundId: rd("rd1"), order: 0, weight: 100,
      standings: [standingRow("k1", 1), standingRow("k2", 2), standingRow("k3", 3)],
      advancement: { [p("k1")]: true, [p("k2")]: false, [p("k3")]: false },
    }];
    const final = computeEventFinal(rounds, 2);
    expect(final.map((f) => f.contestantId)).toEqual([p("k1"), p("k2"), p("k3")]);
  });

  it("non-elimination events rank purely by weighted total", () => {
    const rounds = [{
      roundId: rd("rd1"), order: 0, weight: 100,
      standings: [standingRow("k1", 1), standingRow("k2", 2)],
      advancement: {},
    }];
    const final = computeEventFinal(rounds, 2);
    expect(final[0].rank).toBe(1);
    expect(final[0].contestantId).toBe(p("k1"));
    expect(final.every((f) => f.eliminatedInRoundOrder === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — append to `convex/lib/tabulation.ts`

```ts
export type AdvancementConfig = {
  enabled: boolean;
  mode: "none" | "top_count" | "top_percent" | "manual";
  count: number | null;
  percent: number | null;
  allowOverride: boolean;
};

export type AdvancementOverrideRow = {
  contestantId: Id<"contestants">;
  action: "force_advance" | "force_cut";
};

export function applyAdvancement(
  standings: StandingRow[],
  config: AdvancementConfig,
  overrides: AdvancementOverrideRow[],
): Map<Id<"contestants">, boolean | null> {
  const outcome = new Map<Id<"contestants">, boolean | null>();
  for (const s of standings) outcome.set(s.contestantId, null);
  if (!config.enabled) return outcome;
  const rankable = standings
    .filter((s) => s.rank !== null && s.status === "active")
    .sort((a, b) => a.rank! - b.rank!);
  let advancing = new Set<Id<"contestants">>();
  if (config.mode === "top_count") {
    advancing = new Set(rankable.slice(0, config.count ?? 0).map((s) => s.contestantId));
  } else if (config.mode === "top_percent") {
    const n = Math.ceil(((config.percent ?? 0) / 100) * rankable.length);
    advancing = new Set(rankable.slice(0, n).map((s) => s.contestantId));
  }
  for (const s of rankable) outcome.set(s.contestantId, advancing.has(s.contestantId));
  for (const o of overrides) {
    outcome.set(o.contestantId, o.action === "force_advance");
  }
  return outcome;
}

export type RoundStandingSummary = {
  roundId: Id<"rounds">;
  order: number;
  weight: number;
  standings: StandingRow[];
  advancement: Record<string, boolean | null>;
};

export type FinalStandingRow = {
  contestantId: Id<"contestants">;
  categoryId: Id<"categories">;
  totalScore: number;
  eliminatedInRoundOrder: number | null;
  rank: number;
};

export function computeEventFinal(rounds: RoundStandingSummary[], decimalPrecision: number): FinalStandingRow[] {
  type Work = { contestantId: Id<"contestants">; category: Id<"categories">; total: number; eliminated: number | null; rank: number };
  const byContestant = new Map<Id<"contestants">, { total: number; category: Id<"categories">; eliminated: number | null }>();
  for (const round of rounds) {
    for (const s of round.standings) {
      if (s.roundScore === null) continue;
      const entry = byContestant.get(s.contestantId) ?? { total: 0, category: s.categoryId, eliminated: null };
      entry.total += (s.roundScore * round.weight) / 100;
      if (round.advancement[s.contestantId] === false && (entry.eliminated === null || round.order > entry.eliminated)) {
        entry.eliminated = round.order;
      }
      byContestant.set(s.contestantId, entry);
    }
  }
  const rows: Work[] = [...byContestant.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([contestantId, e]) => ({
      contestantId,
      category: e.category,
      total: roundToPrecision(e.total, decimalPrecision),
      eliminated: e.eliminated,
      rank: 0,
    }));
  const byCategory = new Map<Id<"categories">, Work[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort(
      (a, b) =>
        (a.eliminated === null ? 0 : 1) - (b.eliminated === null ? 0 : 1) ||
        (b.eliminated ?? 0) - (a.eliminated ?? 0) ||
        b.total - a.total,
    );
    list.forEach((row, i) => {
      row.rank = i + 1;
    });
  }
  return rows.map((r) => ({
    contestantId: r.contestantId,
    categoryId: r.category,
    totalScore: r.total,
    eliminatedInRoundOrder: r.eliminated,
    rank: r.rank,
  }));
}
```

- [ ] **Step 4: Run** `npx vitest run convex-test/tabulationCore.test.ts` → PASS. Full gate.

- [ ] **Step 5: Commit** — `git commit -m "feat: advancement rules and cross-round final standings"`

---

## Task 8: Score entry (authz helpers + mutations)

**Files:**
- Modify: `convex/lib/eventAuthz.ts`, `convex-test/setup.ts`
- Create: `convex/scoring.ts`
- Test: `convex-test/scoringEntry.test.ts`

**Interfaces:**
- Produces (`convex/lib/eventAuthz.ts`; `Id` added to the existing dataModel import):

```ts
requireReadyEvent(ctx, args: { orgSlug: string; eventSlug: string; permission: string }): Promise<EventAuthCtx>  // status !== "ready" → CONFLICT
requireJudgeRow(ctx, eactx: EventAuthCtx): Promise<Doc<"judges">>                                              // caller's judges row → NOT_FOUND
loadRound(ctx, eactx: EventAuthCtx, roundId: Id<"rounds">): Promise<Doc<"rounds">>                             // round.eventId check → NOT_FOUND
```

- Produces (`convex/scoring.ts`): `myAssignments` query `{ orgSlug, eventSlug }` → `{ judgeId: Id<"judges"> | null, rounds: { roundId, name, order, status, sheets: { sheetId, contestantId, contestantName, contestantNumber, status }[] }[] }`; `sheetDetail` query `{ orgSlug, eventSlug, roundId, contestantId }` → `{ sheet: Doc<"scoreSheets"> | null, criteria: Doc<"criteria">[], contestant: Doc<"contestants"> | null }`; `saveDraft` mutation `{ orgSlug, eventSlug, sheetId, draftValues: Record<string, number> }`; `submitSheet` mutation `{ orgSlug, eventSlug, sheetId, values: Record<string, number> }` (inserts `scores` rows, patches sheet to `submitted`, clears `draftValues`, audits `score.submitted`).
- Produces (setup): `carolIdentity`; `prepareScoredEvent(t, opts?)` → `{ roundId, criterionIds, contestantIds: [mariaId, ninaId], judgeIds: { bob, carol } }` on a ready event `acme/gala`. Opts: `{ advancement?, qualifiesToNextRound?: boolean, dropHighLow?: boolean, resultVisibility?: "private"|"organization"|"public" }` applied before publish.

- [ ] **Step 1: Extend `convex-test/setup.ts`**

Add after `bobIdentity`:

```ts
export const carolIdentity = {
  tokenIdentifier: "carol-token",
  subject: "carol-subject",
  name: "Carol",
  email: "carol@example.com",
  pictureUrl: "https://example.com/c.png",
  issuer: "https://tabulation.example.com",
} as const;
```

Append at the end of the file:

```ts
type ScoredEventOpts = {
  advancement?: { mode: "none" | "top_count" | "top_percent" | "manual"; count?: number; percent?: number; allowOverride: boolean };
  qualifiesToNextRound?: boolean;
  dropHighLow?: boolean;
  resultVisibility?: "private" | "organization" | "public";
};

export async function prepareScoredEvent(
  t: ReturnType<typeof setupTest>,
  opts: ScoredEventOpts = {},
): Promise<{
  roundId: string;
  criterionIds: string[];
  contestantIds: string[];
  judgeIds: { bob: string; carol: string };
}> {
  await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
  await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
  await t.withIdentity(carolIdentity).mutation(api.auth.ensureUserProfile, {});
  const eventPatch: Record<string, unknown> = {};
  if (opts.dropHighLow !== undefined) eventPatch.scoringRules = { dropHighLow: opts.dropHighLow };
  if (opts.resultVisibility !== undefined) eventPatch.resultVisibility = opts.resultVisibility;
  if (Object.keys(eventPatch).length > 0) {
    await t.withIdentity(aliceIdentity).mutation(api.events.update, { orgSlug: "acme", eventSlug: "gala", ...eventPatch });
  }
  await t.withIdentity(aliceIdentity).mutation(api.rounds.add, {
    orgSlug: "acme", eventSlug: "gala", name: "R",
    qualifiesToNextRound: opts.qualifiesToNextRound,
    advancement: opts.advancement,
  });
  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const roundId = rounds[0]._id;
  for (const [name, weight] of [["A", 60], ["B", 40]] as const) {
    await t.withIdentity(aliceIdentity).mutation(api.criteria.add, {
      orgSlug: "acme", eventSlug: "gala", roundId, name, weight, minScore: 0, maxScore: 10, decimalPrecision: 0,
    });
  }
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Maria", number: 1 });
  await t.withIdentity(aliceIdentity).mutation(api.contestants.add, { orgSlug: "acme", eventSlug: "gala", name: "Nina", number: 2 });
  for (const identity of [bobIdentity, carolIdentity]) {
    await t.withIdentity(aliceIdentity).mutation(api.invitations.create, { orgSlug: "acme", email: identity.email, roleName: "Judge" });
    const pending = await t.withIdentity(identity).query(api.invitations.listForUser, {});
    await t.withIdentity(identity).mutation(api.invitations.accept, { token: pending[0].token });
  }
  const members = await t.withIdentity(aliceIdentity).query(api.members.list, { orgSlug: "acme" });
  const bobId = members.find((m: { email: string }) => m.email === "bob@example.com")!.userId;
  const carolId = members.find((m: { email: string }) => m.email === "carol@example.com")!.userId;
  for (const userId of [bobId, carolId]) {
    await t.withIdentity(aliceIdentity).mutation(api.judges.add, { orgSlug: "acme", eventSlug: "gala", userId });
  }
  const judges = await t.withIdentity(aliceIdentity).query(api.judges.listWithAssignments, { orgSlug: "acme", eventSlug: "gala" });
  for (const judge of judges) {
    await t.withIdentity(aliceIdentity).mutation(api.judges.addAssignment, { orgSlug: "acme", eventSlug: "gala", judgeId: judge._id });
  }
  await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.publish, { orgSlug: "acme", eventSlug: "gala" });
  const after = await t.withIdentity(aliceIdentity).query(api.rounds.list, { orgSlug: "acme", eventSlug: "gala" });
  const contestants = await t.withIdentity(aliceIdentity).query(api.contestants.list, { orgSlug: "acme", eventSlug: "gala" });
  const orderedContestants = [...contestants].sort((a, b) => a.number - b.number);
  return {
    roundId,
    criterionIds: after[0].criteria.map((c: { _id: string }) => c._id),
    contestantIds: orderedContestants.map((k: { _id: string }) => k._id),
    judgeIds: {
      bob: judges.find((j: { userId: string }) => j.userId === bobId)!._id,
      carol: judges.find((j: { userId: string }) => j.userId === carolId)!._id,
    },
  };
}
```

- [ ] **Step 2: Write the failing tests** — `convex-test/scoringEntry.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, carolIdentity, prepareScoredEvent, setupTest } from "./setup";

async function bobSheets(t: ReturnType<typeof setupTest>) {
  const mine = await t.withIdentity(bobIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
  return mine.rounds[0].sheets;
}

describe("score entry", () => {
  it("judge sees only their own sheets", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);
    const bobList = await bobSheets(t);
    const carolMine = await t.withIdentity(carolIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
    expect(bobList.length).toBe(2);
    expect(carolMine.rounds[0].sheets.length).toBe(2);
    expect(new Set([...bobList, ...carolMine.rounds[0].sheets].map((s) => s.sheetId)).size).toBe(4);
  });

  it("saves a draft and marks in_progress", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
      draftValues: { [ids.criterionIds[0]]: 7 },
    });
    const detail = await t.withIdentity(bobIdentity).query(api.scoring.sheetDetail, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, contestantId: sheets[0].contestantId,
    });
    expect(detail.sheet?.status).toBe("in_progress");
    expect(detail.sheet?.draftValues?.[ids.criterionIds[0]]).toBe(7);
  });

  it("rejects out-of-range drafts", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
        draftValues: { [ids.criterionIds[0]]: 11 },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("submits a complete sheet immutably", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await t.withIdentity(bobIdentity).mutation(api.scoring.submitSheet, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
      values: { [ids.criterionIds[0]]: 8, [ids.criterionIds[1]]: 6 },
    });
    const detail = await t.withIdentity(bobIdentity).query(api.scoring.sheetDetail, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, contestantId: sheets[0].contestantId,
    });
    expect(detail.sheet?.status).toBe("submitted");
    expect(detail.sheet?.draftValues).toBeUndefined();
    const scoreRows = await t.run(async (q) =>
      (await q.db.query("scores").withIndex("by_sheet_id", (sq) => sq.eq("sheetId", sheets[0].sheetId)).collect()).length,
    );
    expect(scoreRows).toBe(2);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.submitSheet, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
        values: { [ids.criterionIds[0]]: 1, [ids.criterionIds[1]]: 1 },
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId, draftValues: {},
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("incomplete submit is rejected", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.submitSheet, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId,
        values: { [ids.criterionIds[0]]: 8 },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("judges cannot touch each other's sheets", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const carolMine = await t.withIdentity(carolIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
    const carolSheet = carolMine.rounds[0].sheets[0].sheetId;
    await expect(
      t.withIdentity(bobIdentity).mutation(api.scoring.saveDraft, {
        orgSlug: "acme", eventSlug: "gala", sheetId: carolSheet,
        draftValues: { [ids.criterionIds[0]]: 5 },
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("non-judges and unauthenticated are refused", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);
    const sheets = await bobSheets(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.scoring.saveDraft, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId, draftValues: {},
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.mutation(api.scoring.saveDraft, { orgSlug: "acme", eventSlug: "gala", sheetId: sheets[0].sheetId, draftValues: {} }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });
});
```

- [ ] **Step 3: Run** → FAIL (`api.scoring` missing).

- [ ] **Step 4: Implement `convex/lib/eventAuthz.ts` additions**

```ts
export async function requireReadyEvent(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string; permission: string },
): Promise<EventAuthCtx> {
  const eactx = await requireEventPermission(ctx, args);
  if (eactx.event.status !== "ready") {
    throw appError(ErrorCode.CONFLICT, "Event is not in scoring state");
  }
  return eactx;
}

export async function requireJudgeRow(ctx: QueryCtx, eactx: EventAuthCtx): Promise<Doc<"judges">> {
  const judge = await ctx.db
    .query("judges")
    .withIndex("by_event_id_and_user_id", (q) => q.eq("eventId", eactx.event._id).eq("userId", eactx.user._id))
    .unique();
  if (!judge) throw appError(ErrorCode.NOT_FOUND, "No judge record for this event");
  return judge;
}

export async function loadRound(
  ctx: QueryCtx,
  eactx: EventAuthCtx,
  roundId: Id<"rounds">,
): Promise<Doc<"rounds">> {
  const round = await ctx.db.get(roundId);
  if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
  return round;
}
```

Add `Id` to the existing `import type { Doc } from "../_generated/dataModel";` line (it becomes `import type { Doc, Id } from "../_generated/dataModel";`).

- [ ] **Step 5: Implement `convex/scoring.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { loadRound, requireEventPermission, requireJudgeRow, requireReadyEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

function checkValue(criterion: Doc<"criteria">, value: number): string | null {
  if (value < criterion.minScore || value > criterion.maxScore) {
    return `${criterion.name} must be between ${criterion.minScore} and ${criterion.maxScore}`;
  }
  const factor = 10 ** criterion.decimalPrecision;
  if (Math.abs(value * factor - Math.round(value * factor)) > 1e-9) {
    return `${criterion.name} allows ${criterion.decimalPrecision} decimal(s)`;
  }
  return null;
}

async function loadOwnSheet(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string; sheetId: Id<"scoreSheets"> },
) {
  const eactx = await requireReadyEvent(ctx, {
    orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.enter",
  });
  const judge = await requireJudgeRow(ctx, eactx);
  const sheet = await ctx.db.get(args.sheetId);
  if (!sheet || sheet.eventId !== eactx.event._id || sheet.judgeId !== judge._id) {
    throw appError(ErrorCode.NOT_FOUND, "Score sheet not found");
  }
  const round = await loadRound(ctx, eactx, sheet.roundId);
  if (round.status !== "open") {
    throw appError(ErrorCode.CONFLICT, "Round is not open for scoring");
  }
  return { eactx, judge, sheet, round };
}

export const myAssignments = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.enter",
    });
    const judge = await ctx.db
      .query("judges")
      .withIndex("by_event_id_and_user_id", (q) => q.eq("eventId", eactx.event._id).eq("userId", eactx.user._id))
      .unique();
    if (!judge) return { judgeId: null, rounds: [] };
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const out: {
      roundId: Id<"rounds">;
      name: string;
      order: number;
      status: string;
      sheets: { sheetId: Id<"scoreSheets">; contestantId: Id<"contestants">; contestantName: string; contestantNumber: number; status: string }[];
    }[] = [];
    for (const round of [...rounds].sort((a, b) => a.order - b.order)) {
      const sheets = await ctx.db
        .query("scoreSheets")
        .withIndex("by_judge_id_and_round_id", (q) => q.eq("judgeId", judge._id).eq("roundId", round._id))
        .collect();
      out.push({
        roundId: round._id,
        name: round.name,
        order: round.order,
        status: round.status,
        sheets: sheets.map((s) => {
          const contestant = contestants.find((k) => k._id === s.contestantId);
          return {
            sheetId: s._id,
            contestantId: s.contestantId,
            contestantName: contestant?.name ?? "",
            contestantNumber: contestant?.number ?? 0,
            status: s.status,
          };
        }),
      });
    }
    return { judgeId: judge._id, rounds: out };
  },
});

export const sheetDetail = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), contestantId: v.id("contestants") },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.enter",
    });
    const judge = await requireJudgeRow(ctx, eactx);
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id_and_contestant_id", (q) =>
        q.eq("eventId", eactx.event._id).eq("roundId", args.roundId).eq("contestantId", args.contestantId))
      .collect();
    const sheet = sheets.find((s) => s.judgeId === judge._id) ?? null;
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    const contestant = await ctx.db.get(args.contestantId);
    return { sheet, criteria: [...criteria].sort((a, b) => a.order - b.order), contestant };
  },
});

export const saveDraft = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), sheetId: v.id("scoreSheets"),
    draftValues: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const { sheet, round } = await loadOwnSheet(ctx, args);
    if (sheet.status !== "not_started" && sheet.status !== "in_progress") {
      throw appError(ErrorCode.CONFLICT, "Score sheet is already submitted");
    }
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    for (const [criterionId, value] of Object.entries(args.draftValues)) {
      const criterion = criteria.find((c) => c._id === criterionId);
      if (!criterion) throw appError(ErrorCode.VALIDATION_ERROR, "Unknown criterion in draft");
      const problem = checkValue(criterion, value);
      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
    }
    await ctx.db.patch(args.sheetId, { status: "in_progress", draftValues: args.draftValues });
  },
});

export const submitSheet = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), sheetId: v.id("scoreSheets"),
    values: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const { eactx, judge, sheet, round } = await loadOwnSheet(ctx, args);
    if (sheet.status !== "not_started" && sheet.status !== "in_progress") {
      throw appError(ErrorCode.CONFLICT, "Score sheet is already submitted");
    }
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    const assignments = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_judge_id", (q) => q.eq("judgeId", judge._id))
      .collect();
    const scoped = assignments.filter((a) => a.roundId === undefined || a.roundId === round._id);
    const scopedCriterionIds = scoped
      .filter((a) => a.criterionId !== undefined)
      .map((a) => a.criterionId!);
    const required = scopedCriterionIds.length > 0
      ? criteria.filter((c) => scopedCriterionIds.includes(c._id))
      : criteria;
    for (const criterion of required) {
      const value = args.values[criterion._id];
      if (value === undefined) {
        throw appError(ErrorCode.VALIDATION_ERROR, `${criterion.name} is missing`);
      }
      const problem = checkValue(criterion, value);
      if (problem) throw appError(ErrorCode.VALIDATION_ERROR, problem);
    }
    const now = Date.now();
    for (const criterion of required) {
      await ctx.db.insert("scores", {
        sheetId: sheet._id,
        eventId: eactx.event._id,
        roundId: round._id,
        judgeId: judge._id,
        contestantId: sheet.contestantId,
        criterionId: criterion._id,
        value: args.values[criterion._id],
        submittedAt: now,
        submittedById: eactx.user._id,
      });
    }
    await ctx.db.patch(sheet._id, { status: "submitted", draftValues: undefined });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "score.submitted",
      resourceType: "scoreSheet", resourceId: sheet._id,
      after: { roundId: round._id, contestantId: sheet.contestantId, criteria: required.length },
    });
  },
});
```

Note: draft saves are deliberately NOT audited (high-churn autosave would flood `auditLogs`); submission is.

- [ ] **Step 6: Run** `npx vitest run convex-test/scoringEntry.test.ts` → PASS. Full gate.

- [ ] **Step 7: Commit** — `git commit -m "feat: judge score entry with drafts and immutable submits"`

---

## Task 9: Round lifecycle & monitor

**Files:**
- Create: `convex/roundAdmin.ts`
- Test: `convex-test/roundLifecycle3.test.ts`

**Interfaces:**
- Produces (`convex/roundAdmin.ts`): `roundMonitor` query `{ orgSlug, eventSlug, roundId }` → `{ roundStatus, judges: { judgeId, name }[], contestants: { contestantId, name, number }[], sheets: { judgeId, contestantId, status }[] }` — statuses only, never values; `closeRound` and `reopenRound` mutations `{ orgSlug, eventSlug, roundId }` (`score.manage`, ready events, audited `round.closed`/`round.reopened`).

- [ ] **Step 1: Write the failing tests** — `convex-test/roundLifecycle3.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, carolIdentity, prepareScoredEvent, setupTest } from "./setup";

async function submitJudgeScores(
  t: ReturnType<typeof setupTest>,
  identity: typeof bobIdentity,
  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
  perContestant: number[][],
) {
  const mine = await t.withIdentity(identity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
  const sheets = [...mine.rounds[0].sheets].sort(
    (a, b) => a.contestantNumber - b.contestantNumber,
  );
  for (const [i, sheet] of sheets.entries()) {
    await t.withIdentity(identity).mutation(api.scoring.submitSheet, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId,
      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
    });
  }
}

describe("round lifecycle", () => {
  it("monitor shows statuses without any score payload", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    const monitor = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundMonitor, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(monitor.roundStatus).toBe("open");
    expect(monitor.sheets.length).toBe(4);
    expect(monitor.sheets.filter((s: { status: string }) => s.status === "submitted").length).toBe(2);
    expect(JSON.stringify(monitor)).not.toContain("draftValues");
    expect(JSON.stringify(monitor)).not.toContain("value");
  });

  it("closing blocks submits; reopening re-allows them", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    const carolMine = await t.withIdentity(carolIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
    const sheet = carolMine.rounds[0].sheets[0];
    const values = Object.fromEntries(ids.criterionIds.map((id) => [id, 7]));
    await expect(
      t.withIdentity(carolIdentity).mutation(api.scoring.submitSheet, {
        orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId, values,
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    await t.withIdentity(carolIdentity).mutation(api.scoring.submitSheet, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId, values,
    });
  });

  it("only score.manage holders run the round lifecycle", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
    await expect(
      t.withIdentity(aliceIdentity).query(api.roundAdmin.roundMonitor, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId + "0000" }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("closing twice conflicts; reopening an open round conflicts", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
```

(The `+ "0000"` in the third test mangles the id into a nonexistent one — if convex-test rejects malformed ids before the handler runs, assert `NOT_FOUND` by inserting a round id from a different event instead; use the cross-event round created via a second `prepareScoredEvent` on another org slug if needed. Prefer the simpler reliable route: create a second org/event, take its roundId, and expect `NOT_FOUND`.)

- [ ] **Step 2: Run** → FAIL (`api.roundAdmin` missing).

- [ ] **Step 3: Implement `convex/roundAdmin.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { loadRound, requireReadyEvent } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";

export const roundMonitor = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    const judges = await ctx.db
      .query("judges")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id", (q) =>
        q.eq("eventId", eactx.event._id).eq("roundId", round._id))
      .collect();
    const judgesOut: { judgeId: Id<"judges">; name: string }[] = [];
    for (const j of judges) {
      const user = await ctx.db.get(j.userId);
      judgesOut.push({ judgeId: j._id, name: user?.name ?? "" });
    }
    return {
      roundStatus: round.status,
      judges: judgesOut,
      contestants: contestants.map((k) => ({ contestantId: k._id, name: k.name, number: k.number })),
      sheets: sheets.map((s) => ({ judgeId: s.judgeId, contestantId: s.contestantId, status: s.status })),
    };
  },
});

export const closeRound = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "open") {
      throw appError(ErrorCode.CONFLICT, "Only open rounds can be closed");
    }
    await ctx.db.patch(round._id, { status: "closed" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.closed",
      resourceType: "round", resourceId: round._id,
      before: { status: "open" }, after: { status: "closed" },
    });
  },
});

export const reopenRound = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Only closed rounds can be reopened");
    }
    await ctx.db.patch(round._id, { status: "open" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.reopened",
      resourceType: "round", resourceId: round._id,
      before: { status: "closed" }, after: { status: "open" },
    });
  },
});
```

- [ ] **Step 4: Run** `npx vitest run convex-test/roundLifecycle3.test.ts` → PASS. Full gate.

- [ ] **Step 5: Commit** — `git commit -m "feat: round close/reopen lifecycle and blackout monitor"`

---

## Task 10: Review & decisions

**Files:**
- Create: `convex/lib/roundCompute.ts`
- Modify: `convex/roundAdmin.ts` (append), `convex/lib/errors.ts`
- Test: `convex-test/reviewDecisions.test.ts`

**Interfaces:**
- Produces (`convex/lib/errors.ts`): new code `TIES_UNRESOLVED: "TIES_UNRESOLVED"` in `ErrorCode`.
- Produces (`convex/lib/roundCompute.ts`): `loadRoundCompute(ctx: QueryCtx, eactx: EventAuthCtx, roundId: Id<"rounds">, extraOverrides?: AdvancementOverrideRow[]): Promise<RoundComputeResult>` where

```ts
type RoundComputeResult = {
  round: Doc<"rounds">;
  standings: StandingRow[];
  unresolvedTies: UnresolvedTie[];
  advancement: Map<Id<"contestants">, boolean | null>;
  advancementConfig: AdvancementConfig;
  judgeParticipation: { judgeId: Id<"judges">; sheetsSubmitted: number; sheetsTotal: number }[];
  tieBreaks: Doc<"tieBreaks">[];
  overrides: Doc<"advancementOverrides">[];
};
buildSnapshot(result: RoundComputeResult, now: number, decimalPrecision: number): <snapshot literal matching the resultVersions schema>
```

- Produces (`convex/roundAdmin.ts`): `roundReview` query (closed rounds only → `CONFLICT` otherwise) returning `{ round, eliminationEnabled, standings (with contestantName + advancement), unresolvedTies (with names), tieBreaks, overrides }`; mutations `addTieBreak { orgSlug, eventSlug, roundId, tiedContestantIds, orderedIds }`, `removeTieBreak { ..., tieBreakId }`, `addAdvancementOverride { ..., roundId, contestantId, action }`, `removeAdvancementOverride { ..., overrideId }` — all `score.manage`, round must be `closed`, audited.

- [ ] **Step 1: Write the failing tests** — `convex-test/reviewDecisions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, carolIdentity, prepareScoredEvent, setupTest } from "./setup";

async function submitJudgeScores(
  t: ReturnType<typeof setupTest>,
  identity: typeof bobIdentity,
  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
  perContestant: number[][],
) {
  const mine = await t.withIdentity(identity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
  const sheets = [...mine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
  for (const [i, sheet] of sheets.entries()) {
    await t.withIdentity(identity).mutation(api.scoring.submitSheet, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId,
      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
    });
  }
}

async function closeRound(t: ReturnType<typeof setupTest>, roundId: string) {
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId });
}

describe("review & decisions", () => {
  it("review refuses while the round is open, works when closed", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await expect(
      t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await closeRound(t, ids.roundId);
    const review = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    const maria = review.standings.find((s: { contestantName: string }) => s.contestantName === "Maria")!;
    const nina = review.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")!;
    expect(maria.rank).toBe(1);
    expect(maria.roundScore).toBe(77);
    expect(nina.rank).toBe(2);
    expect(nina.roundScore).toBe(50);
    expect(review.unresolvedTies).toEqual([]);
  });

  it("review requires score.manage", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await closeRound(t, ids.roundId);
    await expect(
      t.withIdentity(bobIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("identical scores surface an unresolved tie; a manual break resolves it", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[7, 7], [7, 7]]);
    await submitJudgeScores(t, carolIdentity, ids, [[7, 7], [7, 7]]);
    await closeRound(t, ids.roundId);
    const before = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(before.unresolvedTies.length).toBe(1);
    expect(before.unresolvedTies[0].names.sort()).toEqual(["Maria", "Nina"]);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
    });
    const after = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(after.unresolvedTies).toEqual([]);
    expect(after.standings.find((s: { contestantName: string }) => s.contestantName === "Maria")?.rank).toBe(1);
    expect(after.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.rank).toBe(2);
    expect(after.tieBreaks.length).toBe(1);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.removeTieBreak, {
      orgSlug: "acme", eventSlug: "gala", tieBreakId: after.tieBreaks[0]._id,
    });
    const reverted = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(reverted.unresolvedTies.length).toBe(1);
  });

  it("tie breaks validate the window and the permutation", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
        tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await closeRound(t, ids.roundId);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
        tiedContestantIds: ids.contestantIds, orderedIds: [ids.contestantIds[0]],
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("advancement preview honors top_count and overrides", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t, {
      qualifiesToNextRound: true,
      advancement: { mode: "top_count", count: 1, allowOverride: true },
    });
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await closeRound(t, ids.roundId);
    const review = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(review.standings.find((s: { contestantName: string }) => s.contestantName === "Maria")?.advancement).toBe(true);
    expect(review.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.advancement).toBe(false);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      contestantId: ids.contestantIds[1], action: "force_advance",
    });
    const overridden = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(overridden.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.advancement).toBe(true);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.removeAdvancementOverride, {
      orgSlug: "acme", eventSlug: "gala", overrideId: overridden.overrides[0]._id,
    });
    const reverted = await t.withIdentity(aliceIdentity).query(api.roundAdmin.roundReview, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    expect(reverted.standings.find((s: { contestantName: string }) => s.contestantName === "Nina")?.advancement).toBe(false);
  });

  it("overrides are refused when not allowed or elimination is off", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t, {
      qualifiesToNextRound: true,
      advancement: { mode: "top_count", count: 1, allowOverride: false },
    });
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await closeRound(t, ids.roundId);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
        contestantId: ids.contestantIds[0], action: "force_advance",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    const t2 = setupTest();
    const ids2 = await prepareScoredEvent(t2, {
      eliminationEnabled: false,
      qualifiesToNextRound: true,
      advancement: { mode: "top_count", count: 1, allowOverride: true },
    });
    await submitJudgeScores(t2, bobIdentity, ids2, [[8, 6], [5, 5]]);
    await closeRound(t2, ids2.roundId);
    await expect(
      t2.withIdentity(aliceIdentity).mutation(api.roundAdmin.addAdvancementOverride, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids2.roundId,
        contestantId: ids2.contestantIds[0], action: "force_advance",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});
```

(Add `eliminationEnabled?: boolean` to `ScoredEventOpts` in `setup.ts` alongside `dropHLow` — wire it into the `events.update` call as `eliminationEnabled: opts.eliminationEnabled`.)

- [ ] **Step 2: Run** → FAIL (`roundReview`, tie/override mutations missing).

- [ ] **Step 3: Implement**

`convex/lib/errors.ts` — add to `ErrorCode`:

```ts
  TIES_UNRESOLVED: "TIES_UNRESOLVED",
```

`convex/lib/roundCompute.ts` — new file:

```ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { loadRound, type EventAuthCtx } from "./eventAuthz";
import {
  applyAdvancement, computeRoundStandings,
  type AdvancementConfig, type AdvancementOverrideRow, type CoreContestant, type CoreCriterion,
  type CoreScoreRow, type RoundComputeInput, type StandingRow, type UnresolvedTie,
} from "./tabulation";

export type RoundComputeResult = {
  round: Doc<"rounds">;
  standings: StandingRow[];
  unresolvedTies: UnresolvedTie[];
  advancement: Map<Id<"contestants">, boolean | null>;
  advancementConfig: AdvancementConfig;
  judgeParticipation: { judgeId: Id<"judges">; sheetsSubmitted: number; sheetsTotal: number }[];
  tieBreaks: Doc<"tieBreaks">[];
  overrides: Doc<"advancementOverrides">[];
};

export async function loadRoundCompute(
  ctx: QueryCtx,
  eactx: EventAuthCtx,
  roundId: Id<"rounds">,
  extraOverrides: AdvancementOverrideRow[] = [],
): Promise<RoundComputeResult> {
  const round = await loadRound(ctx, eactx, roundId);
  const criteriaDocs = await ctx.db
    .query("criteria")
    .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
    .collect();
  const contestants = await ctx.db
    .query("contestants")
    .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
    .collect();
  const sheets = await ctx.db
    .query("scoreSheets")
    .withIndex("by_event_id_and_round_id", (q) =>
      q.eq("eventId", eactx.event._id).eq("roundId", round._id))
    .collect();
  const scoreDocs = await ctx.db
    .query("scores")
    .withIndex("by_event_id_and_round_id", (q) =>
      q.eq("eventId", eactx.event._id).eq("roundId", round._id))
    .collect();
  const judges = await ctx.db
    .query("judges")
    .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
    .collect();
  const tieBreaks = await ctx.db
    .query("tieBreaks")
    .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
    .collect();
  const overrideDocs = await ctx.db
    .query("advancementOverrides")
    .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
    .collect();

  const criteria: CoreCriterion[] = criteriaDocs.map((c) => ({
    id: c._id, weight: c.weight, minScore: c.minScore, maxScore: c.maxScore,
  }));
  const coreContestants: CoreContestant[] = contestants.map((k) => ({
    id: k._id, categoryId: k.categoryId, status: k.status,
  }));
  const scores: CoreScoreRow[] = scoreDocs.map((s) => ({
    judgeId: s.judgeId, contestantId: s.contestantId, criterionId: s.criterionId, value: s.value,
  }));
  const input: RoundComputeInput = {
    winner: round.scoringRules?.winner ?? "highest",
    dropHighLow: eactx.event.scoringRules.dropHighLow,
    decimalPrecision: eactx.event.decimalPrecision,
    criteria,
    contestants: coreContestants,
    scores,
    manualTieBreaks: tieBreaks.map((b) => ({
      tiedContestantIds: b.tiedContestantIds, orderedIds: b.orderedIds,
    })),
  };
  const { standings, unresolvedTies } = computeRoundStandings(input);
  const advancementConfig: AdvancementConfig = {
    enabled:
      eactx.event.eliminationEnabled &&
      round.qualifiesToNextRound &&
      round.advancement.mode !== "none",
    mode: round.advancement.mode,
    count: round.advancement.count ?? null,
    percent: round.advancement.percent ?? null,
    allowOverride: round.advancement.allowOverride,
  };
  const overrides: AdvancementOverrideRow[] = [
    ...overrideDocs.map((o) => ({ contestantId: o.contestantId, action: o.action })),
    ...extraOverrides,
  ];
  const advancement = applyAdvancement(standings, advancementConfig, overrides);
  const judgeParticipation = judges.map((j) => {
    const own = sheets.filter((s) => s.judgeId === j._id);
    return {
      judgeId: j._id,
      sheetsSubmitted: own.filter((s) => s.status === "submitted" || s.status === "locked").length,
      sheetsTotal: own.length,
    };
  });
  return {
    round, standings, unresolvedTies, advancement, advancementConfig,
    judgeParticipation, tieBreaks, overrides: overrideDocs,
  };
}

export function buildSnapshot(result: RoundComputeResult, now: number, decimalPrecision: number) {
  const categoryIds = [...new Set(result.standings.map((s) => s.categoryId))].sort();
  return {
    computedAt: now,
    decimalPrecision,
    categories: categoryIds.map((categoryId) => ({
      categoryId,
      standings: result.standings
        .filter((s) => s.categoryId === categoryId)
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.contestantId < b.contestantId ? -1 : 1))
        .map((s) => ({
          contestantId: s.contestantId,
          status: s.status,
          rank: s.rank,
          roundScore: s.roundScore,
          criterionScores: s.criterionScores.map((cs) => ({
            criterionId: cs.criterionId, avgRaw: cs.avgRaw, contribution: cs.contribution, dropped: cs.dropped,
          })),
          tieResolvedBy: s.tieResolvedBy,
          advanced: result.advancement.get(s.contestantId) ?? null,
        })),
    })),
    judgeParticipation: result.judgeParticipation,
    decisions: {
      tieBreaks: result.tieBreaks.map((b) => ({
        tiedContestantIds: b.tiedContestantIds, orderedIds: b.orderedIds, createdById: b.createdById,
      })),
      advancementOverrides: result.overrides.map((o) => ({
        contestantId: o.contestantId, action: o.action, createdById: o.createdById,
      })),
    },
  };
}
```

`convex/roundAdmin.ts` — append:

```ts
import { loadRoundCompute } from "./lib/roundCompute";

export const roundReview = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const result = await loadRoundCompute(ctx, eactx, args.roundId);
    if (result.round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Close the round before review");
    }
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const nameOf = (id: Id<"contestants">) => contestants.find((k) => k._id === id)?.name ?? "";
    return {
      round: {
        name: result.round.name,
        status: result.round.status,
        advancement: result.round.advancement,
        qualifiesToNextRound: result.round.qualifiesToNextRound,
      },
      eliminationEnabled: eactx.event.eliminationEnabled,
      standings: result.standings.map((s) => ({
        contestantId: s.contestantId,
        contestantName: nameOf(s.contestantId),
        categoryId: s.categoryId,
        status: s.status,
        roundScore: s.roundScore,
        criterionScores: s.criterionScores,
        rank: s.rank,
        tieResolvedBy: s.tieResolvedBy,
        advancement: result.advancement.get(s.contestantId) ?? null,
      })),
      unresolvedTies: result.unresolvedTies.map((u) => ({
        categoryId: u.categoryId,
        contestantIds: u.contestantIds,
        names: u.contestantIds.map(nameOf),
      })),
      tieBreaks: result.tieBreaks,
      overrides: result.overrides,
    };
  },
});

export const addTieBreak = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"),
    tiedContestantIds: v.array(v.id("contestants")),
    orderedIds: v.array(v.id("contestants")),
  },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Tie breaks are only allowed on closed rounds");
    }
    const tied = [...new Set(args.tiedContestantIds)];
    if (tied.length < 2 || tied.length !== args.orderedIds.length || tied.length !== args.tiedContestantIds.length) {
      throw appError(ErrorCode.VALIDATION_ERROR, "A tie break needs at least 2 distinct contestants and a full ordering");
    }
    const ordered = [...new Set(args.orderedIds)];
    if (ordered.length !== tied.length || tied.some((id) => !ordered.includes(id))) {
      throw appError(ErrorCode.VALIDATION_ERROR, "orderedIds must be a permutation of tiedContestantIds");
    }
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    if (tied.some((id) => !contestants.some((k) => k._id === id))) {
      throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    }
    const id = await ctx.db.insert("tieBreaks", {
      eventId: eactx.event._id,
      roundId: round._id,
      tiedContestantIds: tied,
      orderedIds: args.orderedIds,
      createdById: eactx.user._id,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.tiebreak.added",
      resourceType: "tieBreak", resourceId: id, after: { roundId: round._id, contestants: tied.length },
    });
  },
});

export const removeTieBreak = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), tieBreakId: v.id("tieBreaks") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const tieBreak = await ctx.db.get(args.tieBreakId);
    if (!tieBreak || tieBreak.eventId !== eactx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Tie break not found");
    }
    const round = await loadRound(ctx, eactx, tieBreak.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Tie breaks are only editable on closed rounds");
    }
    await ctx.db.delete(args.tieBreakId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.tiebreak.removed",
      resourceType: "tieBreak", resourceId: args.tieBreakId,
    });
  },
});

export const addAdvancementOverride = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"),
    contestantId: v.id("contestants"),
    action: v.union(v.literal("force_advance"), v.literal("force_cut")),
  },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const round = await loadRound(ctx, eactx, args.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Overrides are only allowed on closed rounds");
    }
    if (!round.advancement.allowOverride) {
      throw appError(ErrorCode.VALIDATION_ERROR, "This round does not allow advancement overrides");
    }
    if (
      !eactx.event.eliminationEnabled ||
      !round.qualifiesToNextRound ||
      round.advancement.mode === "none"
    ) {
      throw appError(ErrorCode.VALIDATION_ERROR, "This round has no active advancement rule");
    }
    const contestant = await ctx.db.get(args.contestantId);
    if (!contestant || contestant.eventId !== eactx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
    }
    const existing = await ctx.db
      .query("advancementOverrides")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    if (existing.some((o) => o.contestantId === args.contestantId)) {
      throw appError(ErrorCode.CONFLICT, "An override already exists for this contestant");
    }
    const id = await ctx.db.insert("advancementOverrides", {
      eventId: eactx.event._id,
      roundId: round._id,
      contestantId: args.contestantId,
      action: args.action,
      createdById: eactx.user._id,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.advancement_override.added",
      resourceType: "advancementOverride", resourceId: id,
      after: { roundId: round._id, contestantId: args.contestantId, action: args.action },
    });
  },
});

export const removeAdvancementOverride = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), overrideId: v.id("advancementOverrides") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const override = await ctx.db.get(args.overrideId);
    if (!override || override.eventId !== eactx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Override not found");
    }
    const round = await loadRound(ctx, eactx, override.roundId);
    if (round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Overrides are only editable on closed rounds");
    }
    await ctx.db.delete(args.overrideId);
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.advancement_override.removed",
      resourceType: "advancementOverride", resourceId: args.overrideId,
    });
  },
});
```

(Merge the `loadRoundCompute` import into the file's existing import block.)

- [ ] **Step 4: Run** `npx vitest run convex-test/reviewDecisions.test.ts` → PASS. Full gate.

- [ ] **Step 5: Commit** — `git commit -m "feat: closed-round review with tie breaks and advancement overrides"`

---

## Task 11: Publish, results, corrections, finalize

**Files:**
- Modify: `convex/roundAdmin.ts` (append `publishRound`, `correctResults`)
- Create: `convex/results.ts`
- Test: `convex-test/publishResults.test.ts`

**Interfaces:**
- Produces (`convex/roundAdmin.ts`): `publishRound { orgSlug, eventSlug, roundId }` — closed → compute → `TIES_UNRESOLVED` on unresolved ties → insert `resultVersions` (next version, no reason) → round `published` (terminal) → audit `round.published`; `correctResults { orgSlug, eventSlug, roundId, reason: string, overrides?: { contestantId, action }[] }` — round `published`, event `ready` (refused once `finalized` via `requireReadyEvent`), non-empty trimmed reason, recompute with extra overrides, insert next version with reason, audit `round.corrected`.
- Produces (`convex/results.ts`): `roundResults { orgSlug, eventSlug, roundId, version?: number }` → `{ version, reason, createdAt, snapshot }` (latest or specified; visibility-gated); `listRoundVersions { orgSlug, eventSlug, roundId }` → `{ version, createdAt, reason }[]` desc; `eventResults { orgSlug, eventSlug }` → `{ rounds: { roundId, name, order, weight, version, standings }[], final: { contestantId, contestantName, categoryId, totalScore, eliminatedInRoundOrder, rank }[] }` (published rounds only, `computeEventFinal` over their latest versions); `finalizeEvent { orgSlug, eventSlug }` (`score.manage`, ready, all rounds published) → status `finalized`, audit `event.finalized`.
- Visibility gate (all results reads): `result.view` permission AND if `event.resultVisibility === "private"` also `score.manage`; else `FORBIDDEN`.

- [ ] **Step 1: Write the failing tests** — `convex-test/publishResults.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, carolIdentity, prepareScoredEvent, setupTest } from "./setup";

async function submitJudgeScores(
  t: ReturnType<typeof setupTest>,
  identity: typeof bobIdentity,
  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
  perContestant: number[][],
) {
  const mine = await t.withIdentity(identity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
  const sheets = [...mine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
  for (const [i, sheet] of sheets.entries()) {
    await t.withIdentity(identity).mutation(api.scoring.submitSheet, {
      orgSlug: "acme", eventSlug: "gala", sheetId: sheet.sheetId,
      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
    });
  }
}

async function closeAndPublish(t: ReturnType<typeof setupTest>, roundId: string) {
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId });
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId });
}

describe("publish, results, corrections, finalize", () => {
  it("publish is blocked by unresolved ties, then succeeds after a manual break", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[7, 7], [7, 7]]);
    await submitJudgeScores(t, carolIdentity, ids, [[7, 7], [7, 7]]);
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "TIES_UNRESOLVED" } });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.addTieBreak, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      tiedContestantIds: ids.contestantIds, orderedIds: ids.contestantIds,
    });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId });
    const result = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(result.version).toBe(1);
    expect(result.reason).toBeUndefined();
    const maria = result.snapshot.categories[0].standings.find(
      (s: { contestantId: string }) => s.contestantId === ids.contestantIds[0],
    )!;
    expect(maria.rank).toBe(1);
    expect(maria.roundScore).toBe(70);
  });

  it("private results are for score.manage holders only; organization visibility opens them up", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    await expect(
      t.withIdentity(bobIdentity).query(api.results.roundResults, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    const t2 = setupTest();
    const ids2 = await prepareScoredEvent(t2, { resultVisibility: "organization" });
    await submitJudgeScores(t2, bobIdentity, ids2, [[8, 6], [5, 5]]);
    await submitJudgeScores(t2, carolIdentity, ids2, [[9, 7], [5, 5]]);
    await closeAndPublish(t2, ids2.roundId);
    const asJudge = await t2.withIdentity(bobIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids2.roundId,
    });
    expect(asJudge.snapshot.categories[0].standings.length).toBe(2);
  });

  it("corrections create version 2; finalization locks the event", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "  ",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "clerical verification",
    });
    const versions = await t.withIdentity(aliceIdentity).query(api.results.listRoundVersions, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const latest = await t.withIdentity(aliceIdentity).query(api.results.roundResults, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
    });
    expect(latest.version).toBe(2);
    expect(latest.reason).toBe("clerical verification");
    await t.withIdentity(aliceIdentity).mutation(api.results.finalizeEvent, { orgSlug: "acme", eventSlug: "gala" });
    const ev = await t.withIdentity(aliceIdentity).query(api.events.get, { orgSlug: "acme", eventSlug: "gala" });
    expect(ev?.status).toBe("finalized");
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.correctResults, {
        orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId, reason: "too late",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t.withIdentity(aliceIdentity).mutation(api.eventLifecycle.archive, { orgSlug: "acme", eventSlug: "gala" });
  });

  it("publish requires the round to be closed; scoring stops after publish", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    const mine = await t.withIdentity(bobIdentity).query(api.scoring.myAssignments, { orgSlug: "acme", eventSlug: "gala" });
    expect(mine.rounds[0].status).toBe("published");
  });

  it("eventResults computes weighted final standings", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await submitJudgeScores(t, bobIdentity, ids, [[8, 6], [5, 5]]);
    await submitJudgeScores(t, carolIdentity, ids, [[9, 7], [5, 5]]);
    await closeAndPublish(t, ids.roundId);
    const results = await t.withIdentity(aliceIdentity).query(api.results.eventResults, {
      orgSlug: "acme", eventSlug: "gala",
    });
    expect(results.rounds.length).toBe(1);
    expect(results.rounds[0].weight).toBe(100);
    expect(results.final.map((f: { contestantName: string }) => f.contestantName)).toEqual(["Maria", "Nina"]);
    expect(results.final[0].totalScore).toBe(77);
    expect(results.final[0].rank).toBe(1);
  });

  it("finalize requires every round published", async () => {
    const t = setupTest();
    await prepareScoredEvent(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.results.finalizeEvent, { orgSlug: "acme", eventSlug: "gala" }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});
```

- [ ] **Step 2: Run** → FAIL (`api.roundAdmin.publishRound`, `api.results` missing).

- [ ] **Step 3: Implement `publishRound` + `correctResults`** — append to `convex/roundAdmin.ts`

```ts
import { buildSnapshot } from "./lib/roundCompute";

export const publishRound = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    const result = await loadRoundCompute(ctx, eactx, args.roundId);
    if (result.round.status !== "closed") {
      throw appError(ErrorCode.CONFLICT, "Only closed rounds can be published");
    }
    if (result.unresolvedTies.length > 0) {
      throw appError(ErrorCode.TIES_UNRESOLVED, "Resolve all ties before publishing", {
        ties: result.unresolvedTies,
      });
    }
    const existing = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const now = Date.now();
    await ctx.db.insert("resultVersions", {
      eventId: eactx.event._id,
      roundId: args.roundId,
      version,
      snapshot: buildSnapshot(result, now, eactx.event.decimalPrecision),
      createdById: eactx.user._id,
      createdAt: now,
    });
    await ctx.db.patch(args.roundId, { status: "published" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.published",
      resourceType: "round", resourceId: args.roundId,
      before: { status: "closed" }, after: { status: "published", version },
    });
  },
});

export const correctResults = mutation({
  args: {
    orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), reason: v.string(),
    overrides: v.optional(v.array(v.object({
      contestantId: v.id("contestants"),
      action: v.union(v.literal("force_advance"), v.literal("force_cut")),
    }))),
  },
  handler: async (ctx, args) => {
    const eactx = await requireReadyEvent(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    if (!args.reason.trim()) {
      throw appError(ErrorCode.VALIDATION_ERROR, "A correction reason is required");
    }
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const extra = (args.overrides ?? []).filter((o) => {
      if (!contestants.some((k) => k._id === o.contestantId)) {
        throw appError(ErrorCode.NOT_FOUND, "Contestant not found");
      }
      return true;
    });
    const result = await loadRoundCompute(ctx, eactx, args.roundId, extra);
    if (result.round.status !== "published") {
      throw appError(ErrorCode.CONFLICT, "Only published rounds can be corrected");
    }
    if (result.unresolvedTies.length > 0) {
      throw appError(ErrorCode.TIES_UNRESOLVED, "Resolve all ties before correcting", {
        ties: result.unresolvedTies,
      });
    }
    const existing = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const now = Date.now();
    await ctx.db.insert("resultVersions", {
      eventId: eactx.event._id,
      roundId: args.roundId,
      version,
      snapshot: buildSnapshot(result, now, eactx.event.decimalPrecision),
      createdById: eactx.user._id,
      createdAt: now,
      reason: args.reason.trim(),
    });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "round.corrected",
      resourceType: "resultVersion", resourceId: args.roundId,
      after: { version, reason: args.reason.trim() },
    });
  },
});
```

- [ ] **Step 4: Implement `convex/results.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventMember, requireEventPermission } from "./lib/eventAuthz";
import { writeAudit } from "./lib/audit";
import { computeEventFinal, type RoundStandingSummary, type StandingRow } from "./lib/tabulation";

async function requireResultAccess(
  ctx: QueryCtx,
  args: { orgSlug: string; eventSlug: string },
) {
  const eactx = await requireEventMember(ctx, args);
  if (!eactx.permissions.has("result.view")) {
    throw appError(ErrorCode.FORBIDDEN, "Missing permission: result.view");
  }
  if (eactx.event.resultVisibility === "private" && !eactx.permissions.has("score.manage")) {
    throw appError(ErrorCode.FORBIDDEN, "Results are private");
  }
  return eactx;
}

async function latestVersion(
  ctx: QueryCtx,
  roundId: Id<"rounds">,
): Promise<Doc<"resultVersions"> | null> {
  const versions = await ctx.db
    .query("resultVersions")
    .withIndex("by_round_id", (q) => q.eq("roundId", roundId))
    .collect();
  return versions.reduce<Doc<"resultVersions"> | null>(
    (best, v) => (best === null || v.version > best.version ? v : best),
    null,
  );
}

export const roundResults = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), version: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const versions = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    const chosen = args.version !== undefined
      ? versions.find((v) => v.version === args.version)
      : versions.reduce<Doc<"resultVersions"> | null>((best, v) => (best === null || v.version > best.version ? v : best), null);
    if (!chosen) throw appError(ErrorCode.NOT_FOUND, "Result version not found");
    return {
      version: chosen.version,
      reason: chosen.reason,
      createdAt: chosen.createdAt,
      snapshot: chosen.snapshot,
    };
  },
});

export const listRoundVersions = query({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const versions = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    return versions
      .sort((a, b) => b.version - a.version)
      .map((v) => ({ version: v.version, createdAt: v.createdAt, reason: v.reason }));
  },
});

export const eventResults = query({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    const summaries: (RoundStandingSummary & { name: string; version: number })[] = [];
    for (const round of [...rounds].sort((a, b) => a.order - b.order)) {
      if (round.status !== "published") continue;
      const version = await latestVersion(ctx, round._id);
      if (!version) continue;
      const standings: StandingRow[] = version.snapshot.categories.flatMap((category) =>
        category.standings.map((s) => ({
          contestantId: s.contestantId,
          categoryId: category.categoryId,
          status: s.status,
          roundScore: s.roundScore,
          criterionScores: s.criterionScores.map((cs) => ({
            criterionId: cs.criterionId, avgRaw: cs.avgRaw, contribution: cs.contribution, dropped: cs.dropped,
          })),
          rank: s.rank,
          tieResolvedBy: s.tieResolvedBy,
        })),
      );
      const advancement = Object.fromEntries(
        version.snapshot.categories.flatMap((c) =>
          c.standings.map((s) => [s.contestantId, s.advanced]),
        ),
      );
      summaries.push({
        roundId: round._id, order: round.order, weight: round.weight,
        standings, advancement, name: round.name, version: version.version,
      });
    }
    const final = computeEventFinal(summaries, eactx.event.decimalPrecision).map((f) => ({
      contestantId: f.contestantId,
      contestantName: contestants.find((k) => k._id === f.contestantId)?.name ?? "",
      categoryId: f.categoryId,
      totalScore: f.totalScore,
      eliminatedInRoundOrder: f.eliminatedInRoundOrder,
      rank: f.rank,
    }));
    return {
      rounds: summaries.map(({ name, version, ...s }) => ({
        roundId: s.roundId, name, order: s.order, weight: s.weight, version,
        standings: s.standings.map((row) => ({
          contestantId: row.contestantId,
          contestantName: contestants.find((k) => k._id === row.contestantId)?.name ?? "",
          rank: row.rank, roundScore: row.roundScore,
        })),
      })),
      final,
    };
  },
});

export const finalizeEvent = mutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireEventPermission(ctx, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, permission: "score.manage",
    });
    if (eactx.event.status !== "ready") {
      throw appError(ErrorCode.CONFLICT, "Only ready events can be finalized");
    }
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", eactx.event._id))
      .collect();
    if (rounds.length === 0 || rounds.some((r) => r.status !== "published")) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Every round must be published before finalizing");
    }
    await ctx.db.patch(eactx.event._id, { status: "finalized" });
    await writeAudit(ctx, {
      orgId: eactx.org._id, actorId: eactx.user._id, action: "event.finalized",
      resourceType: "event", resourceId: eactx.event._id,
      before: { status: "ready" }, after: { status: "finalized" },
    });
  },
});
```

(The `summaries.map(({ name, version, ...s })` rest pattern is fine here — `s` is used.)

- [ ] **Step 5: Run** `npx vitest run convex-test/publishResults.test.ts` → PASS. Full gate (`typecheck` + `npm test` + `npm run lint`).

- [ ] **Step 6: Commit** — `git commit -m "feat: round publish, versioned results, corrections, event finalization"`

---

## Task 12: Judge UI — scoring home + entry form

> **SUPERSEDED** by `2026-08-16-phase3-ui-ux-modules.md` Tasks 4–5 — do not execute.

**Files:**
- Modify: `components/EventShell.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx`

**Interfaces:**
- Consumes: `api.scoring.{myAssignments,sheetDetail,saveDraft,submitSheet}` (Task 8), `api.events.get`.
- Produces: judge-facing scoring pages. `myAssignments` returning `judgeId: null` (caller is not a judge) renders an empty state.

- [ ] **Step 1: Extend the EventShell nav** — in `components/EventShell.tsx`, add to the `nav` array after `Judges`:

```tsx
    ["Scoring", `${base}/scoring`],
```

and after `Settings`:

```tsx
    ["Results", `${base}/results`],
```

- [ ] **Step 2: Judge home — `app/app/[orgSlug]/events/[eventSlug]/scoring/page.tsx`**

```tsx
"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";

const statusVariant: Record<string, "outline" | "secondary" | "destructive"> = {
  not_started: "outline",
  in_progress: "secondary",
};

export default function ScoringPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const mine = useQuery(api.scoring.myAssignments, { orgSlug, eventSlug });

  if (mine === undefined) return <div className="p-8">Loading…</div>;
  if (mine.judgeId === null) {
    return <p className="text-sm text-muted-foreground">You are not a judge for this event.</p>;
  }

  return (
    <div className="space-y-6">
      {mine.rounds.length === 0 && (
        <p className="text-sm text-muted-foreground">No score sheets assigned yet.</p>
      )}
      {mine.rounds.map((round) => (
        <div key={round.roundId} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{round.name}</span>
            <Badge variant="outline">{round.status}</Badge>
          </div>
          <ul className="space-y-1 text-sm">
            {round.sheets.map((sheet) => (
              <li key={sheet.sheetId} className="flex items-center justify-between border-b py-1">
                <span>
                  #{sheet.contestantNumber} {sheet.contestantName}
                </span>
                <span className="flex items-center gap-2">
                  {sheet.status === "submitted" ? (
                    <Badge>submitted</Badge>
                  ) : round.status === "open" ? (
                    <Link
                      href={`/app/${orgSlug}/events/${eventSlug}/scoring/${round.roundId}/${sheet.contestantId}`}
                      className="underline"
                    >
                      {sheet.status === "in_progress" ? "Continue" : "Score"}
                    </Link>
                  ) : (
                    <Badge variant={statusVariant[sheet.status] ?? "outline"}>{sheet.status}</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Score entry form — `app/app/[orgSlug]/events/[eventSlug]/scoring/[roundId]/[contestantId]/page.tsx`**

```tsx
"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ScoreEntryPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string; roundId: string; contestantId: string }>;
}) {
  const { orgSlug, eventSlug, roundId, contestantId } = use(params);
  const detail = useQuery(api.scoring.sheetDetail, { orgSlug, eventSlug, roundId, contestantId });
  const saveDraft = useMutation(api.scoring.saveDraft);
  const submitSheet = useMutation(api.scoring.submitSheet);
  const [values, setValues] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (detail && !hydrated.current) {
      hydrated.current = true;
      setValues(detail.sheet?.draftValues ?? {});
    }
  }, [detail]);

  const sheetId = detail?.sheet?._id;

  useEffect(() => {
    if (!hydrated.current || saved || !sheetId) return;
    const timer = setTimeout(() => {
      saveDraft({ orgSlug, eventSlug, sheetId, draftValues: values })
        .then(() => setSaved(true))
        .catch((err: unknown) => {
          const data = (err as { data?: { code?: string; message?: string } })?.data;
          toast.error(data?.message ?? "Could not save draft.");
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [values, saved, sheetId, orgSlug, eventSlug, saveDraft]);

  if (detail === undefined) return <div className="p-8">Loading…</div>;
  if (!detail.contestant) return <p className="text-sm text-muted-foreground">Contestant not found.</p>;
  if (!detail.sheet) {
    return <p className="text-sm text-muted-foreground">You have no score sheet for this contestant.</p>;
  }
  if (detail.sheet.status === "submitted" || detail.sheet.status === "locked") {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">
          #{detail.contestant.number} {detail.contestant.name} — submitted
        </h2>
        <p className="text-sm text-muted-foreground">This sheet is locked. Submitted scores cannot be changed.</p>
        <Link href={`/app/${orgSlug}/events/${eventSlug}/scoring`} className="text-sm underline">
          Back to scoring
        </Link>
      </div>
    );
  }

  const setValue = (criterionId: string, raw: string) => {
    if (raw === "") {
      const next = { ...values };
      delete next[criterionId];
      setValues(next);
      setSaved(false);
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    setValues({ ...values, [criterionId]: num });
    setSaved(false);
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      await submitSheet({ orgSlug, eventSlug, sheetId: detail.sheet!._id, values });
      toast.success("Scores submitted.");
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      toast.error(data?.message ?? "Could not submit.");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          #{detail.contestant.number} {detail.contestant.name}
        </h2>
        <span className="text-xs text-muted-foreground">{saved ? "Saved" : "Saving…"}</span>
      </div>
      {detail.criteria.map((criterion) => (
        <div key={criterion._id} className="space-y-1">
          <label className="text-sm font-medium" htmlFor={criterion._id}>
            {criterion.name} ({criterion.weight}% — {criterion.minScore} to {criterion.maxScore})
          </label>
          <Input
            id={criterion._id}
            type="number"
            inputMode="decimal"
            min={criterion.minScore}
            max={criterion.maxScore}
            step={10 ** -criterion.decimalPrecision}
            value={values[criterion._id] ?? ""}
            onChange={(e) => setValue(criterion._id, e.target.value)}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={submitting}>
          Submit scores
        </Button>
        <Link href={`/app/${orgSlug}/events/${eventSlug}/scoring`} className="self-center text-sm underline">
          Cancel
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add components/EventShell.tsx "app/app/[orgSlug]/events/[eventSlug]/scoring"
git commit -m "feat: judge scoring home and score entry form"
```

Expected: all green (UI-only addition).

---

## Task 13: Tabulator UI — monitor + review

> **SUPERSEDED** by `2026-08-16-phase3-ui-ux-modules.md` Tasks 6–7 — do not execute.

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/review/page.tsx`
- Modify: `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx` (monitor/review links)

**Interfaces:**
- Consumes: `api.roundAdmin.{roundMonitor,closeRound,reopenRound,roundReview,addTieBreak,removeTieBreak,addAdvancementOverride,removeAdvancementOverride,publishRound}` (Tasks 9–11), `api.rounds.list`, `api.events.get`.

- [ ] **Step 1: Monitor — `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/monitor/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function MonitorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string; roundId: string }>;
}) {
  const { orgSlug, eventSlug, roundId } = use(params);
  const monitor = useQuery(api.roundAdmin.roundMonitor, { orgSlug, eventSlug, roundId });
  const closeRound = useMutation(api.roundAdmin.closeRound);
  const reopenRound = useMutation(api.roundAdmin.reopenRound);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      toast.error(data?.message ?? "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (monitor === undefined) return <div className="p-8">Loading…</div>;

  const statusFor = (judgeId: string, contestantId: string) =>
    monitor.sheets.find((s) => s.judgeId === judgeId && s.contestantId === contestantId)?.status ?? "—";
  const submittedCount = monitor.sheets.filter((s) => s.status === "submitted" || s.status === "locked").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Submission progress ({submittedCount}/{monitor.sheets.length} submitted)
        </h2>
        <div className="flex gap-2">
          {monitor.roundStatus === "open" && (
            <Button
              disabled={busy}
              onClick={() => run(async () => { await closeRound({ orgSlug, eventSlug, roundId }); }, "Round closed.")}
            >
              Close round
            </Button>
          )}
          {monitor.roundStatus === "closed" && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run(async () => { await reopenRound({ orgSlug, eventSlug, roundId }); }, "Round reopened.")}
              >
                Reopen
              </Button>
              <Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${roundId}/review`}>
                <Button>Review &amp; publish</Button>
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1">Judge</th>
              {monitor.contestants.map((k) => (
                <th key={k.contestantId}>#{k.number}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monitor.judges.map((judge) => (
              <tr key={judge.judgeId} className="border-t">
                <td className="py-1">{judge.name}</td>
                {monitor.contestants.map((k) => (
                  <td key={k.contestantId}>{statusFor(judge.judgeId, k.contestantId)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Review — `app/app/[orgSlug]/events/[eventSlug]/rounds/[roundId]/review/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ReviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string; roundId: string }>;
}) {
  const { orgSlug, eventSlug, roundId } = use(params);
  const router = useRouter();
  const review = useQuery(api.roundAdmin.roundReview, { orgSlug, eventSlug, roundId });
  const publishRound = useMutation(api.roundAdmin.publishRound);
  const addTieBreak = useMutation(api.roundAdmin.addTieBreak);
  const addOverride = useMutation(api.roundAdmin.addAdvancementOverride);
  const [positions, setPositions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    toast.error(data?.message ?? "Action failed.");
  };

  if (review === undefined) return <div className="p-8">Loading…</div>;
  if (review instanceof Error) {
    return <p className="text-sm text-muted-foreground">Close the round before review.</p>;
  }

  const advancementActive =
    review.eliminationEnabled && review.round.qualifiesToNextRound && review.round.advancement.mode !== "none";

  const publish = async () => {
    setBusy(true);
    try {
      await publishRound({ orgSlug, eventSlug, roundId });
      toast.success("Results published.");
      router.push(`/app/${orgSlug}/events/${eventSlug}/results`);
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      toast.error(data?.code === "TIES_UNRESOLVED" ? "Resolve the highlighted ties first." : data?.message ?? "Could not publish.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{review.round.name} — review</h2>
        <Button onClick={publish} disabled={busy || review.unresolvedTies.length > 0}>
          Publish results
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">Rank</th><th>Contestant</th><th>Score</th><th>Resolved by</th>{advancementActive && <th>Advances</th>}</tr>
        </thead>
        <tbody>
          {review.standings
            .slice()
            .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
            .map((s) => (
              <tr key={s.contestantId} className="border-t">
                <td className="py-1">{s.rank ?? "—"}</td>
                <td>{s.contestantName}</td>
                <td>{s.roundScore ?? "—"}</td>
                <td className="text-muted-foreground">{s.tieResolvedBy}</td>
                {advancementActive && (
                  <td>
                    <span className={s.advancement ? "font-medium" : "text-muted-foreground"}>
                      {s.advancement === null ? "—" : s.advancement ? "Yes" : "No"}
                    </span>
                    {review.round.advancement.allowOverride && (
                      <span className="ml-2 flex gap-1">
                        <Button
                          variant="ghost" size="sm" disabled={busy}
                          onClick={async () => {
                            try { await addOverride({ orgSlug, eventSlug, roundId, contestantId: s.contestantId, action: "force_advance" }); }
                            catch (e) { onError(e); }
                          }}
                        >
                          Force advance
                        </Button>
                        <Button
                          variant="ghost" size="sm" disabled={busy}
                          onClick={async () => {
                            try { await addOverride({ orgSlug, eventSlug, roundId, contestantId: s.contestantId, action: "force_cut" }); }
                            catch (e) { onError(e); }
                          }}
                        >
                          Force cut
                        </Button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>

      {review.unresolvedTies.length > 0 && (
        <div className="space-y-3 rounded-lg border border-destructive p-4">
          <h3 className="font-medium text-destructive">Unresolved ties — set the final order (1 = first)</h3>
          {review.unresolvedTies.map((tie: { contestantIds: string[]; names: string[] }) => (
            <div key={tie.contestantIds.join()} className="space-y-2">
              <div className="flex flex-wrap gap-3">
                {tie.contestantIds.map((id, i) => (
                  <label key={id} className="flex items-center gap-1 text-sm">
                    <Input
                      className="w-16"
                      type="number"
                      min={1}
                      max={tie.contestantIds.length}
                      value={positions[id] ?? String(i + 1)}
                      onChange={(e) => setPositions({ ...positions, [id]: e.target.value })}
                    />
                    {tie.names[i]}
                  </label>
                ))}
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const ordered = [...tie.contestantIds].sort(
                    (a, b) => Number(positions[a] ?? "1") - Number(positions[b] ?? "1"),
                  );
                  try {
                    await addTieBreak({ orgSlug, eventSlug, roundId, tiedContestantIds: tie.contestantIds, orderedIds: ordered });
                    setPositions({});
                  } catch (e) {
                    onError(e);
                  }
                }}
              >
                Save tie break
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rounds page links** — in `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx`, inside the per-round header `<div className="flex items-center gap-2 text-sm">`, after the weights span add:

```tsx
                {ev?.status === "ready" && (
                  <>
                    <Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/monitor`} className="underline">
                      Monitor
                    </Link>
                    <Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/review`} className="underline">
                      Review
                    </Link>
                  </>
                )}
```

(with `Link` imported from `next/link`).

- [ ] **Step 4: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add "app/app/[orgSlug]/events/[eventSlug]/rounds"
git commit -m "feat: tabulator monitor and review/publish UI"
```

---

## Task 14: Results UI + config editor extensions

> **SUPERSEDED** by `2026-08-16-phase3-ui-ux-modules.md` Tasks 8–9 — do not execute.

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/results/page.tsx`
- Modify: `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx` (weight + advancement editor; keeps the Task 13 links)
- Modify: `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx` (scoring rules section)

**Interfaces:**
- Consumes: `api.results.{eventResults,roundResults,listRoundVersions,finalizeEvent}` (Task 11), `api.roundAdmin.correctResults`, `api.rounds.{list,add,update}`, `api.events.{get,update}`.
- Produces: published-results page (round standings + final standings + finalize + correction with required reason); rounds editor with weight + elimination-aware advancement controls (shown only when `eliminationEnabled`); settings page with drop-hi/lo and elimination toggles.

- [ ] **Step 1: Results page — `app/app/[orgSlug]/events/[eventSlug]/results/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ResultsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const results = useQuery(api.results.eventResults, { orgSlug, eventSlug });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const finalize = useMutation(api.results.finalizeEvent);
  const correct = useMutation(api.roundAdmin.correctResults);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    toast.error(data?.message ?? "Action failed.");
  };

  if (results === undefined || ev === undefined) return <div className="p-8">Loading…</div>;
  if (results instanceof Error) {
    return <p className="text-sm text-muted-foreground">Results are not available.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Results</h2>
        {ev?.status === "ready" && (
          <Button
            disabled={busy || results.rounds.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await finalize({ orgSlug, eventSlug });
                toast.success("Event finalized.");
              } catch (e) {
                onError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Finalize event
          </Button>
        )}
      </div>

      {results.rounds.length === 0 && (
        <p className="text-sm text-muted-foreground">No published rounds yet.</p>
      )}
      {results.rounds.map((round) => (
        <div key={round.roundId} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {round.name} (weight {round.weight}%, version {round.version})
            </span>
            {ev?.status === "ready" && (
              <Button
                variant="outline" size="sm"
                onClick={() => { setReasonFor(round.roundId); setReason(""); }}
              >
                Correct
              </Button>
            )}
          </div>
          {reasonFor === round.roundId && (
            <div className="flex gap-2">
              <Input placeholder="Correction reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button
                size="sm" disabled={busy || !reason.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await correct({ orgSlug, eventSlug, roundId: round.roundId, reason });
                    setReasonFor(null);
                    toast.success("Correction recorded.");
                  } catch (e) {
                    onError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Record correction
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setReasonFor(null)}>Cancel</Button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1">Rank</th><th>Contestant</th><th>Round score</th></tr>
            </thead>
            <tbody>
              {round.standings.map((row) => (
                <tr key={row.contestantId} className="border-t">
                  <td className="py-1">{row.rank ?? "—"}</td>
                  <td>{row.contestantName}</td>
                  <td>{row.roundScore ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {results.rounds.length > 0 && (
        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="font-medium">Final standings</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1">Rank</th><th>Contestant</th><th>Total</th><th>Eliminated in round</th></tr>
            </thead>
            <tbody>
              {results.final.map((row) => (
                <tr key={row.contestantId} className="border-t">
                  <td className="py-1">{row.rank}</td>
                  <td>{row.contestantName}</td>
                  <td>{row.totalScore}</td>
                  <td>{row.eliminatedInRoundOrder ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rounds editor extension — replace `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx` with** (original Phase 2 behavior + weight + advancement + the Task 13 monitor/review links):

```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const ADVANCEMENT_MODES = ["none", "top_count", "top_percent", "manual"] as const;

export default function RoundsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const rounds = useQuery(api.rounds.list, { orgSlug, eventSlug });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const addRound = useMutation(api.rounds.add);
  const updateRound = useMutation(api.rounds.update);
  const removeRound = useMutation(api.rounds.remove);
  const addCriterion = useMutation(api.criteria.add);
  const removeCriterion = useMutation(api.criteria.remove);
  const [roundName, setRoundName] = useState("");
  const [roundWeight, setRoundWeight] = useState("");
  const [advForm, setAdvForm] = useState<Record<string, { mode: string; count: string; percent: string; allowOverride: boolean }>>({});
  const [form, setForm] = useState<Record<string, { name: string; weight: string; min: string; max: string }>>({});

  const locked = ev !== undefined && ev !== null && ev.status !== "draft";
  const eliminationOn = ev?.eliminationEnabled ?? true;
  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "CONFLICT") toast.error("Configuration is locked.");
    else toast.error(data?.message ?? "Action failed.");
  };

  const advancementPatch = (roundId: string) => {
    const f = advForm[roundId];
    return {
      mode: f.mode as (typeof ADVANCEMENT_MODES)[number],
      count: f.mode === "top_count" && f.count ? Number(f.count) : undefined,
      percent: f.mode === "top_percent" && f.percent ? Number(f.percent) : undefined,
      allowOverride: f.allowOverride,
    };
  };

  return (
    <div className="space-y-6">
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <Input className="w-48" placeholder="New round name" value={roundName} onChange={(e) => setRoundName(e.target.value)} />
          <Input className="w-24" placeholder="Weight %" value={roundWeight} onChange={(e) => setRoundWeight(e.target.value)} />
          <Button
            onClick={async () => {
              try {
                await addRound({
                  orgSlug, eventSlug, name: roundName,
                  weight: roundWeight ? Number(roundWeight) : undefined,
                });
                setRoundName("");
                setRoundWeight("");
              } catch (e) { onError(e); }
            }}
          >
            Add round
          </Button>
        </div>
      )}
      {rounds?.map((r) => {
        const f = form[r._id] ?? { name: "", weight: "", min: "0", max: "100" };
        const a = advForm[r._id] ?? {
          mode: r.advancement.mode, count: String(r.advancement.count ?? ""),
          percent: String(r.advancement.percent ?? ""), allowOverride: r.advancement.allowOverride,
        };
        const sum = r.criteria.reduce((s, c) => s + c.weight, 0);
        return (
          <div key={r._id} className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">{r.name}</div>
              <div className="flex items-center gap-2 text-sm">
                <span>round weight: {r.weight}%</span>
                <span className={sum === 100 ? "text-muted-foreground" : "text-destructive"}>weights: {sum}%</span>
                {ev?.status === "ready" && (
                  <>
                    <Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/monitor`} className="underline">Monitor</Link>
                    <Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/review`} className="underline">Review</Link>
                  </>
                )}
                {!locked && (
                  <Button variant="ghost" size="sm" onClick={async () => { try { await removeRound({ orgSlug, eventSlug, roundId: r._id }); } catch (e) { onError(e); } }}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {!locked && eliminationOn && (
              <div className="flex flex-wrap items-center gap-2 rounded border border-dashed p-2 text-sm">
                <span className="text-muted-foreground">Advances</span>
                <select
                  className="rounded border bg-background px-2 py-1"
                  value={a.mode}
                  onChange={(e) => setAdvForm({ ...advForm, [r._id]: { ...a, mode: e.target.value } })}
                >
                  {ADVANCEMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {a.mode === "top_count" && (
                  <Input className="w-24" placeholder="Top N" value={a.count} onChange={(e) => setAdvForm({ ...advForm, [r._id]: { ...a, count: e.target.value } })} />
                )}
                {a.mode === "top_percent" && (
                  <Input className="w-24" placeholder="Top %" value={a.percent} onChange={(e) => setAdvForm({ ...advForm, [r._id]: { ...a, percent: e.target.value } })} />
                )}
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={a.allowOverride} onChange={(e) => setAdvForm({ ...advForm, [r._id]: { ...a, allowOverride: e.target.checked } })} />
                  allow override
                </label>
                <Button
                  size="sm" variant="outline"
                  onClick={async () => {
                    try {
                      await updateRound({ orgSlug, eventSlug, roundId: r._id, qualifiesToNextRound: true, advancement: advancementPatch(r._id) });
                      toast.success("Advancement saved.");
                    } catch (e) { onError(e); }
                  }}
                >
                  Save advancement
                </Button>
              </div>
            )}
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
      <p className="text-xs text-muted-foreground">
        Round weights must total 100% across the event before publishing.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Settings extension — replace `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx` with** (original fields + scoring section):

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
  const [dropHighLow, setDropHighLow] = useState(false);
  const [elimination, setElimination] = useState(true);
  const [prevKey, setPrevKey] = useState<string | null>(null);

  if (ev !== undefined && ev !== null && prevKey !== ev._id) {
    setPrevKey(ev._id);
    setName(ev.name);
    setVenue(ev.venue ?? "");
    setDropHighLow(ev.scoringRules.dropHighLow);
    setElimination(ev.eliminationEnabled);
  }

  if (ev === undefined) return <div>Loading…</div>;
  if (ev === null) return <div>Event not found.</div>;

  const save = async (patch: Record<string, unknown>) => {
    try {
      await update({ orgSlug, eventSlug, ...patch });
      toast.success("Saved.");
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      toast.error(data?.code === "CONFLICT" ? "Configuration is locked." : data?.message ?? "Could not save.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={ev.status !== "draft" || !name || name === ev.name} onClick={() => save({ name, venue })}>
          Save
        </Button>
      </div>
      <div className="flex gap-2">
        <Input value={venue} placeholder="Venue" onChange={(e) => setVenue(e.target.value)} />
      </div>
      {ev.status === "draft" && (
        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="font-medium">Scoring</h3>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dropHighLow} onChange={(e) => setDropHighLow(e.target.checked)} />
            Drop highest and lowest judge scores (needs 3+ judges per contestant-criterion)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={elimination} onChange={(e) => setElimination(e.target.checked)} />
            Elimination rounds enabled
          </label>
          <Button
            size="sm" variant="outline"
            disabled={(dropHighLow === ev.scoringRules.dropHighLow && elimination === ev.eliminationEnabled)}
            onClick={() => save({ scoringRules: { dropHighLow }, eliminationEnabled: elimination })}
          >
            Save scoring settings
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Slug: {ev.slug} - Status: {ev.status}</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add "app/app/[orgSlug]/events/[eventSlug]/results" "app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx" "app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx"
git commit -m "feat: results page with finalize and corrections, editor extensions for scoring config"
```

---

## Task 15: Final verification

**Files:**
- No new files; verification pass over the whole phase.

- [ ] **Step 1: Full gates**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
```

Expected: all green. Record final test counts (baseline from Task 1 + new: phase3Schema, permissions3, tabulationCore, scoringEntry, roundLifecycle3, reviewDecisions, publishResults).

- [ ] **Step 2: Authz scan** — run the `convex-authz` skill against the new public functions (`scoring.ts`, `roundAdmin.ts`, `results.ts`, plus modified `events.ts`/`rounds.ts`/`eventLifecycle.ts`). Fix anything it finds.

- [ ] **Step 3: Spec acceptance walkthrough** — verify each acceptance item from the spec §7 against the running app (`npm run dev`): judge autosave+submit lock, blackout monitor, tie resolution + publish flow, correction versioning, finalize, visibility gates.

- [ ] **Step 4: Refresh Graphify context** (per AGENTS.md) — `npm run graphify:build` if the project's Graphify workflow is active.

- [ ] **Step 5: Commit any fixes** — `git commit -m "chore: phase 3 final verification fixes"` (only if needed).






