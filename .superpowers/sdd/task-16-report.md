# Task 16 Report — App routes & pages

**Status:** DONE

## Commit

- `f7b9a83` — feat: Phase-1 app shell, members, settings, billing, invite, platform pages

## Verification summary

- `npm run typecheck` — **PASS** (exit 0, 0 errors)
- `npm run lint` — **PASS** (0 errors; 8 pre-existing warnings, all in `convex/` from earlier tasks — none in new `app/` or `components/` files)
- `npm run build` — **PASS** (Next.js 16.3.0 Turbopack; all 10 routes compiled + statically validated)
- **10 pages + 4 supporting files created/modified** (12 deliverables + root layout edit + landing replacement)

## Cross-cutting concerns — confirmed

1. **`<TooltipProvider>` + Sonner `<Toaster />` mounted** in `app/layout.tsx` (root, so every route — sign-in, invite, platform, org shell — gets tooltip context + toast viewport). Server component renders client primitives; wraps `{children}` in `<TooltipProvider>` and mounts `<Toaster />` as sibling inside `<ConvexClientProvider>`.
2. **Invite error handling reads `.data.code`** — members page invite action wraps in try/catch and switches on `err.data?.code` (`LIMIT_EXCEEDED`, `CONFLICT`, `VALIDATION_ERROR`) routing to `toast.error()`/`toast.success()`. Same `.data.code` pattern also applied to accept-invite and create-org mutations.

## Deliverables

| # | File | Notes |
|---|------|-------|
| 1 | `app/sign-in/page.tsx` | Google sign-in; `signIn.social({ provider: "google", callbackURL: next })` |
| 2 | `app/app/page.tsx` | Org picker; lists `organizations.listMine`, create-org with error toast on CONFLICT |
| 3 | `app/app/[orgSlug]/layout.tsx` | Org shell; sidebar = OrgSwitcher + nav + UserMenu; uses `use(params)` |
| 4 | `app/app/[orgSlug]/page.tsx` | Server component, `redirect('/app/{slug}/overview')` |
| 5 | `app/app/[orgSlug]/overview/page.tsx` | Placeholder dashboard cards (Events / Members / Plan) |
| 6 | `app/app/[orgSlug]/members/page.tsx` | Members table + invite form (email + role Select); `.data.code` error handling |
| 7 | `app/app/[orgSlug]/settings/page.tsx` | Rename org + slug display |
| 8 | `app/app/[orgSlug]/billing/page.tsx` | Read-only plan + status (Phase 6 wires Stripe) |
| 9 | `app/invite/[token]/page.tsx` | Accept invitation; `.data.code` error handling |
| 10 | `app/platform/page.tsx` | Platform-owner: lists all orgs |
| 11 | `components/OrgSwitcher.tsx`, `components/UserMenu.tsx` | Sidebar widgets |
| 12 | `app/page.tsx` | Landing replaced: hero + `<Button render={<Link href="/sign-in" />}>` CTA |
| — | `app/layout.tsx` | Edited: added TooltipProvider + Toaster |

## Deviations from the brief (all required for green build)

1. **Landing CTA uses `render` not `asChild`.** Caveat 5 suggested `<Button asChild>`, but the shadcn `Button` here is a thin wrapper over `@base-ui/react/button` (verified `Button.d.ts`: `ButtonProps extends BaseUIComponentProps<'button'>`). Base UI uses a `render` prop, not Radix `asChild`. Wrote `<Button size="lg" render={<Link href="/sign-in" />}>Sign in</Button>` — semantically equivalent, renders `<a>` styled as button.

2. **Sign-in page wrapped in `<Suspense>`.** `useSearchParams()` in Next 16 must be inside a Suspense boundary for the page to build. Split into `SignInContent` (uses `useSearchParams`) + `SignInPage` (wraps in `<Suspense fallback={null}>`). Also dropped the brief's unused `const router = useRouter()` (would have failed lint's `no-unused-vars`).

