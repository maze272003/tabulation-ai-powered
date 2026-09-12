"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function OrgSwitcher({ currentSlug }: { currentSlug: string }) {
  const mine = useQuery(api.organizations.listMine, {});
  const createOrg = useMutation(api.organizations.create);
  const router = useRouter();

  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  const current = mine?.find((m) => m.org?.slug === currentSlug);

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const slug = await createOrg({ name: newOrgName.trim() });
      try {
        localStorage.setItem("last_org_slug", slug);
      } catch {
        // ignore storage errors
      }
      toast.success("Organization created successfully");
      setCreateOpen(false);
      setNewOrgName("");
      router.push(`/app/${slug}/overview`);
    } catch (err: unknown) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "CONFLICT") {
        toast.error("An organization with that name already exists. Try a different name.");
      } else {
        toast.error("Could not create organization.");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-10 w-full justify-start gap-2.5 px-2 text-sidebar-accent-foreground hover:bg-sidebar-accent"
              aria-label="Switch organization"
            />
          }
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
            <Building2 aria-hidden className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
            {current?.org?.name ?? "Organizations"}
          </span>
          <ChevronsUpDown aria-hidden className="size-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-56">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {mine?.map((m) => {
            const active = m.org?.slug === currentSlug;
            return (
              <DropdownMenuItem
                key={m.membership._id}
                render={<Link href={`/app/${m.org?.slug}`} />}
              >
                <span className="min-w-0 flex-1 truncate">{m.org?.name}</span>
                {active ? <Check aria-hidden className="size-4 text-primary" /> : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)} className="cursor-pointer">
            <Plus aria-hidden className="size-4" />
            New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create an organization</DialogTitle>
            <DialogDescription>
              Organizations group your events, team members, and scoring rubrics.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateOrg} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="switcher-org-name" className="text-xs font-semibold">
                Organization name
              </Label>
              <Input
                id="switcher-org-name"
                placeholder="e.g. National Debate Federation"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                disabled={creating}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !newOrgName.trim()}>
                {creating ? (
                  <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
                ) : (
                  <Plus aria-hidden className="mr-2 size-4" />
                )}
                Create Organization
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
