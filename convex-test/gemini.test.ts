import { describe, expect, it } from "vitest";
import { geminiApiKey, geminiGenerateJson, extractJsonText } from "../convex/lib/gemini";

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

  describe("extractJsonText", () => {
    it("parses clean JSON", () => {
      const raw = '{"name": "Singing Contest", "rounds": []}';
      expect(JSON.parse(extractJsonText(raw))).toEqual({
        name: "Singing Contest",
        rounds: [],
      });
    });

    it("strips markdown code blocks with json tag", () => {
      const raw = '```json\n{"name": "Pageant", "rounds": []}\n```';
      expect(JSON.parse(extractJsonText(raw))).toEqual({
        name: "Pageant",
        rounds: [],
      });
    });

    it("strips markdown code blocks without language tag", () => {
      const raw = '```\n{"name": "Quiz Bee", "rounds": []}\n```';
      expect(JSON.parse(extractJsonText(raw))).toEqual({
        name: "Quiz Bee",
        rounds: [],
      });
    });

    it("extracts JSON embedded in conversational commentary", () => {
      const raw = 'Here is your template:\n```json\n{"name": "Debate", "rounds": []}\n```\nLet me know if you need changes!';
      expect(JSON.parse(extractJsonText(raw))).toEqual({
        name: "Debate",
        rounds: [],
      });
    });

    it("extracts JSON arrays embedded in text", () => {
      const raw = 'The items are: [{"id": 1}, {"id": 2}] as requested.';
      expect(JSON.parse(extractJsonText(raw))).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });
});

