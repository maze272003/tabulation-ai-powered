# Task 15 Report — Demo cleanup & middleware

**Branch:** `phase1-foundation`
**Commit:** `9da21e7 feat: add route-protecting middleware`

## Status

**DONE_WITH_CONCERNS** — All deliverables met; one forward-looking concern (Next 16 deprecation of the `middleware.ts` filename, see below). typecheck/lint/build all PASS.

## Summary line

typecheck PASS; lint PASS; build PASS; middleware gates `/app`, `/platform`, `/invite`.

## Demo cleanup — already done (confirmed)

The brief's Steps 1 and 3 were already completed during Task 3's review fix. Confirmed:

| File / dir | Status |
| --- | --- |
| `convex/myFunctions.ts` | Not present (already deleted earlier in Phase 1) |
| `app/server/` | Directory does not exist (already deleted) |
| `app/page.tsx` | Already the minimal placeholder (`Tabulation` heading + Sign-in link). Left untouched. |

No re-deletion performed. The only NEW deliverable was `middleware.ts`.

## The middleware deliverable

Created `middleware.ts` at the repo root.

### `getToken` investigation — brief's signature was wrong

The brief's `getToken({ request: req })` does **not** match the installed types. The actual signature of `getToken` exported from `lib/auth-server.ts` (which wraps `convexBetterAuthNextJs(...)`) is:

```ts
getToken: () => Promise<string | undefined>
```

Source of truth: `node_modules/@convex-dev/better-auth/dist/nextjs/index.d.ts:10`. The implementation (`node_modules/@convex-dev/better-auth/src/nextjs/index.ts:97–106`) shows it internally does:

```ts
const headers = await (await import("next/headers.js")).headers();
```

`next/headers` is **only available in Server Components and Route Handlers**, not in `middleware`. The brief's fallback suggestion (`cookies()` from `next/headers`) has the same problem. So neither form of the wrapped `getToken` can be used inside middleware.

### Pattern used — direct session-cookie check

Instead of `getToken`, the middleware reads the Better-Auth session cookie directly from `req.cookies` (available on `NextRequest` in all runtimes):

```ts
const SESSION_COOKIE_DOT  = "better-auth.session_token";
const SESSION_COOKIE_DASH = "better-auth-session_token";
```

Cookie name evidence: `node_modules/better-auth/dist/cookies/index.mjs:47` constructs the session cookie from prefix `"better-auth"` + name `"session_token"`; line 217 reads both `better-auth.session_token` (preferred) and `better-auth-session_token` (fallback for environments that reject `.` in cookie names). The project's `convex/betterAuth/auth.ts` does not override `cookiePrefix` or `cookieName`, so the defaults apply. `cookieCache` is also not enabled, so `better-auth.session_data` is not set and is not checked.

**Why this is correct:** the middleware's role is only to gate the route. Token **validation** (signature check, expiry, org membership, permissions) happens server-side inside Convex via the `require*` helpers; the middleware just needs to know "is there a session credential present?" — exactly what presence-of-cookie tells us. This matches the standard Next.js + Better-Auth pattern (and the same approach next-auth's `withAuth` takes under the hood). A bad/expired cookie simply passes the gate and the downstream Convex `requireIdentity` call rejects the request.

### File contents

```ts
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = [/^\/app(\/|$)/, /^\/platform(\/|$)/, /^\/invite\//];

const SESSION_COOKIE_DOT = "better-auth.session_token";
const SESSION_COOKIE_DASH = "better-auth-session_token";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((re) => re.test(pathname))) return NextResponse.next();

  const hasSession =
    Boolean(req.cookies.get(SESSION_COOKIE_DOT)?.value) ||
    Boolean(req.cookies.get(SESSION_COOKIE_DASH)?.value);
  if (hasSession) return NextResponse.next();

  const signIn = new URL("/sign-in", req.url);
  signIn.searchParams.set("next", pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*", "/invite/:path*"],
};
```

## Verification

| Check | Command | Result |
| --- | --- | --- |
| typecheck | `npm run typecheck` (after deleting `tsconfig.tsbuildinfo`) | exit 0 — PASS |
| lint | `npm run lint` | exit 0 — PASS (0 errors; 8 pre-existing warnings, none in `middleware.ts`) |
| build | `npm run build` | exit 0 — PASS. Middleware compiled and detected by Next ("ƒ Proxy (Middleware)" in route report). |

## Self-review

- [x] Gates the three path patterns: regex matches `/app`, `/app/...`, `/platform`, `/platform/...`, `/invite/...` (the `/app` and `/platform` regexes use `(\/|$)` so they match the bare segment without also matching `/apples`).
- [x] `config.matcher` aligns with the regexes (`/app/:path*`, `/platform/:path*`, `/invite/:path*`).
- [x] Preserves the `next` redirect param: `signIn.searchParams.set("next", pathname)` keeps the original path (with any query string already merged into the new URL via `new URL("/sign-in", req.url)`).
- [x] Compiles under Next 16 — confirmed by build.
- [x] Edge-runtime compatible: uses only `NextRequest` / `NextResponse` / `req.cookies`, no `next/headers`, no Node-only APIs.

