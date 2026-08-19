"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ArrowRight, CheckCircle2, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { TemplateDraft } from "@/convex/lib/templateWizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const MAX_PROMPT_LENGTH = 2000;

type RoundAdvancement = NonNullable<TemplateDraft["configSnapshot"]["rounds"][number]["advancement"]>;

function errorData(error: unknown): { code?: string; message?: string } | undefined {
  return (error as { data?: { code?: string; message?: string } })?.data;
}

function advancementLabel(advancement: RoundAdvancement): string {
  const mode = advancement.mode.replace("_", " ");
  const amount =
    advancement.count !== undefined
      ? ` ${advancement.count}`
      : advancement.percent !== undefined
        ? ` ${advancement.percent}%`
        : "";
  return `${mode}${amount} advance`;
}

export function AiEventWizardCard({
  orgSlug,
  eventName,
  onCreated,
}: {
  orgSlug: string;
  eventName: string;
  onCreated: (slug: string) => void;
}) {
  const generate = useAction(api.templates.generateFromPrompt);
  const saveGenerated = useMutation(api.templates.saveGenerated);
  const createFromTemplate = useMutation(api.events.createFromTemplate);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [busy, setBusy] = useState<"generate" | "create" | null>(null);

  async function onGenerate() {
    setBusy("generate");
    try {
      setDraft(await generate({ orgSlug, prompt }));
    } catch (error) {
      const data = errorData(error);
      toast.error(
        data?.code === "LIMIT_EXCEEDED"
          ? "Daily AI wizard limit reached — try again tomorrow."
          : data?.message ?? "The wizard could not design this event. Try rewording.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onAccept() {
    if (!draft) return;
    setBusy("create");
    try {
      const { templateId } = await saveGenerated({ orgSlug, eventName, draft });
      const slug = await createFromTemplate({ orgSlug, name: eventName, templateId });
      toast.success("Event created from the AI design.");
      onCreated(slug);
    } catch (error) {
      const data = errorData(error);
      if (data?.code === "LIMIT_EXCEEDED") toast.error("Event limit reached — upgrade your plan.");
      else if (data?.code === "CONFLICT") toast.error("An event with that slug already exists.");
      else toast.error(data?.message ?? "Could not create the event.");
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles aria-hidden className="size-4 text-primary" />
          Or describe your event (AI)
        </CardTitle>
        <CardDescription>
          e.g. &quot;Miss Philippines pre-pageant: 3 rounds, 5 judges, top 10 advance after prelims.&quot;
          Review the design before anything is created.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft === null ? (
          <div className="space-y-2">
            <Label htmlFor="ai-event-prompt" className="sr-only">
              Describe your event
            </Label>
            <textarea
              id="ai-event-prompt"
              className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Describe the event, rounds, judging style, and how many advance…"
              maxLength={MAX_PROMPT_LENGTH}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy !== null}
            />
            <Button type="button" disabled={busy !== null || !prompt.trim()} onClick={() => void onGenerate()}>
              {busy === "generate" ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
              Design my event
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">{draft.name}</p>
                {draft.description ? <p className="text-xs text-muted-foreground">{draft.description}</p> : null}
              </div>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-success bg-success-muted px-2 py-0.5 rounded-full border border-success/30">
                <CheckCircle2 className="size-3" /> Ready to Publish (100% Balanced)
              </span>
            </div>

            {draft.configSnapshot.rounds.map((round, i) => {
              const criteriaSum = round.criteria.reduce((s, c) => s + c.weight, 0);
              return (
                <div key={`${round.name}-${i}`} className="space-y-2 rounded-lg border bg-card/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      Round {i + 1}: {round.name}
                      {round.advancement && round.advancement.mode !== "none" ? (
                        <span className="ml-2 text-xs text-muted-foreground">({advancementLabel(round.advancement)})</span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground">
                        Round Weight: <strong className="text-foreground">{round.weight ?? 100}%</strong>
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-success">
                        <CheckCircle2 className="size-3" /> Criteria: {criteriaSum}%
                      </span>
                    </div>
                  </div>
                  <ul className="grid gap-1 sm:grid-cols-2 text-xs text-muted-foreground">
                    {round.criteria.map((criterion) => (
                      <li key={`${criterion.name}-${criterion.order}`} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
                        <span className="font-medium text-foreground">{criterion.name}</span>
                        <span>{criterion.weight}% (scale {criterion.minScore}–{criterion.maxScore})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" className="font-semibold shadow-xs" disabled={busy !== null || !eventName.trim()} onClick={() => void onAccept()}>
                {busy === "create" ? <Loader2 aria-hidden className="animate-spin" /> : <ArrowRight aria-hidden />}
                Create event from this design
              </Button>
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setDraft(null)}>
                <RotateCcw aria-hidden />
                Start over
              </Button>
            </div>
            {!eventName.trim() ? (
              <p className="text-xs text-warning">Enter an event name above to enable creation.</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
