# Phase 1 — Foundation (Design Spec)

**Project:** Tabulation SaaS (`tabulation-ai-powered`)
**Phase:** 1 of 7 (Foundation)
**Status:** Approved design — pending user review
**Date:** 2026-08-12

---

## 0. Context

This spec is the first of seven decomposed sub-projects that together implement the
Tabulation SaaS master vision. The full platform spans auth, multi-tenancy, RBAC,
billing, a dynamic competition-config engine, a deterministic scoring/tabulation
engine, a template engine, a PDF/report renderer, a public results portal,
notifications, audit, API/webhooks, and more. Attempting all of it as one design is
unworkable, so it is decomposed into focused phases, each with its own
brainstorm → spec → plan → implementation cycle.

**Phase order:**

1. **Foundation** *(this spec)* — auth, multi-tenancy, RBAC, core schema, design system, app shell.
2. Competition Config Engine — events, categories, rounds, criteria, weights, contestants, judges, assignments, score-sheet skeletons, event templates, config validation.
3. Tabulation Engine — score entry/autosave/submit, deterministic scoring, weighting, ranking, qualification, tie-breaking, result state machine, finalization, result versioning, immutable score history.
4. Reporting & Template Engine — report data model, result/report templates with dynamic fields + conditional sections, versioning, visual template builder, HTML/PDF/print renderer, certificates, QR verification.
5. Event Operations — dashboards, notifications + email, activity feed, bulk ops, CSV/Excel/JSON import-export, simulation mode, public results portal.
6. SaaS / Billing — Stripe via `@convex-dev/stripe`, subscription lifecycle, usage metering, limit enforcement, billing page, upgrade/downgrade UX.
7. Advanced — analytics + judge-consistency, API + API keys, webhooks, rate limiting, white-label/custom domains, offline-friendly scoring, localization polish.

**Phase 1 scope principle:** design the subscription *data model and gating hooks*
now (so the schema is right and later phases can lean on them), but defer real
Stripe wiring to Phase 6 — exactly as the master prompt's phasing already splits.

### Decisions captured during brainstorm

| # | Decision | Choice |
|---|---|---|
| 1 | Auth provider | **Better-Auth** via the Convex-maintained `@convex-dev/better-auth` component (Google OAuth). |
| 2 | RBAC data model | **Fully data-driven** — separate `roles`, `permissions`, `rolePermissions` tables. |
| 3 | Signup policy | **Open self-serve** — any Google user can sign up and create an org (becomes Owner). Includes a global **Platform Owner** super-admin role. |
| 4 | Tenant routing | **URL-embedded `orgSlug`** — routes are `/app/[orgSlug]/...`; the URL *is* the active-org context. |
| 5 | UI scope | **Standard** — login, org picker, create-org, accept-invite, members management, org settings, platform stub, read-only billing placeholder. Design system = shadcn/ui + Tailwind v4 + lucide-react. |
| 6 | Tenant isolation strategy | **Approach A** — `orgId` on every tenant-scoped doc + indexed `by_org` + centralized `require*` helpers returning a typed `AuthCtx`. |

### Existing project state (discovery summary)

The repo is a stock, unmodified `npm create convex@latest -- -t nextjs` template:
1 git commit, 1 demo table (`numbers`), 3 demo functions (`convex/myFunctions.ts`),
no auth, no `auth.config.ts`, no `convex.config.ts`, no `http.ts`, no middleware, no
design system, no UI primitives, no PDF lib, no tests. Stack present and correct:
Next.js 16.3, React 19, Convex ^1.43, Tailwind v4, TS (strict), ESLint 9 flat config,
Prettier. All existing demo code is disposable and will be replaced.

