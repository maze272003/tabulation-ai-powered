"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { formatDateTime } from "@/components/platform/format";
import { Button } from "@/components/ui/button";
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

type ChannelFilter = "all" | "platform";

export default function SentryAuditPage() {
  const { token } = useSentrySession();
  const [channel, setChannel] = useState<ChannelFilter>("all");

  const { results, status, loadMore } = usePaginatedQuery(
    api.superadmin.audit.list,
    token
      ? {
          token,
          orgId: channel === "all" ? undefined : null,
        }
      : "skip",
    { initialNumItems: 30 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          icon={ScrollText}
          title="Audit log"
          description="Every administrative action across the platform, newest first."
        />
        <Select
          value={channel}
          onValueChange={(value) => setChannel((value as ChannelFilter) ?? "all")}
        >
          <SelectTrigger className="w-44" aria-label="Filter by channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="platform">Platform channel only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {status === "LoadingFirstPage" ? (
        <TableSkeleton rows={8} cols={5} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries"
          hint="Administrative actions appear here as they happen."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((entry) => (
                <TableRow key={entry._id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(entry._creationTime)}
                  </TableCell>
                  <TableCell>
                    <p className="font-mono text-xs">{entry.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.resourceType}
                      {entry.orgId ? " · org-scoped" : " · platform"}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.actorName ?? "System"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {entry.reason ?? "—"}
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
                onClick={() => loadMore(30)}
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