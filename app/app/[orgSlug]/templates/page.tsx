"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/tabulation/StateBlock";
import { toast } from "sonner";
import { LayoutTemplate, Loader2, Save, Trash2 } from "lucide-react";

export default function TemplatesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const templates = useQuery(api.templates.list, { orgSlug });
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const createFromEvent = useMutation(api.templates.createFromEvent);
  const remove = useMutation(api.templates.remove);
  const [name, setName] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const drafts = events?.filter((e) => e.status === "draft") ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Reusable event blueprints. Save a configured draft as a template to fast-track future events."
      />

      <Card>
        <CardHeader>
          <CardTitle>Save a draft event as a template</CardTitle>
          <CardDescription>
            Rounds, criteria, and categories from the selected draft are copied into the template.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 lg:flex-row lg:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || !eventSlug) return;
              setSaving(true);
              try {
                await createFromEvent({ orgSlug, eventSlug, name });
                setName("");
                setEventSlug("");
                toast.success("Template saved.");
              } catch (err: unknown) {
                toast.error(
                  (err as { data?: { message?: string } })?.data?.message ?? "Could not save template.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                placeholder="e.g. Standard Pageant Setup"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="w-full space-y-1.5 lg:w-64">
              <Label htmlFor="template-source">Source draft event</Label>
              <Select value={eventSlug} onValueChange={(val) => setEventSlug(val ?? "")}>
                <SelectTrigger id="template-source" className="w-full">
                  <SelectValue placeholder="Choose a draft…" />
                </SelectTrigger>
                <SelectContent>
                  {drafts.map((e) => (
                    <SelectItem key={e._id} value={e.slug}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={saving || !name.trim() || !eventSlug}
              className="lg:w-auto"
            >
              {saving ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
              Save template
            </Button>
          </form>
        </CardContent>
      </Card>

      {templates === undefined ? (
        <Card className="animate-pulse">
          <CardContent className="space-y-2">
            <div className="h-5 w-1/3 rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          hint="Save a configured draft event as a template to reuse its structure."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((tpl) => (
            <Card key={tpl._id} className="h-full">
              <CardContent className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-medium">{tpl.name}</div>
                  {tpl.isSystem ? (
                    <Badge variant="secondary" className="shrink-0">System</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{tpl.description}</p>
                {!tpl.isSystem ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-auto w-fit self-end text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      try {
                        await remove({ orgSlug, templateId: tpl._id });
                        toast.success("Template deleted.");
                      } catch (err: unknown) {
                        toast.error(
                          (err as { data?: { message?: string } })?.data?.message ?? "Failed.",
                        );
                      }
                    }}
                  >
                    <Trash2 aria-hidden />
                    Delete
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
