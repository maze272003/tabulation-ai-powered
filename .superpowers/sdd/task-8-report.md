# Task 8 Report: Billing page UI + route protection e2e

**Status: COMPLETE**

## Outcome

`app/app/[orgSlug]/billing/page.tsx` fully rebuilt and `e2e/05-organizer-workspace.spec.ts` extended with the billing route-protection test. Both files' final committed state matches the brief's spec with exactly two intentional, documented deviations (see below). All gates green.

## Commits

- `f9f8636` — feat(billing): rebuild billing page with plans, checkout, and payment history (1 file, +2/−2: the `window.location.assign` lint fix on `page.tsx`)
- `aeeaf4b` — same message, authored by the concurrent worker at 22:35:40 while my gates were running; it committed both task files in the `window.location.href` state (which fails `react-hooks/immutability`), plus two unrelated files (`convex-test/eventCodes.test.ts`, `convex-test/templates.test.ts` — their staging, not mine; I did not amend their commit). My `f9f8636` on top brings both task files to the exact validated final state.

Both task files are clean in the working tree as of HEAD.

## Gate results (run on the exact final content)

- `npm run lint` — PASS (0 errors; 20 warnings, all pre-existing in unrelated files)
- `npm run typecheck` — PASS
- `npm run build` — PASS (Next 16.3.0 Turbopack; only pre-existing `middleware`→`proxy` deprecation warning)
- `npx vitest run convex-test/billingSubscriptions.test.ts` — PASS (4/4 tests)
- e2e intentionally NOT run per task instructions (needs live dev server + seeded DB)

## Takeover reconciliation

The WIP page was already very close to the brief:

1. **Known defect (useMutation on an action):** already fixed in WIP — `createCheckout` uses `useAction` (line 84); `cancelCheckout`, `changePlan`, `resume` correctly use `useMutation`. Kept.
2. **`window.location.assign` vs brief's `window.location.href =`:** I first restored the brief's literal `href` form; `npm run lint` then failed with `react-hooks/immutability` error at `page.tsx:100` ("Modifying a variable defined outside a component or hook is not allowed" — React Compiler rule flags assignment to `window.location.href` inside the component-defined handler). Since the lint gate is mandatory, I restored `window.location.assign(url)` / `window.location.assign(pendingCheckoutUrl)` — functionally identical navigation, uniform style, lint-clean. **This is a deliberate, documented deviation from the brief's literal code.**
3. Verified the final file is byte-identical to the brief's code block modulo: (a) the mandated `useAction` import/use, (b) the two `.assign` navigations, (c) the brief's lost line break before the "Cancel checkout" `<Button>` (formatting artifact in the brief, normalized).

## Completeness checklist vs brief

- [x] `BillingContent` + Suspense-wrapped default export (Next 16 `useSearchParams` boundary preserved)
- [x] `use(params)` for params; `"use client"`
- [x] Pricing: `Intl.NumberFormat("en-PH", PHP)` with `minimumFractionDigits: 0`, centavos/100
- [x] Date format: `en-PH` short month; `formatDate(null)` → "—"
- [x] Success banner (`?billing=success`) and cancelled banner (`?billing=cancelled`)
- [x] `past_due` warning banner with expiry date + 7-day grace copy
- [x] `cancelAtPeriodEnd && active` info banner with Resume subscription button (`api.subscriptions.resume`)
- [x] Pending checkout card: plan name, amount, Complete payment (external link) + Cancel checkout (`cancelCheckout`, `toast.info`)
- [x] Plan grid: active-only plans, Current badge/ring, free-forever vs per-month pricing, limits line with singular "event", 5 feature rows via `PLAN_FEATURE_LABELS` with check/x icons
- [x] Buttons: Renew for current paid plan; Switch to Free at period end (hidden when already cancelAtPeriodEnd on current plan; shown for non-current Free); `Get <Plan>` for other paid plans; disabled while busy or when a checkout is active
- [x] Payment history table: Date, Plan, Amount, Interval, Period (start → end), Status badge with `PAYMENT_STATUS_TONE` mapping + muted fallback, capitalize
- [x] Loading skeletons (3-card grid `aria-busy`, table block `aria-busy`) and empty state ("No payments yet.")
- [x] Error handling: `errorMessage()` using the brief's `ConvexError` data cast pattern; no `any`, no `@ts-ignore`, no other type assertions beyond the brief's own `key as keyof typeof plan.features`
- [x] Only `CheckCircle2, ExternalLink, XCircle` from lucide (no `CreditCard`)
- [x] e2e: only the appended billing route-protection test (goto `/app/e2e-org/billing`, expect redirect to `/sign-in?next=%2Fapp%2Fe2e-org%2Fbilling`); other tests untouched

## Concerns

- The concurrent worker's `aeeaf4b` bundled two unrelated `convex-test/*` files into a commit carrying this task's message. History rewrite was out of scope (and unsafe with a concurrent committer), so it stands; flagging for the integrator.
- The e2e test is committed but unexecuted (by design for this task); it must be exercised in a full e2e run later.
