"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { Loader2, Settings } from "lucide-react";

export default function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { orgSlug });
  const update = useMutation(api.organizations.update);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [prevOrgName, setPrevOrgName] = useState<string | undefined>(undefined);
  if (org?.name !== prevOrgName) {
    setPrevOrgName(org?.name);
    setName(org?.name ?? "");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="Settings"
        description="Manage your organization profile and identity."
      />
      <div className="max-w-xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Organization profile</CardTitle>
            <CardDescription>The display name visible to your members.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                try {
                  await update({ orgSlug, name });
                  toast.success("Organization renamed");
                } catch {
                  toast.error("Could not save changes.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="org-name">Display name</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <Button
                type="submit"
                disabled={saving || !name.trim() || name === org?.name}
                className="sm:w-auto"
              >
                {saving ? <Loader2 aria-hidden className="animate-spin" /> : null}
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Identifier</CardTitle>
            <CardDescription>The slug used in URLs and API references.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-sm tracking-wide">
                {org?.slug ?? "…"}
              </Badge>
              <span className="text-xs text-muted-foreground">Slugs are permanent.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
