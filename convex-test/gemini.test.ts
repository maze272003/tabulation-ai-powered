import { describe, expect, it } from "vitest";
import { geminiApiKey, geminiGenerateJson } from "../convex/lib/gemini";

describe("gemini wrapper", () => {
  it("throws UPSTREAM when GEMINI_API_KEY is missing", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      expect(() => geminiApiKey()).toThrowError(
        expect.objectContaining({
          data: expect.objectContaining({ code: "UPSTREAM" }),
        }),
      );
      await expect(
        geminiGenerateJson({ systemInstruction: "s", prompt: "p" }),
      ).rejects.toMatchObject({ data: { code: "UPSTREAM" } });
    } finally {
      if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
    }
  });
});
