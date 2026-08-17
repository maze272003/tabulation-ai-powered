"use client";

import { useMemo, useState } from "react";
import { useAction } from "convex/react";
import { Download, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { downloadTextFile, toCsv } from "@/lib/download";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";

interface BulkEntry {
  displayName: string;
  username?: string;
}

interface CreatedAccount {
  accountId: string;
  displayName: string;
  username: string;
  password: string;
}

function parseEntries(text: string): { entries: BulkEntry[]; errors: string[] } {
  const errors: string[] = [];
  const entries: BulkEntry[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (const [i, line] of lines.entries()) {
    const [displayName, username] = line.split(",").map((part) => part.trim());
    if (!displayName) {
      errors.push(`Line ${i + 1}: display name is required.`);
      continue;
    }
    entries.push(username ? { displayName, username } : { displayName });
  }
  return { entries, errors };
}

export function BulkAccountsDialog({
  open,
  onOpenChange,
  orgSlug,
  eventSlug,
  kind,
  eventName,
  eventCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  eventSlug: string;
  kind: "judge" | "staff";
  eventName: string;
  eventCode: string;
}) {
  const bulkCreate = useAction(api.accounts.bulkCreate);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedAccount[] | null>(null);

  const parsed = useMemo(() => parseEntries(text), [text]);
  const canSubmit = !busy && parsed.entries.length > 0 && parsed.errors.length === 0;

  function downloadCredentials() {
    if (!created) return;
    const csv = toCsv(
      ["event", "event_code", "kind", "display_name", "username", "password"],
      created.map((account) => [eventName, eventCode, kind, account.displayName, account.username, account.password]),
    );
    downloadTextFile(`${eventSlug}-${kind}-credentials.csv`, csv);
  }

  async function onCreate() {
    setBusy(true);
    try {
      const result = await bulkCreate({ orgSlug, eventSlug, kind, entries: parsed.entries });
      setCreated(result.accounts);
      toast.success(`Created ${result.accounts.length} ${kind} accounts.`);
    } catch (err) {
      const data = (err as { data?: { message?: string }; message?: string })?.data;
      toast.error(data?.message ?? (err as Error)?.message ?? "Bulk creation failed.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setText("");
    setCreated(null);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Dismissing mid-creation would discard the one-time plaintext passwords.
        if (!next && busy) return;
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk create {kind} accounts</DialogTitle>
          <DialogDescription>
            One account per line: <code className="font-mono text-xs">Display Name</code> or{" "}
            <code className="font-mono text-xs">Display Name, username</code>. Passwords are generated
            automatically and shown once.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="pl-4">Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead className="pr-4">Password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {created.map((account) => (
                    <TableRow key={account.accountId}>
                      <TableCell className="pl-4 font-medium">{account.displayName}</TableCell>
                      <TableCell className="font-mono">{account.username}</TableCell>
                      <TableCell className="pr-4 font-mono">{account.password}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground" role="alert">
              These passwords are shown only once. Download them now and share each credential with its owner.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-accounts-text">Accounts</Label>
              <textarea
                id="bulk-accounts-text"
                className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder={"Judge One\nJudge Two, custom.user"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
              />
            </div>
            {parsed.errors.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
                {parsed.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            {parsed.entries.length > 0 && parsed.errors.length === 0 && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Ready to create {parsed.entries.length} {kind} account{parsed.entries.length === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {created ? (
            <>
              <Button type="button" variant="outline" onClick={downloadCredentials}>
                <Download aria-hidden className="size-4" />
                Download credentials CSV
              </Button>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void onCreate()} disabled={!canSubmit}>
                {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Users aria-hidden className="size-4" />}
                Create {parsed.entries.length > 0 && parsed.errors.length === 0 ? parsed.entries.length : ""}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
