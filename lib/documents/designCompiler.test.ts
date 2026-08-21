import { describe, expect, it } from "vitest";
import { compileDesignIntent } from "./designCompiler";
import { isDocumentSpec, resolvePageSize, type TextElement } from "../../convex/documents/spec";
import type { DesignIntent } from "../../convex/lib/certificateAi";

const baseIntent: DesignIntent = {
  name: "Gold Gala",
  description: "Navy and gold elegance",
  orientation: "portrait",
  frame: "classic-double",
  palette: { background: "#FFFDF6", primary: "#1F3A5F", accent: "#C9A227", ink: "#333333" },
  scriptFont: "Great Vibes",
  headingFont: "Crimson Text",
  text: {
    title: "CERTIFICATE OF EXCELLENCE",
    subtitle: "GRAND GALA NIGHT",
    presentedLine: "This certificate is proudly presented to",
    citation: "for outstanding achievement",
    dateLine: "Awarded today",
    signatureLabels: ["Event Director", "Chief Judge"],
  },
};

const frames = ["classic-double", "minimal", "modern-bar", "ornate"] as const;

describe("compileDesignIntent", () => {
  it("always produces isDocumentSpec-valid output for every frame and orientation", () => {
    for (const frame of frames) {
      for (const orientation of ["portrait", "landscape"] as const) {
        const spec = compileDesignIntent({ ...baseIntent, frame, orientation });
        expect(isDocumentSpec(spec), `${frame}/${orientation}`).toBe(true);
      }
    }
  });

  it("places every element inside the page bounds", () => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const spec = compileDesignIntent({ ...baseIntent, orientation });
      const { widthMm, heightMm } = resolvePageSize(spec.page);
      for (const element of spec.elements) {
        expect(element.xMm).toBeGreaterThanOrEqual(0);
        expect(element.yMm).toBeGreaterThanOrEqual(0);
        expect(element.xMm + element.widthMm).toBeLessThanOrEqual(widthMm + 0.001);
        expect(element.yMm + element.heightMm).toBeLessThanOrEqual(heightMm + 0.001);
      }
    }
  });

  it("maps palette, fonts, and tokens", () => {
    const spec = compileDesignIntent(baseIntent);
    const elements = spec.elements;
    const recipient = elements.find((e) => e.id === "ai-recipient") as TextElement;
    expect(recipient.fontFamily).toBe("Great Vibes");
    expect(recipient.content).toBe("{{recipient.name}}");
    expect(recipient.color).toBe("#1F3A5F");
    const title = elements.find((e) => e.id === "ai-title") as TextElement;
    expect(title.fontFamily).toBe("Crimson Text");
    expect(title.bold).toBe(true);
    expect(spec.page.background).toBe("#FFFDF6");
    expect((elements.find((e) => e.id === "ai-org") as TextElement).content).toBe("{{org.name}}");
  });

  it("appends missing tokens to citation and dateLine", () => {
    const spec = compileDesignIntent(baseIntent);
    const citation = spec.elements.find((e) => e.id === "ai-citation") as TextElement;
    const date = spec.elements.find((e) => e.id === "ai-date") as TextElement;
    expect(citation.content).toContain("{{event.name}}");
    expect(date.content).toContain("{{issued.date}}");
  });

  it("renders both signature groups and frame decorations per style", () => {
    for (const frame of frames) {
      const spec = compileDesignIntent({ ...baseIntent, frame });
      const ids = spec.elements.map((e) => e.id);
      expect(ids).toContain("ai-sig-line-1");
      expect(ids).toContain("ai-sig-label-2");
      if (frame === "classic-double") expect(ids).toContain("ai-frame-outer");
      if (frame === "ornate") expect(ids).toContain("ai-ornament");
      if (frame === "modern-bar") expect(ids).toContain("ai-accent-bar");
      if (frame === "minimal") expect(ids.filter((id) => id.startsWith("ai-frame"))).toHaveLength(0);
    }
  });
});
