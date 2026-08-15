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
