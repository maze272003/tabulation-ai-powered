"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
import { Input } from "@/components/ui/input";

/**
 * ConfirmDialog variant for administrative actions whose reason is recorded
 * in the audit log. The server rejects empty reasons; the dialog enforces the
 * same rule client-side so the user gets immediate feedback.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy = false,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setReason("");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      busy={busy}
      destructive={destructive}
      onConfirm={() => onConfirm(reason.trim())}
      confirmDisabled={!reason.trim()}
    >
      <Input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (recorded in the audit log)"
        aria-label="Reason"
        autoFocus
      />
    </ConfirmDialog>
  );
}
