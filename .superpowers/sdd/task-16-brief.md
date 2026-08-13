## Task 16: App routes & pages

**Files:**
- Create: `app/sign-in/page.tsx`
- Create: `app/app/page.tsx` (org picker)
- Create: `app/app/[orgSlug]/layout.tsx`, `page.tsx`, `overview/page.tsx`, `members/page.tsx`, `settings/page.tsx`, `billing/page.tsx`
- Create: `app/invite/[token]/page.tsx`
- Create: `app/platform/page.tsx`
- Create: `components/OrgSwitcher.tsx`, `components/UserMenu.tsx`

**Interfaces:**
- Produces: the full Standard-scope UI shell.

- [ ] **Step 1: Sign-in page**

Create `app/sign-in/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";
  const [pending, setPending] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Sign in to Tabulation</h1>
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await signIn.social({ provider: "google", callbackURL: next });
        }}
      >
        Continue with Google
      </Button>
    </main>
  );
}
```

- [ ] **Step 2: Org picker**

Create `app/app/page.tsx`:
```tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AppHome() {
  const mine = useQuery(api.organizations.listMine, {});
  const create = useMutation(api.organizations.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Your organizations</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {mine?.map((m) => (
          <Link key={m.membership._id} href={`/app/${m.org?.slug}`} className="block">
            <Card className="p-4 hover:bg-accent">
              <div className="font-medium">{m.org?.name}</div>
              <div className="text-sm text-muted-foreground">{m.role?.name}</div>
            </Card>
          </Link>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="rounded border px-3 py-2"
          placeholder="New organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={creating || !name}
          onClick={async () => {
            setCreating(true);
            try {
              const slug = await create({ name });
              router.push(`/app/${slug}`);
            } finally {
              setCreating(false);
            }
          }}
        >
          Create
        </Button>
      </div>
    </main>
  );
}
```

> Note: `Card` is included in the shadcn add list in Task 14, so it is already available.

- [ ] **Step 3: Org shell layout**

Create `app/app/[orgSlug]/layout.tsx`:
```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { notFound } from "next/navigation";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { UserMenu } from "@/components/UserMenu";
import Link from "next/link";
import { use } from "react";

export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { orgSlug });
  if (org === undefined) return <div className="p-8">Loading…</div>;
  if (org === null) return notFound();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 border-r p-4 space-y-4">
        <OrgSwitcher currentSlug={orgSlug} />
        <nav className="space-y-1 text-sm">
          <Link href={`/app/${orgSlug}/overview`} className="block rounded px-2 py-1 hover:bg-accent">Overview</Link>
          <Link href={`/app/${orgSlug}/members`} className="block rounded px-2 py-1 hover:bg-accent">Members</Link>
          <Link href={`/app/${orgSlug}/settings`} className="block rounded px-2 py-1 hover:bg-accent">Settings</Link>
          <Link href={`/app/${orgSlug}/billing`} className="block rounded px-2 py-1 hover:bg-accent">Billing</Link>
        </nav>
        <div className="pt-4 border-t"><UserMenu /></div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

Create `app/app/[orgSlug]/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default async function OrgRoot({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/app/${orgSlug}/overview`);
}
```

- [ ] **Step 4: Org switcher & user menu components**

Create `components/OrgSwitcher.tsx`:
```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export function OrgSwitcher({ currentSlug }: { currentSlug: string }) {
  const mine = useQuery(api.organizations.listMine, {});
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase text-muted-foreground">Organization</div>
      {mine?.map((m) => (
        <Link
          key={m.membership._id}
          href={`/app/${m.org?.slug}`}
          className={`block rounded px-2 py-1 text-sm ${m.org?.slug === currentSlug ? "bg-accent font-medium" : "hover:bg-accent"}`}
        >
          {m.org?.name}
        </Link>
      ))}
    </div>
  );
}
```

Create `components/UserMenu.tsx`:
```tsx
"use client";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await signOut();
        router.push("/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}
```

- [ ] **Step 5: Overview, Members, Settings, Billing, Invite, Platform pages**

Create `app/app/[orgSlug]/overview/page.tsx`:
```tsx
"use client";

import { use } from "react";
import { Card } from "@/components/ui/card";

export default function OverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-sm text-muted-foreground">Events</div><div className="text-2xl">0</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">Members</div><div className="text-2xl">—</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">Plan</div><div className="text-2xl">Free</div></Card>
      </div>
      <p className="text-sm text-muted-foreground">Welcome to {orgSlug}. Competition features arrive in Phase 2.</p>
    </div>
  );
}
```

Create `app/app/[orgSlug]/members/page.tsx`:
```tsx
"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const members = useQuery(api.members.list, { orgSlug });
  const roles = useQuery(api.roles.list, {});
  const invite = useMutation(api.invitations.create);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Viewer");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Members</h1>
      <div className="flex gap-2">
        <Input placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {roles?.map((r) => <SelectItem key={r._id} value={r.name}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={async () => { await invite({ orgSlug, email, roleName: role }); setEmail(""); }}>Invite</Button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th></tr>
        </thead>
        <tbody>
          {members?.map((m) => (
            <tr key={m.membershipId} className="border-t">
              <td className="py-2">{m.name}</td>
              <td>{m.email}</td>
              <td>{m.roleName}</td>
              <td>{m.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Create `app/app/[orgSlug]/settings/page.tsx`:
```tsx
"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { orgSlug });
  const update = useMutation(api.organizations.update);
  const [name, setName] = useState(org?.name ?? "");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={async () => { await update({ orgSlug, name }); }}>Save</Button>
      </div>
      <p className="text-sm text-muted-foreground">Slug: {org?.slug}</p>
    </div>
  );
}
```

Create `app/app/[orgSlug]/billing/page.tsx`:
```tsx
"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";

