# Application Redesign & BorderBeamPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a comprehensive, production-grade visual and architectural redesign across the entire application ecosystem, introducing the `BorderBeamPanel` visual primitive, polished global layout shells (Sidebars/Navs), modernized Landing and Auth pages, and overhauled Support, Billing, Events/Tabulation, and Sentry Superadmin modules.

**Architecture:** A layered command-center architecture combining a GPU-accelerated `BorderBeamPanel` container, modern slate/midnight token foundations in `globals.css`, responsive desktop sidebars and mobile sheets, and dedicated module workflows with strict accessibility and WCAG AA contrast.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Base UI / shadcn/ui primitives, Convex, Lucide Icons, Sonner.

**Spec:** [`docs/superpowers/specs/2026-08-19-application-redesign-and-border-beam-design.md`](file:///c:/Users/USER/Documents/data/convex/tabulation-ai-powered/docs/superpowers/specs/2026-08-19-application-redesign-and-border-beam-design.md)

## Global Constraints
- All interactive elements must maintain a minimum touch target size of $44 \times 44\text{px}$ on mobile.
- All animations and border beams must respect `@media (prefers-reduced-motion: reduce)` with graceful static fallbacks.
- Zero TypeScript (`tsc`) compiler errors; strict type safety across all components and hooks.
- Semantic HTML and accessible ARIA attributes on all custom controls and dialogs.
- Preserve all existing Convex queries, mutations, actions, and business logic without regressions.

---

### Task 1: Design System Primitives — BorderBeamPanel & Global Tokens

**Files:**
- Create: `components/ui/border-beam-panel.tsx`
- Modify: `app/globals.css`
- Test: `convex-test/borderBeam.test.ts` (or component smoke test)

**Interfaces:**
- Produces: `BorderBeamPanel` component supporting `beamColor`, `duration`, `borderWidth`, `glow`, `disabled`, `className`, `children`.

- [ ] **Step 1: Create `components/ui/border-beam-panel.tsx`**
Implement the `BorderBeamPanel` component with SVG/CSS gradient beam rotation, optional backdrop glow, and reduced motion detection.

- [ ] **Step 2: Update `app/globals.css`**
Add keyframe animations for border beam rotation (`@keyframes border-beam`), glassmorphism utility classes, and refine dark/light color tokens for high-contrast slate/midnight themes.

- [ ] **Step 3: Verify TypeScript compilation**
Run: `npm run typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**
```bash
git add components/ui/border-beam-panel.tsx app/globals.css
git commit -m "feat(ui): add BorderBeamPanel primitive and refine global design tokens"
```

---

### Task 2: Public Surfaces — High-Converting SaaS Landing Page

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `BorderBeamPanel` from `components/ui/border-beam-panel.tsx`
- Produces: Polished SaaS landing page with hero interactive scoring simulation, feature matrix, pricing packs, and step-by-step roadmap.

- [ ] **Step 1: Implement Landing Page with Interactive Tabulator Simulation**
Wrap the interactive simulation demo in `BorderBeamPanel`, add live criteria adjustment sliders, status badges, and animated podium leaderboard rank display.

- [ ] **Step 2: Add 6-Card Capability Matrix and Pricing Tiers**
Implement the feature cards with subtle icon glows, and highlight the featured Growth tier with a subtle border beam.

- [ ] **Step 3: Verify responsiveness and build**
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add app/page.tsx
git commit -m "feat(landing): redesign landing page with interactive BorderBeam simulation"
```

---

### Task 3: Unified Authentication & Portal Entry Surfaces

**Files:**
- Modify: `components/auth/SignInForm.tsx`
- Modify: `app/sign-in/page.tsx`
- Modify: `app/sentry/login/page.tsx`
- Modify: `app/enter/page.tsx`

**Interfaces:**
- Consumes: `BorderBeamPanel`, `Button`, `Input`, `Label`, `Card`
- Produces: Polished glassmorphic authentication cards for Organization Owners, Event Judges/Staff, and Sentry Ops Admins.

- [ ] **Step 1: Upgrade `components/auth/SignInForm.tsx`**
Refactor the tabbed persona switcher (Owner vs. Judge/Staff), enhance form inputs with floating focus states, validation feedback, and clear event code auto-formatting.

- [ ] **Step 2: Upgrade `app/sentry/login/page.tsx`**
Implement the command-center ops login card with high-security branding, shield icon badge, and error toast handling.

- [ ] **Step 3: Upgrade `app/enter/page.tsx`**
Streamline the Judge rapid-entry landing page with active session resumption and clear event code entry.

- [ ] **Step 4: Run typecheck and commit**
```bash
npm run typecheck
git add components/auth/SignInForm.tsx app/sign-in/page.tsx app/sentry/login/page.tsx app/enter/page.tsx
git commit -m "feat(auth): modernize authentication and entry interfaces"
```

---

### Task 4: Global Layout Shells & Real-Time Notification Ecosystem

**Files:**
- Modify: `app/app/[orgSlug]/layout.tsx`
- Modify: `app/sentry/(console)/layout.tsx`
- Modify: `app/platform/layout.tsx`
- Modify: `components/NotificationBell.tsx`
- Modify: `components/AnnouncementBanner.tsx`

**Interfaces:**
- Consumes: `OrgSwitcher`, `UserMenu`, `NotificationBell`, `AnnouncementBanner`
- Produces: Cohesive desktop sidebars, mobile drawer sheets, and multi-tab notification dropdown.

- [ ] **Step 1: Upgrade `app/app/[orgSlug]/layout.tsx`**
Implement the command sidebar with glowing active indicators, unread support ticket badge counters, and mobile slide-out drawer with backdrop blur.

- [ ] **Step 2: Upgrade `app/sentry/(console)/layout.tsx` and `app/platform/layout.tsx`**
Add the ops command header with superadmin status badge, session indicators, and streamlined navigation.

- [ ] **Step 3: Enhance `components/NotificationBell.tsx` & `components/AnnouncementBanner.tsx`**
Upgrade the notification bell with multi-tab filtering (*All*, *Tickets*, *Announcements*), unread counter badges, and instant mark-as-read actions.

- [ ] **Step 4: Run typecheck and commit**
```bash
npm run typecheck
git add app/app/[orgSlug]/layout.tsx app/sentry/(console)/layout.tsx app/platform/layout.tsx components/NotificationBell.tsx components/AnnouncementBanner.tsx
git commit -m "feat(shell): modernize global navigation shells and notification bell"
```

---

### Task 5: Support, Ticketing & Real-Time Resolution Hub

**Files:**
- Modify: `app/app/[orgSlug]/support/page.tsx`
- Modify: `app/app/[orgSlug]/support/[ticketId]/page.tsx`
- Modify: `app/sentry/(console)/support/page.tsx`
- Modify: `app/sentry/(console)/support/[ticketId]/page.tsx`

**Interfaces:**
- Consumes: `api.support.tickets.*`, `api.superadmin.tickets.*`
- Produces: Comprehensive tenant support desk and superadmin resolution hub with live chat and one-click refund triggers.

- [ ] **Step 1: Redesign `app/app/[orgSlug]/support/page.tsx`**
Add the support telemetry summary cards, categorized ticket creation wizard (with auto-loading past payments for refund requests), and filterable ticket feed.

- [ ] **Step 2: Redesign `app/app/[orgSlug]/support/[ticketId]/page.tsx`**
Implement styled real-time chat bubbles, timestamp tooltips, message composer with `Cmd+Enter` submit, and ticket status timeline.

- [ ] **Step 3: Redesign `app/sentry/(console)/support/page.tsx` and `[ticketId]/page.tsx`**
Implement the Sentry ops triage queue with status workflow dropdown, private staff notes, and direct automated PayMongo refund execution.

- [ ] **Step 4: Run test suite & typecheck**
```bash
npm run test
npm run typecheck
git add app/app/[orgSlug]/support/page.tsx app/app/[orgSlug]/support/[ticketId]/page.tsx app/sentry/(console)/support/page.tsx app/sentry/(console)/support/[ticketId]/page.tsx
git commit -m "feat(support): redesign tenant support portal and superadmin triage hub"
```

---

### Task 6: Billing, Units & Revenue Operations Module

**Files:**
- Modify: `app/app/[orgSlug]/billing/page.tsx`
- Modify: `app/sentry/(console)/billing/page.tsx`

**Interfaces:**
- Consumes: `api.billing.*`, `api.superadmin.billing.*`
- Produces: Tenant billing dashboard with interactive unit packs, PayMongo checkout, payment history with refund triggers, and superadmin billing ops.

- [ ] **Step 1: Redesign `app/app/[orgSlug]/billing/page.tsx`**
Add unit balance telemetry card with capacity gauge, 3-tier package matrix with featured Growth Pack in `BorderBeamPanel`, dynamic custom units calculator, and payment history table with instant "Request Refund" action.

- [ ] **Step 2: Redesign `app/sentry/(console)/billing/page.tsx`**
Implement superadmin financial overview cards (Gross Volume, Net Units Sold, Active Paying Orgs), transaction ledger, and manual credit adjustments.

- [ ] **Step 3: Run test suite & typecheck**
```bash
npm run test
npm run typecheck
git add app/app/[orgSlug]/billing/page.tsx app/sentry/(console)/billing/page.tsx
git commit -m "feat(billing): overhaul tenant billing suite and ops financial console"
```

---

### Task 7: Events, Tabulation & Live Scoring Suite

**Files:**
- Modify: `app/app/[orgSlug]/events/page.tsx`
- Modify: `app/app/[orgSlug]/events/new/page.tsx`
- Modify: `app/enter/sheet/[sheetId]/page.tsx`
- Modify: `components/enter/EnterAppShell.tsx`
- Modify: `app/enter/staff/rounds/[roundId]/monitor/page.tsx`
- Modify: `app/enter/staff/rounds/[roundId]/review/page.tsx`
- Modify: `app/public/[eventCode]/page.tsx`

**Interfaces:**
- Consumes: `api.events.*`, `api.rounds.*`, `api.sheets.*`
- Produces: High-density event management, touch-optimized judge scoring sheets, live round monitor, and celebratory public results.

- [ ] **Step 1: Redesign `app/app/[orgSlug]/events/page.tsx` and `events/new/page.tsx`**
Update event status cards (*Draft*, *Ready*, *Live*, *Completed*), readiness checklist, and Gemini AI template generator modal.

- [ ] **Step 2: Redesign Judge Scoring Sheet (`app/enter/sheet/[sheetId]/page.tsx`)**
Optimize for touch devices with high-contrast criterion sliders, score range boundary checks, auto-save indicators, and confirmation dialogs.

- [ ] **Step 3: Redesign Round Monitor & Review (`monitor/page.tsx`, `review/page.tsx`)**
Implement live matrix displaying judge progress, outlier alerts, and round lock controls.

- [ ] **Step 4: Redesign Public Results (`app/public/[eventCode]/page.tsx`)**
Build the celebratory podium layout for top contestants with ranked score tables and export options.

- [ ] **Step 5: Run test suite & typecheck**
```bash
npm run test
npm run typecheck
git add app/app/[orgSlug]/events/ app/enter/ components/enter/ app/public/
git commit -m "feat(events): redesign event management, judge scoring, and public results"
```

---

### Task 8: Sentry Superadmin Operations & CRM Suite

**Files:**
- Modify: `app/sentry/(console)/dashboard/page.tsx`
- Modify: `app/sentry/(console)/crm/page.tsx`
- Modify: `app/sentry/(console)/organizations/page.tsx`
- Modify: `app/sentry/(console)/users/page.tsx`
- Modify: `app/sentry/(console)/announcements/page.tsx`
- Modify: `app/sentry/(console)/audit/page.tsx`

**Interfaces:**
- Consumes: `api.superadmin.*`
- Produces: Executive KPI dashboard, CRM pipeline, organization/user management, announcement broadcasts, and audit logs.

- [ ] **Step 1: Redesign Sentry Dashboard (`dashboard/page.tsx`)**
Add real-time telemetry cards with subtle border beam highlights, active events monitor, and urgent ticket queue.

- [ ] **Step 2: Redesign CRM, Organizations, and Users pages**
Enhance tenant lifecycle tables with search, status filters, and action dropdowns.

- [ ] **Step 3: Redesign Announcements & Audit Log pages**
Implement the broadcast composer with severity tags and immutable audit trail table.

- [ ] **Step 4: Run typecheck and commit**
```bash
npm run typecheck
git add app/sentry/(console)/
git commit -m "feat(sentry): redesign superadmin ops dashboard, CRM, and system tools"
```

---

### Task 9: Quality Gates & End-to-End Verification

**Files:**
- Entire codebase

- [ ] **Step 1: Run TypeScript strict check**
Run: `npm run typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 2: Run all Vitest tests**
Run: `npm run test`
Expected: All test suites PASS.

- [ ] **Step 3: Run Next.js production build**
Run: `npm run build`
Expected: Clean production build with zero warnings or errors.

- [ ] **Step 4: Final commit and verify clean git status**
```bash
git status
```
