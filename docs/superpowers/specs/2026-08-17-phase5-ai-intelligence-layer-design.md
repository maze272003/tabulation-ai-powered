# Phase 5: AI Intelligence Layer — Design

Date: 2026-08-17
Status: Approved
Depends on: Phase 3 (Tabulation Engine), Phase 4 (bulk import eases staging realistic
events for statistical validation)

## Goal

Deliver the product's namesake differentiation: judge integrity scoring (deterministic
statistics — no LLM), an AI event setup wizard, and a grounded results explainer
(both Gemini-powered). All AI output is advisory and human-reviewed; nothing alters
scores or advancement automatically.

## Scope

1. Judge integrity scoring
2. AI event setup wizard
3. Results explainer

Out of scope: AI-generated commentary streams, AI moderation of judges, any
automatic scoring changes.

New dependency: Google Gemini SDK (`@google/genai`). API key stored as a Convex
environment secret (`GEMINI_API_KEY`), never in source.

---

## 1. Judge Integrity Scoring

### Core library

New pure module `convex/lib/judgeIntegrity.ts`. Input: submitted scores for a round
(per judge, per contestant, per criterion, plus weights and each criterion's
min/max). Output: per-judge metrics + flags. No DB access — fully unit-testable.

Metrics:

- **Severity/Leniency bias** — for each contestant, the judge's total vs. the panel
  mean total, normalized (z-score) across judges; averaged over contestants the judge
  scored. Positive → leniency, negative → severity.
- **Differentiation** — stddev of the judge's contestant totals vs. the average panel
  stddev. Low stddev relative to panel → straight-lining flag.
- **Agreement** — Spearman rank correlation between the judge's contestant ranking
  and the consensus ranking (average totals). Low/negative correlation → inverted or
  divergent judge.
- **Completion** — sheets submitted / sheets assigned, from existing
  `judgeParticipation` snapshot data.

### Statistical guardrails

- Bias/agreement/differentiation metrics activate only with `MIN_PANEL_SIZE = 3`
  judges' scores for the contestant set; below that the panel is too small for the
  statistics to be meaningful and only completion is reported.
- Contestants must have at least `MIN_SCORES_PER_CONTESTANT = 2` judge scores to be
  included in consensus calculations.
- Thresholds are named constants (`BIAS_Z_CRITICAL = 0.75`, `AGREEMENT_LOW = 0.4`,
  `DIFFERENTIATION_RATIO_LOW = 0.5`) tuned conservatively: flags fire only on
  meaningful deviation, not normal spread.
- Each metric maps to a flag level `info | warning | critical` with a plain-language
  explanation string (e.g. "Consistently scored ~12% above panel average").

### Surfaces

- **Round monitor** (`enter/rounds.roundMonitor`): extended with a compact integrity
  summary so staff see rogue-judge alerts during scoring. Computed on the fly from
  submitted sheets (cheap: single round's sheets already fetched by the query).
- **Round review page**: new "Integrity" panel — per-judge metric bars, flag chips,
  explanation strings. Data from a dedicated query `enter/rounds.integrityReport`.
- Flags are **advisory only** — never alter scores, advancement, or rankings. Staff
  act through existing override/audit mechanisms.

### Tests

Unit tests on the pure lib with hand-computed fixtures: unbiased panel (baseline),
biased judge (severity/leniency detected), straight-liner, inverted judge, 2-judge
panel (metrics suppressed), missing sheets (completion accurate).

---

## 2. AI Event Setup Wizard

### Flow

1. `/app/[orgSlug]/events/new` gains a "Describe your event" textarea
   (e.g. "Miss Philippines pre-pageant, 3 rounds, 5 judges, top 10 advance").
2. `templates.generateFromPrompt` action calls Gemini with a structured-output
   contract matching `eventTemplates.configSnapshot` shape.
3. Review screen shows a structured preview (categories, rounds, criteria, weights,
   advancement) that the user can edit before applying.
4. Accept → applies through the existing `events.createFromTemplate` path. The action
   never creates an event or template directly.

### Grounding and validation

- Prompt contains a compact JSON schema contract plus few-shot examples derived from
  existing `SYSTEM_TEMPLATES` so output matches `configSnapshot` exactly.
- Action validates the Gemini response against the same validator shape before
   returning it; on validation failure it retries once with the validation error fed
   back, then returns a graceful "try rewording your description" error
   (`appError(ErrorCode.UPSTREAM, ...)`).
- Response is ephemeral (not persisted) until the user accepts.

### Guardrails

- Rate-limited per organization via a counter in `usage` (resource
  `ai_wizard_calls`, cap e.g. 20/day) to control LLM spend.
- Requires `event.create` permission (same as creating events).
- Timeout + error handling per project error standards; LLM failures never block
  manual event creation (wizard is an optional path).
- Audit entry on accept, recording that the template originated from an AI prompt.

---

## 3. Results Explainer

### Flow

1. "Why this ranking?" action available on result rows (results page + round review).
2. `results.explain` action (auth: existing `requireResultAccess` — the explainer
   never exposes data the caller couldn't already see).
3. Gemini receives **only** the relevant slice of the latest `resultVersions`
   snapshot: the contestant's criterion scores, dropped high/low entries, tie-break
   decisions, advancement overrides, plus criterion/round names for readability.
4. Response renders with a collapsible "Source data" panel showing the exact snapshot
   facts passed in, so every claim is verifiable against the record.

### Caching

Explanations are stored per result version in a new `resultExplanations` table
(`resultVersionId`, `contestantId`, `explanation`, `model`, `createdAt`). Stored
explanations are served free; only uncached contestants invoke Gemini. New result
versions (re-close/re-publish) start with an empty cache. Requires a schema addition
(migration-safe: new table only).

### Guardrails

- Rate limit per user (counter in `usage`, e.g. 30/day) to control spend.
- Timeout, `UPSTREAM` error code, graceful UI message on failure.
- Prompt instructs grounding strictly in provided facts; no speculation about judges
  or contestants beyond the data.

---

## Security and operations summary

- LLM key only in Convex env secrets; no keys in source or client.
- All three features sit behind existing permission checks (`requireEventMember` /
  `requireResultAccess` / `event.create`).
- Advisory-only design: no AI path writes scores, rankings, or advancement.
- New tables (`resultExplanations`) are additive — no migration of existing data.
- Audit entries for wizard-accept; integrity flags are read-only computations
  (no audit noise per view).

## Testing

- judgeIntegrity lib: hand-computed fixtures (listed above) — the statistical core
  must be provably correct.
- Wizard: mocked Gemini responses (valid, invalid-then-valid, persistently invalid)
  → validation/retry behavior; rate-limit enforcement; audit on accept.
- Explainer: caching behavior (second request served from table), permission denial,
  rate limit, snapshot-slice construction (no extra data passed).
- E2E: wizard happy path with mocked LLM; integrity panel visible on review page for
  a fixture round.

## Rollout

Ship order: judge integrity scoring (pure computation, zero external dependency) →
results explainer → setup wizard. Each is independently shippable and independently
gated behind its own permission/entitlement checks.
