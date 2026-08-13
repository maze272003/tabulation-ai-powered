# Task 14 Report — Design system setup

**Branch:** `phase1-foundation`
**Commit:** `66367b2` — `chore: set up shadcn/ui design system`

## Status

**DONE**

- typecheck: **PASS** (`tsc --noEmit`, exit 0, with TS 7 via `@typescript/native`)
- lint: **PASS** (0 errors; 8 pre-existing warnings in `convex/` and `convex-test/` unrelated to this task — Convex `no-filter-in-query` notes and unused-import/unused-disable warnings)
- build: **PASS** (`next build` with Turbopack, exit 0; `Compiled successfully in 11.3s`)

## What was done

### Step 1 — shadcn init
Ran `npx shadcn@latest init -d` (defaults, non-interactive). shadcn detected:
- Framework: **Next.js**
- Tailwind: **v4** (auto-detected from `@import "tailwindcss"` + `@tailwindcss/postcss`)
- Import alias: `@/*`

Created:
- `components.json` (style `"base-nova"`, RSC on, TSX on, baseColor `neutral`, cssVariables on, icon library `lucide`)
- `lib/utils.ts` with `cn()` (clsx + tailwind-merge)
- `components/ui/button.tsx` (the init seed component)
- Rewrote `app/globals.css` with the shadcn theme token set (oklch palette, light + `.dark`, sidebar/chart/radius tokens)

Installed peer deps: `shadcn@^4.17.0`, `tw-animate-css@^1.4.0`, `@base-ui/react@^1.7.0`.

### Step 2 — primitives
Ran `npx shadcn@latest add button input label card dialog dropdown-menu select table avatar badge tooltip sonner -y`.

All 12 primitives now in `components/ui/`:

| Primitive | File |
|---|---|
| button | `components/ui/button.tsx` |
| input | `components/ui/input.tsx` |
| label | `components/ui/label.tsx` |
| card | `components/ui/card.tsx` |
| dialog | `components/ui/dialog.tsx` |
| dropdown-menu | `components/ui/dropdown-menu.tsx` |
| select | `components/ui/select.tsx` |
| table | `components/ui/table.tsx` |
| avatar | `components/ui/avatar.tsx` |
| badge | `components/ui/badge.tsx` |
| tooltip | `components/ui/tooltip.tsx` |
| sonner | `components/ui/sonner.tsx` |

### Step 3 — font debt fixed
The shadcn init **already removed** the `font-family: Arial, Helvetica, sans-serif;` override from `body` (its rewrite replaced the entire `@layer base` block with `@apply bg-background text-foreground` on body and `@apply font-sans` on html).

However, the shadcn rewrite introduced a **new** font bug: it wrote `--font-sans: var(--font-sans);` into `@theme inline` — a self-referential declaration that resolves to nothing (the Tailwind `--font-sans` token referencing itself). The original Next template mapped `--font-sans` → `--font-geist-sans`. Without fixing this, the Geist font would not have applied (font-sans utility would resolve to an invalid value).

Fixed in `app/globals.css:10-12`:
```css
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-geist-sans);
```

Verified no `Arial` reference remains in `globals.css`. The Geist font loader in `app/layout.tsx` (`Geist({ variable: "--font-geist-sans", ... })` on `<html>`) now flows through `--font-geist-sans` → `--font-sans` token → `font-sans` utility → `<html>{@apply font-sans}`. Geist applies.

### Step 4 — `next.config.ts` re-evaluated
Previous content had `typescript.ignoreBuildErrors: true` with a comment explaining it was a TS7/Next compiler-API workaround.

Procedure:
1. Baseline build **with** the flag: PASS (`Skipping validation of types`).
2. Removed the `typescript.ignoreBuildErrors` block.
3. Clean build **without** the flag: PASS. Next now reports `Running TypeScript ...` and `Finished TypeScript in 11.4s` — i.e. Next's own type check runs and succeeds.

Result: **`ignoreBuildErrors` removed.** The build is now a real type gate. `next.config.ts` retains a comment documenting when/why the workaround was lifted (re-tested 2026-08-12, Next 16.3 + TS 7.0.2).

### Step 5–6 — verify + commit
Cleared `tsconfig.tsbuildinfo` and `.next/`, ran all three gates from a clean state, all green (see Status above). Committed exactly the deliverables: `components.json`, `lib/utils.ts`, `components/ui/*` (12 files), `app/globals.css`, `next.config.ts`, `package.json`, `package-lock.json`.

Pre-existing unrelated changes left out of the commit: a deletion of `.cursor/rules/convex_rules.mdc` and the untracked `.superpowers/` directory.

## Self-review

- [x] `cn()` exists in `lib/utils.ts` (clsx + tailwind-merge, default shadcn implementation, unmodified)
- [x] All 12 primitives exist in `components/ui/` (verified via directory listing)
- [x] Geist font actually applies: no `Arial` override anywhere; `--font-sans` → `--font-geist-sans` self-reference fixed; body/html use Tailwind `font-sans`
- [x] `ignoreBuildErrors` removed; `next build` is a real type gate
- [x] All three verification gates pass on a clean tree

## Concerns / notes for downstream tasks

1. **shadcn v4 "base-nova" style uses Base UI, not Radix.** The generated primitives import from `@base-ui/react/*` (e.g. `@base-ui/react/button`, `@base-ui/react/dialog`, ...), **not** `@radix-ui/*`. The project's `package.json` already declared `@radix-ui/react-{dialog,dropdown-menu,label,select,slot,tooltip}` from Task 3 — these are now **unused** by the shadcn primitives. They are still installed and harmless (Task 16's pages will only consume the shadcn wrappers in `components/ui/`), but a later cleanup task could remove them. The shadcn init added `@base-ui/react@^1.7.0` as the actual primitive engine.

2. **`TooltipProvider` reminder.** The shadcn CLI emitted a note that the app should be wrapped with `<TooltipProvider>` (from `components/ui/tooltip`) for tooltips to work. Task 16 (UI pages) should add this at the layout level when it introduces the first tooltip consumer.

3. **Sonner requires `<Toaster />` mount.** `components/ui/sonner.tsx` exports a `Toaster` that must be rendered once (typically in `app/layout.tsx` or a providers component) before `toast()` calls work. Task 16 should add it.

4. **No `globals.css` token loss.** The shadcn rewrite replaced the minimalist `:root`/dark blocks with its full oklch token palette. All references the original template relied on (`--font-geist-sans`, `--font-geist-mono` from `app/layout.tsx`) are still honored via the `@theme inline` mappings — confirmed by the corrected `--font-sans` line.

5. **Peer-dep additions are intentional.** `shadcn`, `tw-animate-css`, and `@base-ui/react` were installed by the shadcn CLI as required dependencies for the generated primitives / CSS preset (`@import "shadcn/tailwind.css"` and `@import "tw-animate-css"` at the top of `globals.css`). They are part of the committed `package.json` / lockfile.

6. **shadcn prompts:** none. `-d` (init) and `-y` (add) both ran fully non-interactively, as the brief instructed.