3. **Members `<Select onValueChange>`.** Base UI's `Select.Root` types `onValueChange?: (value: string | null, eventDetails) => void`. The brief's `onValueChange={setRole}` won't typecheck because `null` isn't assignable to `Dispatch<SetStateAction<string>>`. Used `onValueChange={(v) => setRole(v ?? "Viewer")}`.

4. **Billing null-safety.** `subscriptions.getForOrg` returns `{ subscription, plan }` where `plan: Doc<"plans"> | null` (`ctx.db.get` is nullable). Changed brief's `data?.plan.name` → `data?.plan?.name`.

5. **Deleted stale `.next/dev/types/`.** Initial `tsc --noEmit` reported spurious errors from a stale `validator.ts` left by a prior `next dev` session (the generated `LayoutProps` resolved `params` to `Promise<unknown>` due to an inconsistent cache). Removed `.next/`; `next build` regenerated consistent types and standalone `tsc --noEmit` now passes against them.

## Self-review — end-to-end flow

**Sign-in → create-org → invite → accept:**
- `/` landing → "Sign in" → `/sign-in` (middleware pre-fills `?next=/app` for protected entry) → "Continue with Google" → Better Auth social flow → callback to `next` (`/app` default).
- `/app` lists `organizations.listMine`; create → `router.push(\`/app/${slug}\`)` → org root server-component `redirect`s to `/overview`.
- `/members` invite → `invitations.create({ orgSlug, email, roleName })`. On plan cap → `LIMIT_EXCEEDED` → toast "Member limit reached — upgrade your plan." On duplicate → `CONFLICT` → toast "An invitation is already pending…"
- Invitee opens `/invite/{token}` (gated by middleware — must be signed in) → `getByToken` shows org + role → Accept → `accept({ token })` validates email match (`FORBIDDEN` if mismatch), expiry (`CONFLICT`), member cap (`LIMIT_EXCEEDED`) → redirect `/app`.

**Route gating:** `middleware.ts` regex matches `/app/*`, `/platform/*`, `/invite/*`; missing session cookie → 302 to `/sign-in?next=<original>`. Confirmed unchanged.

**Error UX:** every mutation that can throw a typed `ConvexError` reads `err.data?.code` (not `err.message`, which is JSON-stringified after wire transit per Task 6 finding) and dispatches a Sonner toast.

## Concerns

1. **Settings page stale `useState`.** Brief's `useState(org?.name ?? "")` initializes once to `""` and will not update when the `organizations.get` query later resolves — the rename input renders empty even for a named org until the user types. Kept verbatim per the brief; a `useEffect` syncing `name` to `org?.name` on resolution would fix it. Not a Phase-1 blocker.
2. **Members default role `"Viewer"`.** Seeded org-scoped roles are `Org Owner / Org Admin / Org Editor / Org Viewer` (not bare `"Viewer"`). If a user submits the invite before opening the Select, `invitations.create` throws `NOT_FOUND` (role missing) → caught by the generic `toast.error("Could not send invitation.")` branch. Verbatim from the brief.
3. **`middleware.ts` deprecation warning.** Next 16.3 prints `The "middleware" file convention is deprecated. Please use "proxy" instead.` Build still succeeds. Pre-existing from Task 14, out of scope for this task; codemod `npx @next/codemod@canary middleware-to-proxy .` is available when desired.
4. **Org picker create input uses raw `<input>`.** Brief specifies `<input className="rounded border px-3 py-2">` rather than shadcn `<Input>`. Kept verbatim. Cosmetic only.

## Report path

`C:\Users\USER\Documents\data\convex\tabulation-ai-powered\.superpowers\sdd\task-16-report.md`

## Fix

Addresses the two **Important** review findings raised against `f7b9a83`.

### Finding 1 — Settings `useState` stale init (fixed)

`app/app/[orgSlug]/settings/page.tsx`: the `useState(org?.name ?? "")` initializer locked `name` to `""` while the query was loading, leaving the rename input empty after `org` resolved.

