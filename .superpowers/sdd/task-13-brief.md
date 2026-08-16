## Task 13: UI â€” config editors (rounds, categories, contestants, judges)

**Files:**
- Create: `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/categories/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/contestants/page.tsx`
- Create: `app/app/[orgSlug]/events/[eventSlug]/judges/page.tsx`

**Interfaces:**
- Consumes: `api.rounds.{list,add,remove}`, `api.criteria.{add,remove}`, `api.categories.{list,add,remove}`, `api.contestants.{list,add,remove}`, `api.judges.{listWithAssignments,add,remove,addAssignment,removeAssignment}`, `api.members.list` (Phase 1), `api.events.get` (for the locked state).
- Produces: the four editor pages. All edit actions render an error toast reading `.data.code` (CONFLICT â†’ "configuration is locked"; VALIDATION_ERROR â†’ the server message).

- [ ] **Step 1: Rounds + criteria editor â€” `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function RoundsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const rounds = useQuery(api.rounds.list, { orgSlug, eventSlug });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const addRound = useMutation(api.rounds.add);
  const removeRound = useMutation(api.rounds.remove);
  const addCriterion = useMutation(api.criteria.add);
  const removeCriterion = useMutation(api.criteria.remove);
  const [roundName, setRoundName] = useState("");
  const [form, setForm] = useState<Record<string, { name: string; weight: string; min: string; max: string }>>({});

  const locked = ev !== undefined && ev !== null && ev.status !== "draft";
  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "CONFLICT") toast.error("Configuration is locked.");
    else toast.error(data?.message ?? "Action failed.");
  };

  return (
    <div className="space-y-6">
      {!locked && (
        <div className="flex gap-2">
          <Input placeholder="New round name" value={roundName} onChange={(e) => setRoundName(e.target.value)} />
          <Button onClick={async () => { try { await addRound({ orgSlug, eventSlug, name: roundName }); setRoundName(""); } catch (e) { onError(e); } }}>
            Add round
          </Button>
        </div>
      )}
      {rounds?.map((r) => {
        const f = form[r._id] ?? { name: "", weight: "", min: "0", max: "100" };
        const sum = r.criteria.reduce((s, c) => s + c.weight, 0);
        return (
          <div key={r._id} className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">{r.name}</div>
              <div className="flex items-center gap-2 text-sm">
                <span className={sum === 100 ? "text-muted-foreground" : "text-destructive"}>weights: {sum}%</span>
                {!locked && (
                  <Button variant="ghost" size="sm" onClick={async () => { try { await removeRound({ orgSlug, eventSlug, roundId: r._id }); } catch (e) { onError(e); } }}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1">Criterion</th><th>Weight %</th><th>Range</th><th /></tr>
              </thead>
              <tbody>
                {r.criteria.map((c) => (
                  <tr key={c._id} className="border-t">
                    <td className="py-1">{c.name}</td>
                    <td>{c.weight}</td>
                    <td>{c.minScore} - {c.maxScore}</td>
                    <td className="text-right">
                      {!locked && (
                        <Button variant="ghost" size="sm" onClick={async () => { try { await removeCriterion({ orgSlug, eventSlug, criterionId: c._id }); } catch (e) { onError(e); } }}>
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!locked && (
              <div className="flex flex-wrap gap-2">
                <Input className="w-40" placeholder="Criterion" value={f.name} onChange={(e) => setForm({ ...form, [r._id]: { ...f, name: e.target.value } })} />
                <Input className="w-24" placeholder="Weight" value={f.weight} onChange={(e) => setForm({ ...form, [r._id]: { ...f, weight: e.target.value } })} />
                <Input className="w-20" placeholder="Min" value={f.min} onChange={(e) => setForm({ ...form, [r._id]: { ...f, min: e.target.value } })} />
                <Input className="w-20" placeholder="Max" value={f.max} onChange={(e) => setForm({ ...form, [r._id]: { ...f, max: e.target.value } })} />
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await addCriterion({
                        orgSlug, eventSlug, roundId: r._id, name: f.name,
                        weight: Number(f.weight), minScore: Number(f.min), maxScore: Number(f.max), decimalPrecision: 0,
                      });
                      setForm({ ...form, [r._id]: { ...f, name: "", weight: "" } });
                    } catch (e) { onError(e); }
                  }}
                >
                  Add criterion
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Categories page â€” `app/app/[orgSlug]/events/[eventSlug]/categories/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function CategoriesPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const cats = useQuery(api.categories.list, { orgSlug, eventSlug });
  const add = useMutation(api.categories.add);
  const remove = useMutation(api.categories.remove);
  const [name, setName] = useState("");

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "CONFLICT") toast.error(data.message ?? "Conflict.");
    else toast.error(data?.message ?? "Action failed.");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={async () => { try { await add({ orgSlug, eventSlug, name }); setName(""); } catch (e) { onError(e); } }}>
          Add
        </Button>
      </div>
      <ul className="space-y-1 text-sm">
        {cats?.map((c) => (
          <li key={c._id} className="flex items-center justify-between border-b py-1">
            <span>{c.name}</span>
            <Button variant="ghost" size="sm" onClick={async () => { try { await remove({ orgSlug, eventSlug, categoryId: c._id }); } catch (e) { onError(e); } }}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Contestants page â€” `app/app/[orgSlug]/events/[eventSlug]/contestants/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ContestantsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const list = useQuery(api.contestants.list, { orgSlug, eventSlug });
  const cats = useQuery(api.categories.list, { orgSlug, eventSlug });
  const add = useMutation(api.contestants.add);
  const remove = useMutation(api.contestants.remove);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "LIMIT_EXCEEDED") toast.error("Contestant limit reached - upgrade your plan.");
    else if (data?.code === "CONFLICT") toast.error(data.message ?? "Conflict.");
    else toast.error(data?.message ?? "Action failed.");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input className="w-24" placeholder="No." value={number} onChange={(e) => setNumber(e.target.value)} />
        <Input placeholder="Contestant name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          onClick={async () => {
            try {
              await add({ orgSlug, eventSlug, name, number: Number(number) });
              setName(""); setNumber("");
            } catch (e) { onError(e); }
          }}
        >
          Add
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">No.</th><th>Name</th><th>Category</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {list?.map((c) => (
            <tr key={c._id} className="border-t">
              <td className="py-1">{c.number}</td>
              <td>{c.name}</td>
              <td>{cats?.find((x) => x._id === c.categoryId)?.name ?? "-"}</td>
              <td>{c.status}</td>
              <td className="text-right">
                <Button variant="ghost" size="sm" onClick={async () => { try { await remove({ orgSlug, eventSlug, contestantId: c._id }); } catch (e) { onError(e); } }}>
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Judges page â€” `app/app/[orgSlug]/events/[eventSlug]/judges/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function JudgesPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const judges = useQuery(api.judges.listWithAssignments, { orgSlug, eventSlug });
  const members = useQuery(api.members.list, { orgSlug });
  const rounds = useQuery(api.rounds.list, { orgSlug, eventSlug });
  const add = useMutation(api.judges.add);
  const removeJudge = useMutation(api.judges.remove);
  const addAssignment = useMutation(api.judges.addAssignment);
  const [picked, setPicked] = useState("");
  const [roundPick, setRoundPick] = useState("");

  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "LIMIT_EXCEEDED") toast.error("Judge limit reached - upgrade your plan.");
    else toast.error(data?.message ?? "Action failed.");
  };

  const judgeUserIds = new Set(judges?.map((j) => j.userId));
  const candidates = members?.filter((m) => m.status === "active" && !judgeUserIds.has(m.userId)) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select className="rounded border px-2 py-1 text-sm" value={picked} onChange={(e) => setPicked(e.target.value)}>
          <option value="">Select memberâ€¦</option>
          {candidates.map((m) => <option key={m.userId} value={m.userId}>{m.name} ({m.email})</option>)}
        </select>
        <Button disabled={!picked} onClick={async () => { try { await add({ orgSlug, eventSlug, userId: picked as never }); setPicked(""); } catch (e) { onError(e); } }}>
          Add judge
        </Button>
      </div>
      {judges?.map((j) => (
        <div key={j._id} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{j.user.name}</div>
              <div className="text-sm text-muted-foreground">{j.user.email}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={async () => { try { await removeJudge({ orgSlug, eventSlug, judgeId: j._id }); } catch (e) { onError(e); } }}>
              Remove
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Assignments:</span>
            {j.assignments.map((a) => (
              <span key={a._id} className="rounded bg-accent px-2 py-0.5">
                {a.roundId ? rounds?.find((r) => r._id === a.roundId)?.name ?? "round" : "all rounds"}
              </span>
            ))}
            <select className="rounded border px-2 py-0.5" value={roundPick} onChange={(e) => setRoundPick(e.target.value)}>
              <option value="">All rounds</option>
              {rounds?.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await addAssignment({ orgSlug, eventSlug, judgeId: j._id, roundId: roundPick ? (roundPick as never) : undefined });
                } catch (e) { onError(e); }
              }}
            >
              Assign
            </Button>
          </div>
        </div>
      ))}
      {candidates.length === 0 && judges !== undefined && judges.length > 0 && (
        <p className="text-sm text-muted-foreground">All active members are already judges. Invite more via Members.</p>
      )}
    </div>
  );
}
```
(The `as never` casts bridge the HTML-select string to Convex `Id` types at the boundary â€” replace with the `Id<"userProfiles">`-typed state if typecheck complains, but do not use `any`.)

- [ ] **Step 5: Verify + commit**

```powershell
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue; npm run typecheck
npm run lint
npm run build
npm test
git add app
git commit -m "feat: config editor UI - rounds, categories, contestants, judges"
```
Expected: all gates green (58 tests).

---

