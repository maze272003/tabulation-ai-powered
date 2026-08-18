"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Copy,
  Check,
  RefreshCw,
  KeyRound,
  ExternalLink,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function EventSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const update = useMutation(api.events.update);
  const regenerateCodeMutation = useMutation(api.events.regenerateCode);

  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [dropHighLow, setDropHighLow] = useState(false);
  const [elimination, setElimination] = useState(true);
  const [prevKey, setPrevKey] = useState<string | null>(null);

  // Event code actions
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  if (ev !== undefined && ev !== null && prevKey !== ev._id) {
    setPrevKey(ev._id);
    setName(ev.name);
    setVenue(ev.venue ?? "");
    setDropHighLow(ev.scoringRules.dropHighLow);
    setElimination(ev.eliminationEnabled);
  }

  if (ev === undefined) return <LoadingScreen label="Loading settings…" />;
  if (ev === null) return <LoadingScreen label="Event not found." />;

  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/sign-in` : "/sign-in";
  const codeDirectUrl = typeof window !== "undefined"
    ? `${window.location.origin}/sign-in?code=${ev.eventCode}`
    : `/sign-in?code=${ev.eventCode}`;

  const save = async (patch: Record<string, unknown>) => {
    try {
      await update({ orgSlug, eventSlug, ...patch });
      toast.success("Saved.");
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      toast.error(
        data?.code === "CONFLICT" ? "Configuration is locked." : data?.message ?? "Could not save.",
      );
    }
  };

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(ev?.eventCode ?? "");
      setCopiedCode(true);
      toast.success("Event code copied to clipboard!");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("Failed to copy event code.");
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(codeDirectUrl);
      setCopiedLink(true);
      toast.success("Sign-in link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Failed to copy link.");
    }
  }

  async function handleRegenerateCode() {
    setIsRegenerating(true);
    try {
      const newCode = await regenerateCodeMutation({ orgSlug, eventSlug });
      toast.success(`Event code updated to ${newCode}`);
      setRegenerateConfirmOpen(false);
    } catch (err: unknown) {
      const convexErr = err as { data?: { message?: string }; message?: string };
      toast.error(convexErr?.data?.message || convexErr?.message || "Failed to regenerate event code.");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Event Access Code Section */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <span>Event Access Code</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Unique 6-character code used by judges and staff to sign in without email invitations.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              Live Code
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border/60">
            <div className="space-y-1">
              <span className="text-2xs uppercase font-semibold text-muted-foreground tracking-wider block">
                Current Access Code
              </span>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-black font-mono tracking-widest text-primary">
                  {ev.eventCode}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCode}
                  className="gap-1.5 h-8 text-xs font-medium"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? "Copied" : "Copy Code"}</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="gap-1.5 h-9 text-xs font-medium"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-success" /> : <ExternalLink className="w-3.5 h-3.5" />}
                <span>Copy Sign-In Link</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegenerateConfirmOpen(true)}
                className="gap-1.5 h-9 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Regenerate Code</span>
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground flex items-center justify-between pt-1">
            <span>Direct judges and staff to <strong className="text-foreground">{portalUrl}</strong> to enter their credentials.</span>
            <Link
              href={`/app/${orgSlug}/events/${eventSlug}/accounts`}
              className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0 text-xs")}
            >
              Manage Accounts &rarr;
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* General Settings Section */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/20">
          <CardTitle className="text-base font-semibold">General Settings</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-name">Event Name</Label>
            <div className="flex gap-2">
              <Input
                id="event-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={ev.status !== "draft"}
              />
              <Button
                disabled={ev.status !== "draft" || !name || name === ev.name}
                onClick={() => save({ name, venue })}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="venue">Venue / Location</Label>
            <div className="flex gap-2">
              <Input
                id="venue"
                value={venue}
                placeholder="Venue"
                onChange={(e) => setVenue(e.target.value)}
                disabled={ev.status !== "draft"}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scoring Configuration */}
      {ev.status === "draft" && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/20">
            <CardTitle className="text-base font-semibold">Scoring Rules</CardTitle>
            <CardDescription className="text-xs">
              Tabulation math and round advancement behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-3">
              <Label className="flex items-center gap-2 font-normal cursor-pointer">
                <input
                  type="checkbox"
                  checked={dropHighLow}
                  onChange={(e) => setDropHighLow(e.target.checked)}
                  className="rounded border-border"
                />
                <div>
                  <span className="font-semibold block">Drop highest and lowest judge scores</span>
                  <span className="text-xs text-muted-foreground block">
                    Applies automatically when 3 or more judges score a contestant on any criterion.
                  </span>
                </div>
              </Label>

              <Label className="flex items-center gap-2 font-normal cursor-pointer">
                <input
                  type="checkbox"
                  checked={elimination}
                  onChange={(e) => setElimination(e.target.checked)}
                  className="rounded border-border"
                />
                <div>
                  <span className="font-semibold block">Elimination rounds enabled</span>
                  <span className="text-xs text-muted-foreground block">
                    Displays cutlines and manual override controls on the Rounds review page.
                  </span>
                </div>
              </Label>
            </div>

            <Button
              size="sm"
              variant="outline"
              disabled={
                dropHighLow === ev.scoringRules.dropHighLow &&
                elimination === ev.eliminationEnabled
              }
              onClick={() => save({ scoringRules: { dropHighLow }, eliminationEnabled: elimination })}
            >
              Save scoring settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Regenerate Code Confirmation Modal */}
      <Dialog open={regenerateConfirmOpen} onOpenChange={setRegenerateConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerate Event Code</DialogTitle>
            <DialogDescription>
              Are you sure you want to generate a new 6-character access code for <strong className="text-foreground">{ev.name}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-lg bg-warning-muted border border-warning/30 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
            <span>
              Generating a new code will immediately invalidate the previous code (<strong className="font-mono">{ev.eventCode}</strong>). Judges and staff must use the new code for subsequent logins.
            </span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRegenerateConfirmOpen(false)}
              disabled={isRegenerating}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleRegenerateCode}
              disabled={isRegenerating}
              className="gap-2 font-semibold"
            >
              {isRegenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Confirm & Regenerate</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
