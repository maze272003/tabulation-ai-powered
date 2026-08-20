import type { MutationCtx } from "../_generated/server";
import type { DocumentSpec, ShapeElement, TextElement } from "./spec";

function text(partial: Partial<TextElement> & Pick<TextElement, "id" | "name" | "content" | "yMm">): TextElement {
  return {
    type: "text",
    xMm: 15,
    widthMm: 180,
    heightMm: 12,
    rotationDeg: 0,
    opacity: 1,
    locked: false,
    showOnAllPages: false,
    fontFamily: "Lato",
    fontSizePt: 12,
    bold: false,
    italic: false,
    underline: false,
    align: "center",
    color: "#333333",
    lineHeight: 1.3,
    letterSpacingMm: 0,
    ...partial,
  };
}

function shape(
  partial: Partial<ShapeElement> & Pick<ShapeElement, "id" | "name" | "xMm" | "yMm" | "widthMm" | "heightMm">,
): ShapeElement {
  return {
    type: "rect",
    rotationDeg: 0,
    opacity: 1,
    locked: false,
    showOnAllPages: false,
    fill: null,
    stroke: "#888888",
    strokeWidthMm: 0.5,
    ...partial,
  };
}

const A4_PORTRAIT = {
  preset: "A4" as const,
  orientation: "portrait" as const,
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  background: "#FFFFFF",
};

const classicBorder: DocumentSpec = {
  version: 1,
  page: { ...A4_PORTRAIT, background: "#FFFDF6" },
  elements: [
    shape({ id: "classic-frame-outer", name: "Outer frame", xMm: 8, yMm: 8, widthMm: 194, heightMm: 281, stroke: "#C9A227", strokeWidthMm: 1.5 }),
    shape({ id: "classic-frame-inner", name: "Inner frame", xMm: 12, yMm: 12, widthMm: 186, heightMm: 273, stroke: "#C9A227", strokeWidthMm: 0.75 }),
    text({ id: "classic-org", name: "Organization", content: "{{org.name}}", yMm: 30, fontFamily: "Crimson Text", fontSizePt: 16, bold: true, color: "#555555" }),
    text({ id: "classic-title", name: "Title", content: "CERTIFICATE", yMm: 52, fontFamily: "Crimson Text", fontSizePt: 36, bold: true, color: "#1F3A5F", letterSpacingMm: 2 }),
    text({ id: "classic-subtitle", name: "Subtitle", content: "OF ACHIEVEMENT", yMm: 74, fontFamily: "Crimson Text", fontSizePt: 14, color: "#777777", letterSpacingMm: 2.5 }),
    text({ id: "classic-presented", name: "Presented to", content: "This certificate is proudly presented to", yMm: 108, fontSizePt: 12, italic: true, color: "#555555" }),
    text({ id: "classic-recipient", name: "Recipient name", content: "{{recipient.name}}", yMm: 128, heightMm: 24, fontFamily: "Great Vibes", fontSizePt: 52, color: "#1F3A5F" }),
    shape({ id: "classic-name-line", name: "Name line", xMm: 40, yMm: 168, widthMm: 130, heightMm: 2, stroke: "#999999", strokeWidthMm: 0.5 }),
    text({ id: "classic-citation", name: "Citation", content: "for outstanding achievement in {{event.name}}", yMm: 178, fontSizePt: 11, color: "#555555", heightMm: 16 }),
    text({ id: "classic-date", name: "Date", content: "Awarded this {{issued.date}}", yMm: 208, fontSizePt: 11, color: "#555555" }),
    shape({ id: "classic-sig-line-1", name: "Signature line 1", xMm: 25, yMm: 244, widthMm: 70, heightMm: 2, stroke: "#666666", strokeWidthMm: 0.5 }),
    text({ id: "classic-sig-label-1", name: "Signature label 1", content: "Event Director", xMm: 25, yMm: 248, widthMm: 70, fontSizePt: 9, color: "#666666" }),
    shape({ id: "classic-sig-line-2", name: "Signature line 2", xMm: 115, yMm: 244, widthMm: 70, heightMm: 2, stroke: "#666666", strokeWidthMm: 0.5 }),
    text({ id: "classic-sig-label-2", name: "Signature label 2", content: "Chief Judge", xMm: 115, yMm: 248, widthMm: 70, fontSizePt: 9, color: "#666666" }),
  ],
};

const modernMinimal: DocumentSpec = {
  version: 1,
  page: { ...A4_PORTRAIT, background: "#FAFBFD" },
  elements: [
    shape({ id: "modern-accent", name: "Accent bar", xMm: 22, yMm: 48, widthMm: 5, heightMm: 96, fill: "#2E5AAC", stroke: null, strokeWidthMm: 0 }),
    text({ id: "modern-org", name: "Organization", content: "{{org.name}}", xMm: 32, yMm: 48, widthMm: 160, align: "left", fontSizePt: 12, letterSpacingMm: 1.5, color: "#2E5AAC", bold: true }),
    text({ id: "modern-title", name: "Title", content: "Certificate of Excellence", xMm: 32, yMm: 68, widthMm: 160, align: "left", fontFamily: "Crimson Text", fontSizePt: 30, bold: true, color: "#1B1F2B" }),
    text({ id: "modern-presented", name: "Presented to", content: "Proudly presented to", xMm: 32, yMm: 100, widthMm: 160, align: "left", fontSizePt: 11, color: "#6B7280" }),
    text({ id: "modern-recipient", name: "Recipient name", content: "{{recipient.name}}", xMm: 32, yMm: 114, widthMm: 160, heightMm: 18, align: "left", fontSizePt: 34, bold: true, color: "#1B1F2B" }),
    text({ id: "modern-citation", name: "Citation", content: "in recognition of outstanding performance at {{event.name}}", xMm: 32, yMm: 140, widthMm: 150, align: "left", fontSizePt: 11, color: "#4B5563", heightMm: 24 }),
    text({ id: "modern-date", name: "Date", content: "{{issued.date}}", xMm: 32, yMm: 210, widthMm: 160, align: "left", fontSizePt: 11, color: "#6B7280" }),
    shape({ id: "modern-sig-line", name: "Signature line", xMm: 32, yMm: 238, widthMm: 60, heightMm: 2, stroke: "#9CA3AF", strokeWidthMm: 0.5 }),
    text({ id: "modern-sig-label", name: "Signature label", content: "Authorized Signature", xMm: 32, yMm: 242, widthMm: 60, align: "left", fontSizePt: 9, color: "#9CA3AF" }),
  ],
};

