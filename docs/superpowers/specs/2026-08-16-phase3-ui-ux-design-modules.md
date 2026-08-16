# Phase 3 — Tabulation UI/UX Design Modules

**Project:** Tabulation SaaS (`tabulation-ai-powered`)
**Phase:** 3 of 7 (Tabulation Engine — UI layer)
**Status:** Approved design — accompanies `2026-08-16-phase3-tabulation-engine-design.md` and plan tasks 12–14
**Date:** 2026-08-16

---

## 0. Purpose & Inputs

This document defines the UI/UX design modules for the Phase 3 screens: judge
score entry, tabulator round management, and results. It is the visual/UX
contract the plan's UI tasks implement; where the plan's verbatim TSX is
minimal, this spec is the target quality bar.

Inputs synthesized:

- **Existing design system (authoritative):** shadcn/ui (Base UI) + Tailwind v4,
  neutral oklch tokens (`app/globals.css`), Geist Sans/Mono, lucide-react,
  sonner toasts, `EventShell` sub-nav pattern.
- **ui-ux-pro-max recommendation:** style *Data-Dense Dashboard* (density 8/10),
  WCAG AA, effects: row hover highlight, tooltips, loading skeletons, smooth
  150–300ms transitions. Avoid: ornate decoration, unfilterable data.
- **UX guidelines applied:** skeleton loading for >300ms waits (High), loading
  buttons disabled during async (High), visible labels never placeholder-only
  (High), inline validation on blur (Medium), `overflow-x-auto` tables
  (Medium), no double submission (High).

**Stance:** the neutral shadcn token base is kept; no rebrand. The skill's
palette is reconciled into *semantic status tokens* added on top (§2.1).

---

## 1. Design Foundations

### 1.1 Principles for tabulation screens

1. **Numbers are the interface** — every score, rank, weight, and count renders
   in `font-mono tabular-nums` (Geist Mono), right- or center-aligned in table
   columns so digits never jitter on reactive updates.
2. **Status is always visible, never color-only** — every status pairs a color
   token with a text label and/or a distinct shape (§3.1 StatusDot).
3. **Immutability is communicated** — submitted scores, published rounds, and
   finalized events render visibly *locked* (lock icon + muted styling), and
   irreversible actions always pass a confirm dialog (§3.6).
4. **Dense but calm** — dashboard density: row padding `py-1`–`py-1.5`, section
   gap `space-y-4`–`space-y-6`, cards `rounded-lg border p-4` (matches
   existing). No decorative chrome competing with data.
5. **Reactive, never frozen** — Convex subscriptions update tables in place;
   mutations show button-level loading states; skeletons on first load.

### 1.2 Typography & numeric formatting

| Use | Class | Notes |
|---|---|---|
| Scores, ranks, weights, counts, versions | `font-mono tabular-nums` | Fixed decimal places from `decimalPrecision`; trailing zeros kept (`87.50`, not `87.5`) |
| Page/section titles | `text-lg font-semibold` (inside EventShell) | Existing convention |
| Table headers | `text-sm text-muted-foreground` | Existing convention |
| Body/table cells | `text-sm` | `py-1` rows |
| Helper/meta text | `text-xs text-muted-foreground` | Autosave indicator, hints |

### 1.3 Iconography (lucide-react, existing convention)

| Concept | Icon | Size |
|---|---|---|
| Submitted/locked sheet | `Lock` | 14px inline, 16px standalone |
| Unsaved/saving | `Pencil` / `LoaderCircle` (spin) | 14px |
| Round open/closed/published | `Circle` / `CirclePause` / `BadgeCheck` | 16px |
| Publish / finalize | `Upload` / `Flag` | 16px |
| Tie warning | `Equal` or `TriangleAlert` | 16px |
| Advancing / cut | `ArrowUpRight` / `ArrowDownRight` | 14px |
| Version | `History` | 14px |
| Blackout/hidden results | `EyeOff` | 16px |

Rules: one stroke weight per layer (default lucide 2px); never mix filled and
outline at the same hierarchy level; icons are always paired with text or an
`aria-label`; no emojis anywhere.

### 1.4 Motion

