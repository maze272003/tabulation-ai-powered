/**
 * DocumentSpec — the single source of truth for document layouts.
 * Pure module: no imports (safe to bundle into Convex functions and the app).
 * Every mutation that persists a spec must validate it with isDocumentSpec.
 */

export type Orientation = "portrait" | "landscape";
export type PagePreset = "A4" | "Letter" | "Legal" | "A5" | "Custom";
export type FontFamily = "Lato" | "Crimson Text" | "Great Vibes";
export type TextAlignment = "left" | "center" | "right";

export const PAGE_PRESET_SIZES_MM: Record<Exclude<PagePreset, "Custom">, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  Legal: { widthMm: 215.9, heightMm: 355.6 },
  A5: { widthMm: 148, heightMm: 210 },
};

export const MAX_ELEMENTS = 200;

// Stateful global (/g) regex: safe with String.replace/matchAll (they reset/clone lastIndex),
// but .test()/.exec() on it directly would corrupt the shared lastIndex across calls.
export const TOKEN_PATTERN = /\{\{([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*)\}\}/g;

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ElementBase {
  id: string;
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  opacity: number;
  locked: boolean;
  showOnAllPages: boolean;
}

export interface TextElement extends ElementBase {
  type: "text";
  content: string;
  fontFamily: FontFamily;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlignment;
  color: string;
  lineHeight: number;
  letterSpacingMm: number;
}

export interface ImageElement extends ElementBase {
  type: "image";
  storageId: string;
  fit: "contain" | "cover";
}

export type ShapeKind = "rect" | "ellipse" | "line";

export interface ShapeElement extends ElementBase {
  type: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidthMm: number;
}

export type DocumentElement = TextElement | ImageElement | ShapeElement;

export interface DocumentPage {
  preset: PagePreset;
  orientation: Orientation;
  /** Used only when preset === "Custom" (50–600 mm). */
  widthMm?: number;
  heightMm?: number;
  margins: Margins;
  background: string;
}

export interface DocumentSpec {
  version: 1;
  page: DocumentPage;
  elements: DocumentElement[];
}

export function resolvePageSize(page: DocumentPage): { widthMm: number; heightMm: number } {
  const base =
    page.preset === "Custom"
      ? { widthMm: page.widthMm ?? 0, heightMm: page.heightMm ?? 0 }
      : PAGE_PRESET_SIZES_MM[page.preset];
  return page.orientation === "landscape"
    ? { widthMm: base.heightMm, heightMm: base.widthMm }
    : { widthMm: base.widthMm, heightMm: base.heightMm };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function isMargins(value: unknown): value is Margins {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    isFiniteNumber(m.top) && inRange(m.top, 0, 100) &&
    isFiniteNumber(m.right) && inRange(m.right, 0, 100) &&
    isFiniteNumber(m.bottom) && inRange(m.bottom, 0, 100) &&
    isFiniteNumber(m.left) && inRange(m.left, 0, 100)
  );
}

function isElementBase(value: unknown): value is ElementBase {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" && e.id.length > 0 && e.id.length <= 64 &&
    typeof e.name === "string" && e.name.length > 0 && e.name.length <= 80 &&
    isFiniteNumber(e.xMm) && inRange(e.xMm, -500, 1000) &&
    isFiniteNumber(e.yMm) && inRange(e.yMm, -500, 1200) &&
    isFiniteNumber(e.widthMm) && inRange(e.widthMm, 1, 600) &&
    isFiniteNumber(e.heightMm) && inRange(e.heightMm, 1, 600) &&
    isFiniteNumber(e.rotationDeg) && inRange(e.rotationDeg, -360, 360) &&
    isFiniteNumber(e.opacity) && inRange(e.opacity, 0, 1) &&
    typeof e.locked === "boolean" &&
    typeof e.showOnAllPages === "boolean"
  );
}

const FONT_FAMILIES: readonly string[] = ["Lato", "Crimson Text", "Great Vibes"];

function isTextElement(value: unknown): value is TextElement {
  const e = value as Record<string, unknown>;
  if (!isElementBase(value)) return false;
  return (
    e.type === "text" &&
    typeof e.content === "string" && e.content.length > 0 && e.content.length <= 4000 &&
    typeof e.fontFamily === "string" && FONT_FAMILIES.includes(e.fontFamily) &&
    isFiniteNumber(e.fontSizePt) && inRange(e.fontSizePt, 4, 200) &&
    typeof e.bold === "boolean" &&
    typeof e.italic === "boolean" &&
    typeof e.underline === "boolean" &&
    (e.align === "left" || e.align === "center" || e.align === "right") &&
    isHexColor(e.color) &&
    isFiniteNumber(e.lineHeight) && inRange(e.lineHeight, 0.5, 4) &&
    isFiniteNumber(e.letterSpacingMm) && inRange(e.letterSpacingMm, -5, 20)
  );
}

function isImageElement(value: unknown): value is ImageElement {
  const e = value as Record<string, unknown>;
  if (!isElementBase(value)) return false;
  return (
    e.type === "image" &&
    typeof e.storageId === "string" && e.storageId.length > 0 && e.storageId.length <= 128 &&
    (e.fit === "contain" || e.fit === "cover")
  );
}

function isShapeElement(value: unknown): value is ShapeElement {
  const e = value as Record<string, unknown>;
  if (!isElementBase(value)) return false;
  return (
    (e.type === "rect" || e.type === "ellipse" || e.type === "line") &&
    (e.fill === null || isHexColor(e.fill)) &&
    (e.stroke === null || isHexColor(e.stroke)) &&
    isFiniteNumber(e.strokeWidthMm) && inRange(e.strokeWidthMm, 0, 50)
  );
}

export function isDocumentSpec(value: unknown): value is DocumentSpec {
  if (typeof value !== "object" || value === null) return false;
  const spec = value as Record<string, unknown>;
  if (spec.version !== 1) return false;
  const page = spec.page;
  if (typeof page !== "object" || page === null) return false;
  const p = page as Record<string, unknown>;
  const presetOk =
    p.preset === "A4" || p.preset === "Letter" || p.preset === "Legal" || p.preset === "A5" || p.preset === "Custom";
  const customOk =
    p.preset !== "Custom" ||
    (isFiniteNumber(p.widthMm) && inRange(p.widthMm, 50, 600) && isFiniteNumber(p.heightMm) && inRange(p.heightMm, 50, 600));
  if (!presetOk || !customOk) return false;
  if (p.orientation !== "portrait" && p.orientation !== "landscape") return false;
  if (!isMargins(p.margins) || !isHexColor(p.background)) return false;
  if (!Array.isArray(spec.elements) || spec.elements.length === 0 || spec.elements.length > MAX_ELEMENTS) {
    return false;
  }
  const ids = new Set<string>();
  for (const element of spec.elements) {
    const ok =
      (isTextElement(element) || isImageElement(element) || isShapeElement(element)) && !ids.has(element.id);
    if (!ok) return false;
    ids.add(element.id);
  }
  return true;
}
