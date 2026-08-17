# Phase 4: Operational Completeness — Design

Date: 2026-08-17
Status: Approved
Depends on: Phase 1 (Foundation), Phase 2 (Competition Config), Phase 3 (Tabulation Engine)

## Goal

Close the table-stakes gaps that block real-world event usage: bulk data entry, result
exports (implementing the already-sold `canExportReports` entitlement), and a public
results page with an awards-night scoreboard. No AI features — those are Phase 5.

## Scope

1. Bulk contestant import (CSV)
2. Bulk judge/staff account provisioning
3. Results exports (CSV + print view)
4. Public results page and live scoreboard

Out of scope: Stripe checkout, file/photo uploads, notifications, QR judge login,
i18n, any AI functionality.

---

## 1. Bulk Contestant Import

### UI

"Import CSV" dialog on the event contestants page (`app/app/[orgSlug]/events/[eventSlug]/contestants`).
Input is a file upload or pasted text. Client parses and previews rows (with row-level
validation errors) before submission.

### CSV format

Header row required. Columns: `number,name,category,group`.

- `number` — positive integer, unique within the event.
- `name` — non-empty string.
- `category` — must match an existing category name in the event (case-insensitive;
  first match wins on ambiguity).
- `group` — optional string.

### Backend

`contestants.bulkAdd` mutation.

- Args: `orgSlug`, `eventSlug`, `rows` (array of `{ number, name, category, group? }`),
  capped at `MAX_BULK_IMPORT_ROWS = 500`.
- Client parses CSV text; server validates each row (no CSV parsing on the server).
- Requires `contestant.manage` permission on a draft event (`requireDraftEvent`),
  consistent with single `contestants.add`.
- Validates before writing anything — all-or-nothing transaction:
  - Row-level: number is a positive integer, name non-empty, category resolves.
  - File-level: no duplicate numbers within the file; no numbers already used in the
    event (existing `by_event_id_and_number` index).
  - Plan-level: `maxContestants` limit checked against current count + row count
    (`requireLimit`); rejects the whole import when exceeded.
- Errors are returned with row indexes so the client can highlight offending rows.
- On success: single `usage` increment by row count and a single audit entry
  (`contestant.bulk_added`) with a count summary in `after`, avoiding 500 audit rows.
- Category resolution is done once (name → id map) before row validation, not per row,
  to avoid N+1 reads.

### Error handling

Any validation failure throws `appError` with `VALIDATION_ERROR` / `CONFLICT` /
`FORBIDDEN` codes and a row-indexed detail payload; the transaction rolls back cleanly
because validation completes before the first insert.

---

## 2. Bulk Judge/Staff Provisioning

### Backend

`accounts.bulkCreate` action.

- Args: `orgSlug`, `eventSlug`, `kind` (`staff` | `judge`), `entries` (array of
  `{ displayName, username? }`), capped at 100 entries.
- Generates usernames when omitted (`displayName` slugified, deduplicated within the
  batch and against existing accounts).
- Generates a random password per account via the existing PBKDF2 password library
  (same generator used by single create and reset).
- Enforces `maxJudges` plan limit for judge kind via `requireLimit`.
- Requires `account.manage` permission on a draft event.
- Single audit entry (`account.bulk_created`) with count summary.
- Returns the created credentials (username + plaintext password per account) exactly
  once; passwords are never persisted in plaintext.

### UI

Dialog on the event accounts page with a textarea (one `DisplayName` or
`DisplayName, username` per line). After creation, the results render in a
credentials table extending the existing `CredentialsDialog` component pattern, plus a
"Download credentials CSV" button (client-side Blob). The dialog warns that passwords
are shown only once.

---

## 3. Results Exports

Implements the `canExportReports` plan feature that already exists in the schema,
plan constants, and superadmin plan editor.

### Backend

`results.exportData` query.

- Args: `orgSlug`, `eventSlug`.
- Access: existing `requireResultAccess` **plus** a server-side entitlement check —
  `hasFeature(subscription.plan, "canExportReports")`. Gating is enforced on the
  server, not only in the UI.
- Returns two payloads:
  - **Final standings**: per category, per contestant — rank, number, name, status,
    per-round scores, total. Derived from the latest `resultVersions` snapshots and
    `computeEventResults` where suitable.
  - **Per-judge scorecard**: per round, per judge, per contestant, per criterion —
    raw score value, with dropped high/low marks (from `criterionScores.dropped`).

### Client downloads

Client-side CSV serialization + Blob download (no server file generation). Two
buttons on the results page: "Standings CSV" and "Scorecards CSV", visible only when
the plan allows (entitlement surfaced from the subscription query the page already loads).

### Print view

Route: `app/app/[orgSlug]/events/[eventSlug]/results/print`.

- Server component; print-optimized layout: event header (name, venue, date), sign-off
  lines for tabulator/head judge, standings tables per category.
- `@media print` CSS; no PDF library — users print to PDF via the browser.
- "Print" button triggers `window.print()`.
- Same access rules as the results page (member auth, `result.view`, visibility rules).

---

## 4. Public Results Page + Live Scoreboard

### Route

`/public/[eventCode]` — no authentication. The event is resolved via the existing
unique `events.by_event_code` index. Events that are not found, not `public`
visibility, or not yet published return a 404 page (no information leak about
private events).

### Data exposure (security boundary)

One new public query `publicResults.get`:

- Returns **only**: event name, optional branding colors, category list (id, name,
  order), and for rounds with `status === "published"` the latest published
  `resultVersions` snapshot projected to: contestant number, name, photo, rank,
  roundScore, advanced flag — per category.
- Never returns: judge identities, raw sheets, per-judge scores, dropped values,
  criterion-level detail, audit info, unpublished rounds, org data.
- Guarded by `resultVisibility === "public"`; otherwise 404-equivalent error.

### Live updates

Convex reactivity: the public page subscribes to `publicResults.get`; when staff
publishes a round, the scoreboard updates without refresh. No polling.

### Scoreboard mode

Fullscreen toggle on the public page:

- Projector-ready typography (large ranks/names/scores), category tabs, top-N emphasis
  (top 3 or top 5 styling), event branding colors applied.
- Client-only feature on top of the same data; `Esc`/button exits fullscreen.

---

## Testing

- Unit/convex-test: `bulkAdd` validation matrix (duplicate in-file, duplicate vs DB,
  bad number, unknown category, limit exceeded → all-or-nothing rollback, audit
  written); `bulkCreate` username dedupe + limit; `exportData` entitlement denial;
  `publicResults.get` privacy matrix (private event → not found, unpublished round →
  absent, published round → projected fields only).
- E2E (Playwright, existing harness): import a contestant CSV, download standings,
  open public scoreboard for a published event.
- Existing patterns followed: `convex-test/` suites, `e2e/` page objects.

## Performance notes

- All new queries use existing indexes; bulk operations do one index scan for
  existing numbers/categories rather than per-row lookups.
- Public query reads snapshots only (already materialized at publish time) — no
  on-the-fly score computation for anonymous visitors.

## Rollout

Pure additive feature work; no schema migration required. Ship order within the
phase: bulk import → exports → public scoreboard.
