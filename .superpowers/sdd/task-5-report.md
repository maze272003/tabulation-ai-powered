# Task 5 Report: Test harness

## Status: DONE_WITH_CONCERNS

The harness is built, both sanity tests pass, typecheck is clean, and the commit is on `phase1-foundation`. Marked DONE_WITH_CONCERNS only because several adaptations from the brief were required (documented below); they are all sound and the harness genuinely exercises the backend.

## Commits

- `9c5a105` — `test: add convex-test harness`

## Verification

- `npm test`: **2/2 sanity tests pass** (1 file, ~1.2s).
- `npm run typecheck`: **clean** on a fresh build (`tsconfig.tsbuildinfo` deleted first).
- `npm run lint`: 0 errors (2 pre-existing warnings in `convex/betterAuth/_generated/*.ts`, unrelated to this task).

## What was delivered

### `convex-test/setup.ts`
Exports exactly the three agreed symbols — `setupTest()`, `aliceIdentity`, `bobIdentity`. `seedAndProvision` was **deferred** as instructed: `convex/seed.ts` does not exist until Task 8, so `api.seed.seedReferenceData` is a TS error today. Task 8 will add `seedAndProvision` to this file.

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "../convex/schema";

const testModules = import.meta.glob("../convex/**/*.ts");

export function setupTest() {
  return convexTest(schema, testModules);
}

export const aliceIdentity = { tokenIdentifier: "alice-token", subject: "alice-subject",
  name: "Alice", email: "alice@example.com",
  pictureUrl: "https://example.com/a.png", issuer: "https://tabulation.example.com" } as const;

