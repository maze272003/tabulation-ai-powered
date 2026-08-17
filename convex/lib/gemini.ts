import { GoogleGenAI } from "@google/genai";
import { appError, ErrorCode } from "./errors";

export const GEMINI_MODEL = "gemini-2.5-flash";

export function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw appError(ErrorCode.UPSTREAM, "GEMINI_API_KEY is not configured");
  return key;
}

async function callGemini(args: { systemInstruction: string; prompt: string }) {
  const client = new GoogleGenAI({ apiKey: geminiApiKey() });
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: args.prompt,
    config: {
      systemInstruction: args.systemInstruction,
      temperature: 0.4,
    },
  });
  const text = response.text;
  if (!text) throw appError(ErrorCode.UPSTREAM, "Gemini returned an empty response");
  return text;
}

export async function geminiGenerateJson(args: { systemInstruction: string; prompt: string }): Promise<unknown> {
  const text = await callGemini({ ...args, systemInstruction: `${args.systemInstruction}\nRespond with a single JSON value and nothing else.` });
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw appError(ErrorCode.UPSTREAM, "Gemini returned malformed JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function geminiGenerateText(args: { systemInstruction: string; prompt: string }): Promise<string> {
  return callGemini(args);
}