- Transitions 150–200ms `ease-out` for hover/press/focus states only.
- Status dots/badges cross-fade on reactive change — no slide/scale choreography.
- `prefers-reduced-motion`: spinners become static ellipsis text; all
  transitions reduced to opacity-only or removed.

---

## 2. Design Tokens (extension to `app/globals.css`)

### 2.1 New semantic status tokens (light + dark, oklch, WCAG-checked)

```css
:root {
  --success: oklch(0.53 0.14 150);        /* submitted, advancing */
  --success-foreground: oklch(0.985 0 0);
  --success-muted: oklch(0.95 0.04 150);  /* row/cell tint */
  --warning: oklch(0.62 0.16 60);         /* unresolved ties, draft-in-progress */
  --warning-foreground: oklch(0.985 0 0);
  --warning-muted: oklch(0.96 0.05 80);   /* tie-group row tint */
  --info: oklch(0.55 0.15 250);           /* in_progress, saving */
  --info-foreground: oklch(0.985 0 0);
  --info-muted: oklch(0.95 0.04 250);
}
.dark {
  --success: oklch(0.68 0.15 150);
  --success-foreground: oklch(0.145 0 0);
  --success-muted: oklch(0.28 0.05 150);
  --warning: oklch(0.75 0.15 70);
  --warning-foreground: oklch(0.145 0 0);
  --warning-muted: oklch(0.30 0.06 70);
  --info: oklch(0.68 0.13 250);
  --info-foreground: oklch(0.145 0 0);
  --info-muted: oklch(0.28 0.05 250);
}
```

Wire into `@theme inline` as `--color-success`, etc., so Tailwind utilities
(`bg-success-muted`, `text-warning`, `border-info`) generate. Contrast pairs
verified ≥4.5:1 text-on-tint and ≥3:1 tint-on-background in both modes.

### 2.2 Status vocabulary (single source of truth)

| Domain | Value | Token | Label text |
|---|---|---|---|
| Sheet | `not_started` | `muted` | "Not started" |
| Sheet | `in_progress` | `info` | "In progress" |
| Sheet | `submitted` | `success` | "Submitted" |
| Sheet | `locked` | `secondary` + `Lock` | "Locked" |
| Round | `open` | `info` | "Open" |
| Round | `closed` | `warning` | "Closed — in review" |
| Round | `published` | `success` | "Published" |
| Tie | unresolved | `warning` (+destructive when blocking publish) | "Tie — resolve order" |
| Advancement | advancing | `success` | "Advances" |
| Advancement | cut | `muted-foreground` | "Cut" |
| Advancement | override | `warning` outline | "Override: advance/cut" |
| Event | `draft/ready/finalized/archived` | existing badge conventions (`outline`/`secondary`) | capitalized |

---

## 3. Shared Modules

Reusable components live in `components/`. All client components accept only
data + callbacks (no fetch logic) except thin page-level containers.

### 3.1 `<StatusDot>` / `<StatusBadge>`

- **StatusDot:** 8px circle + 4px ring gap + `aria-label`; states encode
  shape-for-colorblind-safety: `not_started` = hollow ring, `in_progress` =
  half-filled, `submitted` = filled + subtle `success` ring, `locked` = filled
  square. Tooltip (existing `tooltip.tsx`) shows "Judge · Contestant · Status".
- **StatusBadge:** `Badge` with token-mapped variant + optional 14px icon +
  human label from §2.2. Used in tables and card headers.

### 3.2 `<Num>` (numeric cell)

Renders `value` at `precision` decimals in `font-mono tabular-nums`; `—`
(em-dash, `aria-label="no value"`) for null. All standings/monitor tables use
it. Optional `tone` (`success|muted`) for advanced/cut emphasis.

### 3.3 `<SaveIndicator>` (autosave status, aria-live)

Four states, driven by the draft-save state machine (§5.1):
`idle` (nothing), `dirty` → "Unsaved changes" (`warning` dot), `saving` →
"Saving…" (`LoaderCircle` spin), `saved` → "Saved 14:32:05" (`success` check,
timestamp muted), `error` → "Save failed — Retry" (retry is a real button).
Rendered top-right of the entry form; wrapped in `aria-live="polite"`.

