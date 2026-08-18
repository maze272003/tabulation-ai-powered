"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Database,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";

export function DatabaseResetCard() {
  const stats = useQuery(api.reset.getDatabaseStats, {});
  const resetAllMutation = useMutation(api.reset.resetAll);
  const resetEventsMutation = useMutation(api.reset.resetEvents);

  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [resetEventsOpen, setResetEventsOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [preserveUsers, setPreserveUsers] = useState(false);
  const [reseed, setReseed] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleResetAll = async () => {
    setBusy(true);
    try {
      const res = await resetAllMutation({
        confirmation: confirmationInput.trim(),
        preserveUsers,
        reseed,
      });
      toast.success(res.message);
      setResetAllOpen(false);
      setConfirmationInput("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reset database";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleResetEvents = async () => {
    setBusy(true);
    try {
      const res = await resetEventsMutation({
        confirmation: confirmationInput.trim(),
      });
      toast.success(res.message);
      setResetEventsOpen(false);
      setConfirmationInput("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reset events";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Database aria-hidden className="size-4" />
                Database Maintenance & Cleanup
              </CardTitle>
              <CardDescription>
                Clean up or purge database records for development, staging, or maintenance.
              </CardDescription>
            </div>
            {stats !== undefined && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono font-medium text-muted-foreground">
                {stats.totalDocuments} total records
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {stats && (
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 md:grid-cols-6">
              <div className="rounded border bg-muted/40 p-2 text-center">
                <div className="text-muted-foreground">Events</div>
                <div className="text-base font-semibold">{stats.tableCounts.events ?? 0}</div>
              </div>
              <div className="rounded border bg-muted/40 p-2 text-center">
                <div className="text-muted-foreground">Contestants</div>
                <div className="text-base font-semibold">{stats.tableCounts.contestants ?? 0}</div>
              </div>
              <div className="rounded border bg-muted/40 p-2 text-center">
                <div className="text-muted-foreground">Score Sheets</div>
                <div className="text-base font-semibold">{stats.tableCounts.scoreSheets ?? 0}</div>
              </div>
              <div className="rounded border bg-muted/40 p-2 text-center">
                <div className="text-muted-foreground">Orgs</div>
                <div className="text-base font-semibold">{stats.tableCounts.organizations ?? 0}</div>
              </div>
              <div className="rounded border bg-muted/40 p-2 text-center">
                <div className="text-muted-foreground">Users</div>
                <div className="text-base font-semibold">{stats.tableCounts.userProfiles ?? 0}</div>
              </div>
              <div className="rounded border bg-muted/40 p-2 text-center">
                <div className="text-muted-foreground">Audit Logs</div>
                <div className="text-base font-semibold">{stats.tableCounts.auditLogs ?? 0}</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => {
                setConfirmationInput("");
                setResetEventsOpen(true);
              }}
            >
              <Trash2 aria-hidden className="mr-1.5 size-4" />
              Reset All Events & Scores
            </Button>

            <Button
              variant="destructive"
              onClick={() => {
                setConfirmationInput("");
                setResetAllOpen(true);
              }}
            >
              <AlertTriangle aria-hidden className="mr-1.5 size-4" />
              Full Database Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reset Events Dialog */}
      <ConfirmDialog
        open={resetEventsOpen}
        onOpenChange={(open) => {
          setResetEventsOpen(open);
          if (!open) setConfirmationInput("");
        }}
        title="Reset All Events and Scoring Data"
        description="This will permanently delete all events, categories, rounds, criteria, contestants, scores, score sheets, results, and judge accounts across the platform. Organizations, user accounts, plans, and subscriptions will be preserved."
        confirmLabel="Reset Events"
        busy={busy}
        destructive
        confirmDisabled={confirmationInput.trim() !== "CONFIRM_RESET_EVENTS"}
        onConfirm={handleResetEvents}
      >
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Type <strong className="font-mono text-foreground">CONFIRM_RESET_EVENTS</strong> to confirm:
          </p>
          <Input
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
            placeholder="CONFIRM_RESET_EVENTS"
            className="font-mono text-xs"
            autoFocus
          />
        </div>
      </ConfirmDialog>

      {/* Full Reset Dialog */}
      <ConfirmDialog
        open={resetAllOpen}
        onOpenChange={(open) => {
          setResetAllOpen(open);
          if (!open) setConfirmationInput("");
        }}
        title="Full Database Reset"
        description="This will wipe all data across all tables. Standard system reference data (plans, roles, permissions, system templates) will automatically be re-seeded so the platform remains ready for use."
        confirmLabel="Wipe Database"
        busy={busy}
        destructive
        confirmDisabled={confirmationInput.trim() !== "CONFIRM_RESET_ALL"}
        onConfirm={handleResetAll}
      >
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={preserveUsers}
                onChange={(e) => setPreserveUsers(e.target.checked)}
                className="size-4 accent-foreground"
              />
              <span>Preserve user profiles (keep user logins intact)</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={reseed}
                onChange={(e) => setReseed(e.target.checked)}
                className="size-4 accent-foreground"
              />
              <span>Re-seed system reference data (roles, permissions, plans, templates)</span>
            </label>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Type <strong className="font-mono text-foreground">CONFIRM_RESET_ALL</strong> to confirm:
            </p>
            <Input
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder="CONFIRM_RESET_ALL"
              className="font-mono text-xs"
              autoFocus
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
