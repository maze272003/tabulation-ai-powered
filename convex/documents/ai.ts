import { v } from "convex/values";
import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requirePermission } from "../lib/authz";
import { appError, ErrorCode } from "../lib/errors";
import { geminiGenerateJson } from "../lib/gemini";
import {
  AI_USAGE_RESOURCES,
  DOCUMENT_DESIGN_DAILY_LIMIT,
  consumeAiQuota,
} from "../lib/aiUsage";
import {
  DESIGN_INTENT_SYSTEM_INSTRUCTION,
  buildCertificateIntents,
} from "../lib/certificateAi";
import { compileDesignIntent } from "../../lib/documents/designCompiler";
import type { DocumentSpec } from "./spec";

const MAX_PROMPT_LENGTH = 2000;

/**
 * Public contract for the AI certificate generator (consumed by the client
 * card). `rejected: true` is a literal discriminant so narrowing via
 * `"rejected" in result` is type-safe on the client.
 */
export type GenerateFromPromptResult =
  | { variants: { name: string; description: string; spec: DocumentSpec }[] }
  | { rejected: true; reason: string };

export const consumeDocumentDesignQuota = internalMutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "documents.manage",
    });
    await consumeAiQuota(ctx, actx.org._id, AI_USAGE_RESOURCES.documentDesigns, DOCUMENT_DESIGN_DAILY_LIMIT);
  },
});

export const generateFromPrompt = action({
  args: { orgSlug: v.string(), prompt: v.string() },
  handler: async (ctx, args): Promise<GenerateFromPromptResult> => {
    const prompt = args.prompt.trim();
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Describe the certificate in 1-2000 characters");
    }
    await ctx.runMutation(internal.documents.ai.consumeDocumentDesignQuota, {
      orgSlug: args.orgSlug,
    });
    // Per-minute burst gate on top of the daily quota.
    await ctx.runMutation(internal.rateLimits.check, { name: "aiGenerate", key: args.orgSlug });

    const result = await buildCertificateIntents(prompt, (userPrompt) =>
      geminiGenerateJson({ systemInstruction: DESIGN_INTENT_SYSTEM_INSTRUCTION, prompt: userPrompt }),
    );
    if (result === null) {
      throw appError(
        ErrorCode.UPSTREAM,
        "The designer could not produce a layout. Try rewording your description.",
      );
    }
    if ("rejected" in result) return { rejected: true, reason: result.reason };
    return {
      variants: result.intents.map((intent) => ({
        name: intent.name,
        description: intent.description,
        spec: compileDesignIntent(intent),
      })),
    };
  },
});
