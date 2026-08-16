# Role-Based Auth & Event Access Refactor — Design

Date: 2026-08-16
Status: Approved (all sections reviewed with product owner)

## 1. Objective

Decouple Judge/Staff access from Organizer (subscriber) access:

- **Admin** (org subscriber/owner): Google SSO only. Full organizer dashboard.
- **Staff** (tabulator): username + password + event code. Full tabulator powers inside one event.
- **Judge**: username + password + event code. Score entry for own assignments only.

Remove the email-invitation workflow entirely (all roles). No email delivery in the product.

## 2. Decisions Log

| Decision | Choice |
|---|---|
| Invitation removal scope | All roles (judges AND staff) |
| Staff account scope | Event-scoped, same login form as judges |
| SSO admins per org | Single admin (the owner/subscriber) + platform owner |
| Account creation UX | Manual OR auto-generated credentials (both supported) |
| Existing data | Dev data, clean cut (no migration) |
| Staff powers | Full tabulator powers (round lifecycle, review, monitor, print) — no config, no account mgmt |
| Auth mechanism | Approach A: parallel `eventAccounts` + `eventSessions` tables, token-auth Convex functions |

## 3. Identity Model

Three user levels:

1. **Admin** — better-auth Google session (unchanged). Any Google user may sign in and create an org (subscriber signup). Dashboard access requires org ownership. Platform owner unchanged.
2. **Staff** — `eventAccounts` row, `kind: "staff"`. Enters via event code. Permissions inside the event: open/close/publish rounds, review + reopen score sheets, monitor live scoring, view/print results. Cannot: edit event config, manage accounts, enter scores.
3. **Judge** — `eventAccounts` row, `kind: "judge"`. Enters via event code. Can: view own assignments, fill drafts, submit own score sheets.

Event-scoping is **structural**: the `eventSessions` row carries `eventId`; a session physically cannot address another event's data.

## 4. Data Model (`convex/schema.ts`)

### Modified

- `events` — add `eventCode: v.string()`, unique index `by_event_code`. 8 chars from alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I). Generated at creation; collision-safe via unique index retry. Regenerable by owner while `status` is `draft` or `ready`.
- `judgeAssignments.judgeId` — `v.id("eventAccounts")`.
- `scoreSheets.judgeId` — `v.id("eventAccounts")` (judge-kind accounts only).
- `scores` — `submittedById: Id<"userProfiles">` replaced by `submittedByAccountId: Id<"eventAccounts">`.
- `auditLogs.actorId` — optional; event-account actions store account kind/displayName in the metadata.
- Org roles constants trimmed to **Org Owner** only (+ platform scope). `organizationMembers` retained solely for the owner row (created at org creation, as today).
- Plan limit `maxJudges` becomes the per-org **event-accounts cap**: staff and judge accounts both count. `requireLimit(ctx, sub, "judges")` enforced on account create.

### New tables

```
eventAccounts: {
  orgId, eventId,
  kind: "staff" | "judge",
  displayName, username (lowercase),
  passwordHash,            // PBKDF2-SHA256, 100_000 iters, "iterations$salt$hash" (base64)
  status: "active" | "disabled",
  failedAttempts: number,
  lockedUntil: number | null,
  createdById,
}
indexes: by_event_id, by_event_id_and_username (unique), by_event_id_and_kind

eventSessions: {
  token (32-byte hex), accountId, eventId, expiresAt, lastSeenAt,
}
indexes: by_token (unique), by_account_id
```

### Removed

- `invitations` table + `convex/invitations.ts` + `/invite/**` pages + `/api/invitations/send` + `lib/mailer.ts` + SMTP env vars.
- `judges` table + `convex/judges.ts` (absorbed by `convex/accounts.ts`).
- Members page + its invitation UI; `middleware` `/invite` matcher.

## 5. Auth Flows

### Staff/Judge login

`POST /api/auth/judge-login` with `{ eventCode, username, password }` → Convex action `eventAuth.login`:

1. Find event by `eventCode` (index). Missing or `status !== "ready"` → error `"Event code does not exist or event has ended"`.
2. Find account by `(eventId, username)`. Missing → run dummy PBKDF2 verify (timing equalization), then error `"Invalid event code or judge credentials"`.
3. `lockedUntil` in future → error `"Account locked due to failed attempts. Try again later."`; `status === "disabled"` → error `"This account has been disabled."`.
4. Verify password (PBKDF2 via WebCrypto). Fail → increment `failedAttempts`; at 5 set `lockedUntil = now + 15 min`; same generic error.
5. Success → reset counters, insert `eventSessions` row (`expiresAt = now + 24h`), return `{ token, kind, displayName, eventName }`.
6. Route sets cookie `event_session`: httpOnly, path `/enter`, SameSite=Lax, Secure in prod, maxAge 24h. Client redirects to `/enter`.

