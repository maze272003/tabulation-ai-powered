import { describe, expect, it } from "vitest";
import {
  buildCertificateIntents,
  validateDesignIntentResponse,
  type DesignIntent,
} from "../convex/lib/certificateAi";

const validIntent = {
  name: "Gold Gala Certificate",
  description: "Elegant navy and gold certificate for gala winners",
  orientation: "portrait",
  frame: "classic-double",
  palette: { background: "#FFFDF6", primary: "#1F3A5F", accent: "#C9A227", ink: "#333333" },
  scriptFont: "Great Vibes",
  headingFont: "Crimson Text",
  text: {
    title: "CERTIFICATE OF EXCELLENCE",
    subtitle: "GRAND GALA NIGHT",
    presentedLine: "This certificate is proudly presented to",
    citation: "for outstanding achievement at {{event.name}}",
    dateLine: "Awarded this {{issued.date}}",
    signatureLabels: ["Event Director", "Chief Judge"],
  },
} satisfies DesignIntent;

describe("validateDesignIntentResponse", () => {
  it("accepts a three-variant response and keeps order", () => {
    const result = validateDesignIntentResponse({
      variants: [validIntent, { ...validIntent, frame: "minimal" }, { ...validIntent, frame: "ornate" }],
    });
    expect("intents" in result && result.intents).toHaveLength(3);
  });

  it("accepts at least one variant when fewer returned", () => {
    const result = validateDesignIntentResponse({ variants: [validIntent] });
    expect("intents" in result && result.intents).toHaveLength(1);
  });

  it("honors the rejection contract", () => {
    const result = validateDesignIntentResponse({ rejected: true, reason: "Not a certificate request." });
    expect(result).toEqual({ rejected: true, reason: "Not a certificate request." });
  });

  it("rejects malformed shapes with precise errors", () => {
    expect(validateDesignIntentResponse(null)).toMatchObject({ error: expect.any(String) });
    expect(validateDesignIntentResponse({ variants: [] })).toMatchObject({ error: expect.any(String) });
    expect(
      validateDesignIntentResponse({ variants: [{ ...validIntent, palette: { ...validIntent.palette, accent: "gold" } }] }),
    ).toMatchObject({ error: expect.any(String) });
    expect(
      validateDesignIntentResponse({ variants: [{ ...validIntent, frame: "neon" }] }),
    ).toMatchObject({ error: expect.any(String) });
    expect(
      validateDesignIntentResponse({ variants: [{ ...validIntent, text: { ...validIntent.text, title: "" } }] }),
    ).toMatchObject({ error: expect.any(String) });
    expect(
      validateDesignIntentResponse({
        variants: [{ ...validIntent, text: { ...validIntent.text, signatureLabels: ["Only One"] } }],
      }),
    ).toMatchObject({ error: expect.any(String) });
    expect(
      validateDesignIntentResponse({
        variants: [{ ...validIntent, text: { ...validIntent.text, citation: "x".repeat(121) } }],
      }),
    ).toMatchObject({ error: expect.any(String) });
  });
});

describe("buildCertificateIntents", () => {
  it("returns intents from a valid first response", async () => {
    const result = await buildCertificateIntents("gold pageant", async () => ({ variants: [validIntent] }));
    expect(result && "intents" in result).toBe(true);
  });

  it("retries once on a malformed first response", async () => {
    let calls = 0;
    const result = await buildCertificateIntents("gold pageant", async () => {
      calls += 1;
      return calls === 1 ? { variants: [{ broken: true }] } : { variants: [validIntent] };
    });
    expect(calls).toBe(2);
    expect(result && "intents" in result).toBe(true);
  });

  it("returns null when both responses are malformed and passes rejection through", async () => {
    expect(await buildCertificateIntents("x", async () => ({ nope: 1 }))).toBeNull();
    const rejected = await buildCertificateIntents("x", async () => ({ rejected: true, reason: "off-topic" }));
    expect(rejected).toEqual({ rejected: true, reason: "off-topic" });
  });

  it("returns null for empty or oversized prompts", async () => {
    expect(await buildCertificateIntents("   ", async () => ({}))).toBeNull();
    expect(await buildCertificateIntents("x".repeat(2001), async () => ({}))).toBeNull();
  });
});
