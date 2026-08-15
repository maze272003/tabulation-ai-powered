## Task 12: UI — events list, new event, event shell, overview

**Files:**
- Create: `app/app/[orgSlug]/events/page.tsx`
- Create: `app/app/[orgSlug]/events/new/page.tsx`
- Create: `components/EventShell.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/layout.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/overview/page.tsx`
- Modify: `app/app/[orgSlug]/layout.tsx` (add "Events" + "Templates" nav links)

**Interfaces:**
- Consumes: `api.events.{listByOrg,create,get,createFromTemplate}`, `api.templates.list` (Task 11).
- Produces: the event list page, template-picking creation page, the event shell (sub-nav + locked banner), overview page. All pages follow Phase 1 conventions: `useQuery`/`useMutation`, `use(params)` for Next 16 async params, error UX reads `.data.code` with Sonner toasts, Base UI shadcn primitives (`render={<Link/>}` instead of `asChild`).

- [ ] **Step 1: Events list page — `app/app/[orgSlug]/events/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function EventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const create = useMutation(api.events.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Button onClick={() => router.push(`/app/${orgSlug}/events/new`)}>New event</Button>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Quick create (blank event)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          variant="outline"
          disabled={creating || !name}
          onClick={async () => {
            setCreating(true);
            try {
              const slug = await create({ orgSlug, name });
              router.push(`/app/${orgSlug}/events/${slug}/overview`);
            } catch (err: unknown) {
              const code = (err as { data?: { code?: string } })?.data?.code;
              if (code === "LIMIT_EXCEEDED") toast.error("Event limit reached - upgrade your plan.");
              else if (code === "CONFLICT") toast.error("An event with that slug already exists.");
              else toast.error("Could not create event.");
              setCreating(false);
            }
          }}
        >
          Create
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {events?.map((ev) => (
          <Link key={ev._id} href={`/app/${orgSlug}/events/${ev.slug}/overview`} className="block">
            <div className="rounded-lg border p-4 hover:bg-accent">
              <div className="font-medium">{ev.name}</div>
              <div className="text-sm text-muted-foreground">{ev.slug} - {ev.status}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: New event page — `app/app/[orgSlug]/events/new/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function NewEventPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const templates = useQuery(api.templates.list, { orgSlug });
  const createBlank = useMutation(api.events.create);
  const createFromTemplate = useMutation(api.events.createFromTemplate);
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      const slug = await fn();
      router.push(`/app/${orgSlug}/events/${slug}/overview`);
    } catch (err: unknown) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "LIMIT_EXCEEDED") toast.error("Event limit reached - upgrade your plan.");
      else if (code === "CONFLICT") toast.error("An event with that slug already exists.");
      else toast.error("Could not create event.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New event</h1>
      <div className="flex gap-2">
        <Input placeholder="Event name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          disabled={busy || !name}
          onClick={() => handle(() => createBlank({ orgSlug, name }))}
        >
          Create blank
        </Button>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Start from a template</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {templates?.filter((tpl) => tpl.isSystem).map((tpl) => (
            <button
              key={tpl._id}
              disabled={busy || !name}
              className="rounded-lg border p-4 text-left hover:bg-accent disabled:opacity-50"
              onClick={() => handle(() => createFromTemplate({ orgSlug, name, templateId: tpl._id }))}
            >
              <div className="font-medium">{tpl.name}</div>
              <div className="text-sm text-muted-foreground">{tpl.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Event shell — `components/EventShell.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";

export function EventShell({
  orgSlug,
  eventSlug,
  children,
}: {
  orgSlug: string;
  eventSlug: string;
  children: React.ReactNode;
}) {
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  if (ev === undefined) return <div className="p-8">Loading…</div>;
  if (ev === null) return notFound();

  const base = `/app/${orgSlug}/events/${eventSlug}`;
  const nav = [
    ["Overview", `${base}/overview`],
    ["Rounds", `${base}/rounds`],
    ["Categories", `${base}/categories`],
    ["Contestants", `${base}/contestants`],
    ["Judges", `${base}/judges`],
    ["Readiness", `${base}/readiness`],
    ["Settings", `${base}/settings`],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{ev.name}</h1>
        <Badge variant={ev.status === "draft" ? "outline" : "secondary"}>{ev.status}</Badge>
        {ev.status !== "draft" && (
          <Link href={`${base}/publish`} className="text-sm text-muted-foreground underline">
            Locked - manage
          </Link>
        )}
      </div>
      {ev.status === "draft" && (
        <div className="rounded border border-dashed p-2 text-sm text-muted-foreground">
          Draft - configuration is editable. <Link href={`${base}/publish`} className="underline">Publish when ready.</Link>
        </div>
      )}
      <nav className="flex flex-wrap gap-1 text-sm">
        {nav.map(([label, href]) => (
          <Link key={href} href={href} className="rounded px-2 py-1 hover:bg-accent">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Event layout/redirect/overview**

`app/app/[orgSlug]/events/[eventSlug]/layout.tsx`:
```tsx
"use client";

import { use } from "react";
import { EventShell } from "@/components/EventShell";

export default function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  return <EventShell orgSlug={orgSlug} eventSlug={eventSlug}>{children}</EventShell>;
}
```

`app/app/[orgSlug]/events/[eventSlug]/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default async function EventRoot({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  redirect(`/app/${orgSlug}/events/${eventSlug}/overview`);
}
```

`app/app/[orgSlug]/events/[eventSlug]/overview/page.tsx`:
```tsx
"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function OverviewPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });
  const router = useRouter();
  const failed = checks?.filter((c) => !c.passed).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Readiness</div>
          <div className="text-2xl">{failed === 0 ? "Ready" : `${failed} issue(s)`}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Visibility</div>
          <div className="text-2xl capitalize">{checks === undefined ? "…" : "See settings"}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Next step</div>
          <Button className="mt-1" variant={failed === 0 ? "default" : "outline"} onClick={() => router.push(`/app/${orgSlug}/events/${eventSlug}/publish`)}>
            {failed === 0 ? "Publish" : "Review readiness"}
          </Button>
        </div>
      </div>
      <ul className="space-y-1 text-sm">
        {checks?.map((c) => (
          <li key={c.item} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
            {c.passed ? "PASS" : "FAIL"} - {c.item} ({c.detail})
          </li>
        ))}
      </ul>
    </div>
  );
}
```
(Remove the unused `toast` import if lint flags it.)

- [ ] **Step 5: Add nav links in `app/app/[orgSlug]/layout.tsx`** — inside the existing `<nav>`, after the Billing link:
```tsx
          <Link href={`/app/${orgSlug}/events`} className="block rounded px-2 py-1 hover:bg-accent">Events</Link>
          <Link href={`/app/${orgSlug}/templates`} className="block rounded px-2 py-1 hover:bg-accent">Templates</Link>
```

- [ ] **Step 6: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add app components/EventShell.tsx
git commit -m "feat: events list, creation, event shell, overview UI"
```
Expected: typecheck/lint/build/test all green (58 tests).

---