export const bobIdentity   = { /* same shape, bob@example.com */ } as const;
```

### `convex-test/sanity.test.ts`
Two tests, both passing:
1. `setupTest()` (anonymous) → `getCurrentUser` returns `null`.
2. `setupTest().withIdentity(aliceIdentity)` → `ensureUserProfile` inserts a row, then `getCurrentUser` reads it back with `email === "alice@example.com"`.

## Adaptations from the brief (concerns)

Four deviations from the brief's literal code were necessary. All were verified against the installed `convex-test@0.0.55` source (`node_modules/convex-test/dist/index.js` + `index.d.ts`) and the Convex testing docs.

### 1. Glob is lazy, NOT `{ eager: true }`
The brief used `import.meta.glob("../convex/**/*.ts", { eager: true })`. convex-test's `moduleCache` does `return await module();` (index.js:1366) — i.e. it expects each entry to be a lazy loader `() => Promise<module>`. The eager form resolves modules to their values immediately, so `module()` throws "module is not a function". Removed `eager: true`. The Convex guidelines example (`convex/_generated/ai/guidelines.md`:414) confirms the lazy form `import.meta.glob("./**/*.ts")`.

### 2. Authentication via `.withIdentity(...)`, not a third `{ userIdentity }` argument
The brief called `t.runMutation(api.auth.ensureUserProfile, {}, { userIdentity: aliceIdentity })`. In convex-test 0.0.55 the runtime signatures are `runQuery(fnRef, args)` and `runMutation(fnRef, args)` — only two arguments. A third argument is **silently ignored** (the function would run with no identity and throw `UNAUTHENTICATED`, failing the test). The typed, supported way to attach an identity is `const t = setupTest().withIdentity(aliceIdentity)`; the resulting object runs all subsequent `query`/`mutation` calls under that identity. Used that pattern. Verified in index.d.ts:85-96 (`withIdentity(identity: Partial<UserIdentity>)`) and index.js:1604-1608.

### 3. Used `t.query` / `t.mutation` (not `t.runQuery` / `t.runMutation`)
The runtime has both names (it spreads `...byType, ...byTypeWithPath`), but the **public types** in `index.d.ts` only declare `query`, `mutation`, `action`. Using `runQuery`/`runMutation` compiles at runtime but fails `tsc` with TS2339/TS2551. Switched to the typed public API. (`runQuery` etc. are reachable through the same object and remain available to callers who need the by-path variants.)

### 4. Removed the `convex: "convex-test/convex-shim.ts"` vitest alias
The alias (added in Task 1) breaks `convex/values` and `convex/server` imports. Vite string aliases match by prefix, so `"convex"` also remaps `convex/values`, `convex/server`, etc., to the empty shim (`export {};`). That would make `import { ConvexError } from "convex/values"` (in `convex/auth.ts`) resolve to `undefined`. Removed the alias from `vitest.config.ts`. The shim file (`convex-test/convex-shim.ts`) is left in place but is now unused — convex-test installs its own global proxy (`global.Convex = { syscall, asyncSyscall, jsSyscall }` via `ensureGlobalProxy()`, index.js:1396-1412) which is the official interception mechanism. The `convex` package reads `globalThis.Convex` at runtime, so no alias is required.

## Caveat checks from the brief

- **Caveat 1 (defer `seedAndProvision`)** — Done. Not written, no `api.seed.*` reference anywhere.
- **Caveat 2 (Step 3 "expected fail" is wrong)** — Confirmed. With `seedAndProvision` removed, both sanity tests genuinely PASS. The real success criterion (`npm test` green) is met.
- **Caveat 3 (verify convex-test API shape)** — Verified against installed 0.0.55 types/source. Adaptations 1–3 above are the result.
- **Caveat 4 (alias)** — Removed; see adaptation 4.
- **Caveat 5 (edge-runtime + Better-Auth glob)** — **No narrowing needed.** The glob `"../convex/**/*.ts"` does include `convex/betterAuth/**/*.ts`, but convex-test loads modules **lazily** (only when a function reference is resolved). The sanity tests only call `api.auth.getCurrentUser` / `api.auth.ensureUserProfile`, which live in `convex/auth.ts`; that module imports only `./_generated/server` and `./_generated/dataModel` — it does **not** import `better-auth`. So `betterAuth/*` is never imported during these tests and the edge-runtime never sees the `better-auth` package. Left the glob broad to keep the harness reusable for later tasks.
- **Caveat 6 (`userIdentity` shape)** — Verified. `withIdentity` accepts `Partial<UserIdentity>`; the brief's fields (`tokenIdentifier`, `subject`, `name`, `email`, `pictureUrl`, `issuer`) are all valid. Missing fields are auto-filled by convex-test (`subject`/`issuer`/`tokenIdentifier` get defaults). All provided explicitly here.

## Self-review: does the harness really exercise the backend?

Yes — it is not a mock of the handlers, it is a mock of the **database/syscall layer** only. The actual function code runs:

- Test 1 calls the real `getCurrentUser` query handler. `ctx.auth.getUserIdentity()` returns `null` (no identity attached), the handler returns `null` directly — no DB read needed. Proves the query executes.
- Test 2 calls the real `ensureUserProfile` mutation handler. It calls `ctx.auth.getUserIdentity()` (returns the Alice identity), then runs a real `ctx.db.query("userProfiles").withIndex("by_token_identifier", ...).unique()` against the `DatabaseFake`, finds nothing, and calls the real `ctx.db.insert("userProfiles", {...})` — exercising schema validation and the `by_token_identifier` index. The follow-up `getCurrentUser` query then reads the just-inserted row through the same index and returns it, with `email === "alice@example.com"`. This proves writes persist within a test, indexes resolve, and validators accept the document.

No function handler is stubbed or bypassed. The harness is suitable for TDD in later tasks.

## Files

- `convex-test/setup.ts` (new, 28 lines)
- `convex-test/sanity.test.ts` (new, 19 lines)
- `vitest.config.ts` (modified — removed 3-line `alias` block)
- `convex-test/convex-shim.ts` (Task 1, now unused — left in place; safe to delete in a later cleanup)
