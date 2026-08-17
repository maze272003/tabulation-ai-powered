"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { parseContestantCsv } from "@/lib/csv";
import { toastMutationError } from "@/lib/convex-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function ImportContestantsDialog({
  open,
  onOpenChange,
  orgSlug,
  eventSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  eventSlug: string;
}) {
  const bulkAdd = useMutation(api.contestants.bulkAdd);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseContestantCsv(text), [text]);
  const canSubmit = !busy && parsed.rows.length > 0 && parsed.errors.length === 0;

  async function onFileSelected(file: File) {
    try {
      const content = await file.text();
      setText(content);
    } catch {
      toast.error("Failed to read the selected file.");
    }
  }

  async function onImport() {
    setBusy(true);
    try {
      const result = await bulkAdd({ orgSlug, eventSlug, rows: parsed.rows });
      toast.success(`Imported ${result.added} contestant${result.added === 1 ? "" : "s"}.`);
      setText("");
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err, {
        codeMessages: { LIMIT_EXCEEDED: "Import exceeds your plan's contestant limit." },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import contestants</DialogTitle>
          <DialogDescription>
            CSV with header <code className="font-mono text-xs">number,name,category,group</code> (group optional).
            Category names must match this event&apos;s categories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="contestant-csv-file">Upload CSV file</Label>
            <input
              ref={fileInputRef}
              id="contestant-csv-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFileSelected(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <FileUp aria-hidden className="size-4" />
              Choose file
            </Button>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="contestant-csv-text">Or paste CSV content</Label>
            <textarea
              id="contestant-csv-text"
              className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder={"number,name,category,group\n1,Maria Santos,Open,Group A"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
            />
          </div>

          {parsed.errors.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
              {parsed.errors.slice(0, 10).map((error) => (
                <li key={`${error.rowIndex}-${error.message}`}>
                  {error.rowIndex > 0 ? `Line ${error.rowIndex}: ` : ""}
                  {error.message}
                </li>
              ))}
              {parsed.errors.length > 10 && <li>…and {parsed.errors.length - 10} more</li>}
            </ul>
          )}

          {parsed.rows.length > 0 && parsed.errors.length === 0 && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Ready to import {parsed.rows.length} contestant{parsed.rows.length === 1 ? "" : "s"}
              {parsed.rows[0]?.group !== undefined ? " (groups included)" : ""}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onImport()} disabled={!canSubmit}>
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Upload aria-hidden className="size-4" />}
            Import {parsed.rows.length > 0 && parsed.errors.length === 0 ? parsed.rows.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
