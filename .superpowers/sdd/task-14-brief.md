## Task 14: UI â€” settings, readiness, publish, templates library

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/readiness/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/publish/page.tsx`
- Create: `app/app/[orgSlug]/templates/page.tsx`

**Interfaces:**
- Consumes: `api.events.{get,update}`, `api.events.readiness`, `api.eventLifecycle.{publish,reopen,archive}`, `api.templates.{list,createFromEvent,remove}`.
- Produces: the four pages. The publish page shows the checklist, Publish/Reopen/Archive actions gated by event status, all reading `.data.code` on errors (VALIDATION_ERROR â†’ list the failing items).

- [ ] **Step 1: Settings page â€” `app/app/[orgSlug]/events/[eventSlug]/settings/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function EventSettingsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const update = useMutation(api.events.update);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [prevKey, setPrevKey] = useState<string | null>(null);

  if (ev !== undefined && ev !== null && prevKey !== ev._id) {
    setPrevKey(ev._id);
    setName(ev.name);
    setVenue(ev.venue ?? "");
  }

  if (ev === undefined) return <div>Loadingâ€¦</div>;
  if (ev === null) return <div>Event not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          disabled={ev.status !== "draft" || !name || name === ev.name}
          onClick={async () => {
            try {
              await update({ orgSlug, eventSlug, name, venue });
              toast.success("Saved.");
            } catch (err: unknown) {
              const data = (err as { data?: { code?: string; message?: string } })?.data;
              toast.error(data?.code === "CONFLICT" ? "Configuration is locked." : data?.message ?? "Could not save.");
            }
          }}
        >
          Save
        </Button>
      </div>
      <div className="flex gap-2">
        <Input value={venue} placeholder="Venue" onChange={(e) => setVenue(e.target.value)} />
      </div>
      <p className="text-sm text-muted-foreground">Slug: {ev.slug} - Status: {ev.status}</p>
    </div>
  );
}
```

- [ ] **Step 2: Readiness page â€” `app/app/[orgSlug]/events/[eventSlug]/readiness/page.tsx`**

```tsx
"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function ReadinessPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });

  return (
    <ul className="space-y-1 text-sm">
      {checks?.map((c) => (
        <li key={c.item} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
          {c.passed ? "PASS" : "FAIL"} - {c.item} ({c.detail})
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Publish page â€” `app/app/[orgSlug]/events/[eventSlug]/publish/page.tsx`**

```tsx
"use client";

import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PublishPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const checks = useQuery(api.events.readiness, { orgSlug, eventSlug });
  const publish = useMutation(api.eventLifecycle.publish);
  const reopen = useMutation(api.eventLifecycle.reopen);
  const archive = useMutation(api.eventLifecycle.archive);
  const failed = checks?.filter((c) => !c.passed) ?? [];

  const run = async (fn: () => Promise<void>, success: string) => {
    try {
      await fn();
      toast.success(success);
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      if (data?.code === "VALIDATION_ERROR") {
        toast.error("Not ready - fix the failing items first.");
      } else {
        toast.error(data?.message ?? "Action failed.");
      }
    }
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-1 text-sm">
        {checks?.map((c) => (
          <li key={c.item} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
            {c.passed ? "PASS" : "FAIL"} - {c.item} ({c.detail})
          </li>
        ))}
      </ul>
      {ev?.status === "draft" && (
        <Button disabled={failed.length > 0} onClick={() => run(() => publish({ orgSlug, eventSlug }), "Event published.")}>
          Publish event
        </Button>
      )}
      {ev?.status === "ready" && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => run(() => reopen({ orgSlug, eventSlug }), "Event reopened.")}>
            Reopen (delete score sheets)
          </Button>
          <Button variant="secondary" onClick={() => run(() => archive({ orgSlug, eventSlug }), "Event archived.")}>
            Archive
          </Button>
        </div>
      )}
      {ev?.status === "archived" && <p className="text-sm text-muted-foreground">This event is archived.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Templates library â€” `app/app/[orgSlug]/templates/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function TemplatesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const templates = useQuery(api.templates.list, { orgSlug });
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const createFromEvent = useMutation(api.templates.createFromEvent);
  const remove = useMutation(api.templates.remove);
  const [name, setName] = useState("");
  const [eventSlug, setEventSlug] = useState("");

  const drafts = events?.filter((e) => e.status === "draft") ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Templates</h1>
      <div className="flex flex-wrap gap-2">
        <Input className="w-48" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="rounded border px-2 py-1 text-sm" value={eventSlug} onChange={(e) => setEventSlug(e.target.value)}>
          <option value="">From draft eventâ€¦</option>
          {drafts.map((e) => <option key={e._id} value={e.slug}>{e.name}</option>)}
        </select>
        <Button
          disabled={!name || !eventSlug}
          onClick={async () => {
            try {
              await createFromEvent({ orgSlug, eventSlug, name });
              setName(""); setEventSlug("");
              toast.success("Template saved.");
            } catch (err: unknown) {
              toast.error((err as { data?: { message?: string } })?.data?.message ?? "Could not save template.");
            }
          }}
        >
          Save as template
        </Button>
      </div>
      <ul className="space-y-1 text-sm">
        {templates?.map((tpl) => (
          <li key={tpl._id} className="flex items-center justify-between border-b py-1">
            <span>
              {tpl.name} {tpl.isSystem ? <span className="text-muted-foreground">(system)</span> : null}
              <span className="text-muted-foreground"> - {tpl.description}</span>
            </span>
            {!tpl.isSystem && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try { await remove({ orgSlug, templateId: tpl._id }); }
                  catch (err: unknown) { toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed."); }
                }}
              >
                Delete
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add app
git commit -m "feat: settings, readiness, publish, templates UI"
```
Expected: all gates green (58 tests).

---

