import type {
  DocumentSpec,
  ShapeElement,
  TextElement,
} from "../../convex/documents/spec";
import type { DesignIntent } from "../../convex/lib/certificateAi";

const MARGIN_MM = 15;

interface Band {
  yFrac: number;
  hFrac: number;
}

// Vertical rhythm as fractions of printable height (between margins).
const BANDS = {
  org: { yFrac: 0.0, hFrac: 0.045 },
  title: { yFrac: 0.075, hFrac: 0.085 },
  subtitle: { yFrac: 0.165, hFrac: 0.04 },
  presented: { yFrac: 0.26, hFrac: 0.035 },
  recipient: { yFrac: 0.31, hFrac: 0.13 },
  rule: { yFrac: 0.455, hFrac: 0.008 },
  citation: { yFrac: 0.48, hFrac: 0.06 },
  date: { yFrac: 0.58, hFrac: 0.035 },
  signature: { yFrac: 0.8, hFrac: 0.03 },
} satisfies Record<string, Band>;

function text(
  id: string,
  content: string,
  box: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  style: Partial<Pick<TextElement, "fontFamily" | "fontSizePt" | "bold" | "italic" | "color" | "letterSpacingMm" | "align">>,
): TextElement {
  return {
    type: "text",
    id,
    name: id.replace("ai-", "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    ...box,
    rotationDeg: 0,
    opacity: 1,
    locked: false,
    showOnAllPages: false,
    content,
    fontFamily: "Lato",
    fontSizePt: 12,
    bold: false,
    italic: false,
    underline: false,
    align: "center",
    color: "#333333",
    lineHeight: 1.3,
    letterSpacingMm: 0,
    ...style,
  };
}

function shape(
  id: string,
  box: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  style: Partial<Pick<ShapeElement, "type" | "fill" | "stroke" | "strokeWidthMm">>,
): ShapeElement {
  return {
    type: "rect",
    id,
    name: id.replace("ai-", "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    ...box,
    rotationDeg: 0,
    opacity: 1,
    locked: false,
    showOnAllPages: false,
    fill: null,
    stroke: "#888888",
    strokeWidthMm: 0.5,
    ...style,
  };
}

/** Deterministic intent → DocumentSpec compiler. Output always passes isDocumentSpec. */
export function compileDesignIntent(intent: DesignIntent): DocumentSpec {
  const portrait = intent.orientation === "portrait";
  const widthMm = portrait ? 210 : 297;
  const heightMm = portrait ? 297 : 210;
  const printW = widthMm - 2 * MARGIN_MM;
  const printH = heightMm - 2 * MARGIN_MM;

  const modern = intent.frame === "modern-bar";
  const contentX = modern ? MARGIN_MM + 11 : MARGIN_MM;
  const contentW = modern ? printW - 11 : printW;
  const bandY = (band: Band) => MARGIN_MM + band.yFrac * printH;
  const bandH = (band: Band) => Math.max(band.hFrac * printH, 4);

  const citation = intent.text.citation.includes("{{event.name}}")
    ? intent.text.citation
    : `${intent.text.citation} at {{event.name}}`;
  const dateLine = intent.text.dateLine.includes("{{issued.date}}")
    ? intent.text.dateLine
    : `${intent.text.dateLine} — {{issued.date}}`;

  const elements: Array<TextElement | ShapeElement> = [];

  if (intent.frame === "classic-double") {
    elements.push(shape("ai-frame-outer", { xMm: 8, yMm: 8, widthMm: widthMm - 16, heightMm: heightMm - 16 }, { stroke: intent.palette.accent, strokeWidthMm: 1.2 }));
    elements.push(shape("ai-frame-inner", { xMm: 12, yMm: 12, widthMm: widthMm - 24, heightMm: heightMm - 24 }, { stroke: intent.palette.accent, strokeWidthMm: 0.6 }));
  }
  if (intent.frame === "ornate") {
    elements.push(shape("ai-frame-outer", { xMm: 10, yMm: 10, widthMm: widthMm - 20, heightMm: heightMm - 20 }, { stroke: intent.palette.accent, strokeWidthMm: 1 }));
    elements.push(shape("ai-ornament", { xMm: widthMm / 2 - 17, yMm: bandY(BANDS.org) + bandH(BANDS.org) + 2, widthMm: 34, heightMm: 10 }, { type: "ellipse", stroke: intent.palette.accent, strokeWidthMm: 0.6 }));
  }
  if (modern) {
    elements.push(shape("ai-accent-bar", { xMm: MARGIN_MM, yMm: bandY(BANDS.title) - 4, widthMm: 5, heightMm: bandY(BANDS.citation) + bandH(BANDS.citation) - bandY(BANDS.title) + 8 }, { fill: intent.palette.primary, stroke: null, strokeWidthMm: 0 }));
  }

  elements.push(text("ai-org", "{{org.name}}", { xMm: contentX, yMm: bandY(BANDS.org), widthMm: contentW, heightMm: bandH(BANDS.org) }, { fontSizePt: 15, bold: true, color: intent.palette.ink }));
  elements.push(text("ai-title", intent.text.title, { xMm: contentX, yMm: bandY(BANDS.title), widthMm: contentW, heightMm: bandH(BANDS.title) }, { fontFamily: intent.headingFont, fontSizePt: 34, bold: true, color: intent.palette.primary, letterSpacingMm: 1.5 }));
  if (intent.text.subtitle) {
    elements.push(text("ai-subtitle", intent.text.subtitle, { xMm: contentX, yMm: bandY(BANDS.subtitle), widthMm: contentW, heightMm: bandH(BANDS.subtitle) }, { fontSizePt: 13, color: intent.palette.ink, letterSpacingMm: 2 }));
  }
  elements.push(text("ai-presented", intent.text.presentedLine, { xMm: contentX, yMm: bandY(BANDS.presented), widthMm: contentW, heightMm: bandH(BANDS.presented) }, { fontSizePt: 12, italic: true, color: intent.palette.ink }));
  elements.push(text("ai-recipient", "{{recipient.name}}", { xMm: contentX, yMm: bandY(BANDS.recipient), widthMm: contentW, heightMm: bandH(BANDS.recipient) }, { fontFamily: "Great Vibes", fontSizePt: portrait ? 52 : 44, color: intent.palette.primary }));
  elements.push(shape("ai-rule", { xMm: contentX + contentW * 0.2, yMm: bandY(BANDS.rule), widthMm: contentW * 0.6, heightMm: 2 }, { stroke: intent.palette.accent, strokeWidthMm: 0.5 }));
  elements.push(text("ai-citation", citation, { xMm: contentX + contentW * 0.075, yMm: bandY(BANDS.citation), widthMm: contentW * 0.85, heightMm: bandH(BANDS.citation) }, { fontSizePt: 11.5, color: intent.palette.ink }));
  elements.push(text("ai-date", dateLine, { xMm: contentX, yMm: bandY(BANDS.date), widthMm: contentW, heightMm: bandH(BANDS.date) }, { fontSizePt: 11, color: intent.palette.ink }));

  const sigW = Math.min(contentW * 0.36, 70);
  const sigGap = contentW * 0.18;
  const sig1X = contentX + contentW / 2 - sigGap / 2 - sigW;
  const sig2X = contentX + contentW / 2 + sigGap / 2;
  const sigY = bandY(BANDS.signature);
  for (const [index, xMm] of [sig1X, sig2X].entries()) {
    elements.push(shape(`ai-sig-line-${index + 1}`, { xMm, yMm: sigY, widthMm: sigW, heightMm: 2 }, { stroke: intent.palette.ink, strokeWidthMm: 0.5 }));
    elements.push(text(`ai-sig-label-${index + 1}`, intent.text.signatureLabels[index], { xMm, yMm: sigY + 4, widthMm: sigW, heightMm: 6 }, { fontSizePt: 9, color: intent.palette.ink }));
  }

  return {
    version: 1,
    page: {
      preset: "A4",
      orientation: intent.orientation,
      margins: { top: MARGIN_MM, right: MARGIN_MM, bottom: MARGIN_MM, left: MARGIN_MM },
      background: intent.palette.background,
    },
    elements,
  };
}
