## Task 14: Design system setup

**Files:**
- Create: `components.json`
- Create: `lib/utils.ts`
- Modify: `app/globals.css`
- Create: `components/ui/button.tsx`, `input.tsx`, `label.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `table.tsx`, `avatar.tsx`, `badge.tsx`, `tooltip.tsx`, `sonner.tsx`
- Modify: `next.config.ts` (re-evaluate `ignoreBuildErrors`)

**Interfaces:**
- Produces: a working shadcn/ui primitive set, Tailwind v4 tokens, `cn()` helper.

- [ ] **Step 1: Initialize shadcn**

Run:
```powershell
npx shadcn@latest init -d
```
If prompted for base color, choose `Slate`. This creates `components.json`, `lib/utils.ts`, and updates `globals.css`.

- [ ] **Step 2: Add primitives**

Run:
```powershell
npx shadcn@latest add button input label card dialog dropdown-menu select table avatar badge tooltip sonner
```

- [ ] **Step 3: Fix the body font override**

Edit `app/globals.css`. Remove the line `font-family: Arial, Helvetica, sans-serif;` from the `body` rule so the Geist `--font-sans` token applies. Ensure the `body` uses `font-family: var(--font-sans), ...` or no explicit override (Tailwind v4 picks up the token).

- [ ] **Step 4: Re-evaluate `next.config.ts`**

Read `next.config.ts`. If the TS7/Next compat issue documented in its comment still affects `next build`, leave `typescript.ignoreBuildErrors: true` in place and ensure `npm run typecheck` is the gate. Otherwise remove it:
```ts
export default {
  // ... other config
};
```

- [ ] **Step 5: Verify**

Run `npm run typecheck && npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add components.json lib/utils.ts components/ui app/globals.css next.config.ts
git commit -m "chore: set up shadcn/ui design system"
```

---

