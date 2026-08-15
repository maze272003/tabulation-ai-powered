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
        {templates === undefined ? (
          <p className="text-sm text-muted-foreground">Loading templates…</p>
        ) : templates.filter((tpl) => tpl.isSystem).length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates available.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {templates.filter((tpl) => tpl.isSystem).map((tpl) => (
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
        )}
      </div>
    </div>
  );
}
