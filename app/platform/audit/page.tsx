"use client";

import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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

/**
 * Scope filter value encoding. Select values must be non-empty strings, so
 * the two sentinel scopes ("all" and "platform") are mapped to the query's
 * `orgId` argument (undefined = everything, null = platform channel only).
 */
type ScopeValue = "all" | "platform" | `org:${string}`;

function scopeToOrgId(scope: ScopeValue): Id<"organizations"> | null | undefined {
  if (scope === "all") return undefined;
  if (scope === "platform") return null;
  return scope.slice("org:".length) as Id<"organizations">;
}

export default function PlatformAuditPage() {
  const [scope, setScope] = useState<ScopeValue>("all");
  const orgOptions = useQuery(api.platform.orgs.options, {});

  const { results, status, loadMore } = usePaginatedQuery(
    api.platform.audit.list,
    { orgId: scopeToOrgId(scope) },
    { initialNumItems: 25 },
  );

  const orgNameById = new Map(orgOptions?.map((org) => [org._id, org.name]) ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ScrollText}
        title="Audit log"
        description="Every administrative and organizational action, newest first."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={scope} onValueChange={(value) => setScope((value as ScopeValue) ?? "all")}>
          <SelectTrigger className="w-64" aria-label="Filter by scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="platform">Platform channel only</SelectItem>
            {orgOptions?.map((org) => (
              <SelectItem key={org._id} value={`org:${org._id}`}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {status === "LoadingFirstPage" ? (
        <TableSkeleton rows={8} cols={5} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries"
          hint="Actions across the platform will be recorded here."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((entry) => (
                <TableRow key={entry._id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(entry._creationTime)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                  <TableCell>{entry.actorName ?? "System"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.orgId === null ? (
                      "Platform"
                    ) : (
                      orgNameById.get(entry.orgId) ?? "Unknown org"
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
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
                onClick={() => loadMore(25)}
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
