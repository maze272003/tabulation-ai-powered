"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/PageHeader";
import { AiEventWizardCard } from "@/components/tabulation/AiEventWizardCard";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

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
      if (code === "LIMIT_EXCEEDED") toast.error("Event limit reached — upgrade your plan.");
      else if (code === "CONFLICT") toast.error("An event with that slug already exists.");
      else toast.error("Could not create event.");
      setBusy(false);
    }
  };

  const systemTemplates = templates?.filter((tpl) => tpl.isSystem) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sparkles}
        title="New event"
        description="Name your event, then start from a blank setup or a proven template."
      />

      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
          <CardDescription>The event name is shown to judges and staff.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              handle(() => createBlank({ orgSlug, name }));
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="event-name" className="sr-only">
                Event name
              </Label>
              <Input
                id="event-name"
                placeholder="e.g. 2026 Regional Finals"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </div>
            <Button type="submit" disabled={busy || !name.trim()} className="sm:w-auto">
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Create blank event
            </Button>
          </form>
        </CardContent>
      </Card>

      <AiEventWizardCard
        orgSlug={orgSlug}
        eventName={name}
        onCreated={(slug) => router.push(`/app/${orgSlug}/events/${slug}/overview`)}
      />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Start from a template</h2>
        {templates === undefined ? (
          <Card className="animate-pulse">
            <CardContent className="space-y-2">
              <div className="h-5 w-1/3 rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
            </CardContent>
          </Card>
        ) : systemTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates available.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {systemTemplates.map((tpl) => (
              <button
                key={tpl._id}
                type="button"
                disabled={busy || !name.trim()}
                className="rounded-xl bg-card p-5 text-left ring-1 ring-foreground/10 transition-all hover:ring-primary/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => handle(() => createFromTemplate({ orgSlug, name, templateId: tpl._id }))}
              >
                <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles aria-hidden className="size-4.5" />
                </span>
                <div className="font-medium">{tpl.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{tpl.description}</div>
              </button>
            ))}
          </div>
        )}
        {templates !== undefined && systemTemplates.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Enter an event name above to enable template creation.
          </p>
        ) : null}
      </div>
    </div>
  );
}