### 3.4 `<StateBlock>` (loading / empty / error)

One skeleton family for tabulation tables: 4–6 shimmer rows
(`animate-pulse` on `bg-muted` blocks matching column layout), never a blank
screen. Empty states pair a 16px icon, one-line explanation, and the next
action link ("No score sheets assigned yet — sheets appear when the event is
published."). Error states map `.data.code` → friendly copy (§5.4) with a
retry where meaningful. Every screen validates all four states (project rule).

### 3.5 `<BlackoutNotice>`

Persistent slim banner (`EyeOff` + text "Results stay hidden to judges and
staff until the round is published") shown on monitor/review pre-publish
screens. Reinforces Decision 6 without ambiguity at live events.

### 3.6 `<ConfirmDialog>` (irreversible actions)

Wraps existing `dialog.tsx`. Required for: **Close round** (warns unsubmitted
sheets are permanently excluded), **Publish results** (lists tie-resolution
count + advancement cut count + "scores become permanent"), **Finalize event**,
**Force cut override**. Copy pattern: action verb first ("Publish results for
Semi-final"), one-line consequence, explicit confirm button labeled with the
verb; destructive styling only for genuinely destructive outcomes.

### 3.7 `<VersionBadge>`

`History` icon + `v{n}` in `font-mono`; when `n ≥ 2`, add tooltip
"Corrected — reason required" and a `warning` outline. Links to the version
selector on results (§4.5).

---

## 4. Screen Modules

Routes under `/app/[orgSlug]/events/[eventSlug]/` per the engine spec §6.
`EventShell` nav gains **Scoring** (after Judges) and **Results** (after
Settings) per plan Task 12; nav items may be permission-filtered later — v1
renders for all members, screens self-guard.

### 4.1 M1 — Judge Scoring Home (`scoring`)

Purpose: judge's assigned rounds + per-contestant sheet status; fastest path
into scoring.

```
┌──────────────────────────────────────────────────────────┐
│ Scoring                                        [You: J1]│
├──────────────────────────────────────────────────────────┤
│ ┌ Round: Preliminaries  [Open] ─────────────── 12/15 ──┐│
│ │ #7 Ava Chen        ● Submitted    (locked, no link)  ││
│ │ #3 Malik Reed      ◐ In progress  → Continue         ││
│ │ #9 Sofia García    ○ Not started   → Score           ││
│ │ …                                                    ││
│ └──────────────────────────────────────────────────────┘│
│ ┌ Round: Semi-final  [Closed] ─────────────────────────┐│
│ │ … rows show badges only (submitting is blocked) …    ││
│ └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

- Each round card: name + round status badge + progress count
  (`submittedCount/total` in `<Num>`).
- Rows: contestant number + name, status dot/badge, action link — "Score" /
  "Continue" / badge-only when submitted/locked or round not open.
- Filters (v1.1, optional): status chip row (All / Not started / In progress /
  Submitted) — data-dense dashboards must be filterable per style guidance.
- States: skeleton cards; empty = "You are not a judge for this event." /
  "No score sheets assigned yet."; reactive update as other judges submit
  (only own-status changes matter, but round counts tick live).

### 4.2 M2 — Score Entry Form (`scoring/[roundId]/[contestantId]`)

Purpose: the highest-stakes screen — fast, bounded, error-proof numeric entry.

```
┌──────────────────────────────────────────────────────────┐
│ ← Back   #3 Malik Reed — Semi-final         [SaveInd.]  │
├──────────────────────────────────────────────────────────┤
│ Technique            weight 30%   [ 8.5 ]  /10  ✓        │
│ Musicality           weight 40%   [ 9.0 ]  /10           │
│ Stage presence       weight 30%   [    ]  /10  — required│
│                                          (inline: 0–10) │
├──────────────────────────────────────────────────────────┤
│ Progress: 2/3 scored        [ Submit scores ]            │
└──────────────────────────────────────────────────────────┘
```

- One `<Input type="number" inputMode="decimal">` per criterion; visible
  `<label htmlFor>` = criterion name; meta line under label: `weight 30% ·
  0–10 · 1 decimal`; `min`/`max`/`step=10^-precision` set natively.
- **Validation on blur** (skill guideline): out-of-range or wrong-precision →
  red border + inline message "Enter a value between 0 and 10"; error clears
  on valid input. Submit is disabled until every criterion is valid + present;
  a "2/3 scored" progress count makes completeness visible pre-submit.
- Autosave per §5.1; `beforeunload` guard while `dirty`.
- **Submit:** button enters loading (spinner + "Submitting…", disabled — no
  double submission); server re-validates; on success the page transitions to
  the **locked confirmation state** — summary table of final values (read-only
  `font-mono`), `Lock` icon, "Scores submitted — scores cannot be changed",
  back link. No edit affordance of any kind exists post-submit.
- Direct navigation to a submitted sheet renders the same locked state.
- Round `closed` / event not `ready`: read-only notice instead of inputs.
- Layout: single column `max-w-md` (existing), works one-handed at 375px;
  inputs ≥44px tall.

### 4.3 M3 — Monitor Grid (`rounds/[roundId]/monitor`)

Purpose: tabulator's live submission tracker — counts only, zero score values
(blackout is structural, the UI reinforces it).

```
┌──────────────────────────────────────────────────────────┐
│ Semi-final — submission progress      11/15 submitted    │
│ [Close round]                    [BlackoutNotice]        │
├────────────┬──────┬──────┬──────┬──────┬─────────────────┤
│ Judge      │ #3   │ #7   │ #9   │ #12  │ …(scroll-x)     │
├────────────┼──────┼──────┼──────┼──────┼─────────────────┤
│ M. Osei    │  ●   │  ●   │  ◐   │  ○   │                 │
│ L. Novak   │  ●   │  ◐   │  ◐   │  ○   │                 │
└────────────┴──────┴──────┴──────┴──────┴─────────────────┘
  ● submitted  ◐ in progress  ○ not started  ■ locked
```

- Matrix = judges (rows) × contestants (columns) of `<StatusDot>` cells
  (40×40px hit area, tooltip "judge · #contestant · status", click toggles a
  small popover with the status label — never a score).
- Sticky first column (`position: sticky; left: 0; bg-background`) and sticky
  header row; wrapper `overflow-x-auto`; column min-width 44px.
- Header progress: `11/15` + thin progress bar (`success` on `muted` track).
- Footer legend repeats dot meanings as labeled text (color not sole signal).
- Actions by state: `open` → **Close round** (ConfirmDialog: "3 sheets are
  unsubmitted and will be excluded"); `closed` → **Reopen** (outline, audited
  note) + **Review & publish** (primary, routes to M4).
- Live via reactive query; a cell flips status without any refocus/flash.

### 4.4 M4 — Review & Publish (`rounds/[roundId]/review`)

Purpose: the decision screen — verify standings, resolve ties, shape the cut,
publish. Only reachable when round `closed`; otherwise a friendly gate state
("Close the round in Monitor before review.").

```
┌──────────────────────────────────────────────────────────┐
│ Semi-final — review                 [Reopen round]       │
│                          [ ⚠ 1 unresolved tie ] [Publish]│
├──────────────────────────────────────────────────────────┤
│ Rank Contestant      Score   Resolved by     Advances    │
│ 1    #7 Ava Chen     92.40   criteria cascade ✓ Advances │
│ ┌ warning-muted tint — tie group ─────────────────────┐  │
│ │ –   #3 Malik Reed   89.20   TIE — set order [1][2]  │ │
│ │ –   #12 L. Petrov   89.20            [Save order]   │ │
│ └─────────────────────────────────────────────────────┘  │
│ 4    #9 Sofia García 85.10   judge firsts     ✗ Cut     │
│      ── advancement cut line (top 3) ─────────────────   │
│ 5    #14 J. Ortiz    81.75   —               ✗ Cut      │
└──────────────────────────────────────────────────────────┘
```

- **Standings table:** rank, contestant (`#num name`), `roundScore` in
  `<Num>`, tie-resolution source as muted text (`criteria cascade` /
  `judge firsts` / `manual` / `—`), advancement column with explicit
  `✓ Advances` (`success`) / `✗ Cut` (`muted-foreground`) + icon — never a
  bare Yes/No.
- **Tie groups:** contiguous rows tinted `--warning-muted` with a labeled
  bracket; inline ordering control (number inputs 1..n, per plan) with
  **Save order** per group; once saved, group re-renders ranked with
  `manual` source and a remove option. Unresolved groups keep the header
  chip "1 unresolved tie" and **Publish stays disabled** — the state is
  actionable, not a crash (engine risk table).
- **Advancement cut line:** when active, a labeled separator row
  ("advances: top 3") between the last advancing and first cut row — the cut
  is *seen*, not inferred. Overrides render as `warning` outline badges on the
  row ("Override: advance") with an × to remove; **Force cut** passes a
  confirm. `allowOverride: false` hides all override controls.
- **Publish** (primary, disabled while ties unresolved or busy): ConfirmDialog
  summarizing "2 categories · 15 contestants · ties resolved (1 manual) · cut:
  top 3 + 1 override"; on `TIES_UNRESOLVED` error the dialog reopens with the
  offending groups scrolled into view and tinted `destructive`.
- Row hover highlight; table `overflow-x-auto`; category sections stacked when
  multi-category.

### 4.5 M5 — Results (`results`)

Purpose: published standings, versions/corrections, event finalization.
Shows **published versions only** — pre-publish there is nothing here by
design (blackout).

```
┌──────────────────────────────────────────────────────────┐
│ Results                                     [Finalize …]│
├──────────────────────────────────────────────────────────┤
│ Preliminaries  [v2 ▾]  weight 40%        [Correct]       │
│  Rank Contestant       Round score                        │
│  1    #7 Ava Chen      92.40                              │
├──────────────────────────────────────────────────────────┤
│ Final standings                                           │
│  Rank Contestant       Total     Eliminated in            │
│  1    #7 Ava Chen      91.28     —                        │
│  2    #3 Malik Reed    89.61     —                        │
│  4    #9 Sofia García  85.10     Semi-final               │
└──────────────────────────────────────────────────────────┘│
```

- Per published round: card with name, `<VersionBadge>` (select → earlier
  versions read-only when >1; latest flagged "current"), weight in `<Num>`.
- **Correct** (visible to `score.manage` while event `ready`): inline drawer —
  reason `<textarea>` **required**, submit disabled until non-empty,
  ConfirmDialog noting "a new version v3 will supersede v2; scores are never
  edited". Never deletes history; version list grows.
- **Final standings** card appears once ≥1 round published; totals `<Num>`;
  "Eliminated in round" column muted; rank gaps from ties/elimination kept
  visible (4 follows 2 in example) — never renumbered silently.
- **Finalize event** (enabled when every round published + event `ready`):
  ConfirmDialog "Finalizing locks all results and corrections permanently";
  on success banner "Event finalized" + all correct/publish actions across
  the app disappear (reactive).
- Empty state: "No published rounds yet — publish from a round's review
  screen." Error states per §5.4.

### 4.6 M6 — Config Editor Extensions (Phase 3 fields)

Minimal, consistent extensions of the Phase 2 editors (draft-gated):

- **Rounds editor:** round card header gains `weight: <Num>%`; a weights-sum
  line under the section ("Round weights: 80% of 100% — must total 100%")
  tinted `warning` until 100. **Advancement** sub-panel (dashed border, per
  plan) renders *only* when `eliminationEnabled`; mode `select` + conditional
  Top N / Top % inputs (labeled, blur-validated: N ≥ 1 integer; % 1–100) +
  allow-override checkbox; hidden entirely when `!qualifiesToNextRound`.
- **Event settings — Scoring card:** two labeled checkbox rows (drop hi/lo,
  elimination) with helper text (drop hi/lo notes "applies when ≥3 judges
  scored a contestant-criterion"); save button disabled until dirty; existing
  locked-out behavior when event not draft.
- Monitor/Review links per plan appear in round headers when event `ready`.

---

## 5. Interaction Patterns

### 5.1 Autosave state machine (M2)

`idle → dirty →(800ms debounce)→ saving → saved | error`. Matches plan Task 12
(800ms). Only valid values enter `draftValues`; clearing a field deletes its
key. `error` keeps the timer armed for manual Retry only (no infinite retry
loop). Sheet status transitions `not_started → in_progress` are server-side
effects surfaced reactively. Timestamp in "Saved 14:32" uses client-local time.

### 5.2 Submit & irreversible actions

All async buttons: `disabled={busy}` + inline spinner + verb-labeled text
("Publishing…"). Irreversible set = {close, publish, finalize, force-cut} →
ConfirmDialog (§3.6). Toasts (sonner, existing) confirm success; error copy
from §5.4. Post-publish navigation: review → results.

### 5.3 Keyboard & focus

- Score entry: natural tab order top-to-bottom; Enter submits only when valid
  (else focuses first invalid input and announces it via `aria-describedby`);
  inputs never silently clamp — invalid stays marked.
- Monitor: dots are buttons (Tab reachable) with Enter-toggling the popover.
- Review: after Save order, focus moves to the group's first ranked row.
- Dialogs trap focus; Escape cancels; confirm buttons start focused=confirm
  only for non-destructive confirms (destructive starts on cancel).

### 5.4 Error-code → UX copy map (extends Phase 1 convention)

| `.data.code` | Screen | Copy |
|---|---|---|
| `TIES_UNRESOLVED` | M4 publish | "Resolve the highlighted tie groups first." + groups tinted `destructive` |
| `CONFLICT` | config editors, submit-after-close | "Configuration is locked." / "This round is closed — scoring is finished." |
| `VALIDATION_ERROR` | M2 submit, M6 | First invalid criterion named + inline field error |
| `NOT_FOUND` | all | "Not available." (no existence leak — matches authz design) |
| `LIMIT_EXCEEDED` | config | "Limit reached — upgrade your plan." |
| network/unknown | all | "Something went wrong — try again." + retry where safe |

### 5.5 Responsive behavior

| Breakpoint | Behavior |
|---|---|
| ≥1024px | Tables full width; review advancement controls inline |
| 768px | Matrix scrolls horizontally; sticky judge column |
| 375px | M2 single column (native); all tables `overflow-x-auto`; action buttons full-width rows; sticky header actions collapse to icon+menu |

### 5.6 Accessibility checklist (screen-specific)

- Status conveyed by label text in DOM (dots/badges carry `aria-label`); tie
  tint always paired with the bracket + "TIE" text.
- `<caption>`/visually-hidden scope labels on monitor & standings tables.
- SaveIndicator + publish errors in `aria-live="polite"` regions.
- All interactive targets ≥44px (dots padded to 40px cell + 4px gap ≈ hit
  target via padding).
- Contrast: status tokens validated §2.1; `muted-foreground` text never below
  4.5:1 on tinted rows — tint lightness capped accordingly.

---

## 6. Module → Plan Task Mapping

| Module | Plan task | Files |
|---|---|---|
| StatusDot/Badge, Num, StateBlock, ConfirmDialog, VersionBadge | 12–14 (shared) | `components/tabulation/*` |
| M1, M2 | Task 12 | `…/scoring/page.tsx`, `…/scoring/[roundId]/[contestantId]/page.tsx` |
| M3, M4 | Task 13 | `…/rounds/[roundId]/{monitor,review}/page.tsx` |
| M5, M6 | Task 14 | `…/results/page.tsx`, `…/rounds/page.tsx`, `…/settings/page.tsx` |

Plan TSX is the behavioral baseline; these modules are the polish layer applied
on top (tokens, states, confirms, a11y) without changing query/mutation
contracts.

---

## 7. Acceptance (UI)

1. All §2 tokens exist in light+dark; no hardcoded status hex values in
   components.
2. Every screen demonstrably handles loading/empty/error/success
   (§3.4 patterns) — verified per project UI/UX rule.
3. Score entry: blur validation, progress count, disabled-until-valid submit,
   locked post-submit state, autosave indicator states all present.
4. Monitor payload renders zero score values (matches integration test).
5. Publish blocked visibly while ties unresolved; confirm dialogs on the four
   irreversible actions; corrections require a reason.
6. Keyboard-only pass: scoring → submit → monitor → review → publish → results
   completes; reduced-motion and 375px checks pass.
7. `npm run build`, typecheck, lint all green.