const elegantScript: DocumentSpec = {
  version: 1,
  page: { ...A4_PORTRAIT, background: "#FFFDF7" },
  elements: [
    shape({ id: "elegant-frame-1", name: "Frame 1", xMm: 10, yMm: 10, widthMm: 190, heightMm: 277, stroke: "#8C6D3F", strokeWidthMm: 1 }),
    shape({ id: "elegant-frame-2", name: "Frame 2", xMm: 14, yMm: 14, widthMm: 182, heightMm: 269, stroke: "#8C6D3F", strokeWidthMm: 0.4 }),
    shape({ id: "elegant-ornament", name: "Ornament", xMm: 88, yMm: 36, widthMm: 34, heightMm: 10, type: "ellipse", stroke: "#C9A227", strokeWidthMm: 0.6 }),
    text({ id: "elegant-org", name: "Organization", content: "{{org.name}}", yMm: 56, fontFamily: "Crimson Text", fontSizePt: 15, color: "#8C6D3F" }),
    text({ id: "elegant-title", name: "Title", content: "Certificate of Recognition", yMm: 76, fontFamily: "Crimson Text", fontSizePt: 28, bold: true, color: "#4A3B22" }),
    text({ id: "elegant-presented", name: "Presented to", content: "presented with gratitude to", yMm: 106, fontFamily: "Crimson Text", fontSizePt: 12, italic: true, color: "#8C6D3F" }),
    text({ id: "elegant-recipient", name: "Recipient name", content: "{{recipient.name}}", yMm: 124, heightMm: 26, fontFamily: "Great Vibes", fontSizePt: 56, color: "#4A3B22" }),
    shape({ id: "elegant-name-line", name: "Name line", xMm: 45, yMm: 172, widthMm: 120, heightMm: 2, stroke: "#C9A227", strokeWidthMm: 0.5 }),
    text({ id: "elegant-citation", name: "Citation", content: "whose excellence illuminated {{event.name}}", yMm: 182, fontFamily: "Crimson Text", fontSizePt: 13, italic: true, color: "#6B5B3E", heightMm: 16 }),
    text({ id: "elegant-date", name: "Date", content: "Given this {{issued.date}}", yMm: 212, fontFamily: "Crimson Text", fontSizePt: 12, color: "#6B5B3E" }),
    shape({ id: "elegant-sig-line-1", name: "Signature line 1", xMm: 28, yMm: 246, widthMm: 66, heightMm: 2, stroke: "#8C6D3F", strokeWidthMm: 0.5 }),
    text({ id: "elegant-sig-label-1", name: "Signature label 1", content: "Organizer", xMm: 28, yMm: 250, widthMm: 66, fontFamily: "Crimson Text", fontSizePt: 10, color: "#6B5B3E" }),
    shape({ id: "elegant-sig-line-2", name: "Signature line 2", xMm: 116, yMm: 246, widthMm: 66, heightMm: 2, stroke: "#8C6D3F", strokeWidthMm: 0.5 }),
    text({ id: "elegant-sig-label-2", name: "Signature label 2", content: "Judge", xMm: 116, yMm: 250, widthMm: 66, fontFamily: "Crimson Text", fontSizePt: 10, color: "#6B5B3E" }),
  ],
};

export const SYSTEM_CERTIFICATE_TEMPLATES: { name: string; description: string; spec: DocumentSpec }[] = [
  { name: "Classic Border Certificate", description: "Traditional gold double-border certificate with script name", spec: classicBorder },
  { name: "Modern Minimal Certificate", description: "Clean left-aligned layout with a bold accent bar", spec: modernMinimal },
  { name: "Elegant Script Certificate", description: "Serif-heavy formal certificate with ornamental frame", spec: elegantScript },
];

/** Idempotently materializes system certificate templates. Called from seedReferenceDataInternal. */
export async function seedSystemDocumentTemplates(ctx: MutationCtx): Promise<void> {
  for (const template of SYSTEM_CERTIFICATE_TEMPLATES) {
    const existing = await ctx.db
      .query("documentTemplates")
      .withIndex("by_kind", (q) => q.eq("kind", "certificate"))
      .filter((q) => q.eq(q.field("isSystem"), true) && q.eq(q.field("name"), template.name))
      .first();
    if (existing) continue;
    await ctx.db.insert("documentTemplates", {
      kind: "certificate",
      name: template.name,
      description: template.description,
      spec: template.spec,
      isSystem: true,
      updatedAt: Date.now(),
    });
  }
}