Key technical debt to address during Phase 1:
- `app/globals.css:25` hardcodes `font-family: Arial` on `body`, overriding the Geist token — remove.
- `components/ConvexClientProvider.tsx` uses plain `ConvexProvider` — replace with `ConvexBetterAuthProvider`.
- `next.config.ts:6-8` sets `typescript.ignoreBuildErrors: true` — re-evaluate; remove if no longer needed.
- `convex/myFunctions.ts:25` calls `ctx.auth.getUserIdentity()` but no `auth.config.ts` exists, so it always returns `null` — fixed by adding `auth.config.ts`.
- Duplicated `Home` component across `app/page.tsx` and `app/server/inner.tsx` — both deleted with the demo.

---

## 1. Authentication & Identity

### Library

`better-auth` + `@convex-dev/better-auth` (a Convex-maintained component), installed
as a **local folder component** under `convex/betterAuth/` per the official
integration guide. The Better-Auth instance runs *on Convex* — its
`user` / `session` / `account` / `verification` tables live inside our Convex
deployment via the component's adapter.

### Separation of concerns

- **Better-Auth component owns auth tables** (`convex/betterAuth/schema.ts`,
  generated): credentials, sessions, OAuth account links, verification tokens.
- **Application owns a separate `userProfiles` table** (our schema), keyed by
  `tokenIdentifier` — the stable key returned by `ctx.auth.getUserIdentity()`.
  This is the link between auth and domain.

### Google OAuth

