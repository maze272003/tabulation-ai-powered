"use client";

import { use, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ArrowLeft,
  CheckCircle2,
  Clock,
  HelpCircle,
  LifeBuoy,
  Loader2,
  Receipt,
  Send,
  ShieldAlert,
  ShieldCheck,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TICKET_STATUS_MAP: Record<string, { label: string; tone: string }> = {
  pending: {
    label: "Pending",
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

export default function SuperadminTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = use(params);
  const router = useRouter();
  const { token } = useSentrySession();

  const ticket = useQuery(
    api.superadmin.tickets.getDetail,
    token ? { token, ticketId: ticketId as Id<"supportTickets"> } : "skip",
  );
  const messages = useQuery(
    api.superadmin.tickets.getMessages,
    token ? { token, ticketId: ticketId as Id<"supportTickets"> } : "skip",
  );

  const sendAdminMessage = useMutation(api.superadmin.tickets.sendAdminMessage);
  const updateStatus = useMutation(api.superadmin.tickets.updateStatus);

  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Status Change State
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Decision Modal State for Refund Approval/Rejection
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (ticket === undefined) {
    return <div className="h-96 rounded-xl bg-muted/60 animate-pulse" />;
  }

  if (ticket === null) {
    return notFound();
  }

  const isRefund = ticket.ticketType === "refund";
  const statusInfo = TICKET_STATUS_MAP[ticket.status] ?? {
    label: ticket.status,
    tone: "bg-muted text-muted-foreground",
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputMessage.trim();
    if (!token) return;
    setSending(true);
    try {
      await sendAdminMessage({
        token,
        ticketId: ticket._id,
        body: text,
      });
      setInputMessage("");
      toast.success("Reply sent to customer.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reply.");
    } finally {
      setSending(false);
    }
  };

  const handleApproveRefund = async () => {
    if (!token) return;
    setUpdatingStatus(true);
    try {
      await updateStatus({
        token,
        ticketId: ticket._id,
        status: "approved",
      });
      toast.success("Refund approved! Subscription has been downgraded to Free.");
      setApprovalModalOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve refund.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRejectRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }

    setUpdatingStatus(true);
    try {
      await updateStatus({
        token,
        ticketId: ticket._id,
        status: "rejected",
        decisionReason: rejectionReason.trim(),
      });
      toast.info("Refund request rejected.");
      setRejectionModalOpen(false);
      setRejectionReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject refund.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleStatusChange = async (
    newStatus: "pending" | "in_review" | "approved" | "rejected" | "resolved",
  ) => {
    if (!token) return;
    setUpdatingStatus(true);
    try {
      await updateStatus({
        token,
        ticketId: ticket._id,
        status: newStatus,
      });
      toast.success(`Ticket status updated to ${newStatus}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/sentry/support"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to Support Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <Badge className={cn("border capitalize text-xs", statusInfo.tone)}>
            {statusInfo.label}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            #{ticket._id.slice(-6).toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Live Real-time Chat & Conversation */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="flex flex-col h-[650px]">
            <CardHeader className="border-b py-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">{ticket.subject}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Customer: <span className="font-medium text-foreground">{ticket.creatorName}</span> ({ticket.creatorEmail}) · Org:{" "}
                    <span className="font-medium text-foreground">{ticket.orgName}</span>
                  </p>
                </div>
              </div>
            </CardHeader>

            {/* Message Area */}
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages === undefined ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No messages yet. Send a message below to respond to the customer.
                </div>
              ) : (
                messages.map((msg) => {
                  const isAdmin = msg.senderRole === "superadmin";
                  const isSystem = msg.senderRole === "system";

                  if (isSystem) {
                    return (
                      <div
                        key={msg._id}
                        className="my-3 flex items-center justify-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                      >
                        <LifeBuoy className="size-3.5 shrink-0 text-primary" />
                        <span className="font-medium">{msg.body}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg._id}
                      className={cn(
                        "flex flex-col max-w-[85%]",
                        isAdmin ? "ml-auto items-end" : "mr-auto items-start",
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">
                          {isAdmin ? "Support Agent (You)" : msg.senderName}
                        </span>
                        <span>·</span>
                        <span>{formatDate(msg.createdAt)}</span>
                      </div>
                      <div
                        className={cn(
                          "rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed shadow-2xs",
                          isAdmin
                            ? "bg-primary text-primary-foreground rounded-br-xs"
                            : "bg-muted text-foreground rounded-bl-xs border",
                        )}
                      >
                        {msg.body}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </CardContent>

            {/* Reply Footer */}
            <div className="border-t p-3 bg-card/60">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendMessage(e);
                    }
                  }}
                  placeholder="Type reply to customer (Enter to send)..."
                  rows={2}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  disabled={sending}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-auto self-end px-3 py-2 shrink-0"
                  disabled={!inputMessage.trim() || sending}
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </form>
            </div>
          </Card>
        </div>

        {/* Right Column: Customer Context & Decision Controls */}
        <div className="space-y-4">
          {/* Refund Decision Card */}
          {isRefund ? (
            <Card className="border-warning/40 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="size-4 text-warning" /> Refund Decision Controls
                </CardTitle>
                <CardDescription className="text-xs">
                  Review the 10-hour refund policy criteria and decide.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {ticket.refundAmountCents ? (
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-bold text-foreground">
                      {formatPeso(ticket.refundAmountCents)}
                    </span>
                  </div>
                ) : null}
                {ticket.planName ? (
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Plan:</span>
                    <span className="font-medium">{ticket.planName}</span>
                  </div>
                ) : null}
                {ticket.refundPaidAt ? (
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Payment Timestamp:</span>
                    <span>{formatDate(ticket.refundPaidAt)}</span>
                  </div>
                ) : null}
                <div className="pt-1">
                  <Badge
                    variant="outline"
                    className="border-success/40 bg-success-muted text-success text-[11px]"
                  >
                    10-Hour Window: Verified Valid at Submission
                  </Badge>
                </div>

                {ticket.status === "pending" || ticket.status === "in_review" ? (
                  <div className="flex flex-col gap-2 pt-3 border-t">
                    <Button
                      onClick={() => setApprovalModalOpen(true)}
                      size="sm"
                      className="w-full bg-success text-success-foreground hover:bg-success/90 gap-1.5"
                    >
                      <CheckCircle2 className="size-4" /> Approve Refund & Downgrade
                    </Button>
                    <Button
                      onClick={() => setRejectionModalOpen(true)}
                      variant="outline"
                      size="sm"
                      className="w-full text-destructive hover:bg-destructive/10 gap-1.5"
                    >
                      <XCircle className="size-4" /> Reject Refund Request
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/40 p-2.5 space-y-1">
                    <span className="font-semibold text-foreground">Decision:</span>
                    <p className="capitalize font-medium text-xs">
                      {ticket.status} {ticket.decisionReason ? `— ${ticket.decisionReason}` : ""}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Status Management</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="space-y-1.5">
                  <Label className="text-xs">Change Ticket Status</Label>
                  <Select
                    value={ticket.status}
                    onValueChange={(val) => {
                      if (val) {
                        void handleStatusChange(
                          val as "pending" | "in_review" | "approved" | "rejected" | "resolved",
                        );
                      }
                    }}
                    disabled={updatingStatus}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Customer & Organization Context */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Customer & Organization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium">{ticket.creatorName}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-mono">{ticket.creatorEmail}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-muted-foreground">Organization:</span>
                <Link
                  href={`/sentry/organizations/${ticket.orgId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {ticket.orgName}
                </Link>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-muted-foreground">Org Slug:</span>
                <span className="font-mono">{ticket.orgSlug}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-muted-foreground">Created:</span>
                <span>{formatDate(ticket.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Activity:</span>
                <span>{formatDate(ticket.lastMessageAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Approval Confirmation Dialog */}
      <Dialog open={approvalModalOpen} onOpenChange={setApprovalModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-5" /> Approve Refund Request
            </DialogTitle>
            <DialogDescription>
              Approving this refund will:
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
            <p>1. Mark payment of <strong>{formatPeso(ticket.refundAmountCents ?? 0)}</strong> as <strong>refunded</strong>.</p>
            <p>2. Automatically downgrade organization <strong>{ticket.orgName}</strong> to the <strong>Free</strong> plan.</p>
            <p>3. Notify customer <strong>{ticket.creatorEmail}</strong> in-app.</p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApprovalModalOpen(false)}
              disabled={updatingStatus}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveRefund}
              disabled={updatingStatus}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {updatingStatus ? <Loader2 className="size-4 animate-spin" /> : "Confirm & Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={rejectionModalOpen} onOpenChange={setRejectionModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleRejectRefund} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <XCircle className="size-5" /> Reject Refund Request
              </DialogTitle>
              <DialogDescription>
                State the reason for rejecting this refund request. This will be sent to the customer.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Rejection Reason</Label>
              <Input
                id="rejection-reason"
                placeholder="e.g. Account features have already been heavily utilized for published events"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                required
                disabled={updatingStatus}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectionModalOpen(false)}
                disabled={updatingStatus}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={updatingStatus || !rejectionReason.trim()}
              >
                {updatingStatus ? <Loader2 className="size-4 animate-spin" /> : "Confirm Rejection"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
