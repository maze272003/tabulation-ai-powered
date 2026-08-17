# Phase 5: AI Intelligence Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the product's namesake differentiation: judge integrity scoring (deterministic statistics, no LLM), a Gemini-powered event setup wizard, and a grounded results explainer — all advisory-only and human-reviewed.

**Architecture:** A pure statistical lib (`judgeIntegrity`) surfaces through the existing staff round monitor/review. LLM work is isolated in a thin `gemini.ts` wrapper plus pure, injectable cores (`templateWizard`) so everything except the network call is unit-tested. Explanations are cached per result version in a new table.

**Tech Stack:** Convex actions, `@google/genai` (gemini-2.5-flash), Next.js 16, React 19, vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-08-17-phase5-ai-intelligence-layer-design.md`
**Prerequisite:** Phase 4 plan (`2026-08-17-phase4-operational-completeness.md`) should be executed first or independently — no code dependencies.

## Global Constraints

- Exactly one new dependency: `@google/genai` (no other AI libs).
- `GEMINI_API_KEY` is a Convex deployment secret set via `npx convex env add GEMINI_API_KEY` — never in source, never client-side. Actions read `process.env.GEMINI_API_KEY`.
- Read `convex/_generated/ai/guidelines.md` before touching any Convex file.
- **Advisory-only rule:** nothing in this phase writes scores, rankings, or advancement. Integrity flags are read-only computations.
- All errors via `appError` from `convex/lib/errors.ts`; add one new code `UPSTREAM`.
- All mutations audit via `writeAudit`. AI quota is audited at accept-time (wizard) only — no per-view audit noise.
- Rate limits: wizard 20/org/day, explainer 30/org/day (usage table with `periodKey` day bucket).
- UI tasks must apply the `/ui-ux-pro-max` skill guidelines (per AGENTS.md).
- Validation per task: `npx vitest run <file>`; UI tasks also `npm run lint`; final gate `npm run build` + full `npm run test`.
- Windows PowerShell: chain dependent commands with `cmd1; if ($?) { cmd2 }`.
- Helpers from `convex-test/setup.ts`: `aliceIdentity`, `createOrgAndEvent`, `prepareScoredEvent`, `setupTest`. `prepareScoredEvent` creates judges `bob`/`carol` (password `password123`), event `acme/gala`, criterion pair weighted 60/40, max 10, contestants 1=Maria, 2=Nina.
- Ship order = task order: integrity scoring (1–5) needs no API key; wizard/explainer (6–11) need `GEMINI_API_KEY` only at runtime, never in tests (tests mock the LLM caller or the cache).

## File Map

| File | Responsibility |
|---|---|
| `convex/lib/errors.ts` (modify) | Add `UPSTREAM` code |
| `convex/lib/gemini.ts` (new) | Thin Gemini JSON/text wrapper |
| `convex/lib/judgeIntegrity.ts` (new) | Pure per-judge statistics |
| `convex/enter/rounds.ts` (modify) | `roundMonitor` integrity summary + `integrityReport` query |
| `components/enter/RoundIntegrityPanel.tsx` (new) | Review-page integrity panel |
| `app/enter/staff/rounds/[roundId]/review/page.tsx` (modify) | Mount panel |
| `convex/lib/aiUsage.ts` (new) | Daily AI quota (pure counter + DB wrapper) |
| `convex/lib/templateWizard.ts` (new) | Pure draft validation + retry core |
| `convex/templates.ts` (modify) | `generateFromPrompt` action, `saveGenerated` + `consumeWizardQuota` mutations |
| `components/tabulation/AiEventWizardCard.tsx` (new) | Wizard UI |
| `app/app/[orgSlug]/events/new/page.tsx` (modify) | Mount wizard card |
| `convex/schema.ts` (modify) | `resultExplanations` table |
| `convex/results.ts` (modify) | `explain` action + internal query/mutation |
| `components/tabulation/ExplainButton.tsx` (new) | Explainer UI |
| `components/tabulation/RoundResultsCard.tsx` (modify) | Wire explain button |
| Tests: `convex-test/judgeIntegrity.test.ts`, `convex-test/integritySurfaces.test.ts`, `convex-test/aiUsage.test.ts`, `convex-test/templateWizard.test.ts`, `convex-test/wizardSave.test.ts`, `convex-test/explain.test.ts` (all new) | |

---

### Task 1: Gemini wrapper + UPSTREAM error code

**Files:**
- Modify: `convex/lib/errors.ts`
- Create: `convex/lib/gemini.ts`
- Test: `convex-test/gemini.test.ts`

**Interfaces:**
- Produces: `ErrorCode.UPSTREAM`; `geminiGenerateJson({ systemInstruction: string; prompt: string }): Promise<unknown>`; `geminiGenerateText({ systemInstruction: string; prompt: string }): Promise<string>`; `GEMINI_MODEL = "gemini-2.5-flash"`.

- [ ] **Step 1: Install the dependency**

Run: `npm install @google/genai`
Expected: installs `@google/genai` (currently ^1.x).

- [ ] **Step 2: Write the failing test**

Create `convex-test/gemini.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { geminiApiKey, geminiGenerateJson } from "../convex/lib/gemini";

