"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DocumentSpec } from "@/convex/documents/spec";
import { listTokens, type TokenMap } from "@/lib/documents/tokens";
import { renderPdfBlob, type RenderSpecInput } from "@/lib/documents/renderPdf";
import { downloadBlobFile } from "@/lib/download";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

export interface GenerateCertificatesDialogProps {
  orgSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: { _id: Id<"documentTemplates">; name: string; spec: DocumentSpec };
}

type Mode = "all" | "category" | "rank" | "manual";

function loadedList<T>(result: T[] | Error | undefined): T[] {
  return result !== undefined && !(result instanceof Error) ? result : [];
}

function parseRankBound(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}

function ordinal(rank: number | undefined): string {
  if (rank === undefined) return "";
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = rank % 100;
  const suffix = suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0];
  return `${rank}${suffix}`;
}

export function GenerateCertificatesDialog({
  orgSlug,
  open,
  onOpenChange,
  template,
}: GenerateCertificatesDialogProps) {
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const [eventSlug, setEventSlug] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [categoryId, setCategoryId] = useState("");
  const [rankFrom, setRankFrom] = useState(1);
  const [rankTo, setRankTo] = useState(3);
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  const event = useQuery(api.events.get, eventSlug ? { orgSlug, eventSlug } : "skip");
  const org = useQuery(api.organizations.get, { orgSlug });
  const contestants = useQuery(
    api.contestants.list,
    eventSlug ? { orgSlug, eventSlug } : "skip",
  );
  const categories = useQuery(
    api.categories.list,
    eventSlug ? { orgSlug, eventSlug } : "skip",
  );
  const results = useQuery(
    api.results.eventResults,
    eventSlug ? { orgSlug, eventSlug } : "skip",
  );

  const usedTokens = useMemo(
    () =>
      template.spec.elements.flatMap((element) =>
        element.type === "text" ? listTokens(element.content) : [],
      ),
    [template.spec],
  );

  const imageStorageIds = useMemo(
    () =>
      template.spec.elements.flatMap((element) =>
        element.type === "image" ? [element.storageId] : [],
      ),
    [template.spec],
  );

  const shouldLoadAssets = open && imageStorageIds.length > 0;
  const assetUrlMap = useQuery(
    api.documents.assets.assetUrls,
    shouldLoadAssets ? { orgSlug, storageIds: imageStorageIds } : "skip",
  );

  const imageUrlMap = useMemo(() => {
    if (assetUrlMap === undefined || assetUrlMap instanceof Error) return {};
    return Object.fromEntries(
      Object.entries(assetUrlMap).filter((entry): entry is [string, string] => entry[1] !== null),
    );
  }, [assetUrlMap]);

  const rankByContestant = useMemo(() => {
    const map = new Map<string, number>();
    if (results && !(results instanceof Error)) {
      for (const row of results.final) map.set(row.contestantId, row.rank);
    }
    return map;
  }, [results]);

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of loadedList(categories)) map.set(category._id, category.name);
    return map;
  }, [categories]);

  const activeContestants = useMemo(
    () =>
      loadedList(contestants)
        .filter((contestant) => contestant.status === "active")
        .sort((a, b) => a.number - b.number),
    [contestants],
  );

  const selectedContestants = useMemo(() => {
    if (mode === "category") {
      return activeContestants.filter((contestant) => contestant.categoryId === categoryId);
    }
    if (mode === "rank") {
      return activeContestants.filter((contestant) => {
        const rank = rankByContestant.get(contestant._id);
        return rank !== undefined && rank >= rankFrom && rank <= rankTo;
      });
    }
    if (mode === "manual") {
      return activeContestants.filter((contestant) => manualIds.has(contestant._id));
    }
    return activeContestants;
  }, [activeContestants, categoryId, manualIds, mode, rankByContestant, rankFrom, rankTo]);

  const needsRank = usedTokens.includes("recipient.rank");
  const rankBlocked = needsRank && rankByContestant.size === 0;
  const missingRankCount =
    needsRank && rankByContestant.size > 0
      ? selectedContestants.filter((contestant) => !rankByContestant.has(contestant._id)).length
      : 0;
  const assetsLoading = imageStorageIds.length > 0 && assetUrlMap === undefined;
  // Generation must not proceed with a broken asset map: the PDF would render
  // empty boxes for every image element, and certificates are distributed.
  const assetsBlocked = imageStorageIds.length > 0 && assetUrlMap instanceof Error;
  const recipientCount = selectedContestants.length;

  async function generate() {
    if (!event || recipientCount === 0) return;
    setGenerating(true);
    try {
      const issuedDate = new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const sharedTokens: TokenMap = {
        "event.name": event.name,
        "event.venue": event.venue ?? "",
        "event.date": event.startDate ? new Date(event.startDate).toLocaleDateString() : "",
        "org.name": org?.name ?? "",
        "issued.date": issuedDate,
      };
      const inputs: RenderSpecInput[] = selectedContestants.map((contestant) => ({
        spec: template.spec,
        tokens: {
          ...sharedTokens,
          "recipient.name": contestant.name,
          "recipient.number": String(contestant.number),
          "recipient.rank": ordinal(rankByContestant.get(contestant._id)),
          "recipient.category": categoryNames.get(contestant.categoryId) ?? "",
        } satisfies TokenMap,
      }));
      const blob = await renderPdfBlob(inputs, imageUrlMap);
      downloadBlobFile(`${event.slug}-certificates.pdf`, blob);
      toast.success(`Generated ${inputs.length} certificate${inputs.length === 1 ? "" : "s"}.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate certificates — {template.name}</DialogTitle>
          <DialogDescription>
            One PDF page is created per recipient from this template&rsquo;s design and fields.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gen-event">Event</Label>
            <Select
              value={eventSlug || null}
              onValueChange={(value) => {
                setEventSlug(value ?? "");
                setCategoryId("");
                setManualIds(new Set());
              }}
            >
              <SelectTrigger id="gen-event" className="w-full">
                <SelectValue placeholder="Choose an event…" />
              </SelectTrigger>
              <SelectContent>
                {loadedList(events).map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {eventSlug ? (
            <>
              <div className="space-y-1.5">
                <Label>Recipients</Label>
                <Select
                  value={mode}
                  onValueChange={(value) => setMode((value ?? "all") as Mode)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All contestants</SelectItem>
                    <SelectItem value="category">By category</SelectItem>
                    <SelectItem value="rank">By final rank</SelectItem>
                    <SelectItem value="manual">Manual selection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode === "category" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="gen-category">Category</Label>
                  <Select
                    value={categoryId || null}
                    onValueChange={(value) => setCategoryId(value ?? "")}
                  >
                    <SelectTrigger id="gen-category" className="w-full">
                      <SelectValue placeholder="Choose a category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {loadedList(categories).map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {mode === "rank" ? (
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="gen-rank-from">Rank from</Label>
                    <Input
                      id="gen-rank-from"
                      type="number"
                      min={1}
                      value={rankFrom}
                      onChange={(changeEvent) =>
                        setRankFrom(parseRankBound(changeEvent.target.value))
                      }
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="gen-rank-to">to</Label>
                    <Input
                      id="gen-rank-to"
                      type="number"
                      min={1}
                      value={rankTo}
                      onChange={(changeEvent) => setRankTo(parseRankBound(changeEvent.target.value))}
                    />
                  </div>
                </div>
              ) : null}

              {mode === "manual" ? (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {activeContestants.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active contestants.</p>
                  ) : (
                    activeContestants.map((contestant) => (
                      <label key={contestant._id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={manualIds.has(contestant._id)}
                          onChange={(changeEvent) =>
                            setManualIds((previous) => {
                              const next = new Set(previous);
                              if (changeEvent.target.checked) next.add(contestant._id);
                              else next.delete(contestant._id);
                              return next;
                            })
                          }
                        />
                        {contestant.name} (No. {contestant.number})
                      </label>
                    ))
                  )}
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground" aria-live="polite">
                {recipientCount} recipient{recipientCount === 1 ? "" : "s"} selected.
                {rankBlocked
                  ? " This template ranks recipients, but the event has no published final results."
                  : ""}
                {missingRankCount > 0 ? (
                  <span className="text-warning">
                    {" "}
                    {missingRankCount} recipient{missingRankCount === 1 ? "" : "s"} have no final
                    rank — their rank field will be blank.
                  </span>
                ) : null}
                {assetsBlocked ? " Image assets could not be loaded — try again." : ""}
              </p>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void generate()}
            disabled={
              generating || !event || recipientCount === 0 || rankBlocked || assetsLoading || assetsBlocked
            }
          >
            {generating ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
