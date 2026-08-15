"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
  const [picked, setPicked] = useState<Id<"userProfiles"> | "">("");
  const [roundPick, setRoundPick] = useState<Id<"rounds"> | "">("");

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
        <select className="rounded border px-2 py-1 text-sm" value={picked} onChange={(e) => setPicked(e.target.value as Id<"userProfiles"> | "")}>
          <option value="">Select member…</option>
          {candidates.map((m) => <option key={m.userId} value={m.userId}>{m.name} ({m.email})</option>)}
        </select>
        <Button disabled={!picked} onClick={async () => { if (picked === "") return; try { await add({ orgSlug, eventSlug, userId: picked }); setPicked(""); } catch (e) { onError(e); } }}>
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
            <select className="rounded border px-2 py-0.5" value={roundPick} onChange={(e) => setRoundPick(e.target.value as Id<"rounds"> | "")}>
              <option value="">All rounds</option>
              {rounds?.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await addAssignment({ orgSlug, eventSlug, judgeId: j._id, roundId: roundPick === "" ? undefined : roundPick });
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