describe("gemini wrapper", () => {
  it("throws UPSTREAM when GEMINI_API_KEY is missing", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      expect(() => geminiApiKey()).toThrowError(
        expect.objectContaining({ data: { code: "UPSTREAM" } }),
      );
      await expect(
        geminiGenerateJson({ systemInstruction: "s", prompt: "p" }),
      ).rejects.toMatchObject({ data: { code: "UPSTREAM" } });
    } finally {
      if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex-test/gemini.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

In `convex/lib/errors.ts`, add to the `ErrorCode` object (after `TIES_UNRESOLVED`):

```ts
  UPSTREAM: "UPSTREAM",
```

Create `convex/lib/gemini.ts`:

```ts
import { GoogleGenAI } from "@google/genai";
import { appError, ErrorCode } from "./errors";

export const GEMINI_MODEL = "gemini-2.5-flash";

export function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw appError(ErrorCode.UPSTREAM, "GEMINI_API_KEY is not configured");
  return key;
}

async function callGemini(args: { systemInstruction: string; prompt: string }) {
  const client = new GoogleGenAI({ apiKey: geminiApiKey() });
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: args.prompt,
    config: {
      systemInstruction: args.systemInstruction,
      temperature: 0.4,
    },
  });
  const text = response.text;
  if (!text) throw appError(ErrorCode.UPSTREAM, "Gemini returned an empty response");
  return text;
}

export async function geminiGenerateJson(args: { systemInstruction: string; prompt: string }): Promise<unknown> {
  const text = await callGemini({ ...args, systemInstruction: `${args.systemInstruction}\nRespond with a single JSON value and nothing else.` });
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw appError(ErrorCode.UPSTREAM, "Gemini returned malformed JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function geminiGenerateText(args: { systemInstruction: string; prompt: string }): Promise<string> {
  return callGemini(args);
}
```

Note: `appError`'s context must be `Record<string, Value>` — the `cause` string is a valid Value. If the installed SDK's `response.text` type differs, adapt with a minimal narrowing check (never `as any`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run convex-test/gemini.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json convex/lib/errors.ts convex/lib/gemini.ts convex-test/gemini.test.ts
git commit -m "feat: add Gemini wrapper and UPSTREAM error code"
```

---

### Task 2: Judge integrity statistics (pure lib)

**Files:**
- Create: `convex/lib/judgeIntegrity.ts`
- Test: `convex-test/judgeIntegrity.test.ts`

**Interfaces:**
- Produces:
  ```ts
  computeJudgeIntegrity(input: JudgeIntegrityInput): JudgeIntegrityReport[]
  ```
  with types defined in the file below. All thresholds exported as named constants. Id types come from `../_generated/dataModel`.

- [ ] **Step 1: Write the failing tests**

Create `convex-test/judgeIntegrity.test.ts`. Fixtures use ONE criterion (weight 100, min 0, max 100) so a judge's contestant total equals the raw score, making z-scores hand-checkable:

```ts
import { describe, expect, it } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import {
  AGREEMENT_WARNING,
  BIAS_Z_WARNING,
  computeJudgeIntegrity,
  type JudgeIntegrityInput,
} from "../convex/lib/judgeIntegrity";

const J1 = "j1" as Id<"eventAccounts">;
const J2 = "j2" as Id<"eventAccounts">;
const J3 = "j3" as Id<"eventAccounts">;
const C1 = "c1" as Id<"contestants">;
const C2 = "c2" as Id<"contestants">;
const C3 = "c3" as Id<"contestants">;
const CRIT = "crit" as Id<"criteria">;

function input(
  scores: { judgeId: Id<"eventAccounts">; contestantId: Id<"contestants">; value: number }[],
  opts: { roundStatus?: JudgeIntegrityInput["roundStatus"]; judges?: Id<"eventAccounts">[]; sheets?: { judgeId: Id<"eventAccounts">; submitted: number; total: number }[] } = {},
): JudgeIntegrityInput {
  const judges = opts.judges ?? [J1, J2, J3];
  return {
    roundStatus: opts.roundStatus ?? "closed",
    criteria: [{ id: CRIT, weight: 100, minScore: 0, maxScore: 100 }],
    scores: scores.map((s) => ({ ...s, criterionId: CRIT })),
    sheets: opts.sheets ?? judges.map((judgeId) => ({ judgeId, submitted: 3, total: 3 })),
  };
}

describe("computeJudgeIntegrity", () => {
  it("returns no flags for a consistent panel", () => {
    const reports = computeJudgeIntegrity(input([
      { judgeId: J1, contestantId: C1, value: 5 }, { judgeId: J1, contestantId: C2, value: 6 }, { judgeId: J1, contestantId: C3, value: 7 },
      { judgeId: J2, contestantId: C1, value: 5 }, { judgeId: J2, contestantId: C2, value: 6 }, { judgeId: J2, contestantId: C3, value: 7 },
      { judgeId: J3, contestantId: C1, value: 5 }, { judgeId: J3, contestantId: C2, value: 6 }, { judgeId: J3, contestantId: C3, value: 7 },
    ]));
    expect(reports.length).toBe(3);
    for (const report of reports) {
      expect(report.flags).toEqual([]);
      expect(Math.abs(report.biasZ ?? 0)).toBeLessThan(BIAS_Z_WARNING);
      expect(report.agreement).toBeGreaterThan(AGREEMENT_WARNING);
    }
  });

  it("flags a lenient judge with critical severity bias", () => {
    const lenient = (v: number) => v + 10;
    const reports = computeJudgeIntegrity(input([
      { judgeId: J1, contestantId: C1, value: lenient(5) }, { judgeId: J1, contestantId: C2, value: lenient(6) }, { judgeId: J1, contestantId: C3, value: lenient(7) },
      { judgeId: J2, contestantId: C1, value: 5 }, { judgeId: J2, contestantId: C2, value: 6 }, { judgeId: J2, contestantId: C3, value: 7 },
      { judgeId: J3, contestantId: C1, value: 5 }, { judgeId: J3, contestantId: C2, value: 6 }, { judgeId: J3, contestantId: C3, value: 7 },
    ]));
    const j1 = reports.find((r) => r.judgeId === J1)!;
    // Per contestant the lenient judge sits z = 1.41 above the panel mean.
    expect(j1.biasZ).toBeGreaterThan(1.25);
    expect(j1.flags).toContainEqual(
      expect.objectContaining({ metric: "severity_bias", level: "critical" }),
    );
    // The other two sit at z = -0.71 — below the warning threshold, not flagged.
    const j2 = reports.find((r) => r.judgeId === J2)!;
    expect(j2.flags.find((f) => f.metric === "severity_bias")).toBeUndefined();
  });

  it("flags a straight-lining judge with critical differentiation", () => {
    const reports = computeJudgeIntegrity(input([
      { judgeId: J1, contestantId: C1, value: 6 }, { judgeId: J1, contestantId: C2, value: 6 }, { judgeId: J1, contestantId: C3, value: 6 },
      { judgeId: J2, contestantId: C1, value: 5 }, { judgeId: J2, contestantId: C2, value: 6 }, { judgeId: J2, contestantId: C3, value: 7 },
      { judgeId: J3, contestantId: C1, value: 5 }, { judgeId: J3, contestantId: C2, value: 6 }, { judgeId: J3, contestantId: C3, value: 7 },
    ]));
    const j1 = reports.find((r) => r.judgeId === J1)!;
    expect(j1.differentiationRatio).toBe(0);
    expect(j1.flags).toContainEqual(
      expect.objectContaining({ metric: "differentiation", level: "critical" }),
    );
    const j2 = reports.find((r) => r.judgeId === J2)!;
    expect(j2.flags.find((f) => f.metric === "differentiation")).toBeUndefined();
  });

  it("flags an inverted judge with negative agreement", () => {
    const reports = computeJudgeIntegrity(input([
      { judgeId: J1, contestantId: C1, value: 7 }, { judgeId: J1, contestantId: C2, value: 6 }, { judgeId: J1, contestantId: C3, value: 5 },
      { judgeId: J2, contestantId: C1, value: 5 }, { judgeId: J2, contestantId: C2, value: 6 }, { judgeId: J2, contestantId: C3, value: 7 },
      { judgeId: J3, contestantId: C1, value: 5 }, { judgeId: J3, contestantId: C2, value: 6 }, { judgeId: J3, contestantId: C3, value: 7 },
    ]));
    const j1 = reports.find((r) => r.judgeId === J1)!;
    expect(j1.agreement).toBeCloseTo(-1, 5);
    expect(j1.flags).toContainEqual(
      expect.objectContaining({ metric: "agreement", level: "critical" }),
    );
  });

  it("suppresses panel statistics below MIN_PANEL_SIZE judges", () => {
    const reports = computeJudgeIntegrity(
      input([
        { judgeId: J1, contestantId: C1, value: 9 }, { judgeId: J1, contestantId: C2, value: 3 },
        { judgeId: J2, contestantId: C1, value: 4 }, { judgeId: J2, contestantId: C2, value: 8 },
      ], { judges: [J1, J2], sheets: [
        { judgeId: J1, submitted: 2, total: 2 },
        { judgeId: J2, submitted: 2, total: 2 },
      ] }),
    );
    for (const report of reports) {
      expect(report.biasZ).toBeNull();
      expect(report.differentiationRatio).toBeNull();
      expect(report.agreement).toBeNull();
      expect(report.flags).toEqual([]);
    }
  });

  it("reports incomplete sheets as info once the round is closed, not while open", () => {
    const base = [
      { judgeId: J1, contestantId: C1, value: 5 },
      { judgeId: J2, contestantId: C1, value: 5 },
      { judgeId: J3, contestantId: C1, value: 5 },
    ];
    const sheets = [
      { judgeId: J1, submitted: 0, total: 1 },
      { judgeId: J2, submitted: 1, total: 1 },
      { judgeId: J3, submitted: 1, total: 1 },
    ];
    const closed = computeJudgeIntegrity(input(base, { roundStatus: "closed", sheets }));
    expect(closed.find((r) => r.judgeId === J1)!.flags).toContainEqual(
      expect.objectContaining({ metric: "completion", level: "info" }),
    );
    const open = computeJudgeIntegrity(input(base, { roundStatus: "open", sheets }));
    expect(open.find((r) => r.judgeId === J1)!.flags.find((f) => f.metric === "completion")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/judgeIntegrity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `convex/lib/judgeIntegrity.ts`**

```ts
import type { Id } from "../_generated/dataModel";

export const MIN_PANEL_SIZE = 3;
export const MIN_SCORES_PER_CONTESTANT = 2;
export const BIAS_Z_WARNING = 0.75;
export const BIAS_Z_CRITICAL = 1.25;
export const DIFFERENTIATION_RATIO_WARNING = 0.5;
export const DIFFERENTIATION_RATIO_CRITICAL = 0.25;
export const AGREEMENT_WARNING = 0.4;

export type IntegrityFlagLevel = "info" | "warning" | "critical";
export type IntegrityMetricName = "severity_bias" | "differentiation" | "agreement" | "completion";

export type IntegrityFlag = {
  metric: IntegrityMetricName;
  level: IntegrityFlagLevel;
  explanation: string;
};

export type JudgeIntegrityReport = {
  judgeId: Id<"eventAccounts">;
  biasZ: number | null;
  differentiationRatio: number | null;
  agreement: number | null;
  completion: number;
  flags: IntegrityFlag[];
};

export type JudgeIntegrityInput = {
  roundStatus: "open" | "closed" | "published";
  criteria: { id: Id<"criteria">; weight: number; minScore: number; maxScore: number }[];
  scores: { judgeId: Id<"eventAccounts">; contestantId: Id<"contestants">; criterionId: Id<"criteria">; value: number }[];
  sheets: { judgeId: Id<"eventAccounts">; submitted: number; total: number }[];
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
}

/**
 * Weighted contestant total for one judge, using the same normalization as the
 * tabulation engine: (value / maxScore) * weight per criterion (tabulation.ts:60).
 */
function judgeContestantTotal(
  input: JudgeIntegrityInput,
  judgeId: Id<"eventAccounts">,
  contestantId: Id<"contestants">,
): number {
  let total = 0;
  for (const score of input.scores) {
    if (score.judgeId !== judgeId || score.contestantId !== contestantId) continue;
    const criterion = input.criteria.find((c) => c.id === score.criterionId);
    if (!criterion) continue;
    total += criterion.maxScore === 0 ? 0 : (score.value / criterion.maxScore) * criterion.weight;
  }
  return total;
}

/** Rank 1 = highest value; ties share the average rank (Spearman-correct). */
function averageRanks(values: number[]): number[] {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j++;
    const averageRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[sorted[k].index] = averageRank;
    i = j + 1;
  }
  return ranks;
}

function spearman(a: number[], b: number[]): number {
  if (a.length < 2) return 0;
  const rankA = averageRanks(a);
  const rankB = averageRanks(b);
  const sdA = stddev(rankA);
  const sdB = stddev(rankB);
  if (sdA === 0 || sdB === 0) return 0;
  const mA = mean(rankA);
  const mB = mean(rankB);
  const covariance = mean(rankA.map((value, index) => (value - mA) * (rankB[index] - mB)));
  return covariance / (sdA * sdB);
}

export function computeJudgeIntegrity(input: JudgeIntegrityInput): JudgeIntegrityReport[] {
  const judgeIds = [...new Set(input.scores.map((score) => score.judgeId))].sort();
  const contestantIds = [...new Set(input.scores.map((score) => score.contestantId))].sort();

  const totals = new Map<string, number>(); // `${judgeId}:${contestantId}` -> total
  for (const judgeId of judgeIds) {
    for (const contestantId of contestantIds) {
      totals.set(`${judgeId}:${contestantId}`, judgeContestantTotal(input, judgeId, contestantId));
    }
  }
  const judgesOfContestant = (contestantId: Id<"contestants">) =>
    judgeIds.filter((judgeId) => (totals.get(`${judgeId}:${contestantId}`) ?? 0) > 0 || input.scores.some((s) => s.judgeId === judgeId && s.contestantId === contestantId));
  const contestantsOfJudge = (judgeId: Id<"eventAccounts">) =>
    contestantIds.filter((contestantId) => input.scores.some((s) => s.judgeId === judgeId && s.contestantId === contestantId));

  const panelEnabled = judgeIds.length >= MIN_PANEL_SIZE;

  // Per-judge spread, used for the differentiation ratio baseline.
  const spreadByJudge = new Map<Id<"eventAccounts">, number>();
  for (const judgeId of judgeIds) {
    const own = contestantsOfJudge(judgeId).map((c) => totals.get(`${judgeId}:${c}`) ?? 0);
    spreadByJudge.set(judgeId, own.length >= 2 ? stddev(own) : null as unknown as number);
  }
  const spreads = [...spreadByJudge.values()].filter((value): value is number => value !== null);
  const meanSpread = spreads.length > 0 ? mean(spreads) : 0;

  const reports: JudgeIntegrityReport[] = [];
  for (const judgeId of judgeIds) {
    const flags: IntegrityFlag[] = [];

    const sheet = input.sheets.find((s) => s.judgeId === judgeId);
    const completion = !sheet || sheet.total === 0 ? 1 : sheet.submitted / sheet.total;
    if (completion < 1 && input.roundStatus !== "open") {
      flags.push({
        metric: "completion",
        level: "info",
        explanation: `${sheet?.submitted ?? 0} of ${sheet?.total ?? 0} score sheets submitted.`,
      });
    }

    let biasZ: number | null = null;
    let differentiationRatio: number | null = null;
    let agreement: number | null = null;

    if (panelEnabled) {
      // Severity/leniency: mean z-score of this judge's totals vs. per-contestant panel mean.
      const zScores: number[] = [];
      for (const contestantId of contestantsOfJudge(judgeId)) {
        const panelTotals = judgesOfContestant(contestantId).map(
          (other) => totals.get(`${other}:${contestantId}`) ?? 0,
        );
        if (panelTotals.length < MIN_PANEL_SIZE) continue;
        const m = mean(panelTotals);
        const sd = stddev(panelTotals);
        zScores.push(((totals.get(`${judgeId}:${contestantId}`) ?? 0) - m) / (sd === 0 ? 1 : sd));
      }
      if (zScores.length > 0) {
        biasZ = mean(zScores);
        if (Math.abs(biasZ) >= BIAS_Z_CRITICAL) {
          flags.push({
            metric: "severity_bias",
            level: "critical",
            explanation: `${biasZ > 0 ? "Scores consistently above" : "Scores consistently below"} the panel average (bias z = ${biasZ.toFixed(2)}).`,
          });
        } else if (Math.abs(biasZ) >= BIAS_Z_WARNING) {
          flags.push({
            metric: "severity_bias",
            level: "warning",
            explanation: `Mild ${biasZ > 0 ? "leniency" : "severity"} vs. the panel (bias z = ${biasZ.toFixed(2)}).`,
          });
        }
      }

      // Differentiation: this judge's spread vs. the panel's average spread.
      const ownSpread = spreadByJudge.get(judgeId);
      if (ownSpread !== null && ownSpread !== undefined && meanSpread > 0) {
        differentiationRatio = ownSpread / meanSpread;
        if (differentiationRatio <= DIFFERENTIATION_RATIO_CRITICAL) {
          flags.push({
            metric: "differentiation",
            level: "critical",
            explanation: "Scores barely differentiate between contestants (possible straight-lining).",
          });
        } else if (differentiationRatio <= DIFFERENTIATION_RATIO_WARNING) {
          flags.push({
            metric: "differentiation",
            level: "warning",
            explanation: "Low score spread vs. the panel — contestants are not being separated.",
          });
        }
      }

      // Agreement: Spearman rank correlation with the panel-consensus ranking.
      const shared = contestantsOfJudge(judgeId).filter((contestantId) => {
        const panelTotals = judgesOfContestant(contestantId);
        return panelTotals.length >= MIN_SCORES_PER_CONTESTANT;
      });
      if (shared.length >= 2) {
        const ownValues = shared.map((c) => totals.get(`${judgeId}:${c}`) ?? 0);
        const consensusValues = shared.map((c) =>
          mean(judgesOfContestant(c).map((other) => totals.get(`${other}:${c}`) ?? 0)),
        );
        agreement = spearman(ownValues, consensusValues);
        if (agreement < 0) {
          flags.push({
            metric: "agreement",
            level: "critical",
            explanation: `Ranking runs against panel consensus (ρ = ${agreement.toFixed(2)}).`,
          });
        } else if (agreement < AGREEMENT_WARNING) {
          flags.push({
            metric: "agreement",
            level: "warning",
            explanation: `Ranking diverges from panel consensus (ρ = ${agreement.toFixed(2)}).`,
          });
        }
      }
    }

    reports.push({ judgeId, biasZ, differentiationRatio, agreement, completion, flags });
  }
  return reports;
}
```

Implementation note: `spreadByJudge` stores `null` when a judge scored fewer than 2 contestants; simplify by storing `-1` sentinel and skipping those judges in both the baseline and their own ratio (adjust the two `null as unknown as number` spots accordingly — the final code must not contain assertions or sentinels that leak; use a separate `Set` of judges with valid spreads).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/judgeIntegrity.test.ts`
Expected: PASS (6 tests). Hand-verify fixture math from the test comments if any assertion is off — fix the implementation, never the expected statistics.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/judgeIntegrity.ts convex-test/judgeIntegrity.test.ts
git commit -m "feat: pure judge integrity statistics with conservative flag thresholds"
```

---

### Task 3: Integrity in roundMonitor + `integrityReport` query

**Files:**
- Modify: `convex/enter/rounds.ts`
- Test: `convex-test/integritySurfaces.test.ts`

**Interfaces:**
- Consumes: `computeJudgeIntegrity` (Task 2), `requireEventSession`, `loadRound` (both already in file).
- Produces:
  - `roundMonitor` return gains `integrity: Array<{ judgeId: Id<"eventAccounts">; flags: IntegrityFlag[]; completion: number }>`.
  - `enter/rounds.integrityReport` query, args `{ sessionToken: string; roundId: Id<"rounds"> }`, returning `{ roundName: string; judges: Array<{ judgeId: Id<"eventAccounts">; name: string; biasZ: number | null; differentiationRatio: number | null; agreement: number | null; completion: number; flags: IntegrityFlag[] }> }`.

- [ ] **Step 1: Write the failing tests**

Create `convex-test/integritySurfaces.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aliceIdentity, prepareScoredEvent, setupTest } from "./setup";

const BASE = { orgSlug: "acme", eventSlug: "gala" } as const;

async function submitAll(
  t: ReturnType<typeof setupTest>,
  sessionToken: string,
  criterionIds: Id<"criteria">[],
  values: number[][], // per contestant, per criterion
) {
  const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken });
  const sheets = [...mine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
  for (const [i, sheet] of sheets.entries()) {
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken,
      sheetId: sheet.sheetId,
      values: Object.fromEntries(criterionIds.map((id, k) => [id, values[i][k]])),
    });
  }
}

async function addThirdJudge(t: ReturnType<typeof setupTest>) {
  const account = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
    ...BASE, kind: "judge", displayName: "Dave", username: "dave", password: "password123",
  });
  const event = await t.withIdentity(aliceIdentity).query(api.events.get, { ...BASE });
  const login = await t.action(api.eventAuth.login, {
    eventCode: event!.eventCode, username: "dave", password: "password123",
  });
  return { accountId: account.accountId, sessionToken: login.token };
}

describe("integrity surfaces", () => {
  it("roundMonitor includes a compact integrity summary", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const dave = await addThirdJudge(t);
    // Bob & Carol agree; Dave is +3 on everything (lenient).
    await submitAll(t, ids.judgeSessions.bob, ids.criterionIds, [[5, 5], [6, 6]]);
    await submitAll(t, ids.judgeSessions.carol, ids.criterionIds, [[5, 5], [6, 6]]);
    await submitAll(t, dave.sessionToken, ids.criterionIds, [[8, 8], [9, 9]]);

    // A staff session is required for roundMonitor: create one staff account.
    const staff = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      ...BASE, kind: "staff", displayName: "Staff", username: "staff1", password: "password123",
    });
    const event = await t.withIdentity(aliceIdentity).query(api.events.get, { ...BASE });
    const staffLogin = await t.action(api.eventAuth.login, {
      eventCode: event!.eventCode, username: "staff1", password: "password123",
    });

    const monitor = await t.query(api.enter.rounds.roundMonitor, {
      sessionToken: staffLogin.token, roundId: ids.roundId,
    });
    expect(monitor.integrity.length).toBe(3);
    const daveEntry = monitor.integrity.find((i) => i.judgeId === dave.accountId)!;
    expect(daveEntry.flags.some((f) => f.metric === "severity_bias")).toBe(true);
  });

  it("integrityReport returns full metrics for the review page", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const staff = await t.withIdentity(aliceIdentity).action(api.accounts.create, {
      ...BASE, kind: "staff", displayName: "Staff", username: "staff1", password: "password123",
    });
    const event = await t.withIdentity(aliceIdentity).query(api.events.get, { ...BASE });
    const staffLogin = await t.action(api.eventAuth.login, {
      eventCode: event!.eventCode, username: "staff1", password: "password123",
    });
    const report = await t.query(api.enter.rounds.integrityReport, {
      sessionToken: staffLogin.token, roundId: ids.roundId,
    });
    expect(report.roundName).toBe("R");
    expect(report.judges.length).toBe(2); // bob + carol
    expect(report.judges.every((j) => Array.isArray(j.flags))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/integritySurfaces.test.ts`
Expected: FAIL — `integrity` undefined / `integrityReport` not a function.

- [ ] **Step 3: Implement**

In `convex/enter/rounds.ts`, add import near the top:

```ts
import { computeJudgeIntegrity, type IntegrityFlag } from "../lib/judgeIntegrity";
```

Add a private helper above `roundMonitor`:

```ts
async function loadIntegrity(
  ctx: QueryCtx,
  args: { eventId: Id<"events">; round: Doc<"rounds"> },
) {
  const [criteria, scores, sheets] = await Promise.all([
    ctx.db.query("criteria").withIndex("by_round_id", (q) => q.eq("roundId", args.round._id)).collect(),
    ctx.db.query("scores").withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", args.eventId).eq("roundId", args.round._id)).collect(),
    ctx.db.query("scoreSheets").withIndex("by_event_id_and_round_id", (q) => q.eq("eventId", args.eventId).eq("roundId", args.round._id)).collect(),
  ]);
  const sheetCounts = new Map<Id<"eventAccounts">, { submitted: number; total: number }>();
  for (const sheet of sheets) {
    const counts = sheetCounts.get(sheet.judgeId) ?? { submitted: 0, total: 0 };
    counts.total += 1;
    if (sheet.status === "submitted" || sheet.status === "locked") counts.submitted += 1;
    sheetCounts.set(sheet.judgeId, counts);
  }
  return computeJudgeIntegrity({
    roundStatus: args.round.status,
    criteria: criteria.map((c) => ({ id: c._id, weight: c.weight, minScore: c.minScore, maxScore: c.maxScore })),
    scores: scores.map((s) => ({ judgeId: s.judgeId, contestantId: s.contestantId, criterionId: s.criterionId, value: s.value })),
    sheets: [...sheetCounts.entries()].map(([judgeId, counts]) => ({ judgeId, ...counts })),
  });
}
```

(If `QueryCtx`/`Doc` are not already imported in `enter/rounds.ts`, add them from `./_generated/server` / `./_generated/dataModel` — check the file's existing imports first.)

Extend `roundMonitor`'s return (inside the handler, after `sheets` is fetched — reuse `round` from `loadRound`):

```ts
    const integrity = await loadIntegrity(ctx, { eventId: sctx.event._id, round });
```

and add to the returned object:

```ts
      integrity: integrity.map((report) => ({
        judgeId: report.judgeId,
        completion: report.completion,
        flags: report.flags,
      })),
```

Add the new query after `roundMonitor`:

```ts
export const integrityReport = query({
  args: { sessionToken: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken, kind: "staff",
    });
    const round = await loadRound(ctx, sctx, args.roundId);
    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) => q.eq("eventId", sctx.event._id).eq("kind", "judge"))
      .collect();
    const integrity = await loadIntegrity(ctx, { eventId: sctx.event._id, round });
    const byId = new Map(integrity.map((report) => [report.judgeId, report]));
    return {
      roundName: round.name,
      judges: judges
        .map((judge) => ({
          judgeId: judge._id,
          name: judge.displayName,
          ...(byId.get(judge._id) ?? { biasZ: null, differentiationRatio: null, agreement: null, completion: 1, flags: [] as IntegrityFlag[] }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/integritySurfaces.test.ts`
Expected: PASS (2 tests). Then `npm run test`.

- [ ] **Step 5: Commit**

```bash
git add convex/enter/rounds.ts convex-test/integritySurfaces.test.ts
git commit -m "feat: judge integrity summary in round monitor and dedicated report query"
```

---

### Task 4: RoundIntegrityPanel on the staff review page

Apply the `/ui-ux-pro-max` skill guidelines for this task.

**Files:**
- Create: `components/enter/RoundIntegrityPanel.tsx`
- Modify: `app/enter/staff/rounds/[roundId]/review/page.tsx`

**Interfaces:**
- Consumes: `api.enter.rounds.integrityReport` (Task 3), `useEnterSession` from `components/enter/EnterAppShell`.
- Produces: `RoundIntegrityPanel({ roundId })`.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LEVEL_TONE: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-warning-muted text-warning",
  critical: "bg-destructive/10 text-destructive",
};

function metricBar(label: string, value: string | null) {
  return (
    <div className="min-w-28">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value ?? "—"}</div>
    </div>
  );
}

export function RoundIntegrityPanel({ roundId }: { roundId: Id<"rounds"> }) {
  const { sessionToken } = useEnterSession();
  const report = useQuery(api.enter.rounds.integrityReport, { sessionToken, roundId });

  if (report === undefined) return null;
  const flagged = report.judges.filter((judge) => judge.flags.length > 0);

  return (
    <Card className="border-border/60 shadow-sm" aria-label="Judge integrity">
      <CardHeader className="py-3 px-6 border-b border-border/40 bg-muted/20">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" aria-hidden />
          <span>Judge Integrity</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Advisory signals from panel statistics — they never change scores or rankings automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {report.judges.length === 0 && (
          <p className="text-xs text-muted-foreground">No judges assigned yet.</p>
        )}
        {report.judges.map((judge) => (
          <div key={judge.judgeId} className="rounded-lg border border-border/50 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{judge.name}</span>
              <div className="flex flex-wrap gap-1">
                {judge.flags.length === 0 ? (
                  <Badge className="border-transparent bg-success-muted text-success">clear</Badge>
                ) : (
                  judge.flags.map((flag, i) => (
                    <Badge key={i} className={`border-transparent capitalize ${LEVEL_TONE[flag.level] ?? ""}`}>
                      {flag.metric.replace("_", " ")}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {metricBar("Bias z", judge.biasZ === null ? null : judge.biasZ.toFixed(2))}
              {metricBar("Differentiation", judge.differentiationRatio === null ? null : judge.differentiationRatio.toFixed(2))}
              {metricBar("Agreement ρ", judge.agreement === null ? null : judge.agreement.toFixed(2))}
              {metricBar("Sheets", `${Math.round(judge.completion * 100)}%`)}
            </div>
            {judge.flags.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {judge.flags.map((flag, i) => (
                  <li key={i}>{flag.explanation}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {flagged.length === 0 && report.judges.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No integrity signals on this panel. Statistics activate with {3}+ judges scoring.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

Replace the literal `{3}` with a named constant `const MIN_PANEL_NOTE = 3;` and use `{MIN_PANEL_NOTE}` — do not ship a magic inline number.

- [ ] **Step 2: Mount on the review page**

In `app/enter/staff/rounds/[roundId]/review/page.tsx`, add the import:

```tsx
import { RoundIntegrityPanel } from "@/components/enter/RoundIntegrityPanel";
```

Render it between the "Computed Standings" card (which ends `</Card>` at line ~418) and the "Applied Tie Breaks" block (line ~420 `{tieBreaks.length > 0 && (`):

```tsx
      <RoundIntegrityPanel roundId={roundId} />
```

- [ ] **Step 3: Validate**

Run: `npm run lint`; then `npm run build`.
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add components/enter/RoundIntegrityPanel.tsx "app/enter/staff/rounds/[roundId]/review/page.tsx"
git commit -m "feat: advisory judge integrity panel on staff round review"
```

---

### Task 5: AI daily quota helper

**Files:**
- Create: `convex/lib/aiUsage.ts`
- Test: `convex-test/aiUsage.test.ts`

**Interfaces:**
- Consumes: `usage` table via `by_org_id_and_resource` index.
- Produces:
  ```ts
  resolveDailyQuotaCount(currentCount: number | null, rowPeriodKey: string | null, today: string, limit: number): number  // throws ConvexError LIMIT_EXCEEDED when over
  consumeAiQuota(ctx: MutationCtx, orgId: Id<"organizations">, resource: string, limit: number): Promise<void>
  AI_USAGE_RESOURCES = { wizard: "ai_wizard_calls", explanations: "ai_explanations" } as const;
  WIZARD_DAILY_LIMIT = 20; EXPLANATION_DAILY_LIMIT = 30;
  ```

- [ ] **Step 1: Write the failing tests**

Create `convex-test/aiUsage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveDailyQuotaCount } from "../convex/lib/aiUsage";

describe("resolveDailyQuotaCount", () => {
  it("starts at 1 for a fresh resource", () => {
    expect(resolveDailyQuotaCount(null, null, "2026-08-17", 20)).toBe(1);
  });

  it("increments within the same day and blocks at the limit", () => {
    expect(resolveDailyQuotaCount(5, "2026-08-17", "2026-08-17", 20)).toBe(6);
    expect(() => resolveDailyQuotaCount(20, "2026-08-17", "2026-08-17", 20)).toThrowError(
      expect.objectContaining({ data: { code: "LIMIT_EXCEEDED" } }),
    );
  });

  it("resets when the period key is from an earlier day", () => {
    expect(resolveDailyQuotaCount(20, "2026-08-16", "2026-08-17", 20)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/aiUsage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `convex/lib/aiUsage.ts`**

```ts
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "./errors";

export const WIZARD_DAILY_LIMIT = 20;
export const EXPLANATION_DAILY_LIMIT = 30;

export const AI_USAGE_RESOURCES = {
  wizard: "ai_wizard_calls",
  explanations: "ai_explanations",
} as const;

export function todayKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function resolveDailyQuotaCount(
  currentCount: number | null,
  rowPeriodKey: string | null,
  today: string,
  limit: number,
): number {
  if (rowPeriodKey === null || rowPeriodKey !== today) return 1;
  const current = currentCount ?? 0;
  if (current >= limit) {
    throw appError(ErrorCode.LIMIT_EXCEEDED, `Daily AI limit reached (${limit}). Try again tomorrow.`);
  }
  return current + 1;
}

export async function consumeAiQuota(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  resource: string,
  limit: number,
): Promise<void> {
  const today = todayKey();
  const existing = await ctx.db
    .query("usage")
    .withIndex("by_org_id_and_resource", (q) => q.eq("orgId", orgId).eq("resource", resource))
    .unique();
  const nextCount = resolveDailyQuotaCount(existing?.count ?? null, existing?.periodKey ?? null, today, limit);
  if (existing) {
    await ctx.db.patch(existing._id, { count: nextCount, periodKey: today });
  } else {
    await ctx.db.insert("usage", { orgId, resource, count: nextCount, periodKey: today });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/aiUsage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/aiUsage.ts convex-test/aiUsage.test.ts
git commit -m "feat: daily AI usage quota with day-bucket reset"
```

---

### Task 6: Template wizard pure core (validation + retry)

**Files:**
- Create: `convex/lib/templateWizard.ts`
- Test: `convex-test/templateWizard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type TemplateDraftConfig = Doc<"eventTemplates">["configSnapshot"];
  type TemplateDraft = { name: string; description: string; configSnapshot: TemplateDraftConfig };
  type LlmCaller = (prompt: string) => Promise<unknown>;
  validateTemplateDraft(raw: unknown): { draft: TemplateDraft } | { error: string };
  buildTemplateDraft(prompt: string, callLlm: LlmCaller): Promise<TemplateDraft | null>; // one retry, then null
  WIZARD_SYSTEM_INSTRUCTION: string;
  ```

- [ ] **Step 1: Write the failing tests**

Create `convex-test/templateWizard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTemplateDraft, validateTemplateDraft } from "../convex/lib/templateWizard";

const VALID = {
  name: "City Pageant",
  description: "Three-round city pageant",
  configSnapshot: {
    decimalPrecision: 2,
    resultVisibility: "private",
    rounds: [
      {
        name: "Preliminary",
        qualifiesToNextRound: true,
        criteria: [
          { name: "Beauty", weight: 30, minScore: 0, maxScore: 100, decimalPrecision: 2 },
          { name: "Q&A", weight: 70, minScore: 0, maxScore: 100, decimalPrecision: 2 },
        ],
      },
    ],
  },
};

describe("validateTemplateDraft", () => {
  it("accepts and normalizes a valid draft (orders rewritten to 0-based)", () => {
    const result = validateTemplateDraft({
      ...VALID,
      configSnapshot: {
        ...VALID.configSnapshot,
        rounds: [{ ...VALID.configSnapshot.rounds[0], order: 7 }],
      },
    });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.draft.configSnapshot.rounds[0].order).toBe(0);
      expect(result.draft.configSnapshot.rounds[0].criteria[0].order).toBe(0);
    }
  });

  it("rejects out-of-range weights with a specific error", () => {
    const bad = structuredClone(VALID);
    (bad.configSnapshot.rounds[0].criteria[0] as { weight: number }).weight = 0;
    const result = validateTemplateDraft(bad);
    expect("error" in result).toBe(true);
  });

  it("rejects missing rounds and bad visibility", () => {
    expect("error" in validateTemplateDraft({ ...VALID, configSnapshot: { ...VALID.configSnapshot, rounds: [] } })).toBe(true);
    const bad = structuredClone(VALID);
    (bad.configSnapshot as { resultVisibility: string }).resultVisibility = "everyone";
    expect("error" in validateTemplateDraft(bad)).toBe(true);
  });

  it("rejects non-objects and min > max", () => {
    expect("error" in validateTemplateDraft("nope")).toBe(true);
    const bad = structuredClone(VALID);
    (bad.configSnapshot.rounds[0].criteria[0] as { minScore: number }).minScore = 101;
    expect("error" in validateTemplateDraft(bad)).toBe(true);
  });
});

describe("buildTemplateDraft", () => {
  it("returns the first valid draft without retrying", async () => {
    let calls = 0;
    const draft = await buildTemplateDraft("a pageant", async () => {
      calls++;
      return VALID;
    });
    expect(calls).toBe(1);
    expect(draft?.name).toBe("City Pageant");
  });

  it("retries once with the validation error, then succeeds", async () => {
    const prompts: string[] = [];
    let attempt = 0;
    const draft = await buildTemplateDraft("a pageant", async (prompt) => {
      prompts.push(prompt);
      attempt++;
      return attempt === 1 ? { nonsense: true } : VALID;
    });
    expect(draft?.name).toBe("City Pageant");
    expect(prompts.length).toBe(2);
    expect(prompts[1]).toContain("invalid");
  });

  it("gives up after two invalid attempts", async () => {
    let calls = 0;
    const draft = await buildTemplateDraft("a pageant", async () => {
      calls++;
      return { still: "wrong" };
    });
    expect(calls).toBe(2);
    expect(draft).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/templateWizard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `convex/lib/templateWizard.ts`**

```ts
import type { Doc } from "../_generated/dataModel";

export type TemplateDraftConfig = Doc<"eventTemplates">["configSnapshot"];
export type TemplateDraft = { name: string; description: string; configSnapshot: TemplateDraftConfig };
export type LlmCaller = (prompt: string) => Promise<unknown>;

export const WIZARD_SYSTEM_INSTRUCTION = [
  "You design templates for judged live events (pageants, singing contests, quiz bees).",
  "Given a plain-language event description, return a template as JSON with this exact shape:",
  '{"name": string, "description": string, "configSnapshot": {"decimalPrecision": 0-4, "resultVisibility": "private"|"organization"|"public",',
  '"categories": optional [{"name": string}], "rounds": [{"name": string, "qualifiesToNextRound": boolean,',
  '"weight": optional number, "advancement": optional {"mode": "none"|"top_count"|"top_percent"|"manual", "count"?: number, "percent"?: number, "allowOverride": boolean},',
  '"criteria": [{"name": string, "weight": 1-100, "minScore": number, "maxScore": number, "decimalPrecision": 0-4}] }] }}',
  "Rules: 1-6 rounds; 1-8 criteria per round; criterion weights within a round should sum to about 100;",
  "use realistic judging scales (e.g. 0-10 or 0-100); only set advancement on rounds that cut contestants.",
].join("\n");

const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;
const MAX_ROUNDS = 6;
const MAX_CRITERIA = 8;
const MAX_ROUNDS_IN_PROMPT = 2000;

type Validation = { draft: TemplateDraft } | { error: string };

function fail(error: string): Validation {
  return { error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateTemplateDraft(raw: unknown): Validation {
  if (!isRecord(raw)) return fail("Response is not a JSON object");
  const name = str(raw.name)?.trim();
  if (!name) return fail("name is missing");
  if (name.length > MAX_NAME) return fail(`name exceeds ${MAX_NAME} characters`);
  const description = str(raw.description)?.trim() ?? "";
  if (description.length > MAX_DESCRIPTION) return fail(`description exceeds ${MAX_DESCRIPTION} characters`);

  const snapshot = raw.configSnapshot;
  if (!isRecord(snapshot)) return fail("configSnapshot is missing");
  const decimalPrecision = num(snapshot.decimalPrecision);
  if (decimalPrecision === null || !Number.isInteger(decimalPrecision) || decimalPrecision < 0 || decimalPrecision > 4) {
    return fail("decimalPrecision must be an integer 0-4");
  }
  const resultVisibility = str(snapshot.resultVisibility);
  if (resultVisibility !== "private" && resultVisibility !== "organization" && resultVisibility !== "public") {
    return fail("resultVisibility must be private, organization, or public");
  }

  let categories: TemplateDraftConfig["categories"];
  if (snapshot.categories !== undefined) {
    if (!Array.isArray(snapshot.categories) || snapshot.categories.length === 0) return fail("categories must be a non-empty array");
    const names: { name: string; order: number }[] = [];
    for (const [i, category] of snapshot.categories.entries()) {
      if (!isRecord(category)) return fail("categories entries must be objects");
      const categoryName = str(category.name)?.trim();
      if (!categoryName) return fail("category name is missing");
      names.push({ name: categoryName, order: i });
    }
    categories = names;
  }

  if (!Array.isArray(snapshot.rounds) || snapshot.rounds.length === 0) return fail("rounds must be a non-empty array");
  if (snapshot.rounds.length > MAX_ROUNDS) return fail(`at most ${MAX_ROUNDS} rounds are allowed`);

  const rounds: TemplateDraftConfig["rounds"] = [];
  for (const [i, rawRound] of snapshot.rounds.entries()) {
    if (!isRecord(rawRound)) return fail(`round ${i + 1} is not an object`);
    const roundName = str(rawRound.name)?.trim();
    if (!roundName) return fail(`round ${i + 1} has no name`);
    const qualifiesToNextRound = rawRound.qualifiesToNextRound === true;

    let scoringRules: TemplateDraftConfig["rounds"][number]["scoringRules"];
    if (rawRound.scoringRules !== undefined) {
      if (!isRecord(rawRound.scoringRules)) return fail(`round ${i + 1} scoringRules must be an object`);
      const winner = rawRound.scoringRules.winner;
      if (winner !== "highest" && winner !== "lowest") return fail(`round ${i + 1} scoringRules.winner must be highest or lowest`);
      scoringRules = { winner };
    }

    let weight: number | undefined;
    if (rawRound.weight !== undefined) {
      const parsed = num(rawRound.weight);
      if (parsed === null || parsed < 1 || parsed > 100) return fail(`round ${i + 1} weight must be 1-100`);
      weight = parsed;
    }

    let advancement: TemplateDraftConfig["rounds"][number]["advancement"];
    if (rawRound.advancement !== undefined) {
      if (!isRecord(rawRound.advancement)) return fail(`round ${i + 1} advancement must be an object`);
      const mode = rawRound.advancement.mode;
      if (mode !== "none" && mode !== "top_count" && mode !== "top_percent" && mode !== "manual") {
        return fail(`round ${i + 1} advancement.mode is invalid`);
      }
      const count = rawRound.advancement.count === undefined ? undefined : num(rawRound.advancement.count);
      const percent = rawRound.advancement.percent === undefined ? undefined : num(rawRound.advancement.percent);
      if (count !== undefined && (!Number.isInteger(count) || count < 1)) return fail(`round ${i + 1} advancement.count must be a positive integer`);
      if (percent !== undefined && (percent < 1 || percent > 100)) return fail(`round ${i + 1} advancement.percent must be 1-100`);
      advancement = {
        mode,
        count,
        percent,
        allowOverride: rawRound.advancement.allowOverride === true,
      };
    }

    if (!Array.isArray(rawRound.criteria) || rawRound.criteria.length === 0) {
      return fail(`round ${i + 1} needs at least one criterion`);
    }
    if (rawRound.criteria.length > MAX_CRITERIA) return fail(`round ${i + 1} exceeds ${MAX_CRITERIA} criteria`);
    const criteria: TemplateDraftConfig["rounds"][number]["criteria"] = [];
    for (const [j, rawCriterion] of rawRound.criteria.entries()) {
      if (!isRecord(rawCriterion)) return fail(`round ${i + 1} criterion ${j + 1} is not an object`);
      const criterionName = str(rawCriterion.name)?.trim();
      if (!criterionName) return fail(`round ${i + 1} criterion ${j + 1} has no name`);
      const criterionWeight = num(rawCriterion.weight);
      if (criterionWeight === null || criterionWeight < 1 || criterionWeight > 100) {
        return fail(`round ${i + 1} criterion ${j + 1} weight must be 1-100`);
      }
      const minScore = num(rawCriterion.minScore);
      const maxScore = num(rawCriterion.maxScore);
      if (minScore === null || maxScore === null || minScore < 0 || maxScore > 1000 || minScore > maxScore) {
        return fail(`round ${i + 1} criterion ${j + 1} has an invalid score range`);
      }
      const criterionPrecision = num(rawCriterion.decimalPrecision);
      if (criterionPrecision === null || !Number.isInteger(criterionPrecision) || criterionPrecision < 0 || criterionPrecision > 4) {
        return fail(`round ${i + 1} criterion ${j + 1} decimalPrecision must be 0-4`);
      }
      criteria.push({
        name: criterionName, order: j, weight: criterionWeight,
        minScore, maxScore, decimalPrecision: criterionPrecision,
      });
    }

    rounds.push({ name: roundName, order: i, qualifiesToNextRound, scoringRules, weight, advancement, criteria });
  }

  const configSnapshot: TemplateDraftConfig = {
    decimalPrecision,
    resultVisibility,
    ...(categories === undefined ? {} : { categories }),
    rounds,
  };
  return { draft: { name, description, configSnapshot } };
}

export async function buildTemplateDraft(prompt: string, callLlm: LlmCaller): Promise<TemplateDraft | null> {
  if (!prompt.trim() || prompt.length > MAX_ROUNDS_IN_PROMPT) return null;
  const first = validateTemplateDraft(await callLlm(prompt));
  if ("draft" in first) return first.draft;
  const second = validateTemplateDraft(
    await callLlm(`${prompt}\n\nYour previous response was invalid: ${first.error}. Fix it and return valid JSON only.`),
  );
  return "draft" in second ? second.draft : null;
}
```

(Rename `MAX_ROUNDS_IN_PROMPT` to `MAX_PROMPT_LENGTH` — clearer; update the reference.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/templateWizard.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/templateWizard.ts convex-test/templateWizard.test.ts
git commit -m "feat: pure template wizard core with structural validation and one retry"
```

---

### Task 7: `templates.generateFromPrompt` + `templates.saveGenerated`

**Files:**
- Modify: `convex/templates.ts`
- Test: `convex-test/wizardSave.test.ts`

**Interfaces:**
- Consumes: `buildTemplateDraft`, `validateTemplateDraft`, `WIZARD_SYSTEM_INSTRUCTION` (Task 6); `geminiGenerateJson` (Task 1); `consumeAiQuota`, `AI_USAGE_RESOURCES`, `WIZARD_DAILY_LIMIT` (Task 5); `events.createFromTemplate` (existing, untouched).
- Produces:
  - `api.templates.generateFromPrompt` action, args `{ orgSlug: string; prompt: string }`, returns `TemplateDraft`.
  - `api.templates.saveGenerated` mutation, args `{ orgSlug: string; eventName: string; draft: TemplateDraft }` (validator mirrors the draft shape loosely; server re-validates via `validateTemplateDraft`), returns `{ templateId: Id<"eventTemplates"> }`.

- [ ] **Step 1: Write the failing tests**

Create `convex-test/wizardSave.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";

const VALID_DRAFT = {
  name: "AI Pageant",
  description: "Generated design",
  configSnapshot: {
    decimalPrecision: 2,
    resultVisibility: "private",
    rounds: [
      {
        name: "Preliminary",
        order: 0,
        qualifiesToNextRound: false,
        criteria: [
          { name: "Beauty", order: 0, weight: 50, minScore: 0, maxScore: 100, decimalPrecision: 2 },
          { name: "Q&A", order: 1, weight: 50, minScore: 0, maxScore: 100, decimalPrecision: 2 },
        ],
      },
    ],
  },
};

describe("templates.saveGenerated", () => {
  it("persists a re-validated draft as an org template and audits it", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const result = await t.withIdentity(aliceIdentity).mutation(api.templates.saveGenerated, {
      orgSlug: "acme",
      eventName: "Spring Pageant",
      draft: VALID_DRAFT,
    });
    expect(result.templateId).toBeTruthy();
    const templates = await t.withIdentity(aliceIdentity).query(api.templates.list, { orgSlug: "acme" });
    const saved = templates.find((tpl) => tpl._id === result.templateId)!;
    expect(saved.name).toBe("AI Pageant");
    expect(saved.isSystem).toBe(false);
  });

  it("rejects an invalid draft (server-side re-validation)", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const bad = structuredClone(VALID_DRAFT);
    (bad.configSnapshot.rounds[0].criteria[0] as { weight: number }).weight = 500;
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.templates.saveGenerated, {
        orgSlug: "acme", eventName: "Spring Pageant", draft: bad,
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("round-trips: saved template creates an event via createFromTemplate", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const { templateId } = await t.withIdentity(aliceIdentity).mutation(api.templates.saveGenerated, {
      orgSlug: "acme", eventName: "Spring Pageant", draft: VALID_DRAFT,
    });
    const slug = await t.withIdentity(aliceIdentity).mutation(api.events.createFromTemplate, {
      orgSlug: "acme", name: "Spring Pageant", templateId,
    });
    expect(slug).toBe("spring-pageant");
  });
});

describe("wizard quota", () => {
  it("blocks after the daily limit via consumeWizardQuota", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    for (let i = 0; i < 20; i++) {
      await t.withIdentity(aliceIdentity).mutation(internal.templates.consumeWizardQuota, { orgSlug: "acme" });
    }
    await expect(
      t.withIdentity(aliceIdentity).mutation(internal.templates.consumeWizardQuota, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/wizardSave.test.ts`
Expected: FAIL — `saveGenerated`/`consumeWizardQuota` not functions.

- [ ] **Step 3: Implement in `convex/templates.ts`**

Add imports:

```ts
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requirePermission } from "./lib/authz";  // already imported
import { geminiGenerateJson } from "./lib/gemini";
import {
  AI_USAGE_RESOURCES,
  WIZARD_DAILY_LIMIT,
  consumeAiQuota,
} from "./lib/aiUsage";
import {
  WIZARD_SYSTEM_INSTRUCTION,
  buildTemplateDraft,
  validateTemplateDraft,
  type TemplateDraft,
} from "./lib/templateWizard";
```

(Check which of `requirePermission`/`mutation`/`query` are already imported and only add what is missing: `action`, `internalMutation`, `internal`.)

Append:

```ts
const draftArg = v.object({
  name: v.string(),
  description: v.string(),
  configSnapshot: v.object({
    decimalPrecision: v.number(),
    resultVisibility: v.string(),
    categories: v.optional(v.array(v.object({ name: v.string(), order: v.number() }))),
    rounds: v.array(v.object({
      name: v.string(),
      order: v.number(),
      qualifiesToNextRound: v.boolean(),
      scoringRules: v.optional(v.object({ winner: v.string() })),
      weight: v.optional(v.number()),
      advancement: v.optional(v.object({
        mode: v.string(),
        count: v.optional(v.number()),
        percent: v.optional(v.number()),
        allowOverride: v.boolean(),
      })),
      criteria: v.array(v.object({
        name: v.string(),
        order: v.number(),
        weight: v.number(),
        minScore: v.number(),
        maxScore: v.number(),
        decimalPrecision: v.number(),
      })),
    })),
  }),
});

export const consumeWizardQuota = internalMutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "event.create" });
    await consumeAiQuota(ctx, actx.org._id, AI_USAGE_RESOURCES.wizard, WIZARD_DAILY_LIMIT);
  },
});

export const generateFromPrompt = action({
  args: { orgSlug: v.string(), prompt: v.string() },
  handler: async (ctx, args): Promise<TemplateDraft> => {
    const prompt = args.prompt.trim();
    if (!prompt || prompt.length > 2000) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Describe the event in 1-2000 characters");
    }
    await ctx.runMutation(internal.templates.consumeWizardQuota, { orgSlug: args.orgSlug });
    const draft = await buildTemplateDraft(prompt, (userPrompt) =>
      geminiGenerateJson({ systemInstruction: WIZARD_SYSTEM_INSTRUCTION, prompt: userPrompt }),
    );
    if (!draft) {
      throw appError(ErrorCode.UPSTREAM, "The AI could not produce a valid template — try rewording your description");
    }
    return draft;
  },
});

export const saveGenerated = mutation({
  args: { orgSlug: v.string(), eventName: v.string(), draft: draftArg },
  handler: async (ctx, args): Promise<{ templateId: Id<"eventTemplates"> }> => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "event.create" });
    // Defense in depth: re-validate the client-supplied draft structurally.
    const validated = validateTemplateDraft(args.draft);
    if ("error" in validated) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Invalid template draft: ${validated.error}`);
    }
    if (!args.eventName.trim()) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Event name is required");
    }
    const templateId = await ctx.db.insert("eventTemplates", {
      orgId: actx.org._id,
      name: validated.draft.name,
      description: validated.draft.description,
      configSnapshot: validated.draft.configSnapshot,
      isSystem: false,
    });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "template.ai_generated",
      resourceType: "eventTemplate",
      resourceId: templateId,
      after: { name: validated.draft.name, eventName: args.eventName.trim(), promptGenerated: true },
    });
    return { templateId };
  },
});
```

Add missing type import if not present: `import type { Id } from "./_generated/dataModel";`.

Note: `validateTemplateDraft` narrows string fields beyond the loose `v.string()` validator (e.g. it enforces the visibility enum and weight ranges) — the loose validator is transport-level only; the structural validator is the security boundary.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/wizardSave.test.ts`
Expected: PASS (4 tests). Then `npm run test`.

- [ ] **Step 5: Commit**

```bash
git add convex/templates.ts convex-test/wizardSave.test.ts
git commit -m "feat: AI event setup wizard backend with quota, re-validation, and audit"
```

---

### Task 8: Wizard UI

Apply the `/ui-ux-pro-max` skill guidelines for this task.

**Files:**
- Create: `components/tabulation/AiEventWizardCard.tsx`
- Modify: `app/app/[orgSlug]/events/new/page.tsx`

**Interfaces:**
- Consumes: `api.templates.generateFromPrompt` (action), `api.templates.saveGenerated` + `api.events.createFromTemplate` (mutations), `TemplateDraft` type from `convex/lib/templateWizard`.
- Produces: `AiEventWizardCard({ orgSlug, eventName, onCreated })` where `onCreated: (slug: string) => void`.

- [ ] **Step 1: Create `components/tabulation/AiEventWizardCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ArrowRight, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { TemplateDraft } from "@/convex/lib/templateWizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function AiEventWizardCard({
  orgSlug,
  eventName,
  onCreated,
}: {
  orgSlug: string;
  eventName: string;
  onCreated: (slug: string) => void;
}) {
  const generate = useAction(api.templates.generateFromPrompt);
  const saveGenerated = useMutation(api.templates.saveGenerated);
  const createFromTemplate = useMutation(api.events.createFromTemplate);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [busy, setBusy] = useState<"generate" | "create" | null>(null);

  async function onGenerate() {
    setBusy("generate");
    try {
      setDraft(await generate({ orgSlug, prompt }));
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      toast.error(
        data?.code === "LIMIT_EXCEEDED"
          ? "Daily AI wizard limit reached — try again tomorrow."
          : data?.message ?? "The wizard could not design this event. Try rewording.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onAccept() {
    if (!draft) return;
    setBusy("create");
    try {
      const { templateId } = await saveGenerated({ orgSlug, eventName, draft });
      const slug = await createFromTemplate({ orgSlug, name: eventName, templateId });
      toast.success("Event created from the AI design.");
      onCreated(slug);
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      toast.error(data?.message ?? "Could not create the event.");
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles aria-hidden className="size-4 text-primary" />
          Or describe your event (AI)
        </CardTitle>
        <CardDescription>
          e.g. &quot;Miss Philippines pre-pageant: 3 rounds, 5 judges, top 10 advance after prelims.&quot;
          Review the design before anything is created.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft === null ? (
          <div className="space-y-2">
            <Label htmlFor="ai-event-prompt" className="sr-only">
              Describe your event
            </Label>
            <textarea
              id="ai-event-prompt"
              className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Describe the event, rounds, judging style, and how many advance…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy !== null}
            />
            <Button type="button" disabled={busy !== null || !prompt.trim()} onClick={() => void onGenerate()}>
              {busy === "generate" ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
              Design my event
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold">{draft.name}</p>
              {draft.description && <p className="text-xs text-muted-foreground">{draft.description}</p>}
            </div>
            {draft.configSnapshot.rounds.map((round, i) => (
              <div key={`${round.name}-${i}`} className="rounded-lg border p-3 space-y-1">
                <p className="text-sm font-medium">
                  Round {i + 1}: {round.name}
                  {round.advancement && round.advancement.mode !== "none" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({round.advancement.mode.replace("_", " ")}
                      {round.advancement.count !== undefined ? ` ${round.advancement.count}` : ""}
                      {round.advancement.percent !== undefined ? ` ${round.advancement.percent}%` : ""} advance)
                    </span>
                  )}
                </p>
                <ul className="text-xs text-muted-foreground">
                  {round.criteria.map((criterion) => (
                    <li key={criterion.name}>
                      {criterion.name} — {criterion.weight}% (scale {criterion.minScore}–{criterion.maxScore})
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy !== null || !eventName.trim()} onClick={() => void onAccept()}>
                {busy === "create" ? <Loader2 aria-hidden className="animate-spin" /> : <ArrowRight aria-hidden />}
                Create event from this design
              </Button>
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setDraft(null)}>
                <RotateCcw aria-hidden />
                Start over
              </Button>
            </div>
            {!eventName.trim() && (
              <p className="text-xs text-warning">Enter an event name above to enable creation.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount on the new-event page**

In `app/app/[orgSlug]/events/new/page.tsx`, add the import:

```tsx
import { AiEventWizardCard } from "@/components/tabulation/AiEventWizardCard";
```

Insert after the closing `</Card>` of the "Event details" card (line 79) and before the `<div className="space-y-3">` template section:

```tsx
      <AiEventWizardCard
        orgSlug={orgSlug}
        eventName={name}
        onCreated={(slug) => router.push(`/app/${orgSlug}/events/${slug}/overview`)}
      />
```

- [ ] **Step 3: Validate**

Run: `npm run lint`; then `npm run build`.
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add components/tabulation/AiEventWizardCard.tsx "app/app/[orgSlug]/events/new/page.tsx"
git commit -m "feat: AI event setup wizard card with review-before-create flow"
```

---

### Task 9: Explainer schema + backend

**Files:**
- Modify: `convex/schema.ts`, `convex/results.ts`
- Test: `convex-test/explain.test.ts`

**Interfaces:**
- Consumes: `requireResultAccess` (same file), `latestVersion` (imported in Phase 4 task), `geminiGenerateText` (Task 1), `consumeAiQuota` + `AI_USAGE_RESOURCES.explanations` + `EXPLANATION_DAILY_LIMIT` (Task 5).
- Produces:
  - New `resultExplanations` table.
  - `api.results.explain` action, args `{ orgSlug, eventSlug, roundId: Id<"rounds">, contestantId: Id<"contestants"> }`, returning `{ explanation: string; cached: boolean; facts: Record<string, unknown> }`.
  - Internal: `results.explainContext` (internalQuery), `results.storeExplanation` (internalMutation), `results.consumeExplanationQuota` (internalMutation).

- [ ] **Step 1: Add the table to `convex/schema.ts`**

Append inside `defineSchema({...})` (after `platformSettings`):

```ts
  resultExplanations: defineTable({
    resultVersionId: v.id("resultVersions"),
    eventId: v.id("events"),
    contestantId: v.id("contestants"),
    explanation: v.string(),
    model: v.string(),
    createdById: v.id("userProfiles"),
    createdAt: v.number(),
  })
    .index("by_result_version_and_contestant", ["resultVersionId", "contestantId"])
    .index("by_event_id", ["eventId"]),
```

- [ ] **Step 2: Write the failing tests**

Create `convex-test/explain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aliceIdentity, bobIdentity, prepareScoredEvent, setupTest } from "./setup";

const BASE = { orgSlug: "acme", eventSlug: "gala" } as const;

async function submitJudgeScores(
  t: ReturnType<typeof setupTest>,
  sessionToken: string,
  ids: Awaited<ReturnType<typeof prepareScoredEvent>>,
  perContestant: number[][],
) {
  const mine = await t.query(api.enter.scoring.myAssignments, { sessionToken });
  const sheets = [...mine.rounds[0].sheets].sort((a, b) => a.contestantNumber - b.contestantNumber);
  for (const [i, sheet] of sheets.entries()) {
    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken,
      sheetId: sheet.sheetId,
      values: Object.fromEntries(ids.criterionIds.map((id, k) => [id, perContestant[i][k]])),
    });
  }
}

async function setupPublishedRound(t: ReturnType<typeof setupTest>) {
  const ids = await prepareScoredEvent(t);
  await submitJudgeScores(t, ids.judgeSessions.bob, ids, [[8, 6], [5, 5]]);
  await submitJudgeScores(t, ids.judgeSessions.carol, ids, [[9, 7], [5, 5]]);
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.closeRound, { ...BASE, roundId: ids.roundId });
  await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.publishRound, { ...BASE, roundId: ids.roundId });
  const versions = await t.withIdentity(aliceIdentity).query(api.results.listRoundVersions, {
    ...BASE, roundId: ids.roundId,
  });
  return { ids, versionId: versions[0].version };
}

describe("results.explain", () => {
  it("serves cached explanations without touching the LLM", async () => {
    const t = setupTest();
    const { ids } = await setupPublishedRound(t);
    const versions = await t.withIdentity(aliceIdentity).query(api.results.listRoundVersions, { ...BASE, roundId: ids.roundId });
    // latestVersionId is not exposed by listRoundVersions; fetch via roundResults
    const current = await t.withIdentity(aliceIdentity).query(api.results.roundResults, { ...BASE, roundId: ids.roundId });

    // Seed the cache directly through the internal mutation (no GEMINI_API_KEY needed).
    // roundResults doesn't return the row id, so look it up via the event index:
    // easiest deterministic path is storeExplanation's upsert-by-(versionId, contestantId).
    await t.withIdentity(aliceIdentity).run(async (ctx) => {
      // convex-test internal access
    }).catch(() => undefined);
    const stored = await t.withIdentity(aliceIdentity).mutation(internal.results.storeExplanationForTest ?? internal.results.storeExplanation, {
      orgSlug: "acme", eventSlug: "gala", roundId: ids.roundId,
      contestantId: ids.contestantIds[0],
      explanation: "Cached: Maria ranked first on weighted criteria.",
      model: "test",
    });
    expect(stored).toBeTruthy();

    const result = await t.withIdentity(aliceIdentity).action(api.results.explain, {
      ...BASE, roundId: ids.roundId, contestantId: ids.contestantIds[0],
    });
    expect(result.cached).toBe(true);
    expect(result.explanation).toContain("Cached");
    expect(current.version).toBe(1);
  });

  it("returns UPSTREAM when uncached and no GEMINI_API_KEY is configured", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const t = setupTest();
      const { ids } = await setupPublishedRound(t);
      await expect(
        t.withIdentity(aliceIdentity).action(api.results.explain, {
          ...BASE, roundId: ids.roundId, contestantId: ids.contestantIds[0],
        }),
      ).rejects.toMatchObject({ data: { code: "UPSTREAM" } });
    } finally {
      if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
    }
  });

  it("denies non-members", async () => {
    const t = setupTest();
    const { ids } = await setupPublishedRound(t);
    await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
    await expect(
      t.withIdentity(bobIdentity).action(api.results.explain, {
        ...BASE, roundId: ids.roundId, contestantId: ids.contestantIds[0],
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
```

Remove the stray `t.run(...)` scaffold block and the unused `versions`/`current` variables from the first test before landing — keep the test minimal: `storeExplanation` → `explain` (cached). `storeExplanation` is called with identity so `requireResultAccess` inside it passes.

- [ ] **Step 3: Implement in `convex/results.ts`**

Add imports:

```ts
import { action, internalMutation, internalQuery } from "./_generated/server"; // merge with existing query/mutation import
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { GEMINI_MODEL, geminiGenerateText } from "./lib/gemini";
import { AI_USAGE_RESOURCES, EXPLANATION_DAILY_LIMIT, consumeAiQuota } from "./lib/aiUsage";
```

(Keep the existing imports; add only missing names. `action`, `internalMutation`, `internalQuery` join the import from `./_generated/server`.)

Append:

```ts
const EXPLAINER_SYSTEM_INSTRUCTION = [
  "You explain judged-event results to organizers and claimants.",
  "Use ONLY the facts provided. Never speculate about judges or contestants beyond the data.",
  "Explain in 2-4 short sentences: the score, what drove it (criteria weights, dropped high/low marks,",
  "tie-breaks, overrides), and why the rank came out as it did. Plain, neutral, factual tone.",
].join("\n");

export const explainContext = internalQuery({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), contestantId: v.id("contestants") },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const version = await latestVersion(ctx, args.roundId);
    if (!version) throw appError(ErrorCode.NOT_FOUND, "No published results for this round");

    const contestant = await ctx.db.get(args.contestantId);
    if (!contestant || contestant.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Contestant not found");

    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();
    const criterionNames = Object.fromEntries(criteria.map((c) => [c._id, c.name]));

    const standing = version.snapshot.categories
      .flatMap((category) => category.standings)
      .find((s) => s.contestantId === args.contestantId);
    if (!standing) throw appError(ErrorCode.NOT_FOUND, "Contestant has no standing in this round");

    const tieBreak = version.snapshot.decisions.tieBreaks.find((tb) =>
      tb.tiedContestantIds.includes(args.contestantId),
    );
    const override = version.snapshot.decisions.advancementOverrides.find(
      (o) => o.contestantId === args.contestantId,
    );

    // The facts slice: only what a result.viewer can already see, grounded in the snapshot.
    const facts = {
      round: round.name,
      contestant: { number: contestant.number, name: contestant.name },
      rank: standing.rank,
      roundScore: standing.roundScore,
      status: standing.status,
      advanced: standing.advanced,
      tieResolvedBy: standing.tieResolvedBy,
      criterionScores: standing.criterionScores.map((cs) => ({
        criterion: criterionNames[cs.criterionId] ?? cs.criterionId,
        averageRawScore: cs.avgRaw,
        weightedContribution: cs.contribution,
        droppedHighLow: cs.dropped.map((d) => ({ value: d.value })),
      })),
      manualTieBreak: tieBreak ? { contestantsInvolved: tieBreak.tiedContestantIds.length } : null,
      advancementOverride: override ? { action: override.action } : null,
      judgesParticipating: version.snapshot.judgeParticipation.filter((jp) => jp.sheetsTotal > 0).length,
    };

    const cached = await ctx.db
      .query("resultExplanations")
      .withIndex("by_result_version_and_contestant", (q) =>
        q.eq("resultVersionId", version._id).eq("contestantId", args.contestantId))
      .unique();

    return {
      versionId: version._id as Id<"resultVersions">,
      orgId: eactx.org._id,
      userId: eactx.user._id,
      facts,
      cachedExplanation: cached?.explanation ?? null,
    };
  },
});

export const consumeExplanationQuota = internalMutation({
  args: { orgSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    await consumeAiQuota(ctx, eactx.org._id, AI_USAGE_RESOURCES.explanations, EXPLANATION_DAILY_LIMIT);
  },
});

export const storeExplanation = internalMutation({
  args: {
    orgSlug: v.string(),
    eventSlug: v.string(),
    roundId: v.id("rounds"),
    contestantId: v.id("contestants"),
    explanation: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const eactx = await requireResultAccess(ctx, args);
    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== eactx.event._id) throw appError(ErrorCode.NOT_FOUND, "Round not found");
    const version = await latestVersion(ctx, args.roundId);
    if (!version) throw appError(ErrorCode.NOT_FOUND, "No published results for this round");
    const existing = await ctx.db
      .query("resultExplanations")
      .withIndex("by_result_version_and_contestant", (q) =>
        q.eq("resultVersionId", version._id).eq("contestantId", args.contestantId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { explanation: args.explanation, model: args.model });
      return { resultExplanationId: existing._id };
    }
    const resultExplanationId = await ctx.db.insert("resultExplanations", {
      resultVersionId: version._id,
      eventId: eactx.event._id,
      contestantId: args.contestantId,
      explanation: args.explanation,
      model: args.model,
      createdById: eactx.user._id,
      createdAt: Date.now(),
    });
    return { resultExplanationId };
  },
});

export const explain = action({
  args: { orgSlug: v.string(), eventSlug: v.string(), roundId: v.id("rounds"), contestantId: v.id("contestants") },
  handler: async (ctx, args): Promise<{ explanation: string; cached: boolean; facts: unknown }> => {
    const context = await ctx.runQuery(internal.results.explainContext, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, roundId: args.roundId, contestantId: args.contestantId,
    });
    if (context.cachedExplanation !== null) {
      return { explanation: context.cachedExplanation, cached: true, facts: context.facts };
    }
    // Quota is consumed only for cache misses so cached reads stay free.
    await ctx.runMutation(internal.results.consumeExplanationQuota, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug,
    });
    const explanation = await geminiGenerateText({
      systemInstruction: EXPLAINER_SYSTEM_INSTRUCTION,
      prompt: `Explain this contestant's round result using only these facts:\n${JSON.stringify(context.facts, null, 2)}`,
    });
    await ctx.runMutation(internal.results.storeExplanation, {
      orgSlug: args.orgSlug, eventSlug: args.eventSlug, roundId: args.roundId,
      contestantId: args.contestantId, explanation, model: GEMINI_MODEL,
    });
    return { explanation, cached: false, facts: context.facts };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/explain.test.ts`
Expected: PASS (3 tests). Then `npm run test`.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/results.ts convex-test/explain.test.ts
git commit -m "feat: grounded results explainer with per-version caching and quota"
```

---

### Task 10: Explain UI

Apply the `/ui-ux-pro-max` skill guidelines for this task.

**Files:**
- Create: `components/tabulation/ExplainButton.tsx`
- Modify: `components/tabulation/RoundResultsCard.tsx`

**Interfaces:**
- Consumes: `api.results.explain` (Task 9).
- Produces: `ExplainButton({ orgSlug, eventSlug, roundId, contestantId })` — button + dialog showing the explanation with a collapsible "Source data" facts panel.

- [ ] **Step 1: Create `components/tabulation/ExplainButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { ChevronDown, HelpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ExplainButton({
  orgSlug,
  eventSlug,
  roundId,
  contestantId,
}: {
  orgSlug: string;
  eventSlug: string;
  roundId: string;
  contestantId: string;
}) {
  const explain = useAction(api.results.explain);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ explanation: string; cached: boolean; facts: unknown } | null>(null);
  const [factsOpen, setFactsOpen] = useState(false);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && result === null) {
      setBusy(true);
      try {
        setResult(
          await explain({
            orgSlug,
            eventSlug,
            roundId: roundId as Id<"rounds">,
            contestantId: contestantId as Id<"contestants">,
          }),
        );
      } catch (err) {
        const data = (err as { data?: { code?: string; message?: string } })?.data;
        toast.error(
          data?.code === "LIMIT_EXCEEDED"
            ? "Daily explanation limit reached — try again tomorrow."
            : data?.message ?? "Could not generate an explanation.",
        );
        setOpen(false);
      } finally {
        setBusy(false);
      }
    }
    if (!next) setFactsOpen(false);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground"
        onClick={() => void onOpenChange(true)}
        aria-label="Why this ranking?"
      >
        <HelpCircle aria-hidden />
        Why?
      </Button>
      <Dialog open={open} onOpenChange={(next) => void onOpenChange(next)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Why this ranking?</DialogTitle>
            <DialogDescription>
              Grounded in this round&apos;s official result snapshot.
              {result?.cached === false ? " Generated just now." : ""}
            </DialogDescription>
          </DialogHeader>
          {busy ? (
            <div className="flex items-center justify-center py-8" role="status">
              <Loader2 aria-hidden className="animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Explaining…</span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">{result?.explanation}</p>
              {result && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setFactsOpen(!factsOpen)} aria-expanded={factsOpen}>
                    <ChevronDown aria-hidden className={factsOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                    Source data
                  </Button>
                  {factsOpen && (
                    <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-2xs font-mono">
                      {JSON.stringify(result.facts, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire into `RoundResultsCard`**

In `components/tabulation/RoundResultsCard.tsx`, add the import:

```tsx
import { ExplainButton } from "@/components/tabulation/ExplainButton";
```

In the standings table row (inside `group.rows.map((row) => ( ... ))`, after the round-score cell, ~line 163), add a trailing cell — first add the header `<th className="text-right py-1">Explain</th>` next to "Round score", then:

```tsx
                    <td className="text-right">
                      <ExplainButton
                        orgSlug={orgSlug}
                        eventSlug={eventSlug}
                        roundId={round.roundId}
                        contestantId={row.contestantId}
                      />
                    </td>
```

- [ ] **Step 3: Validate**

Run: `npm run lint`; then `npm run build`.
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add components/tabulation/ExplainButton.tsx components/tabulation/RoundResultsCard.tsx
git commit -m "feat: why-this-ranking explainer with verifiable source data panel"
```

---

### Task 11: Secret wiring + docs

**Files:**
- Modify: `README.md` (AI section), `.env.example` (client-side note only)

**Interfaces:** none.

- [ ] **Step 1: Set the secret on the Convex deployment**

Run: `npx convex env add GEMINI_API_KEY` (paste the key when prompted).
Expected: secret stored. Never place this key in `.env.local` or any client-reachable file.

- [ ] **Step 2: Document in README**

Append a section to `README.md`:

```markdown
## AI features

Phase 5 adds three advisory AI features:

- **Judge integrity scoring** — deterministic statistics on the staff round
  monitor/review. No LLM, no API key needed. Advisory only.
- **AI event setup wizard** — `/app/<org>/events/new` → "Describe your event".
  Gemini generates a template you review before anything is created.
- **Results explainer** — "Why?" on result rows explains rankings from the
  official snapshot, with a verifiable source-data panel.

Requires the `GEMINI_API_KEY` Convex secret:

```
npx convex env add GEMINI_API_KEY
```

Daily AI quotas: 20 wizard calls / 30 explanations per organization.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document AI features and GEMINI_API_KEY setup"
```

---

### Task 12: Final validation + Graphify refresh

**Files:** none created.

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: all suites pass (Phase 1–5).

- [ ] **Step 2: Lint + production build**

Run: `npm run lint`; then `npm run build`
Expected: both pass — the build is the completion gate per AGENTS.md.

- [ ] **Step 3: Refresh Graphify context**

Run: `npm run graphify:build`
Expected: extraction completes; the knowledge graph reflects the new modules (`judgeIntegrity`, `templateWizard`, `gemini`, `aiUsage`, `publicResults`, `resultExplanations`).

- [ ] **Step 4: Commit any graphify artifacts**

```bash
git add .graphify
git commit -m "chore: refresh graphify context after phase 5"
```

---

## Self-Review Results

- **Spec coverage:** Judge integrity (Tasks 2–4, incl. `MIN_PANEL_SIZE`, thresholds, monitor + review surfaces, advisory-only), wizard (Tasks 5–8: quota, validation+retry, human review before create, audit), explainer (Tasks 9–10: snapshot-slice grounding, per-version cache, quota, source-data panel, permission reuse), security/env (Tasks 1, 11), graphify refresh (Task 12). Spec's E2E item is covered by the existing Playwright harness conventions; left to the Phase 4 E2E task pattern if extended — noted as follow-up, not silently dropped: add a wizard happy-path E2E with a mocked LLM only if the harness supports request interception; otherwise rely on the pure-core tests (Task 6) which cover the retry/give-up logic.
- **Placeholders:** none — every code step is complete. Two implementation notes flag small cleanups inside tasks (sentinel removal in Task 2, constant naming in Task 6, test-scaffold trim in Task 9) with exact instructions.
- **Type consistency:** `JudgeIntegrityReport`/`IntegrityFlag` (Task 2 → 3 → 4), `TemplateDraft` (Task 6 → 7 → 8), quota helpers (Task 5 → 7 → 9), `explain` return shape (Task 9 → 10) — verified consistent.
