"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { Building2, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
import { useDebouncedValue } from "@/components/platform/useDebouncedValue";
import { formatDate } from "@/components/platform/format";
import {
  orgStatusLabel,
  orgStatusTone,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from "@/components/platform/status";
import { Button } from "@/components/ui/button";
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
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { PageHeader } from "@/components/PageHeader";

type StatusFilter = "all" | "active" | "suspended";

export default function PlatformOrganizationsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const search = useDebouncedValue(searchInput.trim().toLowerCase());

  const { results, status, loadMore } = usePaginatedQuery(
    api.platform.orgs.list,
    {
      search: search || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { initialNumItems: 20 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description="Every tenant on the platform. Suspend to revoke member access."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by slug…"
            aria-label="Search organizations by slug"
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter((value as StatusFilter) ?? "all")}
        >
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {status === "LoadingFirstPage" ? (
        <TableSkeleton rows={6} cols={5} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations found"
          hint={
            search || statusFilter !== "all"
              ? "Try a different search term or status filter."
              : "Organizations appear here as users sign up."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => (
                <TableRow key={row.org._id}>
                  <TableCell>
                    <Link
                      href={`/platform/organizations/${row.org._id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.org.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.org.slug}</p>
                  </TableCell>
                  <TableCell>
                    <PlatformBadge
                      label={orgStatusLabel[row.org.status]}
                      tone={orgStatusTone[row.org.status]}
                    />
                  </TableCell>
                  <TableCell>{row.planName ?? "—"}</TableCell>
                  <TableCell>
                    {row.subscriptionStatus ? (
                      <PlatformBadge
                        label={subscriptionStatusLabel[row.subscriptionStatus]}
                        tone={subscriptionStatusTone[row.subscriptionStatus]}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDate(row.org._creationTime)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(status === "CanLoadMore" || status === "LoadingMore") && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                disabled={status === "LoadingMore"}
                onClick={() => loadMore(20)}
              >
                {status === "LoadingMore" ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
