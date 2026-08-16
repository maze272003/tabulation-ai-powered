"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Eye, Plus, ClipboardCheck, Trash2 } from "lucide-react";
import { Num } from "@/components/tabulation/Num";

const ADVANCEMENT_MODES = ["none", "top_count", "top_percent", "manual"] as const;

export default function RoundsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const rounds = useQuery(api.rounds.list, { orgSlug, eventSlug });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const addRound = useMutation(api.rounds.add);
  const updateRound = useMutation(api.rounds.update);
  const removeRound = useMutation(api.rounds.remove);
  const addCriterion = useMutation(api.criteria.add);
  const removeCriterion = useMutation(api.criteria.remove);
  const [roundName, setRoundName] = useState("");
  const [roundWeight, setRoundWeight] = useState("");
  const [weightEdit, setWeightEdit] = useState<Record<string, string>>({});
  const [advForm, setAdvForm] = useState<
    Record<string, { mode: string; count: string; percent: string; allowOverride: boolean }>
  >({});
  const [form, setForm] = useState<
    Record<string, { name: string; weight: string; min: string; max: string; decimals?: string }>
  >({});

  const locked = ev !== undefined && ev !== null && ev.status !== "draft";
  const eliminationOn = ev?.eliminationEnabled ?? true;
  const onError = (err: unknown) => {
    const data = (err as { data?: { code?: string; message?: string } })?.data;
    if (data?.code === "CONFLICT") toast.error("Configuration is locked.");
    else if (data?.code === "LIMIT_EXCEEDED") toast.error("Limit reached — upgrade your plan.");
    else toast.error(data?.message ?? "Action failed.");
  };

  const weightsSum = (rounds ?? []).reduce((s, r) => s + r.weight, 0);

  const advancementPatch = (roundId: string, r: NonNullable<typeof rounds>[number]) => {
    const f = advForm[roundId] ?? {
      mode: r.advancement.mode,
      count: String(r.advancement.count ?? ""),
      percent: String(r.advancement.percent ?? ""),
      allowOverride: r.advancement.allowOverride,
    };
    return {
      mode: f.mode as (typeof ADVANCEMENT_MODES)[number],
      count: f.mode === "top_count" && f.count ? Number(f.count) : undefined,
      percent: f.mode === "top_percent" && f.percent ? Number(f.percent) : undefined,
      allowOverride: f.allowOverride,
    };
  };

  return (
    <div className="space-y-6">
      {!locked && (
        <Card>
          <CardHeader>
            <CardTitle>Add a round</CardTitle>
            <CardDescription>
              Rounds execute in order; weights across rounds must total 100%.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await addRound({
                    orgSlug,
                    eventSlug,
                    name: roundName,
                    weight: roundWeight ? Number(roundWeight) : undefined,
                  });
                  setRoundName("");
                  setRoundWeight("");
                } catch (err) {
                  onError(err);
                }
              }}
            >
              <Input
                className="w-48"
                placeholder="New round name"
                aria-label="New round name"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
              />
              <Input
                className="w-24"
                placeholder="Weight %"
                aria-label="Round weight percent"
                value={roundWeight}
                onChange={(e) => setRoundWeight(e.target.value)}
              />
              <Button type="submit" disabled={!roundName.trim()}>
                <Plus aria-hidden />
                Add round
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {rounds?.map((r) => {
        const f = form[r._id] ?? { name: "", weight: "", min: "0", max: "100" };
        const a = advForm[r._id] ?? {
          mode: r.advancement.mode,
          count: String(r.advancement.count ?? ""),
          percent: String(r.advancement.percent ?? ""),
          allowOverride: r.advancement.allowOverride,
        };
        const sum = r.criteria.reduce((s, c) => s + c.weight, 0);
        return (
          <Card key={r._id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="font-heading">{r.name}</CardTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Round weight: <Num value={r.weight} />%
                  </span>
                  <span className={sum === 100 ? "text-muted-foreground" : "font-medium text-destructive"}>
                    Criterion weights: <Num value={sum} />%
                  </span>
                  {ev?.status === "ready" ? (
                    <>
                      <Button variant="outline" size="sm" render={<Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/monitor`} />}>
                        <Eye aria-hidden />
                        Monitor
                      </Button>
                      <Button variant="outline" size="sm" render={<Link href={`/app/${orgSlug}/events/${eventSlug}/rounds/${r._id}/review`} />}>
                        <ClipboardCheck aria-hidden />
                        Review
                      </Button>
                    </>
                  ) : null}
                  {!locked ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        try {
                          await removeRound({ orgSlug, eventSlug, roundId: r._id });
                        } catch (e) {
                          onError(e);
                        }
                      }}
                    >
                      <Trash2 aria-hidden />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!locked && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
                  <Input
                    className="w-20"
                    aria-label={`New weight for ${r.name}`}
                    placeholder="Weight"
                    value={weightEdit[r._id] ?? ""}
                    onChange={(e) =>
                      setWeightEdit({ ...weightEdit, [r._id]: e.target.value })
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={weightEdit[r._id] === undefined || weightEdit[r._id] === ""}
                    onClick={async () => {
                      try {
                        await updateRound({
                          orgSlug,
                          eventSlug,
                          roundId: r._id,
                          weight: Number(weightEdit[r._id]),
                        });
                        setWeightEdit({ ...weightEdit, [r._id]: "" });
                        toast.success("Weight saved.");
                      } catch (e) {
                        onError(e);
                      }
                    }}
                  >
                    Save weight
                  </Button>
                </div>
              )}
            {!locked && eliminationOn && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
                <Label htmlFor={`adv-mode-${r._id}`} className="text-muted-foreground">
                  Advances
                </Label>
                <select
                  id={`adv-mode-${r._id}`}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  value={a.mode}
                  onChange={(e) =>
                    setAdvForm({ ...advForm, [r._id]: { ...a, mode: e.target.value } })
                  }
                >
                  {ADVANCEMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m === "none"
                        ? "none"
                        : m === "top_count"
                          ? "top count"
                          : m === "top_percent"
                            ? "top percent"
                            : "manual"}
                    </option>
                  ))}
                </select>
                {a.mode === "top_count" && (
                  <Input
                    className="w-24"
                    placeholder="Top N"
                    aria-label="Top count"
                    value={a.count}
                    onChange={(e) =>
                      setAdvForm({ ...advForm, [r._id]: { ...a, count: e.target.value } })
                    }
                  />
                )}
                {a.mode === "top_percent" && (
                  <Input
                    className="w-24"
                    placeholder="Top %"
                    aria-label="Top percent"
                    value={a.percent}
                    onChange={(e) =>
                      setAdvForm({ ...advForm, [r._id]: { ...a, percent: e.target.value } })
                    }
                  />
                )}
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded accent-primary"
                    checked={a.allowOverride}
                    onChange={(e) =>
                      setAdvForm({
                        ...advForm,
                        [r._id]: { ...a, allowOverride: e.target.checked },
                      })
                    }
                  />
                  allow override
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await updateRound({
                        orgSlug,
                        eventSlug,
                        roundId: r._id,
                        qualifiesToNextRound: r.qualifiesToNextRound,
                        advancement: advancementPatch(r._id, r),
                      });
                      toast.success("Advancement saved.");
                    } catch (e) {
                      onError(e);
                    }
                  }}
                >
                  Save advancement
                </Button>
              </div>
            )}
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="pl-4">Criterion</TableHead>
                    <TableHead>Weight %</TableHead>
                    <TableHead>Range</TableHead>
                    <TableHead>Decimals</TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.criteria.map((c) => (
                    <TableRow key={c._id}>
                      <TableCell className="pl-4 font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Num value={c.weight} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.minScore} – {c.maxScore}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {c.decimalPrecision ?? 0} {c.decimalPrecision === 1 ? "dec" : "decs"}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {!locked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              try {
                                await removeCriterion({
                                  orgSlug,
                                  eventSlug,
                                  criterionId: c._id,
                                });
                              } catch (e) {
                                onError(e);
                              }
                            }}
                          >
                            <Trash2 aria-hidden />
                            <span className="sr-only">Remove {c.name}</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!locked && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-40"
                  placeholder="Criterion"
                  aria-label={`New criterion for ${r.name}`}
                  value={f.name}
                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, name: e.target.value } })}
                />
                <Input
                  className="w-24"
                  placeholder="Weight"
                  aria-label="Criterion weight"
                  value={f.weight}
                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, weight: e.target.value } })}
                />
                <Input
                  className="w-20"
                  placeholder="Min"
                  aria-label="Criterion minimum"
                  value={f.min}
                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, min: e.target.value } })}
                />
                <Input
                  className="w-20"
                  placeholder="Max"
                  aria-label="Criterion maximum"
                  value={f.max}
                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, max: e.target.value } })}
                />
                <select
                  aria-label="Criterion decimal places"
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  value={f.decimals ?? String(ev?.decimalPrecision ?? 2)}
                  onChange={(e) => setForm({ ...form, [r._id]: { ...f, decimals: e.target.value } })}
                >
                  <option value="0">0 dec (integers)</option>
                  <option value="1">1 dec (e.g. 59.1)</option>
                  <option value="2">2 decs (e.g. 59.15)</option>
                  <option value="3">3 decs</option>
                  <option value="4">4 decs</option>
                </select>
                <Button
                  size="sm"
                  disabled={!f.name.trim()}
                  onClick={async () => {
                    try {
                      await addCriterion({
                        orgSlug,
                        eventSlug,
                        roundId: r._id,
                        name: f.name,
                        weight: Number(f.weight),
                        minScore: Number(f.min),
                        maxScore: Number(f.max),
                        decimalPrecision: Number(f.decimals ?? ev?.decimalPrecision ?? 2),
                      });
                      setForm({ ...form, [r._id]: { ...f, name: "", weight: "" } });
                    } catch (e) {
                      onError(e);
                    }
                  }}
                >
                  <Plus aria-hidden />
                  Add criterion
                </Button>
              </div>
            )}
            </CardContent>
          </Card>
        );
      })}
      <p
        className={
          weightsSum === 100 ? "text-xs text-muted-foreground" : "text-xs text-warning"
        }
      >
        Round weights: <Num value={weightsSum} />% of 100% — must total 100% before
        publishing.
      </p>
    </div>
  );
}
