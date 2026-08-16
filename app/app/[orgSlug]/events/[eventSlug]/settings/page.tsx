"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function EventSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const update = useMutation(api.events.update);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [dropHighLow, setDropHighLow] = useState(false);
  const [elimination, setElimination] = useState(true);
  const [prevKey, setPrevKey] = useState<string | null>(null);

  if (ev !== undefined && ev !== null && prevKey !== ev._id) {
    setPrevKey(ev._id);
    setName(ev.name);
    setVenue(ev.venue ?? "");
    setDropHighLow(ev.scoringRules.dropHighLow);
    setElimination(ev.eliminationEnabled);
  }

  if (ev === undefined) return <div>Loading…</div>;
  if (ev === null) return <div>Event not found.</div>;

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

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          aria-label="Event name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={ev.status !== "draft" || !name || name === ev.name}
          onClick={() => save({ name, venue })}
        >
          Save
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Venue"
          value={venue}
          placeholder="Venue"
          onChange={(e) => setVenue(e.target.value)}
        />
      </div>
      {ev.status === "draft" && (
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Scoring</h3>
          <div className="space-y-2">
            <Label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                checked={dropHighLow}
                onChange={(e) => setDropHighLow(e.target.checked)}
              />
              Drop highest and lowest judge scores
              <span className="text-xs text-muted-foreground">
                (applies when 3+ judges scored a contestant-criterion)
              </span>
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                checked={elimination}
                onChange={(e) => setElimination(e.target.checked)}
              />
              Elimination rounds enabled
              <span className="text-xs text-muted-foreground">
                (shows advancement controls on the Rounds page)
              </span>
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
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Slug: {ev.slug} - Status: {ev.status}
      </p>
    </div>
  );
}
