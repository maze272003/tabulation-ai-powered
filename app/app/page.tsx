"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Building2, Loader2, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { UserMenu } from "@/components/UserMenu";
import { EmptyState } from "@/components/tabulation/StateBlock";

export default function AppHome() {
  const mine = useQuery(api.organizations.listMine, {});
  const create = useMutation(api.organizations.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title="Your organizations"
        description="Select an organization to manage its events, templates, and billing."
        actions={<UserMenu />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Create an organization</CardTitle>
          <CardDescription>
            Organizations group your events, members, and subscriptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setCreating(true);
              try {
                const slug = await create({ name });
                router.push(`/app/${slug}`);
              } catch (err: unknown) {
                const code = (err as { data?: { code?: string } })?.data?.code;
                if (code === "CONFLICT") {
                  toast.error("An organization with that name already exists. Try a different name.");
                } else {
                  toast.error("Could not create organization.");
                }
                setCreating(false);
              }
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="org-name" className="sr-only">
                Organization name
              </Label>
              <Input
                id="org-name"
                placeholder="e.g. National Debate Federation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={creating}
              />
            </div>
            <Button type="submit" disabled={creating || !name.trim()} className="sm:w-auto">
              {creating ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Plus aria-hidden />
              )}
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      {mine === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="space-y-2">
                <div className="h-5 w-1/2 rounded bg-muted" />
                <div className="h-4 w-1/3 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : mine.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations yet"
          hint="Create your first organization above to start running events."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {mine.map((m) => (
            <Link key={m.membership._id} href={`/app/${m.org?.slug}`} className="group block">
              <Card className="h-full transition-all group-hover:ring-primary/30 group-hover:shadow-md">
                <CardContent className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 aria-hidden className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{m.org?.name}</div>
                      <div className="mt-0.5 text-sm text-muted-foreground">{m.role?.name}</div>
                    </div>
                  </div>
                  <ArrowRight
                    aria-hidden
                    className="mt-1 size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
