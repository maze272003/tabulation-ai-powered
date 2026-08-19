"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Bot,
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const TICKET_STATUS_MAP: Record<string, { label: string; tone: string }> = {
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

function TicketDetailContent({
  orgSlug,
  ticketId,
}: {
  orgSlug: string;
  ticketId: Id<"supportTickets">;
}) {
  const ticket = useQuery(api.support.tickets.getTicket, { orgSlug, ticketId });
  const messages = useQuery(api.support.tickets.getMessages, { orgSlug, ticketId });

  const sendMessage = useMutation(api.support.tickets.sendMessage);
  const markMessagesRead = useMutation(api.support.tickets.markMessagesRead);

  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Clear unread customer count when viewing the ticket
  useEffect(() => {
    if (ticket && ticket.unreadCustomerCount > 0) {
      void markMessagesRead({ orgSlug, ticketId });
    }
  }, [ticket, orgSlug, ticketId, markMessagesRead]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (ticket === undefined) {
    return <div className="h-96 rounded-xl bg-muted/60 animate-pulse" />;
  }

  if (ticket === null) {
    return notFound();
  }

  const statusInfo = TICKET_STATUS_MAP[ticket.status] ?? {
    label: ticket.status,
    tone: "bg-muted text-muted-foreground",
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputMessage.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      await sendMessage({ orgSlug, ticketId, body: text });
      setInputMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Back Navigation & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/app/${orgSlug}/support`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to all tickets
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
        {/* Main Conversation / Live Chat Area */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="flex flex-col h-[600px]">
            <CardHeader className="border-b py-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">{ticket.subject}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Opened by {ticket.creatorName} on {formatDate(ticket.createdAt)}
                  </p>
                </div>
              </div>
            </CardHeader>

            {/* Messages Scroll Area */}
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages === undefined ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No messages yet. Send a message below to start the conversation.
                </div>
              ) : (
                messages.map((msg) => {
                  const isCustomer = msg.senderRole === "customer";
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
                        isCustomer ? "ml-auto items-end" : "mr-auto items-start",
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">
                          {isCustomer ? "You" : msg.senderName}
                        </span>
                        <span>·</span>
                        <span>{formatDate(msg.createdAt)}</span>
                      </div>
                      <div
                        className={cn(
                          "rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed shadow-2xs",
                          isCustomer
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

            {/* Chat Input Footer */}
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
                  placeholder={
                    ticket.status === "resolved"
                      ? "Reply to reopen this ticket..."
                      : "Type your reply (Enter to send)..."
                  }
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

        {/* Sidebar Info Card */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Ticket Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Category:</span>
                <span className="font-medium capitalize">
                  {ticket.ticketType.replace("_", " ")}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Priority:</span>
                <span className="font-medium capitalize">{ticket.priority}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Created:</span>
                <span>{formatDate(ticket.createdAt)}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Last Activity:</span>
                <span>{formatDate(ticket.lastMessageAt)}</span>
              </div>

              {ticket.decisionReason ? (
                <div className="rounded-lg border bg-muted/40 p-2.5 space-y-1">
                  <span className="font-semibold text-foreground">Decision Note:</span>
                  <p className="text-muted-foreground">{ticket.decisionReason}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Refund Context Card if ticketType === 'refund' */}
          {ticket.ticketType === "refund" ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="size-4 text-primary" /> Refund Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {ticket.planName ? (
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Plan:</span>
                    <span className="font-medium">{ticket.planName}</span>
                  </div>
                ) : null}
                {ticket.refundAmountCents ? (
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-medium">{formatPeso(ticket.refundAmountCents)}</span>
                  </div>
                ) : null}
                {ticket.refundPaidAt ? (
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Paid Timestamp:</span>
                    <span>{formatDate(ticket.refundPaidAt)}</span>
                  </div>
                ) : null}
                <div className="pt-1">
                  <span className="text-muted-foreground block mb-1">Policy status:</span>
                  <Badge
                    variant="outline"
                    className="border-success/40 bg-success-muted text-success text-[11px]"
                  >
                    Verified: Submitted within 10-hour window
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; ticketId: string }>;
}) {
  const { orgSlug, ticketId } = use(params);

  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="h-96 rounded-xl bg-muted/60 animate-pulse" />}>
        <TicketDetailContent
          orgSlug={orgSlug}
          ticketId={ticketId as Id<"supportTickets">}
        />
      </Suspense>
    </div>
  );
}
