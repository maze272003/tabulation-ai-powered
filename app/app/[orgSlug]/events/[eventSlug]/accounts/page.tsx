"use client";

import { use, useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CredentialsDialog,
} from "@/components/tabulation/CredentialsDialog";
import { BulkAccountsDialog } from "@/components/tabulation/BulkAccountsDialog";
import {
  Users,
  UserPlus,
  ShieldCheck,
  KeyRound,
  Trash2,
  Lock,
  Unlock,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface AccountItem {
  _id: Id<"eventAccounts">;
  kind: "judge" | "staff";
  displayName: string;
  username: string;
  status: "active" | "disabled";
  lockedUntil: number | null;
  failedAttempts?: number;
  activeSessionsCount?: number;
  assignments?: { _id: Id<"judgeAssignments">; roundId?: Id<"rounds">; criterionId?: Id<"criteria"> }[];
}

interface CredentialsData {
  eventName: string;
  eventCode: string;
  displayName: string;
  username: string;
  password?: string;
  kind: "judge" | "staff";
  isReset?: boolean;
}

export default function EventAccountsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);

  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const rawAccounts = useQuery(api.accounts.list, { orgSlug, eventSlug });
  const sub = useQuery(api.subscriptions.getForOrg, { orgSlug });

  const createAccountAction = useAction(api.accounts.create);
  const resetPasswordAction = useAction(api.accounts.resetPassword);
  const disableAccountMutation = useMutation(api.accounts.disable);
  const enableAccountMutation = useMutation(api.accounts.enable);
  const deleteAccountMutation = useMutation(api.accounts.deleteAccount);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [credentialsData, setCredentialsData] = useState<CredentialsData | null>(null);

  // Form state
  const [role, setRole] = useState<"judge" | "staff">("judge");
  const [displayName, setDisplayName] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [customUsername, setCustomUsername] = useState("");
  const [customPassword, setCustomPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Action state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<{ id: Id<"eventAccounts">; name: string } | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Read the clock outside of render and refresh it periodically so that
  // temporary account locks expire visually without a manual reload.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNowMs(Date.now());
    const frame = requestAnimationFrame(update);
    const clock = window.setInterval(update, 30_000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(clock);
    };
  }, []);

  if (ev === undefined || rawAccounts === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading accounts...</p>
      </div>
    );
  }

  if (ev === null) {
    return <div>Event not found.</div>;
  }

  const currentEvent = ev;
  const accounts = rawAccounts as AccountItem[];
  const judgesCount = accounts.filter((a: AccountItem) => a.kind === "judge").length;
  const staffCount = accounts.filter((a: AccountItem) => a.kind === "staff").length;
  const maxJudges = sub?.plan?.limits?.maxJudges ?? 5;
  const isJudgeLimitReached = judgesCount >= maxJudges;

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("Please provide a display name.");
      return;
    }
    if (!autoGenerate) {
      if (!customUsername.trim()) {
        toast.error("Please provide a username.");
        return;
      }
      if (!customPassword || customPassword.length < 6) {
        toast.error("Password must be at least 6 characters.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const result = await createAccountAction({
        orgSlug,
        eventSlug,
        kind: role,
        displayName: displayName.trim(),
        username: autoGenerate ? undefined : customUsername.trim().toLowerCase(),
        password: autoGenerate ? undefined : customPassword,
      });

      setCredentialsData({
        eventName: currentEvent.name,
        eventCode: currentEvent.eventCode,
        displayName: displayName.trim(),
        username: result.username,
        password: result.password,
        kind: role,
        isReset: false,
      });

      setCreateModalOpen(false);
      setCredentialsModalOpen(true);
      toast.success(`${role === "judge" ? "Judge" : "Staff"} account created successfully.`);

      // Reset form
      setDisplayName("");
      setCustomUsername("");
      setCustomPassword("");
      setAutoGenerate(true);
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to create account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword(account: { _id: Id<"eventAccounts">; displayName: string; username: string; kind: "judge" | "staff" }) {
    setActionInProgressId(account._id);
    try {
      const result = await resetPasswordAction({
        orgSlug,
        eventSlug,
        accountId: account._id,
      });

      setCredentialsData({
        eventName: currentEvent.name,
        eventCode: currentEvent.eventCode,
        displayName: account.displayName,
        username: account.username,
        password: result.password,
        kind: account.kind,
        isReset: true,
      });

      setCredentialsModalOpen(true);
      toast.success(`Password reset for ${account.displayName}.`);
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to reset password.");
    } finally {
      setActionInProgressId(null);
    }
  }

  async function handleToggleDisable(account: { _id: Id<"eventAccounts">; disabledAt?: number }) {
    setActionInProgressId(account._id);
    try {
      if (account.disabledAt) {
        await enableAccountMutation({ orgSlug, eventSlug, accountId: account._id });
        toast.success("Account enabled.");
      } else {
        await disableAccountMutation({ orgSlug, eventSlug, accountId: account._id });
        toast.success("Account disabled. Active sessions revoked.");
      }
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to update account status.");
    } finally {
      setActionInProgressId(null);
    }
  }

  async function handleDeleteAccount() {
    if (!accountToDelete) return;
    setActionInProgressId(accountToDelete.id);
    try {
      await deleteAccountMutation({ orgSlug, eventSlug, accountId: accountToDelete.id });
      toast.success("Account deleted.");
      setDeleteConfirmOpen(false);
      setAccountToDelete(null);
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to delete account.");
    } finally {
      setActionInProgressId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Event Access & Accounts</h2>
          <p className="text-xs text-muted-foreground">
            Manage authentication accounts for Judges and Event Staff.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setBulkDialogOpen(true)}
            className="gap-1.5 h-9 font-medium"
          >
            <Users className="w-4 h-4" />
            <span>Bulk Create</span>
          </Button>
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="gap-1.5 h-9 font-semibold shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create Account</span>
          </Button>
        </div>
      </div>

      {/* Quota & Usage Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/60 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium">Judges Assigned</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-foreground">{judgesCount}</span>
                <span className="text-xs text-muted-foreground">/ {maxJudges} limit</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium">Staff Accounts</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-foreground">{staffCount}</span>
                <span className="text-xs text-muted-foreground">unlimited</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium">Active Event Code</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono font-bold text-lg tracking-wider text-primary">
                  {ev.eventCode}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accounts List Table */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/20">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span>Event Accounts</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Credentials generated for this event. Passwords are hashed with PBKDF2-SHA256 and a per-account salt.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          {accounts.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-base">No Accounts Created Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Create Judge and Staff accounts to enable secure scoring entry through the Event Code sign-in portal.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateModalOpen(true)}
                className="gap-1.5 mt-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create First Account</span>
              </Button>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground font-semibold">
                  <th className="text-left py-3 px-4">Role</th>
                  <th className="text-left py-3 px-4">Display Name</th>
                  <th className="text-left py-3 px-4">Username</th>
                  <th className="text-center py-3 px-3">Status</th>
                  <th className="text-center py-3 px-3">Active Sessions</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {accounts.map((acc: AccountItem) => {
                  const isActing = actionInProgressId === acc._id;
                  const isLocked = acc.lockedUntil !== null && nowMs !== null && acc.lockedUntil > nowMs;
                  const isDisabled = acc.status === "disabled";

                  return (
                    <tr key={acc._id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <Badge
                          variant={acc.kind === "staff" ? "default" : "secondary"}
                          className="capitalize text-2xs font-semibold"
                        >
                          {acc.kind}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {acc.displayName}
                      </td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">
                        {acc.username}
                      </td>
                      <td className="text-center py-3 px-3">
                        {isDisabled ? (
                          <Badge variant="destructive" className="text-2xs">
                            Disabled
                          </Badge>
                        ) : isLocked ? (
                          <Badge variant="outline" className="text-2xs text-amber-600 border-amber-500/40">
                            Locked Out
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-2xs text-emerald-600 border-emerald-500/40">
                            Active
                          </Badge>
                        )}
                      </td>
                      <td className="text-center py-3 px-3 font-mono text-muted-foreground">
                        {acc.activeSessionsCount ?? 0}
                      </td>
                      <td className="text-right py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => handleResetPassword(acc)}
                            disabled={isActing}
                            className="gap-1 text-2xs h-7"
                            title="Reset password and generate new credentials"
                          >
                            <RefreshCw className={`w-3 h-3 ${isActing ? "animate-spin" : ""}`} />
                            <span>Reset Password</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleToggleDisable(acc)}
                            disabled={isActing}
                            className={`h-7 px-2 ${isDisabled ? "text-emerald-600 hover:text-emerald-700" : "text-muted-foreground hover:text-foreground"}`}
                            title={isDisabled ? "Enable account" : "Disable account and revoke sessions"}
                          >
                            {isDisabled ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </Button>

                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setAccountToDelete({ id: acc._id, name: acc.displayName });
                              setDeleteConfirmOpen(true);
                            }}
                            disabled={isActing}
                            className="h-7 px-2 text-destructive hover:bg-destructive/10"
                            title="Delete account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create Account Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Event Account</DialogTitle>
            <DialogDescription className="text-xs">
              Generate credentials for a Judge or Event Staff member.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAccount} className="space-y-4 py-2 text-xs">
            {/* Role Selection */}
            <div className="space-y-1.5">
              <Label className="font-semibold text-muted-foreground">Account Role</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("judge")}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                    role === "judge"
                      ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/30"
                      : "border-border/60 hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <Users className="w-4 h-4 text-primary" />
                    <span>Judge</span>
                  </div>
                  <span className="text-2xs text-muted-foreground mt-0.5">
                    Assigned to score contestant sheets.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("staff")}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                    role === "staff"
                      ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/30"
                      : "border-border/60 hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>Event Staff</span>
                  </div>
                  <span className="text-2xs text-muted-foreground mt-0.5">
                    Live monitor, review, ties & publishing.
                  </span>
                </button>
              </div>

              {role === "judge" && isJudgeLimitReached && (
                <p className="text-2xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Judge limit reached ({maxJudges} max on your current tier).</span>
                </p>
              )}
            </div>

            {/* Display Name */}
            <div className="space-y-1.5">
              <Label htmlFor="displayName" className="font-semibold text-muted-foreground">
                Display Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sarah Jenkins or Judge 1"
                className="h-9"
                required
              />
            </div>

            {/* Auto Generate Toggle */}
            <div className="space-y-3 pt-2 border-t border-border/40">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoGenerate}
                  onChange={(e) => setAutoGenerate(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="font-semibold text-foreground">
                  Auto-generate secure username and password
                </span>
              </label>

              {!autoGenerate && (
                <div className="space-y-3 pl-5 border-l-2 border-primary/40">
                  <div className="space-y-1.5">
                    <Label htmlFor="customUsername" className="text-muted-foreground">
                      Username
                    </Label>
                    <Input
                      id="customUsername"
                      value={customUsername}
                      onChange={(e) => setCustomUsername(e.target.value)}
                      placeholder="e.g. judge1"
                      className="font-mono h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="customPassword" className="text-muted-foreground">
                      Password (min 6 chars)
                    </Label>
                    <Input
                      id="customPassword"
                      type="password"
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="••••••••"
                      className="font-mono h-9 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border/40">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={isSubmitting || (role === "judge" && isJudgeLimitReached)}
                className="gap-2 font-semibold"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Create Account</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Event Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete the account for{" "}
              <span className="font-semibold text-foreground">{accountToDelete?.name}</span>?
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs text-muted-foreground py-2 border-y border-border/50">
            This will immediately revoke all sessions and delete the account record. If this judge has submitted score sheets, their submitted records remain preserved.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={Boolean(actionInProgressId)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={Boolean(actionInProgressId)}
              className="gap-2"
            >
              {actionInProgressId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>Delete Account</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Share Dialog */}
      <CredentialsDialog
        data={credentialsData}
        open={credentialsModalOpen}
        onOpenChange={setCredentialsModalOpen}
      />

      <BulkAccountsDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        kind="judge"
        eventName={currentEvent.name}
        eventCode={currentEvent.eventCode}
      />
    </div>
  );
}