Configured as Better-Auth's `social` provider (`google`). Sign-in via
`authClient.signIn.social({ provider: "google", callbackURL: "/app" })`.
OAuth credentials stored on the Convex deployment via
`npx convex env set GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### Auto-provisioning

Because queries cannot write, profile provisioning uses an idempotent
`ensureUserProfile` mutation called on authenticated session-start. The trigger is
an `Authenticated` gate component that uses `authClient.useSession()`; once the
session becomes authenticated, it fires `ensureUserProfile` (upsert keyed by
`tokenIdentifier`) before rendering protected children. Subsequent queries then
safely use `requireUserProfile` (read-only). No races on protected routes because
`middleware.ts` redirects unauthenticated users before the gate renders.

### Client wiring

- `components/ConvexClientProvider.tsx` — **replaced** with:
  ```tsx
  <ConvexBetterAuthProvider client={convex} authClient={authClient} initialToken={token}>
    {children}
  </ConvexBetterAuthProvider>
  ```
- `app/layout.tsx` — `RootLayout` awaits `getToken()` (SSR) and passes `initialToken`.
- `lib/auth-client.ts` — `createAuthClient({ plugins: [convexClient()] })`.
- `lib/auth-server.ts` — `convexBetterAuthNextJs({ convexUrl, convexSiteUrl })`
  returning `{ handler, isAuthenticated, getToken, preloadAuthQuery, fetchAuthQuery, fetchAuthMutation, fetchAuthAction }`.
- `app/api/auth/[...all]/route.ts` — exports `{ GET, POST }` from `handler`, proxying to:
- `convex/http.ts` — mounts `authComponent.registerRoutes(http, createAuth)`.

### Convex auth config

`convex/auth.config.ts`:
```ts
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";
export default { providers: [getAuthConfigProvider()] } satisfies AuthConfig;
```
This is what makes `ctx.auth.getUserIdentity()` resolve (currently always `null`).

### Route protection

`middleware.ts` (new) uses `getToken()` from the SSR helpers to gate `/app/*` and
`/platform/*`, redirecting unauthenticated users to `/sign-in?next=<original>`.
Per-org and per-permission enforcement stays inside Convex functions via the
`require*` helpers (Section 3), never in middleware.

### Environment variables

Stored on the Convex deployment via `npx convex env set` (used by the auth instance
running in Convex functions): `BETTER_AUTH_SECRET`, `SITE_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

Already present in `.env.local` (read by Next.js): `CONVEX_DEPLOYMENT`,
`NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`. We add
`NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

### Out of scope for Phase 1

Passwordless email, magic links, passkeys, MFA — Better-Auth supports all of these,
but the master prompt requires only Google OAuth for v1. They are added later by
extending Better-Auth options, not by re-architecting.

---

## 2. Core Data Model

The Better-Auth component owns its auth tables in its generated schema; the
application schema below lives in `convex/schema.ts` (which replaces the demo).
Index names follow the Convex convention of listing all indexed fields.

### Identity & tenancy

**`userProfiles`**
- `tokenIdentifier: string` (stable key from `getUserIdentity()`)
- `name: string`, `email: string`, `image: string` (mirrored from identity for denormalized reads)
- `platformRole: union<null, "platform_owner">` — global super-admin, *not* org-scoped
- `status: union<"active", "inactive", "suspended">`
- `lastLoginAt: number` (ms since epoch)
- Indexes: `by_token_identifier` (unique), `by_email`.

**`organizations`**
- `slug: string` (URL key, lowercase, unique)
- `name: string`
- `logoUrl: string` (optional)
- `ownerId: Id<"userProfiles">` (denormalized for fast ownership checks)
- `createdById: Id<"userProfiles">`
- `status: union<"active", "suspended", "deleted">`
- `branding: object<{ primaryColor?: string, secondaryColor?: string }>` (placeholder, extended in later phases)
- Index: `by_slug` (unique).

**`organizationMembers`**
- `userId: Id<"userProfiles">`
- `orgId: Id<"organizations">`
- `roleId: Id<"roles">`
- `status: union<"active", "invited", "inactive">`
- `joinedAt: number`
- Indexes: `by_org_id_and_user_id` (unique), `by_user_id`, `by_org_id`.

### RBAC (fully data-driven)

**`roles`**
- `name: string` (e.g. `"Org Owner"`, `"Admin"`, `"Tabulator"`, `"Judge"`)
- `scope: union<"organization", "platform">`
- `isSystem: boolean` (built-ins cannot be deleted)
- `description: string`
- Indexes: `by_scope`, `by_name`.

**`permissions`**
- `name: string` (e.g. `"event.create"`, `"organization.members.manage"`)
- `category: string` (e.g. `"event"`, `"organization"`, `"score"`)
- `description: string`
- Index: `by_name` (unique).

**`rolePermissions`**
- `roleId: Id<"roles">`
- `permissionId: Id<"permissions">`
- Indexes: `by_role_id`, `by_permission_id`.

### Invitations

**`invitations`**
- `orgId: Id<"organizations">`
- `email: string`
- `roleId: Id<"roles">`
- `eventId: Id<"events"> | null` (nullable now; wired in Phase 2)
- `token: string` (opaque, unique, URL-safe)
- `status: union<"pending", "accepted", "expired", "revoked">`
- `expiresAt: number`
- `createdById: Id<"userProfiles">`
- `acceptedById: Id<"userProfiles"> | null`
- `acceptedAt: number | null`
- Indexes: `by_token` (unique), `by_email`, `by_org_id_and_email`.

### Subscription data shape (no Stripe in Phase 1)

**`plans`** — seeded reference data, read-only to users.
- `name: string` (`"Free"`, `"Starter"`, `"Pro"`, `"Business"`, `"Enterprise"`)
- `sortOrder: number`
- `features: object<{ …booleans }>` — bounded set owned by us, e.g.
  `canCreateEvent`, `canExportReports`, `canUseCustomBranding`,
  `canUseAuditLogs`, `canCreateTemplates`. Not user-extensible.
- `limits: object<{ …numbers }>` — e.g. `maxEvents`, `maxMembers`, `maxJudges`,
  `maxContestants`, `storageMb`, `maxReports`.
- `isSystem: boolean`
- Index: `by_name`.

**`subscriptions`**
- `orgId: Id<"organizations">` (unique — one subscription per org in v1)
- `planId: Id<"plans">`
- `status: union<"trialing", "active", "past_due", "canceled", "expired", "paused">`
- `trialEndsAt: number | null`
- `currentPeriodEndAt: number | null`
- `cancelAtPeriodEnd: boolean`
- `stripeCustomerId: string | null` (populated in Phase 6)
- `stripeSubscriptionId: string | null` (populated in Phase 6)
- Index: `by_org_id` (unique).

**`usage`** — denormalized counters for limit enforcement.
- `orgId: Id<"organizations">`
- `resource: string` (e.g. `"members"`, `"events"`)
- `count: number`
- `periodKey: string | null` (for resources that reset per period; null for lifetime)
- Index: `by_org_id_and_resource`.

### Audit

**`auditLogs`**
- `orgId: Id<"organizations"> | null` (null = platform-level action)
- `actorId: Id<"userProfiles"> | null` (null = system)
- `action: string` (e.g. `"member.role.changed"`)
- `resourceType: string` (e.g. `"organizationMember"`)
- `resourceId: string`
- `before: string` (serialized JSON diff — produced by typed serializers, never `v.any()`)
- `after: string` (serialized JSON diff)
- `reason: string | null`
- Indexes: `by_org_id_and_creation_time`, `by_actor`.

### Deferred tables (NOT in Phase 1)

`events`, `categories`, `rounds`, `criteria`, `contestants`, `judges`,
`scoreSheets`, `scores`, `results`, `templates`, `reports`, `documents`,
`notifications`, `activities`, `apiKeys`, `webhooks` — all land in later phases.

### Key schema decisions

- `features`/`limits` are structured objects on `plans` (bounded, seeded by us). If
  we ever need an admin-editable feature matrix we promote to child tables — YAGNI for v1.
- `usage` uses simple counter docs in Phase 1; the gating helpers hide storage so
  we can swap to `@convex-dev/aggregate` without touching call sites.
- `organizationMembers` carries a single `roleId` (one role per membership per
  org). Multi-role-per-membership is a non-goal for v1.
- No `v.any()` anywhere — `before`/`after` are JSON strings produced by typed serializers.

---

## 3. Authorization Helpers & Entitlements

Every public Convex function begins with one of these helpers, and they are the
*only* path to a usable context. All derive identity server-side (no `userId`
arguments, per Convex guidelines).

### File layout

- `convex/lib/auth.ts` — identity ladder.
- `convex/lib/authz.ts` — org/permission helpers + `AuthCtx` type.
- `convex/lib/entitlements.ts` — feature/limit checks.
- `convex/lib/usage.ts` — counter read/increment.
- `convex/lib/audit.ts` — `writeAudit`.
- `convex/lib/errors.ts` — `ConvexError` code constants.

### Identity ladder (`convex/lib/auth.ts`)

- `requireIdentity(ctx): Promise<UserIdentity>` — calls `ctx.auth.getUserIdentity()`, throws `UNAUTHENTICATED` if null.
- `requireUserProfile(ctx): Promise<Doc<"userProfiles">>` — reads by `tokenIdentifier`, throws `PROFILE_NOT_PROVISIONED` if missing.
- `requirePlatformOwner(ctx): Promise<Doc<"userProfiles">>` — `requireUserProfile` + check `platformRole === "platform_owner"`, else throw `FORBIDDEN`.

### Tenancy & RBAC (`convex/lib/authz.ts`)

- `resolveOrgBySlug(ctx, slug): Promise<Doc<"organizations">>` — throws `NOT_FOUND`.
- `requireOrgMember(ctx, { orgSlug }): Promise<AuthCtx>` — resolves org, loads the caller's *active* membership, loads the membership's role, builds the permission set (single `rolePermissions` scan + `permissions` join), loads the org's subscription, and returns:
  ```ts
  type AuthCtx = {
    user: Doc<"userProfiles">;
    org: Doc<"organizations">;
    membership: Doc<"organizationMembers">;
    role: Doc<"roles">;
    permissions: Set<string>;
    subscription: Doc<"subscriptions">;
  };
  ```
  Throws `FORBIDDEN` if the caller has no active membership.
- `requirePermission(ctx, { orgSlug, permission }): Promise<AuthCtx>` — `requireOrgMember` + `permissions.has(permission)` check, else throw `FORBIDDEN`.
- Convenience wrappers (each is just `requirePermission` with a specific permission):
  - `requireOrgOwner(ctx, { orgSlug })` → `"organization.update"`.
  - `requireOrgAdmin(ctx, { orgSlug })` → `"organization.members.manage"`.

### Entitlements & limits (`convex/lib/entitlements.ts`)

Pure functions over a loaded subscription:

- `getSubscription(ctx, orgId): Promise<Doc<"subscriptions">>` — reads `subscriptions.by_org_id`. Orgs are seeded with a "Free" subscription at creation, so this is never null.
- `hasFeature(subscription, feature: string): boolean` — looks up `plan.features[feature]`.
- `hasLimit(subscription, resource: string, currentCount: number): boolean` — `plan.limits[resource] > currentCount`.
- `requireFeature(ctx, { orgSlug, feature }): Promise<AuthCtx>` — throws `FEATURE_UNAVAILABLE` if not.
- `requireLimit(ctx, { orgSlug, resource }): Promise<AuthCtx>` — reads `usage`, throws `LIMIT_EXCEEDED` if at/over the plan ceiling. Storage detail hidden behind `getUsage` / `incrementUsage` (`convex/lib/usage.ts`), swappable to `@convex-dev/aggregate` later.

### Audit (`convex/lib/audit.ts`)

- `writeAudit(ctx, { orgId?, actorId?, action, resourceType, resourceId, before?, after?, reason? })` — serializes `before`/`after` to JSON strings via typed serializers and inserts into `auditLogs` in the *same transaction* as the state change.

### Typed error model (`convex/lib/errors.ts`)

Every throw is `new ConvexError({ code, message, context? })` with a stable `code`:

`UNAUTHENTICATED | PROFILE_NOT_PROVISIONED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | LIMIT_EXCEEDED | FEATURE_UNAVAILABLE | CONFLICT`

The client switches on `code` to render UX (Section 5).

### Usage in a mutation

A typical member-role-change mutation is:
```ts
export const changeRole = mutation({
  args: { orgSlug: v.string(), memberId: v.id("organizationMembers"), newRoleId: v.id("roles") },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "organization.members.manage" });
    const before = await ctx.db.get(args.memberId);
    if (!before || before.orgId !== actx.org._id) throw new ConvexError({ code: "NOT_FOUND", message: "Member not found" });
    await ctx.db.patch(args.memberId, { roleId: args.newRoleId });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id,
      action: "member.role.changed", resourceType: "organizationMember", resourceId: args.memberId,
      before, after: { ...before, roleId: args.newRoleId },
    });
  },
});
```
Three lines guarantee auth + membership + permission + audit in one transaction.

---

## 4. App Architecture, Routes & UI

### Route map (Next.js App Router)

```
/                         landing (public; CTA → /sign-in)
/sign-in                  Better-Auth Google button (+ "next" redirect support)
/app                      org picker (user's memberships + "Create organization" card)
/app/[orgSlug]            → redirect to /overview
/app/[orgSlug]/overview   placeholder dashboard (member count, plan, recent activity)
/app/[orgSlug]/members    list · invite (email + role) · change role · remove
/app/[orgSlug]/settings   rename · branding placeholder · danger zone (transfer ownership, delete)
/app/[orgSlug]/billing    current plan + usage bars (read-only; Phase 6 wires Stripe)
/invite/[token]           accept invitation (sign-in gate if not authenticated)
/platform                 platform-owner: list all orgs (gated by requirePlatformOwner)
```

### `middleware.ts`

Uses `getToken()` from the SSR helpers to gate `/app/*` and `/platform/*` → redirect
to `/sign-in?next=<original>`. Per-org and per-permission enforcement remains inside
Convex via the `require*` helpers.

### App shell

Conventional multi-tenant layout (Linear/Vercel pattern):
- Collapsible left sidebar with an **org switcher** at the top (lists the user's
  memberships, "+ create org" entry).
- Nav items per scope (Overview, Members, Settings, Billing).
- User menu footer (profile, sign out).
- Top bar carries breadcrumbs (`<Org> / <Section>`).
- Mobile collapses the sidebar into a drawer.

### Convex function layout (replaces the demo)

```
convex/
  _generated/
  betterAuth/            @convex-dev/better-auth local component
    convex.config.ts     defineComponent("betterAuth")
    auth.ts              createClient, createAuthOptions, createAuth, options
    adapter.ts           createApi adapter functions
    schema.ts            generated Better-Auth tables
  lib/
    auth.ts              requireIdentity, requireUserProfile, requirePlatformOwner
    authz.ts             requireOrgMember, requirePermission, AuthCtx, convenience wrappers
    entitlements.ts      getSubscription, hasFeature, hasLimit, requireFeature, requireLimit
    usage.ts             getUsage, incrementUsage
    audit.ts             writeAudit
    errors.ts            ConvexError code constants + helpers
    serializers.ts       typed JSON serializers for audit before/after
  auth.ts                ensureUserProfile, getCurrentUser, getCurrentSession
  organizations.ts       create, get, listMine, update, suspend (platform)
  members.ts             list, invite, changeRole, remove
  invitations.ts         getForUser, getByToken, accept, revoke, listByOrg
  roles.ts               list, listPermissions (reference reads)
  plans.ts               list (public reference read)
  subscriptions.ts       getForOrg, changePlan (Phase 1 stub, no Stripe)
  audit.ts               listByOrg (paginated, requires audit.view)
  platform.ts            listAllOrgs, listAllUsers (requirePlatformOwner)
  seed.ts                internalMutation seeding roles/permissions/plans on first deploy
  schema.ts              app schema (replaces the demo)
  auth.config.ts         Better-Auth provider config
  convex.config.ts       defineApp + mount betterAuth component
  http.ts                mount Better-Auth route handlers
  tsconfig.json
```

### Design-system setup

- `shadcn init` → `components.json`, `lib/utils.ts` (`cn()`), `components/ui/` primitives (button, input, dialog, dropdown-menu, select, table, avatar, badge, sonner for toasts, form, label, tooltip).
- Tailwind v4 `@theme` tokens in `globals.css` (colors, radius, fonts, spacing).
- `lucide-react` for icons.
- **Fix existing debt:** remove the `font-family: Arial` override on `body` so the Geist token applies; re-evaluate `next.config.ts` `typescript.ignoreBuildErrors: true` and remove if no longer required.

### Demo cleanup

Delete: the `numbers` table from `schema.ts`, `convex/myFunctions.ts`, the
`app/page.tsx` branding/`AuthPopoverButton` demo, and the `app/server/*` SSR demo
(real SSR is re-added via `preloadAuthQuery` where needed).

### Out of scope for Phase 1

Events, contestants, judges, criteria, scoring, tabulation, reports, PDFs, Stripe,
real notifications/email, analytics, API/webhooks, offline, localization content.
The billing page is a read-only placeholder so the entitlement hooks have a
visible surface.

---

## 5. Audit, Errors, Testing & Acceptance

### Audit coverage in Phase 1

Every state-changing mutation writes one `auditLogs` row in the same transaction:

`user.profile.provisioned`, `organization.created`, `organization.updated`,
`organization.deleted`, `organization.ownership_transferred`, `member.invited`,
`member.invitation.accepted`, `member.invitation.revoked`, `member.role.changed`,
`member.removed`, `subscription.plan_changed`, `platform.org.suspended`.

`before` / `after` carry the diff as JSON. Reads via paginated `audit:listByOrg`
(requires the `audit.view` permission).

### Error handling

Server throws `ConvexError({ code, message, context? })`. Client has one
`useMutationHandler` / toast layer mapping codes → UX:

| Code | UX |
|---|---|
| `UNAUTHENTICATED` | redirect to `/sign-in?next=<current>` |
| `PROFILE_NOT_PROVISIONED` | fire `ensureUserProfile` then retry |
| `LIMIT_EXCEEDED` | upsell modal pointing at `/billing` |
| `FEATURE_UNAVAILABLE` | upsell modal pointing at `/billing` |
| `FORBIDDEN` | "contact an admin" toast |
| `CONFLICT` (e.g. duplicate slug) | inline form error |
| `VALIDATION_ERROR` | field-level errors |
| `NOT_FOUND` | toast + navigate back |

No silent failures.

### Testing strategy

Stack: `convex-test` + `vitest` + `@edge-runtime/vm` (per Convex guidelines,
`environment: "edge-runtime"` with an `import.meta.glob` module map). New scripts
in `package.json`: `"test": "vitest"`.

Test priorities (Phase 1):

1. **Authz (highest priority):** for each public mutation, assert
   (a) unauthenticated throws, (b) non-member throws,
   (c) member-without-permission throws, (d) cross-org access by IDOR throws
   (org A member cannot read/write org B by guessing slugs or IDs),
   (e) correct member succeeds.
2. **Auto-provisioning:** `ensureUserProfile` is idempotent; concurrent calls do not duplicate.
3. **RBAC:** changing a role changes the resolved permission set; removing a `rolePermissions` row revokes access.
4. **Invitations:** expired → rejected; already-accepted → rejected; wrong-email → rejected.
5. **Entitlements:** inviting beyond `maxMembers` throws `LIMIT_EXCEEDED`; a disabled feature blocks the gated mutation.
6. **Audit:** each mutation produces exactly the expected audit row.

Determinism tests are deferred to Phase 3 (tabulation engine).

### Acceptance criteria — Phase 1 is "done" when

1. Google sign-in works end-to-end; `ctx.auth.getUserIdentity()` resolves non-null.
2. A fresh user can create an org and becomes its Owner with the Owner role + full permissions.
3. Owner can invite by email, assign a role, change role, remove member; invitee can accept via `/invite/[token]`.
4. Cross-tenant access is refused (verified by test) — org A member cannot read/write org B.
5. Platform Owner can list all orgs; a normal user cannot reach `/platform`.
6. Billing page shows plan + usage; hitting `maxMembers` shows the upsell, not a crash.
7. Every state change produces an audit row visible to `audit.view` holders.
8. `npm run typecheck && npm run lint && npm run build` all pass; the `convex-test` suite is green.
9. The `convex-authz` audit skill run finds no identity-from-arg, missing-ownership, or public-PII issues.

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| Better-Auth + Convex component is relatively new | Keep the auth surface narrow (Google only); follow the official integration verbatim; revisit if the component API shifts. |
| Profile-provisioning race on first login | `ensureUserProfile`-on-session-start gate + middleware redirect for unauth users. |
| Forgotten `requirePermission` leaks data | Run the `convex-authz` audit skill before declaring Phase 1 complete; authz tests cover every public mutation. |
| `ignoreBuildErrors: true` hides type errors | Re-evaluate during implementation; prefer removing it so `next build` is a real type gate. If kept, `npm run typecheck` runs in CI and the pre-commit check. |
| `@convex-dev/better-auth` local-component setup is fiddly | Implement exactly per the current official docs; if blocked, fall back to the NPM-distributed component variant. |

---

## 6. Open items deferred to implementation planning

The following are noted here so the implementation plan can address them; they do
not change the design:

- Initial seeded role/permission/plan dataset (concrete names and values).
- **Platform Owner provisioning** — since no admin UI exists in Phase 1, the first Platform Owner is designated via an internal/bootstrap mutation (e.g. `internalMutation` keyed on a bootstrap env var or a one-time CLI invocation), setting `userProfiles.platformRole = "platform_owner"`. Subsequent platform owners can be promoted by an existing Platform Owner via a `platform.ts` mutation added when needed. This stays out of the user-facing UI for v1.
- Slug generation + uniqueness rules (casing, allowed chars, collision handling).
- Invitation token format, length, and TTL.
- Transfer-ownership flow details (two-phase: current owner initiates, new owner accepts).
- Organization deletion semantics (soft-delete: status `"deleted"`, members deactivated, data retained for audit; hard-purge out of scope).
- Whether `next.config.ts` keeps `ignoreBuildErrors` (decide at implementation time).
