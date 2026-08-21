import { describe, expect, it } from "vitest";
import {
  isDocumentSpec,
  resolvePageSize,
  MAX_ELEMENTS,
  type DocumentSpec,
  type TextElement,
} from "../../convex/documents/spec";

const validText: TextElement = {
  type: "text",
  id: "el-1",
  name: "Title",
  xMm: 10,
  yMm: 20,
  widthMm: 100,
  heightMm: 20,
  rotationDeg: 0,
  opacity: 1,
  locked: false,
  showOnAllPages: false,
  content: "Awarded to {{recipient.name}}",
  fontFamily: "Crimson Text",
  fontSizePt: 30,
  bold: true,
  italic: false,
  underline: false,
  align: "center",
  color: "#1F3A5F",
  lineHeight: 1.2,
  letterSpacingMm: 0,
};

const validSpec: DocumentSpec = {
  version: 1,
  page: {
    preset: "A4",
    orientation: "portrait",
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    background: "#FFFFFF",
  },
  elements: [validText],
};

describe("isDocumentSpec", () => {
  it("accepts a valid spec", () => {
    expect(isDocumentSpec(validSpec)).toBe(true);
  });

  it("rejects non-objects, wrong versions, and bad pages", () => {
    expect(isDocumentSpec(null)).toBe(false);
    expect(isDocumentSpec("nope")).toBe(false);
    expect(isDocumentSpec({ ...validSpec, version: 2 })).toBe(false);
    expect(isDocumentSpec({ ...validSpec, page: { ...validSpec.page, preset: "B5" } })).toBe(false);
    expect(isDocumentSpec({ ...validSpec, page: { ...validSpec.page, background: "white" } })).toBe(false);
  });

  it("rejects invalid elements and duplicate ids", () => {
    const bad = (element: Record<string, unknown>) =>
      isDocumentSpec({ ...validSpec, elements: [{ ...validText, ...element }] });

    expect(bad({ xMm: Number.NaN })).toBe(false);
    expect(bad({ widthMm: 0 })).toBe(false);
    expect(bad({ heightMm: -5 })).toBe(false);
    expect(bad({ fontSizePt: 3 })).toBe(false);
    expect(bad({ opacity: 1.5 })).toBe(false);
    expect(bad({ color: "#FFF" })).toBe(false);
    expect(bad({ align: "justify" })).toBe(false);
    expect(bad({ content: "" })).toBe(false);
    expect(
      isDocumentSpec({ ...validSpec, elements: [validText, { ...validText, name: "Dup" }] }),
    ).toBe(false);
  });

  it("rejects image elements without a storageId and shapes with bad colors", () => {
    expect(
      isDocumentSpec({
        ...validSpec,
        elements: [{ ...validText, type: "image", storageId: "", fit: "cover" } as never],
      }),
    ).toBe(false);
    expect(
      isDocumentSpec({
        ...validSpec,
        elements: [{ ...validText, type: "rect", fill: "blue", stroke: null, strokeWidthMm: 1 } as never],
      }),
    ).toBe(false);
  });

  it("rejects more than MAX_ELEMENTS elements", () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ ...validText, id: `el-${i}` }));
    expect(isDocumentSpec({ ...validSpec, elements: many })).toBe(false);
  });

  it("accepts exactly MAX_ELEMENTS elements", () => {
    const many = Array.from({ length: MAX_ELEMENTS }, (_, i) => ({ ...validText, id: `el-${i}` }));
    expect(isDocumentSpec({ ...validSpec, elements: many })).toBe(true);
  });

  it("accepts fontSizePt at both bounds (4, 200)", () => {
    expect(isDocumentSpec({ ...validSpec, elements: [{ ...validText, fontSizePt: 4 }] })).toBe(true);
    expect(isDocumentSpec({ ...validSpec, elements: [{ ...validText, fontSizePt: 200 }] })).toBe(true);
  });

  it("accepts lineHeight at both bounds (0.5, 4)", () => {
    expect(isDocumentSpec({ ...validSpec, elements: [{ ...validText, lineHeight: 0.5 }] })).toBe(true);
    expect(isDocumentSpec({ ...validSpec, elements: [{ ...validText, lineHeight: 4 }] })).toBe(true);
  });

  it("accepts opacity at both bounds (0, 1)", () => {
    expect(isDocumentSpec({ ...validSpec, elements: [{ ...validText, opacity: 0 }] })).toBe(true);
    expect(isDocumentSpec({ ...validSpec, elements: [{ ...validText, opacity: 1 }] })).toBe(true);
  });

  it("accepts custom page size at both bounds (50, 600)", () => {
    expect(
      isDocumentSpec({
        ...validSpec,
        page: { ...validSpec.page, preset: "Custom", widthMm: 50, heightMm: 600 },
      }),
    ).toBe(true);
    expect(
      isDocumentSpec({
        ...validSpec,
        page: { ...validSpec.page, preset: "Custom", widthMm: 600, heightMm: 50 },
      }),
    ).toBe(true);
  });

  it("accepts margins at both bounds (0, 100)", () => {
    const margins = { top: 0, right: 100, bottom: 0, left: 100 };
    expect(isDocumentSpec({ ...validSpec, page: { ...validSpec.page, margins } })).toBe(true);
  });
});

describe("resolvePageSize", () => {
  it("derives preset sizes and swaps for landscape", () => {
    expect(resolvePageSize(validSpec.page)).toEqual({ widthMm: 210, heightMm: 297 });
    expect(resolvePageSize({ ...validSpec.page, orientation: "landscape" })).toEqual({
      widthMm: 297,
      heightMm: 210,
    });
  });

  it("uses custom overrides when preset is Custom", () => {
    expect(
      resolvePageSize({ ...validSpec.page, preset: "Custom", widthMm: 100, heightMm: 50 }),
    ).toEqual({ widthMm: 100, heightMm: 50 });
  });
});
