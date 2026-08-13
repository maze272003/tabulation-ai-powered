## Task 15: Demo cleanup & middleware

**Files:**
- Delete: `convex/myFunctions.ts`
- Delete: `app/server/` directory
- Replace: `app/page.tsx` (landing — real content in Task 16)
- Create: `middleware.ts`

- [ ] **Step 1: Delete demo backend**

```powershell
git rm convex/myFunctions.ts
git rm -r app/server
```

- [ ] **Step 2: Create `middleware.ts`**

Create `middleware.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "@/lib/auth-server";

const PROTECTED = [/^\/app(\/|$)/, /^\/platform(\/|$)/, /^\/invite\//];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((re) => re.test(pathname))) return NextResponse.next();
  const token = await getToken({ request: req });
  if (token) return NextResponse.next();
  const signIn = new URL("/sign-in", req.url);
  signIn.searchParams.set("next", pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*", "/invite/:path*"],
};
```

> Note: `getToken` may need to accept a `request` argument in your version of `@convex-dev/better-auth`. If typecheck fails, check the installed types — the Next.js helper signature may be `getToken()` reading cookies from `next/headers`. In that case, switch to:
> ```ts
> import { cookies } from "next/headers";
> const token = await getToken();
> ```
> and accept that middleware runs in the Node runtime. Verify against the installed package types.

- [ ] **Step 3: Replace landing page with a minimal placeholder**

Replace `app/page.tsx`:
```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold">Tabulation</h1>
      <p className="text-muted-foreground">Competition management and tabulation platform.</p>
      <Button asChild>
        <Link href="/sign-in">Sign in</Link>
      </Button>
    </main>
  );
}
```

- [ ] **Step 4: Verify**

Run `npm run typecheck`. Expected: PASS (the demo `numbers` table was already removed from the schema in Task 4).

- [ ] **Step 5: Commit**

```powershell
git add middleware.ts app/page.tsx
git commit -m "refactor: remove demo code, add route-protecting middleware"
```

---

