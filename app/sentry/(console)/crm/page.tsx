"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Handshake, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { formatMoney } from "@/components/sentry/format";
import { formatDate } from "@/components/platform/format";
import { platformErrorMessage } from "@/components/platform/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "lead", label: "Lead", tone: "bg-muted" },
  { key: "qualified", label: "Qualified", tone: "bg-info-muted" },
  { key: "proposal", label: "Proposal", tone: "bg-primary/15" },
  { key: "trial", label: "Trial", tone: "bg-warning-muted" },
  { key: "customer", label: "Customer", tone: "bg-success-muted" },
  { key: "churned", label: "Churned", tone: "bg-destructive/10" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

const LEAD_SOURCES = ["Referral", "Website", "Social media", "Event", "Outbound", "Partner", "Other"];

export default function SentryCrmPage() {
  const { token } = useSentrySession();
  const leads = useQuery(api.superadmin.crm.board, token ? { token } : "skip");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    phone: "",
    source: "Referral",
    stage: "lead" as StageKey,
    valueDollars: "",
    nextFollowUpAt: "",
    summary: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const createLead = useMutation(api.superadmin.crm.create);

  const submit = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await createLead({
        token,
        companyName: form.companyName,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        phone: form.phone || undefined,
        source: form.source,
        stage: form.stage,
        valueCents: Math.round((parseFloat(form.valueDollars || "0") || 0) * 100),
        nextFollowUpAt: form.nextFollowUpAt
          ? new Date(`${form.nextFollowUpAt}T23:59:59`).getTime()
          : undefined,
        summary: form.summary,
        reason: form.reason,
      });
      setCreateOpen(false);
      setForm({ ...form, companyName: "", contactName: "", contactEmail: "", summary: "", reason: "" });
      toast.success("Lead created");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The lead could not be created."));
    } finally {
      setBusy(false);
    }
  };

  const pipeline = STAGES.map((stage) => ({
    ...stage,
    leads: leads?.filter(({ lead }) => lead.stage === stage.key) ?? [],
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          icon={Handshake}
          title="CRM"
          description="Sales pipeline for prospects and customers across the platform."
        />
        <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden className="size-4" />
          New lead
        </Button>
      </div>

      {leads === undefined ? (
        <TableSkeleton rows={4} cols={4} />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No leads yet"
          hint="Create your first lead to start tracking prospects."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {pipeline.map((stage) => (
            <section key={stage.key} aria-label={`${stage.label} stage`}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <span aria-hidden className={cn("size-2 rounded-full", stage.tone)} />
                  {stage.label}
                </h2>
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {stage.leads.length}
                </span>
              </div>
              <div className="space-y-2">
                {stage.leads.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Empty
                  </div>
                ) : (
                  stage.leads.map(({ lead }) => {
                    const followUpDue =
                      lead.nextFollowUpAt !== null && lead.nextFollowUpAt <= Date.now();
                    return (
                      <a
                        key={lead._id}
                        href={`/sentry/crm/${lead._id}`}
                        className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                      >
                        <p className="truncate text-sm font-medium">{lead.companyName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {lead.contactName} · {lead.contactEmail}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-mono tabular-nums text-muted-foreground">
                            {formatMoney(lead.valueCents)}
                          </span>
                          {lead.nextFollowUpAt !== null && (
                            <span
                              className={cn(
                                "font-mono tabular-nums",
                                followUpDue ? "font-semibold text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {followUpDue ? "Due " : ""}
                              {formatDate(lead.nextFollowUpAt)}
                            </span>
                          )}
                        </div>
                      </a>
                    );
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New lead</DialogTitle>
            <DialogDescription>Track a prospect through the sales pipeline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lead-company">Company</Label>
                <Input
                  id="lead-company"
                  value={form.companyName}
                  onChange={(event) => setForm({ ...form, companyName: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-contact">Contact name</Label>
                <Input
                  id="lead-contact"
                  value={form.contactName}
                  onChange={(event) => setForm({ ...form, contactName: event.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lead-email">Contact email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-phone">Phone</Label>
                <Input
                  id="lead-phone"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lead-source">Source</Label>
                <Select
                  value={form.source}
                  onValueChange={(value) => setForm({ ...form, source: value ?? "Referral" })}
                >
                  <SelectTrigger id="lead-source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-stage">Stage</Label>
                <Select
                  value={form.stage}
                  onValueChange={(value) => setForm({ ...form, stage: (value ?? "lead") as StageKey })}
                >
                  <SelectTrigger id="lead-stage" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((stage) => (
                      <SelectItem key={stage.key} value={stage.key}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lead-value">Deal value (USD)</Label>
                <Input
                  id="lead-value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valueDollars}
                  onChange={(event) => setForm({ ...form, valueDollars: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-followup">Next follow-up</Label>
                <Input
                  id="lead-followup"
                  type="date"
                  value={form.nextFollowUpAt}
                  onChange={(event) => setForm({ ...form, nextFollowUpAt: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-summary">Summary</Label>
              <Input
                id="lead-summary"
                value={form.summary}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
                placeholder="What do we know about this prospect?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-reason">Reason</Label>
              <Input
                id="lead-reason"
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
                placeholder="Reason (recorded in the audit log)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={
                busy || !form.companyName.trim() || !form.contactName.trim() || !form.contactEmail.trim()
              }
              onClick={() => void submit()}
            >
              {busy ? "Creating…" : "Create lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}