## Concerns

1. **Next 16 deprecates the `middleware` filename.** During `next build`, Next 16.3.0 prints:

   > ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
   > To migrate automatically, run: `npx @next/codemod@canary middleware-to-proxy .`

   The build still succeeds and the middleware runs — this is a soft deprecation. The brief explicitly asked for `middleware.ts`, so I followed it. Recommend renaming to `proxy.ts` (and exporting `proxy`/`config`) in a future task before Next 17 hard-deprecates it.

2. **`/sign-in` route does not exist yet.** No `app/sign-in/page.tsx` is present (it's Task 16's deliverable). Until Task 16 lands, an unauthenticated hit on `/app/*` will redirect to `/sign-in?next=...` which will 404. This is expected sequencing — not a defect.

3. **Cookie presence ≠ valid session.** Intentional. The middleware is a UX gate, not a security boundary; everything security-critical is enforced inside Convex `require*` helpers. A tampered or expired cookie will pass the middleware and be rejected by Convex, after which the client should clear its session and redirect to `/sign-in` (Task 16's responsibility).

## Fix

**Critical review finding (post-merge):** the manual cookie-name check (`better-auth.session_token` / `better-auth-session_token`) missed Better-Auth's `__Secure-` cookie prefix. On HTTPS deploys, Better-Auth auto-enables `useSecureCookies` (see `node_modules/better-auth/dist/cookies/index.mjs`, `secureCookiePrefix` derived from `baseURL` protocol / `isProduction`), renaming the session cookie to `__Secure-better-auth.session_token`. Result: `hasSession` was always false in production → every `/app/*` request redirected to `/sign-in`. Fail-closed (secure) but unusable.

### Resolution

Replaced the manual `req.cookies.get(...)` pair with Better-Auth's official edge-safe helper `getSessionCookie` from `better-auth/cookies`:

```ts
import { getSessionCookie } from "better-auth/cookies";
// ...
if (getSessionCookie(req)) return NextResponse.next();
```

### `getSessionCookie` verification

Source of truth — `node_modules/better-auth/dist/cookies/index.d.mts:98`:

```ts
declare const getSessionCookie: (
  request: Request | Headers,
  config?: { cookiePrefix?: string; cookieName?: string; path?: string }
) => string | null;
```

Implementation — `node_modules/better-auth/dist/cookies/index.mjs`:

```js
const cookies = (request instanceof Headers || !("headers" in request) ? request : request.headers).get("cookie");
// ...
const getCookie = (name) => parsedCookie.get(`__Secure-${name}`) ?? parsedCookie.get(name);
const sessionToken = getCookie(`${cookiePrefix}.${cookieName}`) || getCookie(`${cookiePrefix}-${cookieName}`);
```

Confirms all four findings requirements:
1. **Accepts `NextRequest`** — `NextRequest extends Request`; the helper reads `request.headers.get("cookie")` so any `Request`-shaped object works.
2. **Handles `__Secure-` prefix** — tries `__Secure-<name>` first, falls back to `<name>`. Correct across dev (http, no prefix) and prod (https, `__Secure-`).
3. **Handles dot vs dash** — checks both `better-auth.session_token` and `better-auth-session_token`.
4. **Edge-safe** — pure header parse, no Node-only imports. Confirmed by build (middleware compiled for the Edge runtime).

### What did NOT change

- `PROTECTED` regexes — identical (`/app`, `/platform`, `/invite`).
- `config.matcher` — identical.
- Redirect behavior — still `NextResponse.redirect(signIn)` with `signIn.searchParams.set("next", pathname)`.
- Fail-closed posture — a missing/empty cookie still redirects to `/sign-in`; downstream Convex `require*` helpers still enforce actual session validity (cookie presence ≠ valid session, by design).

### Verification

| Check | Command | Result |
| --- | --- | --- |
| `tsconfig.tsbuildinfo` cleared | `Remove-Item tsconfig.tsbuildinfo -Force` | done before typecheck |
| typecheck | `npm run typecheck` | exit 0 — PASS |
| lint | `npm run lint` | exit 0 — PASS (0 errors; same 8 pre-existing warnings, none in `middleware.ts`) |
| build | `npm run build` | exit 0 — PASS. `✓ Compiled successfully`; route report shows `ƒ Proxy (Middleware)`. |
| export sanity | grep'd `node_modules/better-auth/dist/cookies/index.mjs` | `export { ..., getSessionCookie, ... }` confirmed at `better-auth/cookies`. |

### Commit

```
be6943a fix: use getSessionCookie for __Secure-prefixed production cookies
```

`1 file changed, 2 insertions(+), 7 deletions(-)` — only `middleware.ts`. No other files touched.
