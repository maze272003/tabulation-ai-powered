# Platform Admin (Superadmin) Module — Design

Date: 2026-08-16
Status: Approved (user delegated all decisions to the implementer)

## Goal

Give the platform owner a complete, production-quality control surface for the
SaaS: accounts, organizations, subscriptions/plans, audit trail, and platform
access control — all enforced server-side.

## Modules

| Module | Route | Purpose |
|---|---|---|
| Overview | `/platform` | KPIs: orgs/users/owners/subscription counts, plan distribution, recent platform activity, recent signups |
| Organizations | `/platform/organizations` | Paginated, searchable (slug prefix), status-filtered org list; suspend/resume; detail page with plan override, usage, org audit |
| Users | `/platform/users` | Paginated, searchable (email prefix), status-filtered user list; suspend/activate; promote/demote platform owner |
| Subscriptions | `/platform/subscriptions` | All subscriptions with plan + status; administrative plan override (Stripe lands Phase 6) |
| Audit log | `/platform/audit` | Platform-wide audit trail, paginated, filterable by scope (All / Platform / per-org) |
| Bootstrap | (automatic) | First platform owner claimed from `PLATFORM_OWNER_EMAIL` Convex env var during profile provisioning |

## Backend

Replace `convex/platform.ts` (3 functions, no pagination) with `convex/platform/`:

- `dashboard.ts` — `stats` query. Counts via async iteration over the three
  slow-growing tables (organizations, userProfiles, subscriptions). Scale note:
  replace with `@convex-dev/aggregate` in Phase 6 if tables grow large.
- `orgs.ts` — `list` (paginated; slug-prefix index range search; status
  post-filter), `get` (org + owner + subscription + plan + usage + recent
  audit), `options` (light id/name list for filter dropdowns),
  `setStatus` (active ↔ suspended only; "deleted" is not admin-reachable).
- `users.ts` — `list` (paginated; email-prefix search; status filter),
  `setStatus` (suspend/activate), `setPlatformRole` (promote/demote).
- `subscriptions.ts` — `list` (paginated, hydrated with org + plan),
  `setPlan` (admin override).
- `audit.ts` — `list` (paginated; undefined orgId = all via default index,
  null = platform channel, id = one org).
- `bootstrap.ts` — `maybeBootstrapPlatformOwner(ctx, profile)`: promotes the
  profile whose email matches `env.PLATFORM_OWNER_EMAIL` when zero platform
  owners exist; audited as `platform.user.bootstrapped` (system actor).
  Called from `auth.ensureUserProfile` (runs on every session start).

Every function is gated by `requirePlatformOwner`. Identity is always derived
from `ctx.auth` (never passed from the client).

### Enforcement

- `resolveOrgBySlug` additionally rejects `status === "suspended"` with
  FORBIDDEN — one choke point that blocks all org-scoped and event-scoped
  functions for suspended orgs.
- Suspended users are already rejected by `requireUserProfile`.

### Guard rails (all server-enforced, all audited with required reason)

- `orgs.setStatus`: no-op status changes → CONFLICT; deleted org → NOT_FOUND.
- `users.setStatus`: cannot target self (VALIDATION_ERROR); cannot target a
  platform owner (FORBIDDEN); no-op → CONFLICT.
- `users.setPlatformRole`: demote blocked when target is the last platform
  owner (FORBIDDEN — prevents lock-out); no-op → CONFLICT.
- `subscriptions.setPlan`: org/plan/subscription must exist; no-op → CONFLICT.

### Schema changes

None. Audit actions: `platform.org.suspended`, `platform.org.resumed`,
`platform.user.suspended`, `platform.user.activated`, `platform.user.promoted`,
`platform.user.demoted`, `platform.user.bootstrapped`,
`platform.subscription.plan_overridden` — all on the platform channel
(`orgId: null`) except plan override (org-scoped).

### Env

`convex.config.ts`: `defineApp({ env: { PLATFORM_OWNER_EMAIL: v.optional(v.string()) } })`.
Set with `npx convex env set PLATFORM_OWNER_EMAIL=you@example.com`.
Generated `env` is `process.env` at runtime — safe in tests.

## Frontend

- `app/platform/layout.tsx` — `Authenticated` gate + client owner check
  (server remains authoritative) + sidebar shell (Overview, Organizations,
  Users, Subscriptions, Audit log, back-to-app, UserMenu).
- Pages per the module table; `usePaginatedQuery` + Load more; shadcn tables;
  debounced search; status selects; row action dropdowns.
- `components/platform/`: `status.ts` (org/user/subscription/plan status
  vocabularies + tones), `PlatformBadge`, `StatCard`, `ReasonDialog`
  (ConfirmDialog + required reason input), `useDebouncedValue`,
  `platformErrorMessage` (error-code → copy map), date formatting.
- Reuses tabulation shared modules (StateBlock skeleton/empty/error,
  ConfirmDialog, tone classes) and semantic status tokens; dark-mode safe.

## Testing

- Update `convex-test/reads.test.ts` to the new `api.platform.orgs.list`.
- New `convex-test/platform.test.ts`: authz matrix (non-owner FORBIDDEN on all
  functions), suspend/resume + enforcement, user suspend guards, promote/
  demote + last-owner lock-out, plan override + audit, bootstrap behavior
  (env match / mismatch / already-owned no-op).

## Validation gates

`npm test` → `npm run lint` → `npm run build` must all pass.