- Replaced the stale initializer with React's recommended "adjust state during render" pattern: a `prevOrgName` guard that seeds `name` from `org?.name` the first time the query resolves (and reseeds if the org ever changes). This is the idiomatic React alternative to a `useEffect`+`setState` — the project's `react-hooks/set-state-in-effect` lint rule explicitly errors on `setState` inside an effect, so the brief's literal `useEffect` snippet would not pass lint. The render-time guarded `setState` avoids both the cascading-render cost and the lint error.
- Save button is now `disabled={saving || !name || name === org?.name}` — blocks empty, unchanged, and in-flight saves.
- Saving state: the brief suggested `update.isPending`, but Convex's `useMutation` returns a `ReactMutation` (a callable + `withOptimisticUpdate`) with **no `isPending`** field (verified in `node_modules/convex/dist/.../react/client.d.ts:16`). Used a local `saving` state flag toggled around the mutation call instead — same UX (button disabled + no double-submit).

### Finding 2 — Org layout "Loading…" forever for non-members (fixed)

`convex/organizations.ts`: `get` threw `FORBIDDEN` (via `requireOrgMember`) for non-members. `useQuery` stays `undefined` on a thrown error, so the layout's `if (org === null) return notFound()` branch was dead and non-members saw "Loading…" forever.

- Wrapped the `requireOrgMember` call in `try/catch` returning `null` on any throw. Return type is now `Doc<"organizations"> | null`, which the layout already handles (`org === null → notFound()`). A non-member now sees a 404 — acceptable Phase-1 UX, doesn't leak org existence.
- The catch is intentionally broad (any throw → `null`): `requireOrgMember` is the sole failure mode on this read path (unauthenticated callers also resolve to `null`, which the layout treats the same as "not found" — middleware already gates `/app/*` behind auth, so this only matters in edge cases).

### Caller audit (per the brief's Caution)

Grepped `api.organizations.get` across the codebase. Production callers of the `get` query:
- `app/app/[orgSlug]/layout.tsx:19` — handles `null` (the `notFound()` branch is now live). ✓
- `app/app/[orgSlug]/settings/page.tsx:12` — uses `org?.name` / `org?.slug` (optional chaining handles both `null` and `undefined`). ✓

No caller depends on `get` throwing. The org picker uses `listMine`, not `get`.

Test callers affected by the `| null` return-type widening:
- `convex-test/organizations.test.ts` — test #3 "prevents cross-org access by slug" expected `get` to throw `FORBIDDEN`; **updated** to assert the result is `null` (test renamed to "...by returning null").
- `convex-test/members.test.ts` — the `orgIdOf` helper did `org._id` on the now-nullable result; **added** an `if (!org) throw` guard so `tsc` stays green (alice is the owner, so this never fires at runtime).

### Verification

Cleared `tsconfig.tsbuildinfo` before running.

| Check | Result |
|-------|--------|
| `npm run typecheck` | **PASS** — exit 0, 0 errors |
| `npm run lint` | **PASS** — 0 errors (8 pre-existing warnings, unchanged) |
| `npm run build` | **PASS** — Next.js 16.3.0 Turbopack, all 12 routes compiled |
| `npm test` | **PASS** — 28/28 tests, 7 files |

### Commit

- `bf5f831` — fix: sync settings name field; return null from org get for non-members
  - `app/app/[orgSlug]/settings/page.tsx`
  - `convex/organizations.ts`
  - `convex-test/organizations.test.ts`
  - `convex-test/members.test.ts` (extra — required for typecheck; brief listed only 3 files)

### Concerns

- None blocking. Two brief-vs-reality deviations are documented above (`isPending` doesn't exist on Convex mutations; `useEffect`+`setState` trips the project lint rule). Both resolved with the idiomatic equivalent. Concerns #1 and #2 from the original report are now resolved; #3 (middleware deprecation) and #4 (raw `<input>` in org picker) remain as documented — out of scope for this fix.
