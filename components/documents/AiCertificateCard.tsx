"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { DocumentSpec } from "@/convex/documents/spec";
import { isDocumentSpec } from "@/convex/documents/spec";
import { toastMutationError } from "@/lib/convex-errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SpecThumbnail } from "./SpecThumbnail";

const MAX_PROMPT_LENGTH = 2000;

interface Variant {
  name: string;
  description: string;
  spec: DocumentSpec;
}

// Convex infers `rejected: boolean` from the action's return; the flag is only
// ever `true` on that branch, and "rejected" in result discriminates the union.
type GenerateResult = { variants: Variant[] } | { rejected: boolean; reason: string };

export function AiCertificateCard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const generate = useAction(api.documents.ai.generateFromPrompt);
  const createTemplate = useMutation(api.documents.templates.create);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"generate" | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [usingIndex, setUsingIndex] = useState<number | null>(null);

  async function onGenerate() {
    setBusy("generate");
    setRejected(null);
    try {
      const result: GenerateResult = await generate({ orgSlug, prompt });
      if ("rejected" in result) {
        setRejected(result.reason);
        setVariants(null);
      } else {
        setVariants(result.variants);
      }
    } catch (error) {
      toastMutationError(error, {
        fallback: "The designer could not produce a layout. Try rewording.",
        codeMessages: { LIMIT_EXCEEDED: "Daily AI design limit reached — try again tomorrow." },
      });
    } finally {
      setBusy(null);
    }
  }

  async function onUse(variant: Variant, index: number) {
    if (!isDocumentSpec(variant.spec)) {
      toast.error("This design is invalid. Please regenerate.");
      return;
    }
    setUsingIndex(index);
    try {
      const { templateId } = await createTemplate({
        orgSlug,
        name: variant.name,
        kind: "certificate",
        spec: variant.spec,
      });
      router.push(`/studio/${orgSlug}/${templateId}`);
    } catch (error) {
      toastMutationError(error, { fallback: "Could not create the template." });
      setUsingIndex(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles aria-hidden className="size-4 text-primary" />
          Design with AI
        </CardTitle>
        <CardDescription>
          Describe the vibe — e.g. &quot;elegant gold pageant certificate, navy and gold, formal.&quot; Pick one of three designs, then edit it in the studio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ai-cert-prompt" className="sr-only">
            Describe your certificate
          </Label>
          <textarea
            id="ai-cert-prompt"
            className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Describe the style, colors, and occasion…"
            maxLength={MAX_PROMPT_LENGTH}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={busy !== null}
          />
          <div className="flex items-center gap-2">
            <Button type="button" disabled={busy !== null || !prompt.trim()} onClick={() => void onGenerate()}>
              {busy === "generate" ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
              Design my certificate
            </Button>
            {variants ? (
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void onGenerate()}>
                <RotateCcw aria-hidden />
                Regenerate
              </Button>
            ) : null}
          </div>
          {rejected ? (
            <p className="text-sm text-warning" role="status">
              {rejected}
            </p>
          ) : null}
        </div>

        {variants ? (
          <div className="grid gap-3 sm:grid-cols-3" data-testid="ai-cert-variants">
            {variants.map((variant, index) => (
              <div key={`${variant.name}-${index}`} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex justify-center">
                  <SpecThumbnail spec={variant.spec} widthPx={120} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{variant.name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{variant.description}</p>
                </div>
                <Button
                  size="sm"
                  className="mt-auto"
                  disabled={busy !== null || usingIndex !== null}
                  onClick={() => void onUse(variant, index)}
                >
                  {usingIndex === index ? <Loader2 aria-hidden className="animate-spin" /> : null}
                  Use this design
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
