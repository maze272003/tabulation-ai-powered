"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { MoreHorizontal, Search, ShieldCheck, ShieldX, UserCheck, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
import { ReasonDialog } from "@/components/platform/ReasonDialog";
import { platformErrorMessage } from "@/components/platform/errors";
import { formatDateTime } from "@/components/platform/format";
import { useDebouncedValue } from "@/components/platform/useDebouncedValue";
import { userStatusLabel, userStatusTone } from "@/components/platform/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type StatusFilter = "all" | "active" | "inactive" | "suspended";
type RowAction =
  | { kind: "suspend"; userId: Id<"userProfiles">; name: string }
  | { kind: "activate"; userId: Id<"userProfiles">; name: string }
  | { kind: "promote"; userId: Id<"userProfiles">; name: string }
  | { kind: "demote"; userId: Id<"userProfiles">; name: string };

export default function PlatformUsersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const search = useDebouncedValue(searchInput.trim().toLowerCase());

  const me = useQuery(api.auth.getCurrentUser, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.platform.users.list,
    {
      search: search || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { initialNumItems: 20 },
  );

  const [action, setAction] = useState<RowAction | null>(null);
  const [busy, setBusy] = useState(false);
  const setStatus = useMutation(api.platform.users.setStatus);
  const setPlatformRole = useMutation(api.platform.users.setPlatformRole);

  const runAction = async (reason: string) => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === "suspend" || action.kind === "activate") {
        await setStatus({
          userId: action.userId,
          status: action.kind === "suspend" ? "suspended" : "active",
          reason,
        });
      } else {
        await setPlatformRole({
          userId: action.userId,
          platformRole: action.kind === "promote" ? "platform_owner" : null,
          reason,
        });
      }
      setAction(null);
      toast.success("Done");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Every account on the platform. Suspended users lose all access.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by email…"
            aria-label="Search users by email"
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
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {status === "LoadingFirstPage" ? (
        <TableSkeleton rows={6} cols={5} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          hint={
            search || statusFilter !== "all"
              ? "Try a different search term or status filter."
              : "Users appear here as they sign up."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Platform role</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((user) => {
                const isSelf = me?._id === user._id;
                const isOwner = user.platformRole === "platform_owner";
                return (
                  <TableRow key={user._id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          {user.image ? <AvatarImage src={user.image} /> : null}
                          <AvatarFallback>
                            {(user.name || user.email).charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {user.name || user.email}
                            {isSelf && <span className="text-muted-foreground"> (you)</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PlatformBadge
                        label={userStatusLabel[user.status]}
                        tone={userStatusTone[user.status]}
                      />
                    </TableCell>
                    <TableCell>
                      {isOwner ? (
                        <PlatformBadge label="Platform owner" tone="info" icon={ShieldCheck} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(user.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Actions for ${user.name || user.email}`}
                          disabled={isSelf}
                          className="inline-flex size-7 items-center justify-center rounded-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                        >
                          <MoreHorizontal aria-hidden className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>
                            {user.name || user.email}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {user.status === "suspended" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                setAction({ kind: "activate", userId: user._id, name: user.name || user.email })
                              }
                            >
                              <UserCheck aria-hidden />
                              Activate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={isOwner}
                              onClick={() =>
                                setAction({ kind: "suspend", userId: user._id, name: user.name || user.email })
                              }
                            >
                              <UserX aria-hidden />
                              Suspend
                            </DropdownMenuItem>
                          )}
                          {isOwner ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                setAction({ kind: "demote", userId: user._id, name: user.name || user.email })
                              }
                            >
                              <ShieldX aria-hidden />
                              Demote from platform owner
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() =>
                                setAction({ kind: "promote", userId: user._id, name: user.name || user.email })
                              }
                            >
                              <ShieldCheck aria-hidden />
                              Promote to platform owner
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
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

      <ReasonDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={
          action?.kind === "suspend"
            ? "Suspend user"
            : action?.kind === "activate"
              ? "Activate user"
              : action?.kind === "promote"
                ? "Promote to platform owner"
                : "Demote from platform owner"
        }
        description={
          action
            ? action.kind === "suspend"
              ? `${action.name} will immediately lose access to the platform.`
              : action.kind === "activate"
                ? `${action.name} will regain platform access.`
                : action.kind === "promote"
                  ? `${action.name} will gain full superadmin control of the platform.`
                  : `${action.name} will lose superadmin access. The last platform owner cannot be demoted.`
            : ""
        }
        confirmLabel={
          action?.kind === "suspend"
            ? "Suspend"
            : action?.kind === "activate"
              ? "Activate"
              : action?.kind === "promote"
                ? "Promote"
                : "Demote"
        }
        busy={busy}
        destructive={action?.kind === "suspend" || action?.kind === "demote"}
        onConfirm={runAction}
      />
    </div>
  );
}
