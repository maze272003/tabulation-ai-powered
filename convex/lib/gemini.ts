import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { appError, ErrorCode } from "./errors";

export const GEMINI_MODEL = "gemini-2.5-flash";

export function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw appError(ErrorCode.UPSTREAM, "GEMINI_API_KEY is not configured");
  return key;
}

export function extractJsonText(raw: string): string {
  let text = raw.trim();

  // Strip markdown code blocks if wrapped, e.g. ```json ... ```
  const codeBlockMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // Check if it's already directly parseable
  try {
    JSON.parse(text);
    return text;
  } catch {
    // If not, find the enclosing JSON object {...} or array [...]
    const firstBrace = text.indexOf("{");
    const firstBracket = text.indexOf("[");

    let startIndex = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
      startIndex = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIndex = firstBrace;
    } else if (firstBracket !== -1) {
      startIndex = firstBracket;
    }

    if (startIndex !== -1) {
      const isObject = text[startIndex] === "{";
      const endIndex = isObject ? text.lastIndexOf("}") : text.lastIndexOf("]");
      if (endIndex > startIndex) {
        return text.substring(startIndex, endIndex + 1).trim();
      }
    }
  }

  return text;
}

async function callGemini(args: {
  systemInstruction: string;
  prompt: string;
  responseMimeType?: string;
}): Promise<string> {
  const client = new GoogleGenAI({ apiKey: geminiApiKey() });
  let response: GenerateContentResponse;
  try {
    response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: args.prompt,
      config: {
        systemInstruction: args.systemInstruction,
        temperature: 0.4,
        ...(args.responseMimeType ? { responseMimeType: args.responseMimeType } : {}),
      },
    });
  } catch (error) {
    // Map SDK/transport failures to a typed UPSTREAM error so callers never
    // see a raw SDK exception. Our own appErrors (empty response below) are
    // thrown outside this try/catch and pass through unwrapped.
    throw appError(ErrorCode.UPSTREAM, "AI provider request failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const text = response.text;
  if (!text) throw appError(ErrorCode.UPSTREAM, "Gemini returned an empty response");
  return text;
}

export async function geminiGenerateJson(args: { systemInstruction: string; prompt: string }): Promise<unknown> {
  const text = await callGemini({
    ...args,
    systemInstruction: `${args.systemInstruction}\nRespond with a single JSON value and nothing else.`,
    responseMimeType: "application/json",
  });
  const cleaned = extractJsonText(text);
  try {
    return JSON.parse(cleaned) as unknown;
  } catch (error) {
    throw appError(ErrorCode.UPSTREAM, "Gemini returned malformed JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function geminiGenerateText(args: { systemInstruction: string; prompt: string }): Promise<string> {
  return callGemini(args);
}

