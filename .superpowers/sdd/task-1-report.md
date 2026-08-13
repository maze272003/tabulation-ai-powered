# Task 1 Report: Project dependencies & environment

**Status:** DONE_WITH_CONCERNS
**Branch:** `phase1-foundation`
**Commit:** `b5ef576` — `chore: install auth, UI, and test dependencies`

## Steps executed

### Step 1 — Runtime dependencies ✓
```
npm install better-auth @convex-dev/better-auth lucide-react class-variance-authority clsx tailwind-merge
```
Result: 32 packages added. Installed versions:
- `better-auth@^1.6.27`
- `@convex-dev/better-auth@^0.12.5`
- `lucide-react@^1.31.0`
- `class-variance-authority@^0.7.1`
- `clsx@^2.1.1`
- `tailwind-merge@^3.6.0`

### Step 2 — Radix primitives + sonner + next-themes ✓
```
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-label @radix-ui/react-slot @radix-ui/react-tooltip sonner next-themes
```
Result: 47 packages added. Installed versions:
- `@radix-ui/react-dialog@^1.1.23`
- `@radix-ui/react-dropdown-menu@^2.1.24`
- `@radix-ui/react-select@^2.3.7`
- `@radix-ui/react-label@^2.1.15`
- `@radix-ui/react-slot@^1.3.3`
- `@radix-ui/react-tooltip@^1.2.16`
- `sonner@^2.0.8`
- `next-themes@^0.4.6`

### Step 3 — Dev/test dependencies ✓
```
npm install -D vitest @edge-runtime/vm convex-test
```
Result: 36 packages added. Installed versions:
- `vitest@^4.1.10`
- `@edge-runtime/vm@^5.0.0`
- `convex-test@^0.0.55`

### Step 4 — `test` script added to package.json ✓
```json
"test": "vitest run",
"test:watch": "vitest"
```

### Step 5 — `vitest.config.ts` + `convex-test/convex-shim.ts` created ✓
Both files created verbatim from the brief.

### Step 6 — Convex environment variables ✓ (with placeholders)
Convex CLI was authenticated to `dev:calculating-viper-382`. All four deployment vars set successfully:
- `SITE_URL=http://localhost:3000` ✓
- `GOOGLE_CLIENT_ID=placeholder-development` ⚠ PLACEHOLDER
- `GOOGLE_CLIENT_SECRET=placeholder-development` ⚠ PLACEHOLDER
- `BETTER_AUTH_SECRET=<generated>` ✓

`npx auth secret` ran successfully (installed `auth@1.6.27`) but only **printed** the secret to stdout rather than writing it anywhere. Per caveat #3, I took the generated value and set it on the deployment manually via `npx convex env set BETTER_AUTH_SECRET <value>`.

`.env.local` updated with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (file is gitignored, not committed).

### Step 7 — Verify install ✓
- `npm run typecheck` → **PASS** (no errors)
- `npm test` → resolves to `vitest run`; reports "No test files found" (expected — no tests exist yet; vitest exits code 1 in this case, acceptable per task spec)

### Step 8 — Commit ✓
```
git add package.json package-lock.json vitest.config.ts convex-test/convex-shim.ts .env.example
git commit -m "chore: install auth, UI, and test dependencies"
```
Result: `b5ef576` (5 files changed, 4528 insertions, 2001 deletions).

Note: `.env.example` was extended with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (documented, non-secret, client-side var that mirrors `.env.local`). The brief lists `.env.example` in the `git add` set, and this is the only sensible change for that committed template file. The pre-existing unrelated change (`deleted: .cursor/rules/convex_rules.mdc`) and untracked `.superpowers/` were intentionally left out of this commit.

## Dependency completeness check
All 17 dependencies from the brief are present in `package.json`:
- Runtime (6): better-auth, @convex-dev/better-auth, lucide-react, class-variance-authority, clsx, tailwind-merge ✓
- Radix/UI (8): react-dialog, react-dropdown-menu, react-select, react-label, react-slot, react-tooltip, sonner, next-themes ✓
- Dev/test (3): vitest, @edge-runtime/vm, convex-test ✓

## Concerns

1. **Google OAuth credentials are placeholders.** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set to `placeholder-development` on the Convex deployment. **The human must create real Google OAuth credentials in Google Cloud Console (APIs & Services → Credentials → OAuth 2.0 Client ID) and replace both values before the end-to-end smoke test in Task 17.** Authorized redirect URIs to configure:
   - `https://calculating-viper-382.convex.site/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`

2. **`npm test` exit code.** `vitest run` exits with code 1 when no test files are found. This is expected for Task 1 (no tests exist yet) and acceptable per the task spec. Once Task 14+ adds tests under `convex-test/**/*.test.ts`, the exit code will reflect actual test results.

3. **Harmless Vite config-loader warning.** Vitest emits a warning: *"ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"`..."* This is a forward-looking deprecation notice from Vite's planned `configLoader: 'native'` default; the config still loads and runs correctly today. The brief specifies the `vitest.config.ts` content verbatim, so I kept it as-is. A future task could resolve this by renaming to `vitest.config.mts` or adding `"type": "module"`, but that is out of scope here.

4. **`npx auth secret` does not auto-write.** Contrary to the brief's wording ("which writes it for you"), the command only prints the secret to stdout. I captured and set it manually — documented here in case later tasks expect a written `.env`.

5. **CRLF warnings** during `git add` (package*.json, .env.example, vitest.config.ts, convex-shim.ts) — expected on Windows, ignored per caveat #5.

## Verification summary
- `npm run typecheck` → **PASS**
- `npm test` → vitest wired correctly; no test files yet (expected)
- All 17 deps installed and resolvable
- Commit `b5ef576` on `phase1-foundation`