export default function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const data = useQuery(api.subscriptions.getForOrg, { orgSlug });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <Card className="p-4 space-y-2">
        <div className="text-sm text-muted-foreground">Current plan</div>
        <div className="text-2xl">{data?.plan.name ?? "—"}</div>
        <div className="text-xs text-muted-foreground">Status: {data?.subscription.status}</div>
      </Card>
      <p className="text-sm text-muted-foreground">Stripe integration and plan changes arrive in Phase 6.</p>
    </div>
  );
}
```

Create `app/invite/[token]/page.tsx`:
```tsx
"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const inv = useQuery(api.invitations.getByToken, { token });
  const accept = useMutation(api.invitations.accept);
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (inv === undefined) return <div className="p-8">Loading…</div>;
  if (inv === null) return <div className="p-8">Invitation not found or already used.</div>;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Join {inv.orgName}</h1>
      <p className="text-muted-foreground">You have been invited as {inv.roleName}.</p>
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await accept({ token });
            router.push("/app");
          } catch {
            setPending(false);
          }
        }}
      >
        Accept invitation
      </Button>
    </main>
  );
}
```

Create `app/platform/page.tsx`:
```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function PlatformPage() {
  const orgs = useQuery(api.platform.listAllOrgs, {});
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Platform administration</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground"><tr><th className="py-2">Name</th><th>Slug</th><th>Status</th></tr></thead>
        <tbody>
          {orgs?.map((o) => (
            <tr key={o._id} className="border-t"><td className="py-2">{o.name}</td><td>{o.slug}</td><td>{o.status}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 6: Verify typecheck, lint, build**

Run:
```powershell
npm run typecheck; if ($?) { npm run lint }; if ($?) { npm run build }
```
Expected: all PASS. If `next build` reports errors hidden by `ignoreBuildErrors`, address them now.

- [ ] **Step 7: Commit**

```powershell
git add app components/OrgSwitcher.tsx components/UserMenu.tsx
git commit -m "feat: Phase-1 app shell, members, settings, billing, invite, platform pages"
```

---

