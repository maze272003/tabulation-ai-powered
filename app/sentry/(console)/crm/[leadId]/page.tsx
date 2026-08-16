"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Link2, MessageSquarePlus, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { formatMoney } from "@/components/sentry/format";
import { formatDateTime } from "@/components/platform/format";
import { ReasonDialog } from "@/components/platform/ReasonDialog";
import { platformErrorMessage } from "@/components/platform/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/tabulation/StateBlock";

const STAGES = [
  "lead",
  "qualified",
  "proposal",
  "trial",
  "customer",
  "churned",
] as const;

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  trial: "Trial",
  customer: "Customer",
  churned: "Churned",
};

export default function SentryLeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = use(params);
  const { token } = useSentrySession();
  const detail = useQuery(
    api.superadmin.crm.detail,
    token ? { token, leadId: leadId as Id<"crmLeads"> } : "skip",
  );
  const orgOptions = useQuery(api.superadmin.orgs.options, token ? { token } : "skip");

  const [note, setNote] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const updateLead = useMutation(api.superadmin.crm.update);
  const addNote = useMutation(api.superadmin.crm.addNote);
  const linkOrg = useMutation(api.superadmin.crm.linkOrg);
  const deleteLead = useMutation(api.superadmin.crm.deleteLead);

  if (detail === undefined) {
    return (
      <div className="space-y-6">
        <BackLink />
        <TableSkeleton rows={4} cols={3} />
      </div>
    );
  }

  const { lead, notes, convertedOrg } = detail;

  const moveStage = async (stage: string) => {
    if (!token || stage === lead.stage) return;
    try {
      await updateLead({ token, leadId: lead._id, stage: stage as (typeof STAGES)[number], reason: `moved to ${stage}` });
      toast.success(`Moved to ${STAGE_LABELS[stage]}`);
    } catch (error) {
      toast.error(platformErrorMessage(error, "The stage could not be updated."));
    }
  };

  const submitNote = async () => {
    if (!token || !note.trim()) return;
    setBusy(true);
    try {
      await addNote({ token, leadId: lead._id, body: note });
      setNote("");
      toast.success("Note added");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The note could not be added."));
    } finally {
      setBusy(false);
    }
  };

  const runLinkOrg = async () => {
    if (!token || !selectedOrgId) return;
    setBusy(true);
    try {
      await linkOrg({
        token,
        leadId: lead._id,
        orgId: selectedOrgId as Id<"organizations">,
        reason: "converted to customer",
      });
      setLinkDialogOpen(false);
      toast.success("Lead converted to customer");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The conversion could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async (reason: string) => {
    if (!token) return;
    setBusy(true);
    try {
      await deleteLead({ token, leadId: lead._id, reason });
      setDeleteDialogOpen(false);
      toast.success("Lead deleted");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The lead could not be deleted."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-semibold">{lead.companyName}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {lead.contactName} · {lead.contactEmail}
            {lead.phone ? (
              <>
                {" "}
                · <span className="inline-flex items-center gap-1">
                  <Phone aria-hidden className="size-3" />
                  {lead.phone}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={convertedOrg !== null}
            onClick={() => setLinkDialogOpen(true)}
          >
            <Link2 aria-hidden className="size-3.5" />
            {convertedOrg ? "Converted" : "Link to organization"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 aria-hidden className="size-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Stage</p>
              <Select
                value={lead.stage}
                onValueChange={(value) => {
                  if (value) void moveStage(value);
                }}
              >
                <SelectTrigger className="mt-1 w-full" aria-label="Lead stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {STAGE_LABELS[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Deal value</p>
                <p className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                  {formatMoney(lead.valueCents)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="mt-0.5 font-medium">{lead.source}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Next follow-up</p>
              <p className="mt-0.5 font-medium">
                {lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : "None scheduled"}
              </p>
            </div>
            {convertedOrg && (
              <div>
                <p className="text-xs text-muted-foreground">Converted to</p>
                <Link
                  href={`/sentry/organizations/${convertedOrg._id}`}
                  className="mt-0.5 block truncate font-medium text-primary underline-offset-4 hover:underline"
                >
                  {convertedOrg.name}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquarePlus aria-hidden className="size-4 text-muted-foreground" />
              Notes ({notes.length})
            </CardTitle>
            <CardDescription>Activity log and context for this prospect.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a note about this lead…"
                aria-label="New note"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitNote();
                  }
                }}
              />
              <Button onClick={() => void submitNote()} disabled={busy || !note.trim()}>
                Add
              </Button>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <div className="space-y-3">
                {notes.map((entry) => (
                  <div key={entry._id} className="rounded-lg bg-muted/50 p-3">
                    <p className="whitespace-pre-wrap text-sm">{entry.body}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {formatDateTime(entry._creationTime)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to customer</DialogTitle>
            <DialogDescription>
              Link this lead to an existing organization. The lead moves to the Customer stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="convert-org">Organization</Label>
            <Select
              value={selectedOrgId}
              onValueChange={(value) => {
                if (value) setSelectedOrgId(value);
              }}
            >
              <SelectTrigger id="convert-org" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orgOptions?.map((org) => (
                  <SelectItem key={org._id} value={org._id}>
                    {org.name} ({org.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button disabled={busy || !selectedOrgId} onClick={() => void runLinkOrg()}>
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete lead"
        description={`${lead.companyName} and all of its notes will be permanently removed.`}
        confirmLabel="Delete lead"
        busy={busy}
        destructive
        onConfirm={runDelete}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/sentry/crm"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-3.5" />
      Back to CRM
    </Link>
  );
}