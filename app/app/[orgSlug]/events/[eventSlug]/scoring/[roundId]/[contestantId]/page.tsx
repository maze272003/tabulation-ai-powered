"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, ClipboardList, Lock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Num } from "@/components/tabulation/Num";
import { SaveIndicator, type SaveState } from "@/components/tabulation/SaveIndicator";
import { StatusBadge } from "@/components/tabulation/StatusBadge";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";

function validateRaw(raw: string, c: Doc<"criteria">): string | null {
  if (raw.trim() === "") return null;
  const num = Number(raw);
  if (Number.isNaN(num)) return "Enter a number";
  if (num < c.minScore || num > c.maxScore) {
    return `Enter a value between ${c.minScore} and ${c.maxScore}`;
  }
  const scale = 10 ** c.decimalPrecision;
  if (Math.abs(num * scale - Math.round(num * scale)) > 1e-9) {
    return `Use at most ${c.decimalPrecision} decimal${c.decimalPrecision === 1 ? "" : "s"}`;
  }
  return null;
}

export default function ScoreEntryPage({
  params,
}: {
  params: Promise<{
    orgSlug: string;
    eventSlug: string;
    roundId: string;
    contestantId: string;
  }>;
}) {
  const { orgSlug, eventSlug, roundId, contestantId } = use(params);
  const detail = useQuery(api.scoring.sheetDetail, {
    orgSlug,
    eventSlug,
    roundId: roundId as Id<"rounds">,
    contestantId: contestantId as Id<"contestants">,
  });
  const mine = useQuery(api.scoring.myAssignments, { orgSlug, eventSlug });
  const saveDraft = useMutation(api.scoring.saveDraft);
  const submitSheet = useMutation(api.scoring.submitSheet);

  const [raw, setRaw] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState<Record<string, number> | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (detail && !hydrated.current) {
      hydrated.current = true;
      const drafts = detail.sheet?.draftValues ?? {};
      setRaw(Object.fromEntries(Object.entries(drafts).map(([k, v]) => [k, String(v)])));
    }
  }, [detail]);

  const sheetId = detail?.sheet?._id;

  useEffect(() => {
    if (!hydrated.current || !sheetId || saveState !== "dirty") return;
    const timer = setTimeout(() => {
      const payload: Record<string, number> = {};
      for (const [id, value] of Object.entries(raw)) {
        const criterion = detail?.criteria.find((c) => c._id === id);
        if (criterion && value.trim() !== "" && validateRaw(value, criterion) === null) {
          payload[id] = Number(value);
        }
      }
      setSaveState("saving");
      saveDraft({ orgSlug, eventSlug, sheetId, draftValues: payload })
        .then(() => {
          setSavedAt(Date.now());
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 800);
    return () => clearTimeout(timer);
  }, [saveState, raw, sheetId, orgSlug, eventSlug, saveDraft, detail]);

  useEffect(() => {
    if (saveState !== "dirty" && saveState !== "error") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  const criteria = detail?.criteria ?? [];
  const errors = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const c of criteria) {
      map[c._id] = touched[c._id] ? validateRaw(raw[c._id] ?? "", c) : null;
    }
    return map;
  }, [criteria, raw, touched]);

  const validValues = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of criteria) {
      const value = raw[c._id];
      if (value !== undefined && value.trim() !== "" && validateRaw(value, c) === null) {
        out[c._id] = Number(value);
      }
    }
    return out;
  }, [criteria, raw]);

  if (detail === undefined || mine === undefined) return <TableSkeleton rows={4} cols={2} />;
  if (!detail.contestant) {
    return <EmptyState icon={ClipboardList} title="Contestant not found" />;
  }
  if (!detail.sheet) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="You have no score sheet for this contestant"
        action={
          <Link
            className="text-sm underline underline-offset-4"
            href={`/app/${orgSlug}/events/${eventSlug}/scoring`}
          >
            Back to scoring
          </Link>
        }
      />
    );
  }

  const round = mine.rounds.find((r) => r.roundId === roundId);
  const sheet = detail.sheet;
  const locked =
    justSubmitted !== null || sheet.status === "submitted" || sheet.status === "locked";
  const backHref = `/app/${orgSlug}/events/${eventSlug}/scoring`;
  const filledCount = criteria.filter((c) => validValues[c._id] !== undefined).length;
  const allValid =
    filledCount === criteria.length && criteria.every((c) => errors[c._id] === null);

  if (locked) {
    const summary = justSubmitted ?? null;
    return (
      <div className="max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            #{detail.contestant.number} {detail.contestant.name}
            {round && <StatusBadge kind="round" status={round.status} />}
          </h2>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock aria-hidden className="size-3.5" />
            Locked
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Scores submitted{summary ? " — see the summary below" : ""}. Submitted scores
          cannot be changed.
        </p>
        {summary && (
          <table className="w-full text-sm">
            <caption className="sr-only">Submitted scores</caption>
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1">Criterion</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c) => (
                <tr key={c._id} className="border-t">
                  <td className="py-1">{c.name}</td>
                  <td>
                    <Num value={summary[c._id]} precision={c.decimalPrecision} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link
          className="flex items-center gap-1 text-sm underline underline-offset-4"
          href={backHref}
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          Back to scoring
        </Link>
      </div>
    );
  }

  if (round && round.status !== "open") {
    return (
      <div className="max-w-md space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          #{detail.contestant.number} {detail.contestant.name}
          <StatusBadge kind="round" status={round.status} />
        </h2>
        <p className="text-sm text-muted-foreground">
          This round is closed — scoring is finished. Your draft is kept but cannot be
          submitted.
        </p>
        <Link
          className="flex items-center gap-1 text-sm underline underline-offset-4"
          href={backHref}
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          Back to scoring
        </Link>
      </div>
    );
  }

  const setValue = (id: string, value: string) => {
    setRaw((prev) => ({ ...prev, [id]: value }));
    setSaveState("dirty");
  };

  const onBlurField = (id: string) => setTouched((prev) => ({ ...prev, [id]: true }));

  const onSubmit = async () => {
    const invalid = criteria.find((c) => {
      const value = raw[c._id];
      return value === undefined || value.trim() === "" || validateRaw(value, c) !== null;
    });
    if (invalid) {
      setTouched((prev) => ({ ...prev, [invalid._id]: true }));
      document.getElementById(invalid._id)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await submitSheet({ orgSlug, eventSlug, sheetId: sheet._id, values: validValues });
      setJustSubmitted(validValues);
      setSaveState("idle");
      toast.success("Scores submitted.");
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      if (data?.code === "CONFLICT") toast.error("This round is closed — scoring is finished.");
      else if (data?.code === "VALIDATION_ERROR") {
        toast.error(data.message ?? "Some scores are invalid.");
      } else toast.error(data?.message ?? "Could not submit.");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          #{detail.contestant.number} {detail.contestant.name}
          {round && <StatusBadge kind="round" status={round.status} />}
        </h2>
        <SaveIndicator
          state={saveState}
          savedAt={savedAt}
          onRetry={saveState === "error" ? () => setSaveState("dirty") : undefined}
        />
      </div>
      {criteria.map((criterion) => {
        const error = errors[criterion._id];
        return (
          <div key={criterion._id} className="space-y-1">
            <Label htmlFor={criterion._id}>
              {criterion.name}
              <span className="ml-1 font-normal text-muted-foreground">
                weight {criterion.weight}% · {criterion.minScore}–{criterion.maxScore} ·{" "}
                {criterion.decimalPrecision} decimal
                {criterion.decimalPrecision === 1 ? "" : "s"}
              </span>
            </Label>
            <Input
              id={criterion._id}
              type="number"
              inputMode="decimal"
              min={criterion.minScore}
              max={criterion.maxScore}
              step={10 ** -criterion.decimalPrecision}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${criterion._id}-error` : undefined}
              value={raw[criterion._id] ?? ""}
              onBlur={() => onBlurField(criterion._id)}
              onChange={(e) => setValue(criterion._id, e.target.value)}
            />
            {error && (
              <p id={`${criterion._id}-error`} className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          <Num value={filledCount} /> / <Num value={criteria.length} /> scored
        </span>
        <div className="flex gap-2">
          <Button onClick={onSubmit} disabled={submitting || !allValid}>
            {submitting ? "Submitting…" : "Submit scores"}
          </Button>
          <Link className="self-center text-sm underline underline-offset-4" href={backHref}>
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
