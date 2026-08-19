# Full Application Design & UI/UX Redesign Specification

**Date:** 2026-08-19  
**Status:** Approved  
**Author:** Antigravity Engineering & Design Architecture  

---

## 1. Overview & Vision

This specification defines the complete end-to-end design system, visual identity, responsive layouts, accessibility compliance, and module redesign for the **Tabulation AI-Powered SaaS Platform**.

The platform is elevated into an **Ultra-Modern Dark/Light SaaS with Ambient Glows**, featuring:
- A shared `BorderBeamPanel` visual primitive (`components/ui/border-beam-panel.tsx`) with animated perimeter highlight rays, subtle glows, and strict `prefers-reduced-motion` guards.
- Refined slate/midnight tokens in `app/globals.css` with WCAG AA compliant contrast ratios across light and dark modes.
- Coherent command-center navigation shells for Tenant Organizations (`/app/[orgSlug]`), Sentry Superadmin (`/sentry`), and Platform Admin (`/platform`) with responsive mobile slide-out drawers and bottom sheets.
- High-converting modern SaaS Landing Page (`app/page.tsx`) with interactive live tabulation simulation and feature matrix.
- Unified, persona-tailored Authentication surfaces (`/sign-in`, `/sentry/login`, `/enter`).
- Deep module overhauls across Support/Ticketing, Billing/Units, Tabulation/Scoring, and Sentry Platform Operations.

---

## 2. Design System & Visual Primitives

### 2.1 `BorderBeamPanel` (`components/ui/border-beam-panel.tsx`)
A high-performance visual container component designed to highlight featured surfaces without visual clutter.

* **Architecture**:
  * Root container with relative positioning, `overflow-hidden`, and customizable border radius (`rounded-xl` or `rounded-2xl`).
  * SVG/CSS conic gradient beam layer that rotates along the container's perimeter.
  * Inner content wrapper ensuring clear legibility and contrast against the subtle background.
* **Props Interface**:
  ```typescript
  export interface BorderBeamPanelProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    beamColor?: string; // Default: "from-primary via-sky-400 to-indigo-500"
    duration?: number;  // Seconds per cycle, default: 8
    borderWidth?: number; // In px, default: 1.5
    glow?: boolean;     // Adds soft ambient blur glow behind panel
    disabled?: boolean; // Disables animation
  }
  ```
* **Accessibility**: Automatically disables rotation animation and displays an elegant static gradient border when `@media (prefers-reduced-motion: reduce)` is detected.

### 2.2 Color & Elevation Tokens (`app/globals.css`)
* **Light Palette**: Slate-50 background (`oklch(0.984 0.003 247.86)`), Slate-900 foreground, Royal Blue-600 primary (`oklch(0.546 0.215 262.88)`), crisp borders (`oklch(0.929 0.013 255.51)`).
* **Dark Palette**: Midnight Slate-950 background (`oklch(0.129 0.028 261.69)`), Slate-50 foreground, Luminous Blue-500 primary (`oklch(0.623 0.214 259.81)`), subtle card borders (`oklch(1 0 0 / 10%)`).
* **Semantic Badges**:
  * `--success`: Emerald (`oklch(0.527 0.154 150.07)` / dark `oklch(0.696 0.17 162.48)`)
  * `--warning`: Amber (`oklch(0.666 0.179 58.32)` / dark `oklch(0.769 0.16 70.08)`)
  * `--info`: Sky (`oklch(0.585 0.157 237.6)` / dark `oklch(0.685 0.169 237.32)`)
  * `--destructive`: Rose (`oklch(0.577 0.245 27.325)` / dark `oklch(0.704 0.191 22.216)`)

---

## 3. Global Navigation & Layout Shells

### 3.1 Tenant Organization Shell (`app/app/[orgSlug]/layout.tsx`)
* **Desktop Sidebar (16rem / 64)**:
  * Persistent dark sidebar (`bg-sidebar`) with high contrast text.
  * `OrgSwitcher` header supporting switching between multiple tenant organizations and creation of new organizations.
  * Navigation items: Overview, Events, Templates, Billing, Support & Tickets, Settings.
  * Real-time unread badges for Support tickets.
  * Footer with `UserMenu` for profile details, theme switching, and sign out.
* **Mobile Shell (< 1024px)**:
  * Top navigation bar with organization title, quick `NotificationBell` icon, and hamburger menu toggle.
  * Accessible slide-out navigation sheet with backdrop blur and touch target sizes $\ge 44\text{px}$.

### 3.2 Sentry Superadmin Console Shell (`app/sentry/(console)/layout.tsx`)
* Top ops header with environment indicator (`Ops Console: Superadmin Live`), session status, and instant sign-out.
* Navigation hierarchy: Dashboard, Support & Tickets, Users, Organizations, Billing, CRM, Announcements, Audit Log, Settings.
* Real-time notification counters for pending support tickets and unhandled refund requests.

### 3.3 Platform Admin Shell (`app/platform/layout.tsx`)
* Consistent platform administrator interface for global system statistics, user lists, and organization quotas.

---

## 4. Public Surfaces & Authentication

### 4.1 Landing Page (`app/page.tsx`)
* **Hero Section**:
  * Modern SaaS header with brand logo, product links, and dual CTAs (*"Get Started"*, *"Sign In"*).
  * Impactful headline with gradient accents and feature pill badge.
  * **Live Tabulation Showcase**: An interactive simulation card wrapped in `BorderBeamPanel` demonstrating live criteria weights, real-time score submissions, and automatic ranking recalculation.
