"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { orgSlug });
  const update = useMutation(api.organizations.update);
  const [name, setName] = useState(org?.name ?? "");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          onClick={async () => {
            try {
              await update({ orgSlug, name });
              toast.success("Organization renamed");
            } catch {
              toast.error("Could not save changes.");
            }
          }}
        >
          Save
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Slug: {org?.slug}</p>
    </div>
  );
}
