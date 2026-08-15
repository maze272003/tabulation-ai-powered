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
          <option value="">From draft event…</option>
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
