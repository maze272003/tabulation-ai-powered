"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  ArrowRight,
  Clock,
  HelpCircle,
  LifeBuoy,
  MessageSquare,
  Receipt,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wrench,
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

const TICKET_TYPE_MAP: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  refund: { label: "Refund", icon: Receipt },
  general_support: { label: "General", icon: HelpCircle },
  billing_issue: { label: "Billing", icon: AlertCircle },
  technical: { label: "Technical", icon: Wrench },
};

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

function formatPeso(cents: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export default function SuperadminSupportPage() {
  const { token } = useSentrySession();

  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const metrics = useQuery(api.superadmin.tickets.getSupportMetrics, token ? { token } : "skip");
  const ticketsResult = useQuery(
    api.superadmin.tickets.listAll,
    token
      ? {
          token,
          paginationOpts: { numItems: 100, cursor: null },
          status:
            filterStatus !== "all"
              ? (filterStatus as "pending" | "in_review" | "approved" | "rejected" | "resolved")
              : undefined,
          ticketType:
            filterType !== "all"
              ? (filterType as "refund" | "general_support" | "billing_issue" | "technical")
              : undefined,
          search: search.trim() || undefined,
        }
      : "skip",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LifeBuoy}
        title="Customer Support & Refund Tickets"
        description="Manage customer inquiries, review refund requests, and chat in real time with organizations."
      />

      {/* Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Pending Refunds</span>
            <Receipt className="size-4 text-warning" />
          </div>
          <p className="mt-2 text-2xl font-bold font-heading text-warning">
            {metrics?.pendingRefunds ?? 0}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">10-hour policy requests</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Open Tickets</span>
            <AlertCircle className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold font-heading">{metrics?.openTickets ?? 0}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Requiring attention</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">In Review</span>
            <Clock className="size-4 text-info" />
          </div>
          <p className="mt-2 text-2xl font-bold font-heading text-info">
            {metrics?.inReview ?? 0}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Being handled</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Unread Customer Chats</span>
            <MessageSquare className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold font-heading text-primary">
            {metrics?.unreadChats ?? 0}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">New customer replies</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Resolved Total</span>
            <ShieldCheck className="size-4 text-success" />
          </div>
          <p className="mt-2 text-2xl font-bold font-heading text-success">
            {metrics?.resolvedTotal ?? 0}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Completed tickets</p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3 w-full">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search subject, organization, customer email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>

            <Select value={filterType} onValueChange={(val) => { if (val) setFilterType(val); }}>
              <SelectTrigger className="h-9 w-40 text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
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
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg">All Tickets</CardTitle>
          <CardDescription>
            Click any ticket to open the resolution center, inspect payment details, and reply in real time.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {ticketsResult === undefined ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : ticketsResult.page.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <LifeBuoy className="size-8 mx-auto mb-2 opacity-30" />
              No tickets found matching your query.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">ID</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Organization / User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ticketsResult.page.map((ticket) => {
                  const typeInfo = TICKET_TYPE_MAP[ticket.ticketType] ?? {
                    label: "General",
                    icon: HelpCircle,
                  };
                  const statusInfo = TICKET_STATUS_MAP[ticket.status] ?? {
                    label: ticket.status,
                    tone: "bg-muted text-muted-foreground",
                  };
                  const TypeIcon = typeInfo.icon;

                  return (
                    <TableRow key={ticket._id}>
                      <TableCell className="font-mono text-xs text-muted-foreground font-semibold">
                        #{ticket._id.slice(-6).toUpperCase()}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="space-y-0.5">
                          <Link
                            href={`/sentry/support/${ticket._id}`}
                            className="font-medium text-foreground hover:underline text-xs flex items-center gap-1.5"
                          >
                            <span className="truncate">{ticket.subject}</span>
                            {ticket.unreadAdminCount > 0 ? (
                              <Badge className="bg-primary text-primary-foreground text-[10px] h-4 px-1 shrink-0">
                                {ticket.unreadAdminCount} new
                              </Badge>
                            ) : null}
                          </Link>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {ticket.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p className="font-medium text-foreground">{ticket.orgName}</p>
                          <p className="text-[11px] text-muted-foreground">{ticket.creatorEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex items-center gap-1 text-xs">
                          <TypeIcon className="size-3.5 text-muted-foreground" />
                          <span>{typeInfo.label}</span>
                          {ticket.refundAmountCents ? (
                            <span className="text-[10px] text-muted-foreground font-semibold">
                              ({formatPeso(ticket.refundAmountCents)})
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs capitalize font-medium">{ticket.priority}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("border capitalize text-[11px]", statusInfo.tone)}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(ticket.lastMessageAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/sentry/support/${ticket._id}`}>
                          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                            View <ArrowRight className="size-3.5" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
