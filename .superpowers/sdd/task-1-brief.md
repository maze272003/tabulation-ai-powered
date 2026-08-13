## Task 1: Project dependencies & environment

**Files:**
- Modify: `package.json` (add deps + `test` script)
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: installed `better-auth`, `@convex-dev/better-auth`, shadcn UI deps, test deps; `npm test` runnable.

- [ ] **Step 1: Install runtime dependencies**

Run (PowerShell):
```powershell
npm install better-auth @convex-dev/better-auth lucide-react class-variance-authority clsx tailwind-merge
```

- [ ] **Step 2: Install shadcn/ui prerequisite Radix primitives + sonner**

Run:
```powershell
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-label @radix-ui/react-slot @radix-ui/react-tooltip sonner next-themes
```

- [ ] **Step 3: Install dev/test dependencies**

Run:
```powershell
npm install -D vitest @edge-runtime/vm convex-test
```

- [ ] **Step 4: Add `test` script to package.json**

Modify `package.json` `scripts` to include:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create `vitest.config.ts`**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex-test/**/*.test.ts"],
    alias: {
      convex: "convex-test/convex-shim.ts",
    },
  },
});
```

Create `convex-test/convex-shim.ts` (empty placeholder; `convex-test` provides the real module mapping at runtime):
```ts
// Placeholder; convex-test intercepts convex/* imports via the test setup.
export {};
```

- [ ] **Step 6: Set Convex environment variables**

Run (cross-platform via Convex CLI). For the secret, use `npx auth secret` which writes it for you:
```powershell
npx convex env set SITE_URL http://localhost:3000
```

Then set Google OAuth credentials (you must create these in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID; authorized redirect: `https://<your-deployment>.convex.site/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`):
```powershell
npx convex env set GOOGLE_CLIENT_ID <your-client-id>
npx convex env set GOOGLE_CLIENT_SECRET <your-client-secret>
```

Generate the Better-Auth secret:
```powershell
npx auth secret
```
(If `npx auth secret` is unavailable, generate 32 random base64 bytes and set manually: `npx convex env set BETTER_AUTH_SECRET <value>`.)

Add to `.env.local` (Next.js side):
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 7: Verify install**

Run:
```powershell
npm run typecheck
```
Expected: PASS (no type errors from the new deps).

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts convex-test/convex-shim.ts .env.example
git commit -m "chore: install auth, UI, and test dependencies"
```

---

