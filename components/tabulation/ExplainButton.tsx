"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { ChevronDown, HelpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ExplanationResult = { explanation: string; cached: boolean; facts: unknown };

function errorData(error: unknown): { code?: string; message?: string } | undefined {
  return (error as { data?: { code?: string; message?: string } })?.data;
}

function explainErrorMessage(error: unknown): string {
  const data = errorData(error);
  if (data?.code === "LIMIT_EXCEEDED") {
    return "Daily explanation limit reached — try again tomorrow.";
  }
  return data?.message ?? "Could not generate an explanation.";
}

export function ExplainButton({
  orgSlug,
  eventSlug,
  roundId,
  contestantId,
}: {
  orgSlug: string;
  eventSlug: string;
  roundId: string;
  contestantId: string;
}) {
  const explain = useAction(api.results.explain);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExplanationResult | null>(null);
  const [factsOpen, setFactsOpen] = useState(false);

  async function fetchExplanation() {
    setBusy(true);
    try {
      setResult(
        await explain({
          orgSlug,
          eventSlug,
          roundId: roundId as Id<"rounds">,
          contestantId: contestantId as Id<"contestants">,
        }),
      );
    } catch (error) {
      toast.error(explainErrorMessage(error));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFactsOpen(false);
      return;
    }
    // Fetch lazily on first open; the result is kept in state so reopening is free.
    if (result === null && !busy) {
      void fetchExplanation();
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground"
        onClick={() => handleOpenChange(true)}
        aria-label="Why this ranking?"
      >
        <HelpCircle aria-hidden />
        Why?
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Why this ranking?</DialogTitle>
            <DialogDescription>
              Grounded in this round&apos;s official result snapshot.
              {result?.cached === true && " Reused from an earlier explanation."}
              {result?.cached === false && " Generated just now."}
            </DialogDescription>
          </DialogHeader>
          {busy ? (
            <div className="flex items-center justify-center py-8" role="status">
              <Loader2 aria-hidden className="animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Explaining…</span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">{result?.explanation}</p>
              {result && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFactsOpen(!factsOpen)}
                    aria-expanded={factsOpen}
                    aria-controls="explain-facts"
                  >
                    <ChevronDown
                      aria-hidden
                      className={factsOpen ? "rotate-180 transition-transform" : "transition-transform"}
                    />
                    Source data
                  </Button>
                  {factsOpen && (
                    <pre
                      id="explain-facts"
                      className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-2xs font-mono"
                    >
                      {JSON.stringify(result.facts, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