* **Feature Grid**: 6 visual cards with glowing icon badges, concise value propositions, and audit-grade integrity highlights.
* **Step-by-Step Roadmap**: 3-step timeline (01 Setup Event $\rightarrow$ 02 Issue Passcodes $\rightarrow$ 03 Live Tabulation & Podium Publishing).
* **Pricing & Unit Packs**: Interactive package tiers with the Growth Pack highlighted in `BorderBeamPanel`.
* **FAQ & Footer**: Accordion items and links to documentation, privacy, and support.

### 4.2 Unified Authentication (`app/sign-in/page.tsx`, `components/auth/SignInForm.tsx`)
* Centered glassmorphic container with ambient background glow.
* **Persona Tabs**:
  * **Organization Owners**: Better-Auth email/password authentication, social providers, and validation feedback.
  * **Judges & Event Staff**: Direct event code input (with auto-formatting to uppercase), assigned judge username, and password entry with immediate error handling.

### 4.3 Sentry Ops Login (`app/sentry/login/page.tsx`) & Judge Enter (`app/enter/page.tsx`)
* **Sentry Ops**: High-security login with shielded badge header, credential validation, and toast notifications.
* **Judge Enter**: Direct portal for event passcode entry, active judging assignments, and current session indicator.

---

## 5. Module-by-Module Redesigns

### 5.1 Support & Help Desk Module
* **Tenant Support Center (`/app/[orgSlug]/support`)**:
  * Status telemetry cards: Open Tickets, In Review, Resolved, Avg Response SLA.
  * **New Ticket Dialog**: Categorized request types (Refund Request, Billing Issue, Technical Support, General Question). When "Refund Request" is chosen, loads recent payments for quick reference selection.
  * Filterable tabs: *All*, *Open*, *Refunds*, *Resolved*, with instant search.
* **Real-Time Ticket Detail (`/app/[orgSlug]/support/[ticketId]` & `/sentry/(console)/support/[ticketId]`)**:
  * Threaded message history with distinct styling for customer vs. superadmin replies.
  * Instant reply composer with `Cmd+Enter` keyboard shortcut.
  * For Sentry Superadmin: Status workflow dropdown, internal resolution notes, and direct one-click PayMongo refund processing action with immediate feedback.
* **Notification System (`components/NotificationBell.tsx`, `components/AnnouncementBanner.tsx`)**:
  * Multi-tab popover: *All*, *Tickets*, *Announcements*.
  * Real-time unread badge counts and instant "Mark all as read" mutation.

### 5.2 Billing, Units & Revenue Module
* **Tenant Billing Suite (`/app/[orgSlug]/billing`)**:
  * Balance telemetry card showing available units and capacity gauge.
  * Tiered package selector with the Growth Pack highlighted via `BorderBeamPanel`.
  * Dynamic custom units calculator with real-time PHP pricing.
  * PayMongo checkout modal with GCash, Maya, Cards, and Online Banking.
  * Transaction history table with receipt download and direct "Request Refund" triggers.
* **Sentry Billing Console (`/sentry/(console)/billing`)**:
  * Platform revenue telemetry, global transaction ledger, and manual unit adjustment controls.

### 5.3 Events, Tabulation & Scoring Module
* **Event Workspace (`/app/[orgSlug]/events`)**:
  * Status badges (*Draft*, *Ready*, *Live*, *Completed*), readiness checklist, and Gemini AI template generator.
* **Judge Scoring Console (`/enter/sheet/[sheetId]`)**:
  * Touch-optimized sliders and stepper buttons with validation bounds and real-time auto-saving.
* **Live Round Monitor (`/enter/staff/rounds/[roundId]/monitor`)**:
  * Real-time grid of all judges' submission statuses with lock/unlock round controls.
* **Public Results Display (`/public/[eventCode]`)**:
  * Podium showcase for top contestants with celebratory gradients and ranked category breakdowns.

### 5.4 Sentry Superadmin Operations Module
* **Executive Dashboard (`/sentry/(console)/dashboard`)**:
  * Live KPI cards (Active Tenants, Live Scoring Rounds, Revenue, Ticket Queue).
* **CRM & Organization Administration (`/sentry/(console)/crm`, `organizations`, `users`)**:
  * Tenant lifecycle management, organization statuses, and user management.
* **Announcements System (`/sentry/(console)/announcements`)**:
  * Broadcast manager with severity levels (*Info*, *Warning*, *Urgent*) and target audience selection.
* **Audit Trail (`/sentry/(console)/audit`)**:
  * Immutable event log table with search and filtering by actor, event type, and date.

---

## 6. Accessibility & Responsiveness Requirements

* **WCAG AA Compliance**: All text elements meet a minimum 4.5:1 contrast ratio against their backgrounds.
* **Keyboard Navigation**: Full `Tab`, `Shift+Tab`, `Enter`, and `Escape` support across all dropdowns, modals, and forms.
* **Touch Targets**: Minimum interactive dimension of $44 \times 44\text{px}$ on mobile.
* **Motion Preferences**: Respects `prefers-reduced-motion` with graceful static fallbacks for animations and border beams.
* **Screen Reader Support**: Semantic HTML (`<main>`, `<nav>`, `<aside>`, `<header>`, `<footer>`), descriptive ARIA labels on icon buttons, and live region announcements.

---

## 7. Verification & Quality Gates

1. **TypeScript Compilation**: Zero type errors with strict typechecking (`npm run typecheck`).
2. **Linting**: Conforms to ESLint rules without unhandled code smells (`npm run lint`).
3. **Automated Tests**: Unit and integration test suite verification (`npm run test`).
4. **Production Build**: Successful clean production build (`npm run build`).
5. **Cross-Viewport Responsiveness**: Verification across mobile (375px), tablet (768px), and desktop (1280px+).