### Session use

- Every `/enter` Convex function takes `sessionToken` and passes through `requireEventSession(ctx, token, { kind?, requireReadyEvent? })` → resolves `{ account, event, org }`; throws `UNAUTHENTICATED` on missing/expired session, `FORBIDDEN` on wrong kind or disabled account.
- `logout(token)` deletes the row; cookie cleared. Revocation is instant.
- `lastSeenAt` updated on use (observability only; expiry fixed 24h).

### Admin login

Unchanged better-auth Google flow. `/app/**` functions continue through `requireUserProfile → requireOrgMember` — now only the owner passes.

## 6. Backend API Surface

### New Convex modules

- `convex/eventAuth.ts` — `login` (public action), `logout`, `sessionInfo(token)`.
- `convex/enter/scoring.ts` — judge scope: `myAssignments`, `sheetDetail`, `saveDraft`, `submitSheet`. Sheet-validation logic extracted from current `scoring.ts` into `convex/lib/` and shared (no duplication).
- `convex/enter/rounds.ts` — staff scope: `monitor` (live round standings), `openRound`, `closeRound`, `publishRound` (reuse `roundAdmin`/`roundCompute` lib logic), `reviewSheet`, `reopenSheet`.
- `convex/enter/results.ts` — staff scope: published-results view + print data.

### Admin-side changes

- `events.create` generates `eventCode`; new `events.regenerateCode` (owner; blocked once finalized/archived).
- `convex/accounts.ts` — `list(eventId)`, `create` (manual or auto-generated username/password; auto: readable username like `judge3` + 10-char password; plaintext returned exactly once), `resetPassword` (manual or auto), `disable`/`enable`, `delete` (blocked while the account has score sheets; sessions revoked), `addAssignment`/`removeAssignment` (judges only).
- `eventLifecycle.publish` generates score sheets for judge-kind accounts only.
- All existing `/app` admin functions keep working; permission checks simplify to owner-only.

## 7. Frontend

### `/sign-in` — dual-tab login

- **Tab 1 "Judge Access" (default)**: fields Event Code / Username / Password; button "Enter Event". Submit disabled while any field empty; loading state; inline error text from the API responses above.
- **Tab 2 "Organizer Portal"**: single CTA "Continue with Google"; helper text "For event organizers and subscription holders only."

### `/enter/**` — staff & judge area

- Server layout reads `event_session` cookie → redirect to `/sign-in` when absent.
- Judge: assignment dashboard → sheet entry (reuses `components/tabulation/` sheet components; refactored to token-based hooks).
- Staff: monitoring overview, round controls, sheet review, results + print view.
- Middleware: `/enter/**` requires `event_session` cookie; `/app`, `/platform` unchanged (better-auth cookie).

### Admin dashboard (`/app`)

- Event settings gains:
  - **Event Code panel** — display, copy, regenerate (disabled once finalized).
  - **Accounts panel** — create staff/judge (manual or auto credentials; one-time credentials dialog after create), list, disable/enable, reset password, delete, judge assignments.
- Members page removed; nav updated.

## 8. Cleanup Checklist

- Delete `convex/invitations.ts`, `convex/judges.ts`, `app/invite/`, `app/api/invitations/send/`, `lib/mailer.ts`, members page, `middleware` `/invite` matcher.
- Remove SMTP block from `.env.example`; leave `.env.local` untouched (unused vars harmless).
- Org role constants trimmed (Judge/Tabulator/Viewer/Event Admin removed from seed; `seed.ts` updated idempotently).
- Dev DB reset on schema push (clean cut — existing dev data disposable).

## 9. Error Handling & Security

- Generic credential errors (no username enumeration); timing-equalized via dummy hash.
- Account lockout 5 fails / 15 min; disabled accounts rejected.
- httpOnly cookie; no token in URLs; Convex args validated (`v.string()` with format constraints everywhere).
- Login only while `event.status === "ready"`; code rotation invalidates nothing structurally (sessions still valid — they reference eventId; rotation only blocks new logins).
- Audit trail: account actions (login is not audited; round publish, sheet submit/reopen are) record `actorId: null` + account metadata.
- Rate limiting beyond account lockout (per-IP) deferred — single-tenant dev scale, noted as future work.

## 10. Testing

- `eventAuth` unit tests (convex-test): happy path (staff + judge), wrong code, ended event, wrong username (timing path), wrong password, lockout at 5, disabled account, expired session, revoked session, cross-event rejection.
- Permission separation: judge blocked from staff ops; staff blocked from score entry; sheet ownership enforced.
- Account admin tests: create (manual + auto), limits (`maxJudges`), delete blocked with sheets, reset password revokes sessions.
- Scoring flow tests reworked to token identity; tabulation-core tests untouched.
- Validation gate: `npm run build`, `npm run lint`, `npm test` all green.
