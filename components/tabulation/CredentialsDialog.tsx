"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check,
  Copy,
  KeyRound,
  ShieldAlert,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export interface CredentialsData {
  eventName?: string;
  eventCode: string;
  displayName: string;
  username: string;
  password?: string;
  kind: "judge" | "staff";
  isReset?: boolean;
}

export function CredentialsDialog({
  data,
  open,
  onOpenChange,
}: {
  data: CredentialsData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  if (!data) return null;

  const { eventName, eventCode, displayName, username, password, kind, isReset } = data;

  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/sign-in` : "/sign-in";
  const directLink = typeof window !== "undefined" 
    ? `${window.location.origin}/sign-in?code=${eventCode}&username=${username}`
    : `/sign-in?code=${eventCode}&username=${username}`;

  async function copyToClipboard(text: string, fieldName: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast.success(`${fieldName} copied to clipboard!`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  }

  async function copyAllDetails() {
    const formatted = [
      `--- ${eventName || "Event"} Access Details ---`,
      `Role: ${kind === "judge" ? "Judge" : "Event Staff"}`,
      `Name: ${displayName}`,
      `Sign-In URL: ${portalUrl}`,
      `Event Code: ${eventCode}`,
      `Username: ${username}`,
      password ? `Temporary Password: ${password}` : "",
      `Direct Link: ${directLink}`,
      "------------------------------------------",
    ]
      .filter(Boolean)
      .join("\n");

    await copyToClipboard(formatted, "Complete access details");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                {isReset ? "Password Reset Successfully" : "Account Credentials Created"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isReset
                  ? `New login credentials generated for ${displayName}.`
                  : `New ${kind} account created for ${displayName}.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Warning Callout */}
        <div className="p-3 rounded-lg bg-warning-muted border border-warning/30 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <span>
            <strong>Important:</strong> Passwords are encrypted and cannot be viewed again once this modal is closed. Copy these credentials now to share with the account holder.
          </span>
        </div>

        {/* Credentials Form Box */}
        <div className="space-y-4 py-2 text-xs">
          {/* Event Code */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground font-medium">Event Code</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={eventCode}
                className="font-mono font-bold tracking-widest text-sm uppercase bg-muted/40 h-9"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={() => copyToClipboard(eventCode, "Event code")}
              >
                {copiedField === "Event code" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground font-medium">Username</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={username}
                className="font-mono font-semibold text-sm bg-muted/40 h-9"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={() => copyToClipboard(username, "Username")}
              >
                {copiedField === "Username" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Password (if provided) */}
          {password && (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-medium">Temporary Password</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    readOnly
                    type={showPassword ? "text" : "password"}
                    value={password}
                    className="font-mono font-semibold text-sm bg-muted/40 pr-9 h-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 shrink-0"
                  onClick={() => copyToClipboard(password, "Password")}
                >
                  {copiedField === "Password" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between items-center pt-2 border-t border-border/50">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyAllDetails}
            className="w-full sm:w-auto gap-1.5 h-9 font-medium"
          >
            {copiedField === "Complete access details" ? (
              <>
                <Check className="w-4 h-4 text-success" />
                <span>Copied All!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Copy All Details</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto h-9 font-semibold"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
