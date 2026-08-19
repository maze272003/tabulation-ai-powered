"use client";

import { Suspense, use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  AlertCircle,
  ArrowRight,
  Clock,
  HelpCircle,
  LifeBuoy,
  Loader2,
  MessageSquare,
  Plus,
  Receipt,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TICKET_STATUS_MAP: Record<
  string,
  { label: string; tone: string; icon?: React.ReactNode }
> = {
  pending: {
    label: "Ticket Pending",
    tone: "bg-warning-muted text-warning border-warning/30",
  },
  in_review: {
    label: "In Review",
    tone: "bg-info-muted text-info border-info/30",
  },
  approved: {
    label: "Approved",
    tone: "bg-success-muted text-success border-success/30",
  },
  rejected: {
    label: "Rejected",
    tone: "bg-destructive/15 text-destructive border-destructive/30",
  },
  resolved: {
    label: "Resolved",
    tone: "bg-muted text-muted-foreground border-transparent",
  },
};

const TICKET_TYPE_MAP: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  refund: { label: "Refund Request", icon: Receipt },
  general_support: { label: "General Support", icon: HelpCircle },
  billing_issue: { label: "Billing Issue", icon: AlertCircle },
  technical: { label: "Technical Support", icon: Wrench },
};

function formatPeso(cents: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRemainingTime(ms: number): string {
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function SupportContent({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const tickets = useQuery(api.support.tickets.listForOrg, { orgSlug });
  const refundEligibility = useQuery(api.support.tickets.getRefundEligibility, { orgSlug });

  const createSupportTicket = useMutation(api.support.tickets.createSupportTicket);
  const createRefundTicket = useMutation(api.support.tickets.createRefundTicket);

  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // New Support Ticket Modal
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [ticketType, setTicketType] = useState<"general_support" | "billing_issue" | "technical">(
    "general_support",
  );
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [description, setDescription] = useState("");
  const [submittingSupport, setSubmittingSupport] = useState(false);

  // Refund Ticket Modal
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundDetails, setRefundDetails] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const handleCreateSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3) {
      toast.error("Subject must be at least 3 characters.");
      return;
    }
    if (description.trim().length < 5) {
      toast.error("Description must be at least 5 characters.");
      return;
    }

    setSubmittingSupport(true);
    try {
      const res = await createSupportTicket({
        orgSlug,
        subject: subject.trim(),
        description: description.trim(),
        ticketType,
        priority,
      });
      toast.success("Support ticket opened successfully.");
      setSupportModalOpen(false);
      setSubject("");
      setDescription("");
      router.push(`/app/${orgSlug}/support/${res.ticketId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open support ticket.");
    } finally {
      setSubmittingSupport(false);
    }
  };

  const handleCreateRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (refundReason.trim().length < 3) {
      toast.error("Please provide a reason for the refund request.");
      return;
    }

    setSubmittingRefund(true);
    try {
      const res = await createRefundTicket({
        orgSlug,
        reason: refundReason.trim(),
        details: refundDetails.trim() || undefined,
      });
      toast.success(res.message);
      setRefundModalOpen(false);
      setRefundReason("");
      setRefundDetails("");
      router.push(`/app/${orgSlug}/support/${res.ticketId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit refund ticket.");
    } finally {
      setSubmittingRefund(false);
    }
  };

  const filteredTickets = tickets?.filter((t) => {
    if (filterType !== "all" && t.ticketType !== filterType) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 10-Hour Refund Policy Banner */}
      {refundEligibility?.hasPaidSubscription ? (
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <LifeBuoy className="size-5 text-primary" />
                <h3 className="font-heading text-sm font-semibold">
                  10-Hour Subscription Refund Policy
                </h3>
                {refundEligibility.existingTicket ? (
                  <Badge variant="outline" className="border-warning text-warning capitalize">
                    Ticket {refundEligibility.existingTicket.status}
                  </Badge>
                ) : refundEligibility.isEligible ? (
                  <Badge className="bg-success-muted text-success border-success/30">
                    Window Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Window Closed
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {refundEligibility.existingTicket ? (
                  <span>
                    Your refund request is currently being processed by support.
                  </span>
                ) : refundEligibility.isEligible ? (
                  <span>
                    Refund requests are valid strictly within <strong>10 hours</strong> of payment.
                    You have <strong>{formatRemainingTime(refundEligibility.remainingMs)}</strong>{" "}
                    remaining to submit a ticket.
                  </span>
                ) : (
                  <span>
                    Refund Window Closed: Subscriptions cannot be self-cancelled. Refund tickets are
                    only accepted within 10 hours of payment.
                  </span>
                )}
              </p>
            </div>

            {refundEligibility.isEligible && !refundEligibility.existingTicket ? (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => setRefundModalOpen(true)}
              >
                <Clock className="size-4 text-warning" /> Request Refund Ticket
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Action Bar & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterType} onValueChange={(val) => { if (val) setFilterType(val); }}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="refund">Refunds</SelectItem>
              <SelectItem value="general_support">General Support</SelectItem>
              <SelectItem value="billing_issue">Billing</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={(val) => { if (val) setFilterStatus(val); }}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setSupportModalOpen(true)} size="sm" className="gap-1.5">
            <Plus className="size-4" /> Open Support Ticket
          </Button>
        </div>
      </div>

      {/* Tickets List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg">Support Tickets & History</CardTitle>
          <CardDescription>
            View ticket status, real-time responses, and conversation threads with our team.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {tickets === undefined ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : filteredTickets?.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <LifeBuoy className="size-8 mx-auto mb-2 opacity-30" />
              <p>No support tickets found matching your filters.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSupportModalOpen(true)}
              >
                Create a support ticket
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {filteredTickets?.map((ticket) => {
                const typeInfo = TICKET_TYPE_MAP[ticket.ticketType] ?? {
                  label: "Ticket",
                  icon: HelpCircle,
                };
                const statusInfo = TICKET_STATUS_MAP[ticket.status] ?? {
                  label: ticket.status,
                  tone: "bg-muted text-muted-foreground",
                };
                const Icon = typeInfo.icon;

                return (
                  <Link
                    key={ticket._id}
                    href={`/app/${orgSlug}/support/${ticket._id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 rounded-lg border bg-muted/30 p-2 text-muted-foreground">
                        <Icon className="size-4.5" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            #{ticket._id.slice(-6).toUpperCase()}
                          </span>
                          <h4 className="text-sm font-semibold text-foreground truncate">
                            {ticket.subject}
                          </h4>
                          {ticket.unreadCustomerCount > 0 ? (
                            <Badge className="bg-primary text-primary-foreground text-[10px] h-4.5 px-1.5">
                              {ticket.unreadCustomerCount} new reply
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {ticket.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
                          <span>Updated {formatDate(ticket.lastMessageAt)}</span>
                          <span>·</span>
                          <span className="capitalize">{typeInfo.label}</span>
                          {ticket.planName ? (
                            <>
                              <span>·</span>
                              <span>Plan: {ticket.planName}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <Badge className={cn("border capitalize text-xs", statusInfo.tone)}>
                        {statusInfo.label}
                      </Badge>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Support Ticket Modal */}
      <Dialog open={supportModalOpen} onOpenChange={setSupportModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleCreateSupport} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LifeBuoy className="size-5 text-primary" /> Open Support Ticket
              </DialogTitle>
              <DialogDescription>
                Describe your inquiry or issue. Our support team will assist you shortly in real time.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="support-type">Category</Label>
              <Select
                value={ticketType}
                onValueChange={(val) => {
                  if (val) setTicketType(val as "general_support" | "billing_issue" | "technical");
                }}
              >
                <SelectTrigger id="support-type">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general_support">General Support / Question</SelectItem>
                  <SelectItem value="billing_issue">Billing & Invoicing Issue</SelectItem>
                  <SelectItem value="technical">Technical / Bug Report</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(val) => {
                  if (val) setPriority(val as "low" | "normal" | "high" | "urgent");
                }}
              >
                <SelectTrigger id="support-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-subject">
                Subject <span className="text-destructive">*</span>
              </Label>
              <Input
                id="support-subject"
                placeholder="e.g. Question about judge accounts assignment"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                maxLength={120}
                disabled={submittingSupport}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-description">
                Message / Description <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="support-description"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
                placeholder="Provide details of your request..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                disabled={submittingSupport}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSupportModalOpen(false)}
                disabled={submittingSupport}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingSupport}>
                {submittingSupport ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Opening…
                  </>
                ) : (
                  "Create Ticket"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Refund Request Modal */}
      <Dialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateRefund} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="size-5 text-primary" /> Request Subscription Refund
              </DialogTitle>
              <DialogDescription>
                Refund tickets are processed by our CRM support team. Submissions are valid strictly
                within <strong>10 hours</strong> from the payment timestamp.
              </DialogDescription>
            </DialogHeader>

            {refundEligibility?.isEligible ? (
              <div className="rounded-lg border bg-muted/50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan:</span>
                  <span className="font-medium">{refundEligibility.planName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium">{formatPeso(refundEligibility.amountCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid At:</span>
                  <span>{formatDate(refundEligibility.paidAt)}</span>
                </div>
                <div className="flex justify-between text-warning font-medium">
                  <span>Window Remaining:</span>
                  <span>{formatRemainingTime(refundEligibility.remainingMs)}</span>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="refund-reason">
                Reason for Refund <span className="text-destructive">*</span>
              </Label>
              <Input
                id="refund-reason"
                placeholder="e.g. Upgraded by mistake, wrong tier selected"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                required
                maxLength={500}
                disabled={submittingRefund}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-details">
                Additional Details <span className="text-muted-foreground text-xs">(Optional)</span>
              </Label>
              <textarea
                id="refund-details"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                placeholder="Provide any additional context for our support team..."
                value={refundDetails}
                onChange={(e) => setRefundDetails(e.target.value)}
                disabled={submittingRefund}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefundModalOpen(false)}
                disabled={submittingRefund}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingRefund}>
                {submittingRefund ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  "Submit Refund Ticket"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SupportPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LifeBuoy}
        title="Support & Tickets"
        description="Get help from our team, chat in real time, and track subscription refund tickets."
      />
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
        <SupportContent orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}
