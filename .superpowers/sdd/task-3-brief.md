## Task 3: Client auth wiring & profile provisioning

**Files:**
- Create: `lib/auth-client.ts`
- Create: `lib/auth-server.ts`
- Modify: `components/ConvexClientProvider.tsx` (replace contents)
- Modify: `app/layout.tsx`
- Create: `app/api/auth/[...all]/route.ts`
- Create: `components/Authenticated.tsx`
- Create: `convex/auth.ts`
- Modify: `convex/schema.ts` (add `userProfiles` table only — full schema lands in Task 4)

**Interfaces:**
- Produces: `api.auth.ensureUserProfile`, `api.auth.getCurrentUser`, a working Google sign-in → profile flow.

- [ ] **Step 1: Create the auth client**

Create `lib/auth-client.ts`:
```ts
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [convexClient()],
});

export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 2: Create the SSR helpers**

Create `lib/auth-server.ts`:
```ts
import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
```

- [ ] **Step 3: Replace the Convex client provider**

Replace `components/ConvexClientProvider.tsx` with:
```tsx
"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { authClient } from "@/lib/auth-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: React.ReactNode;
  initialToken?: string | null;
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  );
}
```

- [ ] **Step 4: Update the root layout**

Replace `app/layout.tsx` body contents to fetch and pass the token:
```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { getToken } from "@/lib/auth-server";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tabulation",
  description: "Competition management and tabulation platform",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const token = await getToken();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ConvexClientProvider initialToken={token}>
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Mount the auth route handler**

Create `app/api/auth/[...all]/route.ts`:
```ts
import { handler } from "@/lib/auth-server";

export const { GET, POST } = handler;
```

- [ ] **Step 6: Add a minimal `userProfiles` table to the schema**

Replace `convex/schema.ts` contents with (full schema arrives in Task 4; this unblocks `ensureUserProfile`):
```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userProfiles: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    image: v.string(),
    platformRole: v.union(v.null(), v.literal("platform_owner")),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("suspended")),
    lastLoginAt: v.number(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),
});
```

- [ ] **Step 7: Create `convex/auth.ts`**

Create `convex/auth.ts`:
```ts
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    return profile;
  },
});

export const ensureUserProfile = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"userProfiles">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
    }
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: identity.name ?? existing.name,
        email: identity.email ?? existing.email,
        image: identity.pictureUrl ?? existing.image,
        lastLoginAt: Date.now(),
      });
      return existing._id;
    }
    const id = await ctx.db.insert("userProfiles", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "",
      email: identity.email ?? "",
      image: identity.pictureUrl ?? "",
      platformRole: null,
      status: "active",
      lastLoginAt: Date.now(),
    });
    return id;
  },
});
```

Add the missing import at the top of `convex/auth.ts` (the `mutation` import was omitted above):
```ts
import { mutation } from "./_generated/server";
```
(Final imports block for `convex/auth.ts`):
```ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
```
(`paginationOptsValidator` is not needed here — remove that import if you copied it.)

- [ ] **Step 8: Create the `Authenticated` gate**

Create `components/Authenticated.tsx`:
```tsx
"use client";

import { useSession } from "@/lib/auth-client";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect } from "react";

export function Authenticated({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const ensureProfile = useMutation(api.auth.ensureUserProfile);

  useEffect(() => {
    if (session) {
      void ensureProfile({});
    }
  }, [session, ensureProfile]);

  if (isPending) return null;
  if (!session) return null;
  return <>{children}</>;
}
```

- [ ] **Step 9: Verify typecheck**

Run:
```powershell
npm run typecheck
```
Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add lib components/convexClientProvider.tsx app/layout.tsx app/api/auth convex/auth.ts convex/schema.ts
git commit -m "feat: wire Better-Auth client + profile provisioning"
```

---

