"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Megaphone, Pause, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { formatDateTime } from "@/components/platform/format";
import { platformErrorMessage } from "@/components/platform/errors";
import { PlatformBadge } from "@/components/platform/PlatformBadge";
import { ReasonDialog } from "@/components/platform/ReasonDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { PageHeader } from "@/components/PageHeader";

export default function SentryAnnouncementsPage() {
  const { token } = useSentrySession();
  const announcements = useQuery(api.superadmin.announcements.list, token ? { token } : "skip");

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Id<"announcements"> | null>(null);
  const [busy, setBusy] = useState(false);

  const create = useMutation(api.superadmin.announcements.create);
  const setActive = useMutation(api.superadmin.announcements.setActive);
  const remove = useMutation(api.superadmin.announcements.remove);

  const submitCreate = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await create({ token, title, body, isActive: publishNow });
      setCreateOpen(false);
      setTitle("");
      setBody("");
      setPublishNow(true);
      toast.success("Announcement created");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The announcement could not be created."));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (announcementId: Id<"announcements">, isActive: boolean) => {
    if (!token) return;
    try {
      await setActive({ token, announcementId, isActive: !isActive });
      toast.success(isActive ? "Announcement paused" : "Announcement published");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The announcement could not be updated."));
    }
  };

  const runDelete = async () => {
    if (!token || !deleteTarget) return;
    setBusy(true);
    try {
      await remove({ token, announcementId: deleteTarget });
      setDeleteTarget(null);
      toast.success("Announcement deleted");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The announcement could not be deleted."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Announcements"
          description="Broadcast product updates and notices to every signed-in user."
        />
        <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden className="size-4" />
          New announcement
        </Button>
      </div>

      {announcements === undefined ? (
        <TableSkeleton rows={4} cols={3} />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          hint="Create one to broadcast a message across the app."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone aria-hidden className="size-4 text-muted-foreground" />
              All announcements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {announcements.map((announcement) => (
              <div
                key={announcement._id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{announcement.title}</h2>
                    <PlatformBadge
                      label={announcement.isActive ? "Live" : "Paused"}
                      tone={announcement.isActive ? "success" : "muted"}
                    />
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {announcement.body}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Published {formatDateTime(announcement.publishedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void toggleActive(announcement._id, announcement.isActive)}
                  >
                    {announcement.isActive ? (
                      <>
                        <Pause aria-hidden className="size-3.5" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play aria-hidden className="size-3.5" />
                        Publish
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget(announcement._id)}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>
              Live announcements appear in a banner to every signed-in user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Title</Label>
              <Input
                id="announcement-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Scheduled maintenance"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-body">Message</Label>
              <textarea
                id="announcement-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="What should users know?"
                rows={4}
                className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 md:text-sm"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(event) => setPublishNow(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              Publish immediately
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || !title.trim() || !body.trim()}
              onClick={() => void submitCreate()}
            >
              {busy ? "Creating…" : "Create announcement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete announcement"
        description="The announcement is removed permanently. Users who already saw it keep it."
        confirmLabel="Delete announcement"
        busy={busy}
        destructive
        onConfirm={runDelete}
      />
    </div>
  );
}