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
