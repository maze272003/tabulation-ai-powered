import { describe, expect, it } from "vitest";
import { pointsToSvgPath, validateSvgSignature, formatVerificationHash, textToSvgPath } from "./vector";

describe("signature vector utilities", () => {
  it("converts raw points to smooth cubic SVG path", () => {
    const points: Array<[number, number]> = [
      [10, 10],
      [20, 30],
      [50, 40],
      [80, 70],
    ];
    const path = pointsToSvgPath(points);
    expect(path.startsWith("M10 10")).toBe(true);
    expect(path).toContain("Q");
    expect(validateSvgSignature(path)).toBe(true);
  });

  it("handles single point or empty points gracefully", () => {
    expect(pointsToSvgPath([])).toBe("");
    expect(pointsToSvgPath([[15, 25]])).toBe("M15 25 L15.1 25.1");
  });

  it("validates safe SVG path and rejects malicious script tags", () => {
    expect(validateSvgSignature("M10 10 Q20 20 30 30 Z")).toBe(true);
    expect(validateSvgSignature("<script>alert('xss')</script>")).toBe(false);
    expect(validateSvgSignature("javascript:void(0)")).toBe(false);
    expect(validateSvgSignature("")).toBe(false);
  });

  it("formats verification hash with clean hyphenated chunks", () => {
    const fullHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const formatted = formatVerificationHash(fullHash);
    expect(formatted.length).toBe(19); // 4 chunks of 4 hex chars + 3 hyphens (e3b0-c442-98fc-1c14)
    expect(formatted).toBe("E3B0-C442-98FC-1C14");
  });

  it("converts typed text to an SVG vector path representation", () => {
    const svgPath = textToSvgPath("Jane Doe", 0);
    expect(svgPath.length).toBeGreaterThan(10);
    expect(validateSvgSignature(svgPath)).toBe(true);
  });
});
