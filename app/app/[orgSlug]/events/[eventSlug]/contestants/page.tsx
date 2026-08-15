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
