# Canva-Style Certificate Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual drag-and-drop certificate editor (Studio) with mm-accurate positioning, snapping, undo/redo, and deterministic PDF export via `@react-pdf/renderer`, plus a document-template library and per-recipient certificate generation.

**Architecture:** A versioned `DocumentSpec` JSON (pure module in `convex/documents/spec.ts`) is the single source of truth. The editor renders the spec on an HTML canvas at `1mm = 96/25.4 px` (page scaled via CSS transform); the same spec renders through `@react-pdf/renderer` with the same TTF files for deterministic PDFs (True Preview renders the real PDF blob in an iframe). Convex stores templates in a new `documentTemplates` table (system + org tiers) guarded by `requireOrgMember` / a new `documents.manage` permission; images live in Convex file storage.

**Tech Stack:** Next.js 16 (App Router, React 19, Tailwind 4, shadcn-style primitives in `components/ui`), Convex (`convex/`), `@react-pdf/renderer` v4 (only new dependency), Vitest + convex-test (tests must live under `convex-test/`, `lib/`, or `components/` — see `vitest.config.mts` include), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-20-certificate-editor-design.md` (approved). Read it before starting.

## Global Constraints

- TypeScript strict; no `any` (single sanctioned exception: `spec: v.any()` in the schema, always re-validated by `isDocumentSpec` before every write).
- No `@ts-ignore`, no `eslint-disable`, no `NOSONAR`.
- Convex rules per `convex/_generated/ai/guidelines.md`: args validators on every function; authz via `requireOrgMember`/`requirePermission` from `convex/lib/authz.ts`; audits via `writeAudit` (`convex/lib/audit.ts`); errors via `appError` + `ErrorCode` (`convex/lib/errors.ts`).
- All spec coordinates/sizes are millimeters (`xMm`, `yMm`, `widthMm`, `heightMm`, `strokeWidthMm`, `letterSpacingMm`); font size in points (`fontSizePt`).
- Element `xMm/yMm` is the **unrotated** top-left; `rotationDeg` rotates clockwise around the element center (HTML: `transform: rotate(deg)`; PDF: `transform: rotate(deg)`).
- Fonts (OFL, static TTFs only — Inter/Playfair are variable-only upstream and were substituted): **Lato** (Regular/Bold/Italic), **Crimson Text** (Regular/Bold/Italic), **Great Vibes** (Regular).
- Tokens: `{{namespace.field}}`; unknown/missing → fallback `[namespace.field]`, never throw.
- New client components go in `components/documents/` with `"use client"`; the only new npm dependency is `@react-pdf/renderer`.
- Test placement (vitest include globs): pure-logic tests in `lib/**/*.test.ts`, Convex function tests in `convex-test/**/*.test.ts` using `convex-test/setup.ts` helpers (`setupTest`, `aliceIdentity`, `bobIdentity`, `createOrgAndEvent`).
- Validation gates after every task: `npm run typecheck` and `npm run lint`; `npm run test` when the task adds tests. Final task runs all gates + `npm run build`.
- Commit after every task, conventional-commit style matching `git log --oneline` (e.g. `feat(documents): ...`, `test(documents): ...`).

## File Map

```
convex/documents/spec.ts                    DocumentSpec types + runtime guards (pure, zero imports)
convex/documents/systemTemplates.ts         3 system certificate specs + idempotent seeder
convex/documents/templates.ts               CRUD queries/mutations (authz + audit)
convex/documents/assets.ts                  generateUploadUrl + assetUrls
convex/schema.ts                            + documentTemplates table
convex/lib/constants.ts                     + documents.manage permission
convex/seed.ts                              wire system document template seeding
lib/documents/fonts.ts                      font registry, @font-face injection, react-pdf Font.register
lib/documents/tokens.ts                     token catalog, parser, resolver, sample data
lib/documents/geometry.ts                   pure rotate/resize/hit-test math
lib/documents/snap.ts                       snapping engine
lib/documents/renderPdf.tsx                 spec → react-pdf → Blob/Buffer
lib/documents/editorState.ts                reducer + history + hook
lib/download.ts                             + downloadBlobFile
components/documents/DocumentTemplateLibrary.tsx
components/documents/GenerateCertificatesDialog.tsx
components/documents/editor/EditorShell.tsx
components/documents/editor/Canvas.tsx
components/documents/editor/ElementView.tsx
components/documents/editor/SelectionOverlay.tsx
components/documents/editor/Toolbar.tsx
components/documents/editor/Palette.tsx
components/documents/editor/Inspector.tsx
components/documents/editor/LayersPanel.tsx
components/documents/editor/PageSetupPanel.tsx
components/documents/editor/TokenPicker.tsx
components/documents/editor/TruePreview.tsx
app/app/[orgSlug]/documents/page.tsx        template library page
app/app/[orgSlug]/layout.tsx                + nav item
app/studio/[orgSlug]/[templateId]/page.tsx  full-screen editor page
public/fonts/*.ttf                          7 OFL TTFs + OFL-LICENSES.txt
convex-test/documents.test.ts               authz + CRUD + seed integration tests
convex-test/documentFixtures.ts             shared valid spec fixture
lib/documents/{spec,tokens,geometry,snap,editorState,renderPdf}.test.ts
e2e/08-certificate-documents.spec.ts
```

---

### Task 1: Dependency, fonts, and spec amendment

**Files:**
- Modify: `package.json` (via npm)
- Create: `public/fonts/{Lato-Regular,Lato-Bold,Lato-Italic,CrimsonText-Regular,CrimsonText-Bold,CrimsonText-Italic,GreatVibes-Regular}.ttf`, `public/fonts/OFL-LICENSES.txt`
- Create: `lib/documents/fonts.ts`
- Modify: `docs/superpowers/specs/2026-08-20-certificate-editor-design.md` (font table only)

**Interfaces:**
- Produces: `FontFamily` values `"Lato" | "Crimson Text" | "Great Vibes"` (type defined in Task 2), `FONT_FILES`, `FONT_META`, `ensureEditorFontsLoaded(): void`, `registerPdfFonts(baseUrl?: string): Promise<void>`, `storageIdFromUploadUrl(url: string): string`.

- [ ] **Step 1: Install the dependency**

```bash
npm install @react-pdf/renderer
```

Expected: `package.json` gains `"@react-pdf/renderer": "^4.6.1"`.

- [ ] **Step 2: Download the 7 OFL TTFs (verified static files from google/fonts)**

```powershell
New-Item -ItemType Directory -Force -Path public\fonts | Out-Null
$base = "https://raw.githubusercontent.com/google/fonts/main/ofl"
Invoke-WebRequest -Uri "$base/lato/Lato-Regular.ttf" -OutFile public\fonts\Lato-Regular.ttf
Invoke-WebRequest -Uri "$base/lato/Lato-Bold.ttf" -OutFile public\fonts\Lato-Bold.ttf
Invoke-WebRequest -Uri "$base/lato/Lato-Italic.ttf" -OutFile public\fonts\Lato-Italic.ttf
Invoke-WebRequest -Uri "$base/crimsontext/CrimsonText-Regular.ttf" -OutFile public\fonts\CrimsonText-Regular.ttf
Invoke-WebRequest -Uri "$base/crimsontext/CrimsonText-Bold.ttf" -OutFile public\fonts\CrimsonText-Bold.ttf
Invoke-WebRequest -Uri "$base/crimsontext/CrimsonText-Italic.ttf" -OutFile public\fonts\CrimsonText-Italic.ttf
Invoke-WebRequest -Uri "$base/greatvibes/GreatVibes-Regular.ttf" -OutFile public\fonts\GreatVibes-Regular.ttf
Invoke-WebRequest -Uri "$base/lato/OFL.txt" -OutFile public\fonts\OFL-LICENSES.txt
Add-Content public\fonts\OFL-LICENSES.txt "`n`n== Crimson Text =="
Invoke-WebRequest -Uri "$base/crimsontext/OFL.txt" -OutFile "$env:TEMP\ofl-crimson.txt"
Add-Content public\fonts\OFL-LICENSES.txt (Get-Content "$env:TEMP\ofl-crimson.txt" -Raw)
Add-Content public\fonts\OFL-LICENSES.txt "`n`n== Great Vibes =="
Invoke-WebRequest -Uri "$base/greatvibes/OFL.txt" -OutFile "$env:TEMP\ofl-vibes.txt"
Add-Content public\fonts\OFL-LICENSES.txt (Get-Content "$env:TEMP\ofl-vibes.txt" -Raw)
```

Expected: 7 `.ttf` files each > 40 KB; one combined license file.

- [ ] **Step 3: Create `lib/documents/fonts.ts`**

```ts
import type { FontFamily } from "@/convex/documents/spec";

export interface FontFileInfo {
  path: string;
  weight: 400 | 700;
  style: "normal" | "italic";
}

export interface FontMeta {
  category: "sans" | "serif" | "script";
  hasBold: boolean;
  hasItalic: boolean;
}

export const FONT_FILES: Record<FontFamily, FontFileInfo[]> = {
  Lato: [
    { path: "/fonts/Lato-Regular.ttf", weight: 400, style: "normal" },
    { path: "/fonts/Lato-Bold.ttf", weight: 700, style: "normal" },
    { path: "/fonts/Lato-Italic.ttf", weight: 400, style: "italic" },
  ],
  "Crimson Text": [
    { path: "/fonts/CrimsonText-Regular.ttf", weight: 400, style: "normal" },
    { path: "/fonts/CrimsonText-Bold.ttf", weight: 700, style: "normal" },
    { path: "/fonts/CrimsonText-Italic.ttf", weight: 400, style: "italic" },
  ],
  "Great Vibes": [{ path: "/fonts/GreatVibes-Regular.ttf", weight: 400, style: "normal" }],
};

export const FONT_META: Record<FontFamily, FontMeta> = {
  Lato: { category: "sans", hasBold: true, hasItalic: true },
  "Crimson Text": { category: "serif", hasBold: true, hasItalic: true },
  "Great Vibes": { category: "script", hasBold: false, hasItalic: false },
};

let fontsInjected = false;

/** Loads the editor-canvas copies of the PDF fonts via @font-face (browser only, idempotent). */
export function ensureEditorFontsLoaded(): void {
  if (fontsInjected || typeof document === "undefined") return;
  const rules = Object.entries(FONT_FILES)
    .flatMap(([family, files]) =>
      files.map(
        (f) =>
          `@font-face{font-family:'${family}';src:url('${f.path}') format('truetype');font-weight:${f.weight};font-style:${f.style};font-display:block;}`,
      ),
    )
    .join("");
  const style = document.createElement("style");
  style.id = "document-editor-fonts";
  style.textContent = rules;
  document.head.appendChild(style);
  fontsInjected = true;
}

let pdfFontsPromise: Promise<void> | null = null;

/**
 * Registers the TTFs with @react-pdf/renderer once per process.
 * `baseUrl` prefixes font paths so non-browser callers can resolve them
 * from the filesystem (vitest passes "public").
 */
export async function registerPdfFonts(baseUrl = ""): Promise<void> {
  pdfFontsPromise ??= (async () => {
    const { Font } = await import("@react-pdf/renderer");
    for (const [family, files] of Object.entries(FONT_FILES)) {
      Font.register({
        family,
        fonts: files.map((f) => ({
          src: `${baseUrl}${f.path}`,
          fontWeight: f.weight,
          fontStyle: f.style,
        })),
      });
    }
  })();
  return pdfFontsPromise;
}

/** Convex upload URLs end with the storageId. */
export function storageIdFromUploadUrl(url: string): string {
  const withoutQuery = url.split("?")[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  const id = segments[segments.length - 1];
  if (!id) throw new Error("Upload URL does not contain a storage id");
  return id;
}
```

Note: typecheck will fail until Task 2 creates `spec.ts` — commit Task 1 files together with Task 2's commit if so.

- [ ] **Step 4: Amend the spec doc font table** — in Section 2.3 of `docs/superpowers/specs/2026-08-20-certificate-editor-design.md`, replace the three font rows with Lato / Crimson Text / Great Vibes and add: *"Inter and Playfair Display are variable-font-only upstream; static TTFs were substituted for deterministic react-pdf embedding."*

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json public/fonts lib/documents/fonts.ts docs/superpowers/specs/2026-08-20-certificate-editor-design.md
git commit -m "feat(documents): add react-pdf dependency, OFL font bundle, and font registry"
```

---

### Task 2: DocumentSpec module — types + runtime guards

**Files:**
- Create: `convex/documents/spec.ts`
- Test: `lib/documents/spec.test.ts` (imports `../../convex/documents/spec` relatively — vitest has no `@/` alias)

**Interfaces:**
- Produces (consumed by nearly every later task): `PagePreset`, `Orientation`, `FontFamily`, `TextAlignment`, `Margins`, `PAGE_PRESET_SIZES_MM`, `ElementBase`, `TextElement`, `ImageElement`, `ShapeElement`, `ShapeKind`, `DocumentElement`, `DocumentPage`, `DocumentSpec`, `MAX_ELEMENTS = 200`, `TOKEN_PATTERN`, `isHexColor`, `isDocumentSpec`, `resolvePageSize(page): { widthMm; heightMm }`.

- [ ] **Step 1: Write failing tests at `lib/documents/spec.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  isDocumentSpec,
  resolvePageSize,
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
    const bad = (element: Partial<TextElement>) =>
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/documents/spec.test.ts
```

Expected: FAIL — cannot resolve module `../../convex/documents/spec`.

- [ ] **Step 3: Implement `convex/documents/spec.ts`**

```ts
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
  if (!isElementBase(value)) return false;
  const e = value as Record<string, unknown>;
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
  if (!isElementBase(value)) return false;
  const e = value as Record<string, unknown>;
  return (
    e.type === "image" &&
    typeof e.storageId === "string" && e.storageId.length > 0 && e.storageId.length <= 128 &&
    (e.fit === "contain" || e.fit === "cover")
  );
}

function isShapeElement(value: unknown): value is ShapeElement {
  if (!isElementBase(value)) return false;
  const e = value as Record<string, unknown>;
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
```

- [ ] **Step 4: Run tests, gates, commit**

```bash
npx vitest run lib/documents/spec.test.ts
npm run typecheck; npm run lint
git add convex/documents/spec.ts lib/documents/spec.test.ts lib/documents/fonts.ts public/fonts package.json package-lock.json docs/superpowers/specs/2026-08-20-certificate-editor-design.md
git commit -m "feat(documents): add DocumentSpec model with runtime guards and font bundle"
```

---

### Task 3: Schema, permission, and system certificate templates

**Files:**
- Modify: `convex/schema.ts` (add `documentTemplates` after `eventTemplates`)
- Modify: `convex/lib/constants.ts` (permission + role grant)
- Create: `convex/documents/systemTemplates.ts`
- Modify: `convex/seed.ts` (call the seeder from `seedReferenceDataInternal`)
- Create: `convex/documents/templates.ts` (minimal `list` now; Task 4 adds CRUD)
- Test: `convex-test/documents.test.ts`
- Create: `convex-test/documentFixtures.ts`

**Interfaces:**
- Produces: table `documentTemplates` (`orgId?`, `kind: "certificate"|"results"|"judgeSheet"`, `name`, `description`, `spec: any` (DocumentSpec, runtime-validated), `isSystem`, `sourceTemplateId?`, `updatedBy?`, `updatedAt: number`); permission `documents.manage`; system templates named "Classic Border Certificate", "Modern Minimal Certificate", "Elegant Script Certificate"; `SYSTEM_CERTIFICATE_TEMPLATES`; `seedSystemDocumentTemplates(ctx)`; fixture `validSpec`.

- [ ] **Step 1: Write the failing seed test at `convex-test/documents.test.ts`**

```ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";
import { isDocumentSpec } from "../convex/documents/spec";

describe("documents: system templates", () => {
  it("seeds exactly three valid system certificate templates", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const list = await t.withIdentity(aliceIdentity).query(api.documents.templates.list, {
      orgSlug: "acme",
      kind: "certificate",
    });
    const system = list.filter((x) => x.isSystem);
    expect(system.map((x) => x.name).sort()).toEqual([
      "Classic Border Certificate",
      "Elegant Script Certificate",
      "Modern Minimal Certificate",
    ]);
    for (const tpl of system) {
      expect(isDocumentSpec(tpl.spec)).toBe(true);
    }
  });

  it("is idempotent when seeding runs again", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.mutation(api.seed.seedReferenceData, {});
    const list = await t.withIdentity(aliceIdentity).query(api.documents.templates.list, {
      orgSlug: "acme",
      kind: "certificate",
    });
    expect(list.filter((x) => x.isSystem)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run convex-test/documents.test.ts` (expected: `api.documents` unresolved).

- [ ] **Step 3: Add the schema table in `convex/schema.ts` (after the `eventTemplates` block)**

```ts
  documentTemplates: defineTable({
    orgId: v.optional(v.id("organizations")),
    kind: v.union(v.literal("certificate"), v.literal("results"), v.literal("judgeSheet")),
    name: v.string(),
    description: v.string(),
    // DocumentSpec — intentionally v.any(); every write re-validates via isDocumentSpec.
    spec: v.any(),
    isSystem: v.boolean(),
    sourceTemplateId: v.optional(v.id("documentTemplates")),
    updatedBy: v.optional(v.id("userProfiles")),
    updatedAt: v.number(),
  })
    .index("by_org_id", ["orgId"])
    .index("by_kind", ["kind"]),
```

- [ ] **Step 4: Add the permission in `convex/lib/constants.ts`**

In `SYSTEM_PERMISSIONS` append:

```ts
  { name: "documents.manage", category: "documents", description: "Create and customize document templates" },
```

In `ROLE_PERMISSIONS["Org Owner"]` append `"documents.manage"` to the array.

- [ ] **Step 5: Create `convex/documents/systemTemplates.ts`**

```ts
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
```

Note: the `text()`/`shape()` factories accept `type` overrides via `partial` (the elegant ornament passes `type: "ellipse"` — `type` is optional inside `Partial<ShapeElement>`).

- [ ] **Step 6: Wire seeding in `convex/seed.ts`**

Add a top-level import next to the existing `./lib/constants` import:

```ts
import { seedSystemDocumentTemplates } from "./documents/systemTemplates";
```

At the end of `seedReferenceDataInternal` (after the existing system-template seeding block):

```ts
  await seedSystemDocumentTemplates(ctx);
```

- [ ] **Step 7: Create minimal `convex/documents/templates.ts` (list only)**

```ts
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireOrgMember } from "../lib/authz";

export const list = query({
  args: {
    orgSlug: v.string(),
    kind: v.optional(v.union(v.literal("certificate"), v.literal("results"), v.literal("judgeSheet"))),
  },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    const kind = args.kind ?? "certificate";
    const system = await ctx.db
      .query("documentTemplates")
      .withIndex("by_kind", (q) => q.eq("kind", kind))
      .filter((q) => q.eq(q.field("isSystem"), true))
      .collect();
    const orgTemplates = await ctx.db
      .query("documentTemplates")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("kind"), kind))
      .collect();
    return [...system, ...orgTemplates];
  },
});
```

- [ ] **Step 8: Create `convex-test/documentFixtures.ts`**

```ts
import type { DocumentSpec } from "../convex/documents/spec";

export const validSpec: DocumentSpec = {
  version: 1,
  page: {
    preset: "A4",
    orientation: "portrait",
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    background: "#FFFFFF",
  },
  elements: [
    {
      type: "text",
      id: "el-1",
      name: "Title",
      xMm: 15,
      yMm: 40,
      widthMm: 180,
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
    },
  ],
};
```

- [ ] **Step 9: Run tests, gates, commit**

```bash
npx vitest run convex-test/documents.test.ts
npm run typecheck; npm run lint
git add convex/schema.ts convex/lib/constants.ts convex/documents convex/seed.ts convex-test/documents.test.ts convex-test/documentFixtures.ts
git commit -m "feat(documents): add documentTemplates schema, documents.manage permission, and system certificate templates"
```

---

### Task 4: Template CRUD + asset functions

**Files:**
- Modify: `convex/documents/templates.ts` (add `get`, `create`, `update`, `duplicate`, `remove`)
- Create: `convex/documents/assets.ts`
- Test: `convex-test/documents.test.ts` (append)

**Interfaces:**
- Consumes: `isDocumentSpec` (Task 2), `requireOrgMember`/`requirePermission`, `writeAudit`, `appError`.
- Produces: `api.documents.templates.{list,get,create,update,duplicate,remove}`, `api.documents.assets.{generateUploadUrl,assetUrls}`. `create`/`duplicate` return `{ templateId, updatedAt }`; `update` returns `{ updatedAt }`; `get` returns the full doc (incl. `spec`). `assetUrls({ orgSlug, storageIds })` returns `Record<string, string | null>`.

- [ ] **Step 1: Append failing tests to `convex-test/documents.test.ts`**

Extend the imports at the top of the file:

```ts
import { bobIdentity } from "./setup";
import { validSpec } from "./documentFixtures";
```

Append:

```ts
describe("documents: template CRUD authz and validation", () => {
  async function orgTemplateId(t: ReturnType<typeof setupTest>): Promise<string> {
    const created = await t.withIdentity(aliceIdentity).mutation(api.documents.templates.create, {
      orgSlug: "acme",
      name: "My Certificate",
      kind: "certificate",
      spec: validSpec,
    });
    return created.templateId;
  }

  it("creates, updates, and reads back an org template", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const templateId = await orgTemplateId(t);
    const renamed = {
      ...validSpec,
      elements: [...validSpec.elements, { ...validSpec.elements[0], id: "el-2", name: "Second" }],
    };
    await t.withIdentity(aliceIdentity).mutation(api.documents.templates.update, {
      orgSlug: "acme", templateId, name: "Renamed", spec: renamed,
    });
    const got = await t.withIdentity(aliceIdentity).query(api.documents.templates.get, { orgSlug: "acme", templateId });
    expect(got.name).toBe("Renamed");
    expect(got.spec.elements).toHaveLength(2);
  });

  it("rejects non-members", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const templateId = await orgTemplateId(t);
    await expect(
      t.withIdentity(bobIdentity).query(api.documents.templates.get, { orgSlug: "acme", templateId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("rejects invalid specs on create and update", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.documents.templates.create, {
        orgSlug: "acme", name: "Bad", kind: "certificate", spec: { hello: "world" },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    const templateId = await orgTemplateId(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.documents.templates.update, {
        orgSlug: "acme", templateId, spec: { version: 1, page: null },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("refuses to update or delete system templates and isolates orgs", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const list = await t.withIdentity(aliceIdentity).query(api.documents.templates.list, { orgSlug: "acme", kind: "certificate" });
    const systemId = list.find((x) => x.isSystem)!._id;
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.documents.templates.update, { orgSlug: "acme", templateId: systemId, name: "Nope" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.documents.templates.remove, { orgSlug: "acme", templateId: systemId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

    await createOrgAndEvent(t, bobIdentity, { orgSlug: "bobs", eventSlug: "expo" });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.documents.templates.update, {
        orgSlug: "bobs", templateId: systemId, name: "Hijack",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

    // Org templates from another org are invisible (NOT_FOUND, not FORBIDDEN).
    const aliceTemplateId = await orgTemplateId(t);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.documents.templates.update, {
        orgSlug: "bobs", templateId: aliceTemplateId, name: "Hijack",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("duplicates a system template into the org with provenance", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const list = await t.withIdentity(aliceIdentity).query(api.documents.templates.list, { orgSlug: "acme", kind: "certificate" });
    const systemId = list.find((x) => x.isSystem)!._id;
    const { templateId } = await t.withIdentity(aliceIdentity).mutation(api.documents.templates.duplicate, {
      orgSlug: "acme", templateId: systemId, name: "My Classic",
    });
    const got = await t.withIdentity(aliceIdentity).query(api.documents.templates.get, { orgSlug: "acme", templateId });
    expect(got.name).toBe("My Classic");
    expect(got.isSystem).toBe(false);
    expect(got.sourceTemplateId).toBe(systemId);
  });

  it("writes audit rows for create and remove", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const templateId = await orgTemplateId(t);
    await t.withIdentity(aliceIdentity).mutation(api.documents.templates.remove, { orgSlug: "acme", templateId });
    const audit = await t.withIdentity(aliceIdentity).query(api.audit.listByOrg, {
      orgSlug: "acme",
      paginationOpts: { numItems: 50, cursor: null },
    });
    const actions = audit.page.map((row: { action: string; resourceType: string }) => `${row.action}:${row.resourceType}`);
    expect(actions).toContain("documentTemplate.created:documentTemplate");
    expect(actions).toContain("documentTemplate.deleted:documentTemplate");
  });
});
```

Note: check `api.audit.listByOrg`'s actual args in `convex/audit.ts` before running and adapt the call to its real signature (it may take `paginationOpts`; if it takes different args, adjust the test call — not the function).

- [ ] **Step 2: Run to verify failures** — `npx vitest run convex-test/documents.test.ts`

- [ ] **Step 3: Complete `convex/documents/templates.ts`**

Add imports at the top (keep the existing `list`):

```ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireOrgMember, requirePermission } from "../lib/authz";
import { appError, ErrorCode } from "../lib/errors";
import { writeAudit } from "../lib/audit";
import { isDocumentSpec } from "./spec";
```

Append:

```ts
type TemplateDoc = Doc<"documentTemplates">;

async function requireVisibleTemplate(
  ctx: QueryCtx,
  args: { orgSlug: string; templateId: Id<"documentTemplates"> },
): Promise<{ template: TemplateDoc; orgId: Id<"organizations">; userId: Id<"userProfiles"> }> {
  const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
  const template = await ctx.db.get(args.templateId);
  if (!template || (!template.isSystem && template.orgId !== actx.org._id)) {
    throw appError(ErrorCode.NOT_FOUND, "Template not found");
  }
  return { template, orgId: actx.org._id, userId: actx.user._id };
}

export const get = query({
  args: { orgSlug: v.string(), templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const { template } = await requireVisibleTemplate(ctx, args);
    return template;
  },
});

export const create = mutation({
  args: { orgSlug: v.string(), name: v.string(), kind: v.string(), spec: v.any() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "documents.manage" });
    const name = args.name.trim();
    if (!name) throw appError(ErrorCode.VALIDATION_ERROR, "Name must not be empty");
    const kind = args.kind === "certificate" || args.kind === "results" || args.kind === "judgeSheet"
      ? args.kind
      : null;
    if (!kind) throw appError(ErrorCode.VALIDATION_ERROR, "Invalid template kind");
    if (!isDocumentSpec(args.spec)) throw appError(ErrorCode.VALIDATION_ERROR, "Invalid document spec");
    const now = Date.now();
    const templateId = await ctx.db.insert("documentTemplates", {
      orgId: actx.org._id,
      kind,
      name,
      description: "",
      spec: args.spec,
      isSystem: false,
      updatedBy: actx.user._id,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "documentTemplate.created",
      resourceType: "documentTemplate", resourceId: templateId, after: { name },
    });
    return { templateId, updatedAt: now };
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(),
    templateId: v.id("documentTemplates"),
    name: v.optional(v.string()),
    spec: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { template, orgId, userId } = await requireVisibleTemplate(ctx, args);
    if (template.isSystem) throw appError(ErrorCode.FORBIDDEN, "System templates cannot be edited");
    const now = Date.now();
    const patch: Partial<TemplateDoc> = { updatedBy: userId, updatedAt: now };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw appError(ErrorCode.VALIDATION_ERROR, "Name must not be empty");
      patch.name = name;
    }
    if (args.spec !== undefined) {
      if (!isDocumentSpec(args.spec)) throw appError(ErrorCode.VALIDATION_ERROR, "Invalid document spec");
      patch.spec = args.spec;
    }
    await ctx.db.patch(args.templateId, patch);
    await writeAudit(ctx, {
      orgId, actorId: userId, action: "documentTemplate.updated",
      resourceType: "documentTemplate", resourceId: args.templateId,
      after: { name: patch.name ?? template.name },
    });
    return { updatedAt: now };
  },
});

export const duplicate = mutation({
  args: { orgSlug: v.string(), templateId: v.id("documentTemplates"), name: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "documents.manage" });
    const source = await ctx.db.get(args.templateId);
    if (!source || (!source.isSystem && source.orgId !== actx.org._id)) {
      throw appError(ErrorCode.NOT_FOUND, "Template not found");
    }
    const name = args.name.trim();
    if (!name) throw appError(ErrorCode.VALIDATION_ERROR, "Name must not be empty");
    const now = Date.now();
    const newId = await ctx.db.insert("documentTemplates", {
      orgId: actx.org._id,
      kind: source.kind,
      name,
      description: source.description,
      spec: source.spec,
      isSystem: false,
      sourceTemplateId: source._id,
      updatedBy: actx.user._id,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "documentTemplate.duplicated",
      resourceType: "documentTemplate", resourceId: newId, after: { name, sourceId: source._id },
    });
    return { templateId: newId, updatedAt: now };
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const { template, orgId, userId } = await requireVisibleTemplate(ctx, args);
    if (template.isSystem) throw appError(ErrorCode.FORBIDDEN, "System templates cannot be deleted");
    await ctx.db.delete(args.templateId);
    await writeAudit(ctx, {
      orgId, actorId: userId, action: "documentTemplate.deleted",
      resourceType: "documentTemplate", resourceId: args.templateId, before: { name: template.name },
    });
  },
});
```

Note: the hijack test above expects a system template id cross-org to be FORBIDDEN (visible) — with `requireVisibleTemplate`, a system template is visible to any member, and the `isSystem` guard then rejects the write with FORBIDDEN, which the test asserts. An org template from another org returns NOT_FOUND.

- [ ] **Step 4: Create `convex/documents/assets.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireOrgMember } from "../lib/authz";

export const generateUploadUrl = mutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    return await ctx.storage.generateUploadUrl();
  },
});

export const assetUrls = query({
  args: { orgSlug: v.string(), storageIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    const urls: Record<string, string | null> = {};
    for (const storageId of args.storageIds.slice(0, 100)) {
      urls[storageId] = await ctx.storage.getUrl(storageId);
    }
    return urls;
  },
});
```

- [ ] **Step 5: Run tests, gates, commit**

```bash
npx vitest run convex-test/documents.test.ts
npm run typecheck; npm run lint
git add convex/documents convex-test/documents.test.ts
git commit -m "feat(documents): template CRUD with authz/audit and file-storage asset functions"
```

---

### Task 5: Token engine

**Files:**
- Create: `lib/documents/tokens.ts`
- Test: `lib/documents/tokens.test.ts`

**Interfaces:**
- Produces: `TokenMap = Record<string, string>`, `TokenDef`, `TOKEN_CATALOG: TokenDef[]`, `listTokens(content: string): string[]`, `resolveTokens(content: string, data: TokenMap): string`, `sampleTokenMap(): TokenMap`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { TOKEN_CATALOG, listTokens, resolveTokens, sampleTokenMap } from "./tokens";

describe("tokens", () => {
  it("lists unique tokens in order of appearance", () => {
    expect(listTokens("{{recipient.name}} of {{event.name}} — {{recipient.name}}")).toEqual([
      "recipient.name",
      "event.name",
    ]);
    expect(listTokens("no tokens here")).toEqual([]);
    expect(listTokens("{{Invalid}} {{recipient}}")).toEqual(["recipient"]);
  });

  it("resolves known tokens and falls back to bracketed names for unknown/missing", () => {
    const data = { "recipient.name": "Maria", "event.name": "Grand Gala" };
    expect(resolveTokens("{{recipient.name}} wins {{event.name}}", data)).toBe("Maria wins Grand Gala");
    expect(resolveTokens("{{recipient.rank}} — {{org.name}}", data)).toBe("[recipient.rank] — [org.name]");
  });

  it("exposes the full catalog with a complete sample map", () => {
    const names = TOKEN_CATALOG.map((t) => t.token);
    expect(names).toContain("recipient.name");
    expect(names).toContain("issued.date");
    const sample = sampleTokenMap();
    for (const def of TOKEN_CATALOG) {
      expect(typeof sample[def.token]).toBe("string");
      expect(sample[def.token].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/documents/tokens.test.ts`

- [ ] **Step 3: Implement `lib/documents/tokens.ts`**

```ts
import { TOKEN_PATTERN } from "../../convex/documents/spec";

export type TokenMap = Record<string, string>;

export interface TokenDef {
  token: string;
  label: string;
}

export const TOKEN_CATALOG: TokenDef[] = [
  { token: "recipient.name", label: "Recipient name" },
  { token: "recipient.number", label: "Contestant number" },
  { token: "recipient.rank", label: "Final rank" },
  { token: "recipient.category", label: "Category" },
  { token: "event.name", label: "Event name" },
  { token: "event.venue", label: "Venue" },
  { token: "event.date", label: "Event date" },
  { token: "org.name", label: "Organization" },
  { token: "issued.date", label: "Issue date" },
];

/** Unique `{{namespace.field}}` tokens in order of appearance; malformed braces are ignored. */
export function listTokens(content: string): string[] {
  const seen = new Set<string>();
  for (const match of content.matchAll(TOKEN_PATTERN)) {
    const token = match[1];
    if (token && !seen.has(token)) seen.add(token);
  }
  return [...seen];
}

/** Replaces tokens with data values; unresolved tokens render as `[token]` (never throw). */
export function resolveTokens(content: string, data: TokenMap): string {
  return content.replace(TOKEN_PATTERN, (_full, token: string) => data[token] ?? `[${token}]`);
}

/** Sample data used by the editor canvas and sample-PDF preview. */
export function sampleTokenMap(): TokenMap {
  return {
    "recipient.name": "Juan Dela Cruz",
    "recipient.number": "7",
    "recipient.rank": "Champion",
    "recipient.category": "Senior Division",
    "event.name": "Grand Gala Night 2026",
    "event.venue": "Grand Hall",
    "event.date": "August 20, 2026",
    "org.name": "Acme Events",
    "issued.date": new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  };
}
```

- [ ] **Step 4: Run tests, gates, commit**

```bash
npx vitest run lib/documents/tokens.test.ts
npm run typecheck; npm run lint
git add lib/documents/tokens.ts lib/documents/tokens.test.ts
git commit -m "feat(documents): token catalog, parser, resolver, and sample data"
```

---

### Task 6: Geometry engine

**Files:**
- Create: `lib/documents/geometry.ts`
- Test: `lib/documents/geometry.test.ts`

**Interfaces:**
- Produces: `Point`, `RotatedBox`, `PX_PER_MM`, `PT_PER_MM`, `mmToPt(mm)`, `HANDLE_IDS`, `HandleId`, `rotatePoint(p, center, deg)`, `boxCenter(box)`, `elementCorners(box)`, `hitTest(box, p)`, `SelectionBounds`, `selectionBounds(boxes)`, `normalizeAngle(deg)`, `snapAngle(deg, thresholdDeg?)`, `resizeBox(box, handle, dxMm, dyMm, opts)`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  PX_PER_MM,
  elementCorners,
  hitTest,
  mmToPt,
  normalizeAngle,
  resizeBox,
  rotatePoint,
  selectionBounds,
  snapAngle,
} from "./geometry";

const box = { xMm: 10, yMm: 20, widthMm: 30, heightMm: 40, rotationDeg: 0 };

describe("constants + helpers", () => {
  it("converts units exactly", () => {
    expect(PX_PER_MM).toBeCloseTo(3.779527559, 6);
    expect(mmToPt(25.4)).toBeCloseTo(72, 6);
  });

  it("rotates points clockwise and normalizes angles", () => {
    const p = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(1, 6);
    expect(normalizeAngle(370)).toBeCloseTo(10, 6);
    expect(normalizeAngle(-190)).toBeCloseTo(170, 6);
    expect(snapAngle(43)).toBe(45);
    expect(snapAngle(41)).toBe(41);
  });
});

describe("corners + hit testing", () => {
  it("computes unrotated corners", () => {
    const corners = elementCorners(box);
    expect(corners[0]).toEqual({ x: 10, y: 20 });
    expect(corners[2]).toEqual({ x: 40, y: 60 });
  });

  it("rotates corners around the center", () => {
    const corners = elementCorners({ ...box, rotationDeg: 90 });
    expect(corners[0].x).toBeCloseTo(45, 6);
    expect(corners[0].y).toBeCloseTo(5, 6);
  });

  it("hit-tests through rotation", () => {
    const rotated = { ...box, rotationDeg: 90 };
    expect(hitTest(rotated, { x: 25, y: 40 })).toBe(true);
    expect(hitTest(rotated, { x: 30, y: 10 })).toBe(true);
    expect(hitTest(rotated, { x: 15, y: 30 })).toBe(false);
  });
});

describe("selectionBounds", () => {
  it("returns null for empty input and an AABB for rotated boxes", () => {
    expect(selectionBounds([])).toBeNull();
    const bounds = selectionBounds([box, { ...box, xMm: 100, rotationDeg: 45 }]);
    expect(bounds).not.toBeNull();
    expect(bounds!.minXMm).toBe(10);
    expect(bounds!.minYMm).toBe(20);
  });
});

describe("resizeBox", () => {
  it("grows the south-east handle at rotation 0 keeping the nw corner fixed", () => {
    const next = resizeBox(box, "se", 5, 8, { aspectRatio: false });
    expect(next.xMm).toBeCloseTo(10, 6);
    expect(next.yMm).toBeCloseTo(20, 6);
    expect(next.widthMm).toBeCloseTo(35, 6);
    expect(next.heightMm).toBeCloseTo(48, 6);
  });

  it("grows the north-west handle keeping the se corner fixed", () => {
    const next = resizeBox(box, "nw", 4, 6, { aspectRatio: false });
    expect(next.xMm).toBeCloseTo(14, 6);
    expect(next.yMm).toBeCloseTo(26, 6);
    expect(next.widthMm).toBeCloseTo(26, 6);
    expect(next.heightMm).toBeCloseTo(34, 6);
  });

  it("keeps the opposite anchor fixed in world space when rotated 90°", () => {
    const rotated = { ...box, rotationDeg: 90 };
    const before = elementCorners(rotated);
    const next = resizeBox(rotated, "e", 0, 10, { aspectRatio: false });
    const after = elementCorners(next);
    expect(after[3].x).toBeCloseTo(before[3].x, 3);
    expect(after[3].y).toBeCloseTo(before[3].y, 3);
    expect(next.heightMm).toBeCloseTo(50, 6);
  });

  it("preserves aspect ratio on corner handles", () => {
    const next = resizeBox(box, "se", 10, 0, { aspectRatio: true });
    expect(next.widthMm / next.heightMm).toBeCloseTo(30 / 40, 6);
  });

  it("enforces a 2mm minimum size", () => {
    const next = resizeBox(box, "se", -100, -100, { aspectRatio: false });
    expect(next.widthMm).toBeGreaterThanOrEqual(2);
    expect(next.heightMm).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/documents/geometry.test.ts`

- [ ] **Step 3: Implement `lib/documents/geometry.ts`**

```ts
export interface Point {
  x: number;
  y: number;
}

export interface RotatedBox {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
}

export const PX_PER_MM = 96 / 25.4;
export const PT_PER_MM = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

export const HANDLE_IDS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type HandleId = (typeof HANDLE_IDS)[number];

export function rotatePoint(p: Point, center: Point, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  // Screen coordinates grow downward, so positive angles rotate clockwise visually.
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

export function boxCenter(box: Pick<RotatedBox, "xMm" | "yMm" | "widthMm" | "heightMm">): Point {
  return { x: box.xMm + box.widthMm / 2, y: box.yMm + box.heightMm / 2 };
}

export function elementCorners(box: RotatedBox): [Point, Point, Point, Point] {
  const center = boxCenter(box);
  const local: [Point, Point, Point, Point] = [
    { x: box.xMm, y: box.yMm },
    { x: box.xMm + box.widthMm, y: box.yMm },
    { x: box.xMm + box.widthMm, y: box.yMm + box.heightMm },
    { x: box.xMm, y: box.yMm + box.heightMm },
  ];
  return local.map((p) => rotatePoint(p, center, box.rotationDeg)) as [Point, Point, Point, Point];
}

export function hitTest(box: RotatedBox, p: Point): boolean {
  const center = boxCenter(box);
  const local = rotatePoint(p, center, -box.rotationDeg);
  return (
    local.x >= box.xMm &&
    local.x <= box.xMm + box.widthMm &&
    local.y >= box.yMm &&
    local.y <= box.yMm + box.heightMm
  );
}

export interface SelectionBounds {
  minXMm: number;
  minYMm: number;
  maxXMm: number;
  maxYMm: number;
}

export function selectionBounds(boxes: RotatedBox[]): SelectionBounds | null {
  if (boxes.length === 0) return null;
  let minXMm = Infinity;
  let minYMm = Infinity;
  let maxXMm = -Infinity;
  let maxYMm = -Infinity;
  for (const box of boxes) {
    for (const corner of elementCorners(box)) {
      minXMm = Math.min(minXMm, corner.x);
      minYMm = Math.min(minYMm, corner.y);
      maxXMm = Math.max(maxXMm, corner.x);
      maxYMm = Math.max(maxYMm, corner.y);
    }
  }
  return { minXMm, minYMm, maxXMm, maxYMm };
}

export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

/** Snaps to the nearest multiple of 45° when within `thresholdDeg`, else returns the input normalized. */
export function snapAngle(deg: number, thresholdDeg = 5): number {
  const target = Math.round(deg / 45) * 45;
  return Math.abs(deg - target) <= thresholdDeg ? normalizeAngle(target) : normalizeAngle(deg);
}

const MIN_SIZE_MM = 2;

/**
 * Rotation-aware resize. `dxMm/dyMm` are world-space pointer deltas; they are
 * transformed into the element's local frame, the box is resized against the
 * opposite anchor, and the center is repositioned so the anchor stays fixed
 * in world space.
 */
export function resizeBox(
  box: RotatedBox,
  handle: HandleId,
  dxMm: number,
  dyMm: number,
  opts: { aspectRatio: boolean },
): RotatedBox {
  const center = boxCenter(box);
  const rotatedPointer = rotatePoint({ x: center.x + dxMm, y: center.y + dyMm }, center, -box.rotationDeg);
  const ldx = rotatedPointer.x - center.x;
  const ldy = rotatedPointer.y - center.y;

  let width = box.widthMm;
  let height = box.heightMm;
  if (handle.includes("e")) width += ldx;
  if (handle.includes("w")) width -= ldx;
  if (handle.includes("s")) height += ldy;
  if (handle.includes("n")) height -= ldy;

  if (opts.aspectRatio && handle.length === 2) {
    const scale = Math.max(width / box.widthMm, height / box.heightMm);
    width = box.widthMm * scale;
    height = box.heightMm * scale;
  }
  width = Math.max(width, MIN_SIZE_MM);
  height = Math.max(height, MIN_SIZE_MM);

  // Anchor (opposite handle) offset from center in the new local frame.
  const anchorX = handle.includes("w") ? width / 2 : handle.includes("e") ? -width / 2 : 0;
  const anchorY = handle.includes("n") ? height / 2 : handle.includes("s") ? -height / 2 : 0;
  const anchorWorld = rotatePoint({ x: center.x + anchorX, y: center.y + anchorY }, center, box.rotationDeg);

  // The new center places the anchor at the same world position: the anchor
  // sits at (-anchorX, -anchorY) from the new center in the new local frame.
  const anchorOffset = rotatePoint({ x: -anchorX, y: -anchorY }, { x: 0, y: 0 }, box.rotationDeg);
  const newCenter = { x: anchorWorld.x - anchorOffset.x, y: anchorWorld.y - anchorOffset.y };

  return {
    xMm: newCenter.x - width / 2,
    yMm: newCenter.y - height / 2,
    widthMm: width,
    heightMm: height,
    rotationDeg: box.rotationDeg,
  };
}
```

- [ ] **Step 4: Run tests, gates, commit**

```bash
npx vitest run lib/documents/geometry.test.ts
npm run typecheck; npm run lint
git add lib/documents/geometry.ts lib/documents/geometry.test.ts
git commit -m "feat(documents): rotation-aware geometry engine with resize anchors and hit testing"
```

---

### Task 7: Snapping engine

**Files:**
- Create: `lib/documents/snap.ts`
- Test: `lib/documents/snap.test.ts`

**Interfaces:**
- Consumes: `DocumentPage`, `DocumentElement`, `resolvePageSize` (Task 2).
- Produces: `SnapTargets`, `SnapGuide`, `collectSnapTargets(page, elements, excludeIds)`, `SnapBoxResult`, `snapBox(box, targets, thresholdMm)`, `snapToGrid(valueMm, gridMm)`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { collectSnapTargets, snapBox, snapToGrid } from "./snap";
import { validSpec } from "../../convex-test/documentFixtures";
import type { DocumentElement } from "../../convex/documents/spec";

const page = validSpec.page;

describe("collectSnapTargets", () => {
  it("includes margins, page edges, centers, and other element edges/centers", () => {
    const other: DocumentElement = {
      ...validSpec.elements[0],
      id: "other",
      xMm: 50,
      yMm: 60,
      widthMm: 100,
      heightMm: 40,
    };
    const targets = collectSnapTargets(page, [other], new Set(["moved"]));
    for (const x of [0, 15, 105, 195, 210, 50, 150, 100]) {
      expect(targets.xLines).toContain(x);
    }
    for (const y of [0, 15, 148.5, 282, 297, 60, 100, 80]) {
      expect(targets.yLines).toContain(y);
    }
  });

  it("excludes elements whose ids are in excludeIds", () => {
    const el = validSpec.elements[0];
    const withEl = collectSnapTargets(page, [el], new Set());
    const withoutEl = collectSnapTargets(page, [el], new Set([el.id]));
    expect(withoutEl.xLines.length).toBeLessThan(withEl.xLines.length);
  });
});

describe("snapBox", () => {
  it("snaps left edge to a nearby line and reports the guide", () => {
    const result = snapBox({ xMm: 13, yMm: 20, widthMm: 100, heightMm: 40 }, { xLines: [15], yLines: [] }, 3);
    expect(result.xMm).toBe(15);
    expect(result.guides).toEqual([{ axis: "x", positionMm: 15 }]);
    expect(result.yMm).toBe(20);
  });

  it("prefers the closest line when multiple are within threshold", () => {
    const result = snapBox({ xMm: 13.5, yMm: 0, widthMm: 10, heightMm: 10 }, { xLines: [15, 12], yLines: [] }, 3);
    expect(result.xMm).toBe(12);
  });

  it("checks center and right edges too, and never moves when nothing is close", () => {
    const centered = snapBox({ xMm: 50, yMm: 0, widthMm: 10, heightMm: 10 }, { xLines: [55], yLines: [] }, 1);
    expect(centered.xMm).toBe(45);
    const far = snapBox({ xMm: 50, yMm: 0, widthMm: 10, heightMm: 10 }, { xLines: [100], yLines: [] }, 1);
    expect(far.xMm).toBe(50);
    expect(far.guides).toEqual([]);
  });
});

describe("snapToGrid", () => {
  it("rounds to the grid step", () => {
    expect(snapToGrid(12.4, 5)).toBe(10);
    expect(snapToGrid(12.6, 5)).toBe(15);
    expect(snapToGrid(-2.4, 5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/documents/snap.test.ts`

- [ ] **Step 3: Implement `lib/documents/snap.ts`**

```ts
import type { DocumentElement, DocumentPage } from "../../convex/documents/spec";
import { resolvePageSize } from "../../convex/documents/spec";

export interface SnapTargets {
  xLines: number[];
  yLines: number[];
}

export interface SnapGuide {
  axis: "x" | "y";
  positionMm: number;
}

function dedupeSorted(values: number[]): number[] {
  return [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
}

/** Page edges/center, margin lines, and every non-excluded element's edges/center. */
export function collectSnapTargets(
  page: DocumentPage,
  elements: DocumentElement[],
  excludeIds: Set<string>,
): SnapTargets {
  const { widthMm, heightMm } = resolvePageSize(page);
  const xs: number[] = [0, widthMm, widthMm / 2, page.margins.left, widthMm - page.margins.right];
  const ys: number[] = [0, heightMm, heightMm / 2, page.margins.top, heightMm - page.margins.bottom];
  for (const el of elements) {
    if (excludeIds.has(el.id)) continue;
    xs.push(el.xMm, el.xMm + el.widthMm / 2, el.xMm + el.widthMm);
    ys.push(el.yMm, el.yMm + el.heightMm / 2, el.yMm + el.heightMm);
  }
  return { xLines: dedupeSorted(xs), yLines: dedupeSorted(ys) };
}

export interface SnapBoxResult {
  xMm: number;
  yMm: number;
  guides: SnapGuide[];
}

interface SnapCandidate {
  position: number;
  delta: number;
}

function snapAxis(
  candidates: SnapCandidate[],
  lines: number[],
  thresholdMm: number,
): { shift: number; guide: SnapGuide | null } {
  let best: { line: number; delta: number; distance: number } | null = null;
  for (const candidate of candidates) {
    for (const line of lines) {
      const distance = Math.abs(candidate.position - line);
      if (distance <= thresholdMm && (!best || distance < best.distance)) {
        best = { line, delta: candidate.delta, distance };
      }
    }
  }
  if (!best) return { shift: 0, guide: null };
  return { shift: best.line + best.delta - candidates[0].position, guide: { axis: "x", positionMm: best.line } };
}

/** Snaps the box's left/center/right and top/middle/bottom to nearby target lines. */
export function snapBox(
  box: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  targets: SnapTargets,
  thresholdMm: number,
): SnapBoxResult {
  const xCandidates: SnapCandidate[] = [
    { position: box.xMm, delta: 0 },
    { position: box.xMm + box.widthMm / 2, delta: -box.widthMm / 2 },
    { position: box.xMm + box.widthMm, delta: -box.widthMm },
  ];
  const yCandidates: SnapCandidate[] = [
    { position: box.yMm, delta: 0 },
    { position: box.yMm + box.heightMm / 2, delta: -box.heightMm / 2 },
    { position: box.yMm + box.heightMm, delta: -box.heightMm },
  ];

  const x = snapAxis(xCandidates, targets.xLines, thresholdMm);
  const y = snapAxis(yCandidates, targets.yLines, thresholdMm);
  const guides: SnapGuide[] = [];
  if (x.guide) guides.push(x.guide);
  if (y.guide) guides.push({ axis: "y", positionMm: y.guide.positionMm });

  return { xMm: box.xMm + x.shift, yMm: box.yMm + y.shift, guides };
}

export function snapToGrid(valueMm: number, gridMm: number): number {
  return Math.round(valueMm / gridMm) * gridMm;
}
```

Note: `snapAxis` hardcodes `axis: "x"` in its guide; callers override for y as shown. Keep this shape (it stays simple and is covered by tests).

- [ ] **Step 4: Run tests, gates, commit**

```bash
npx vitest run lib/documents/snap.test.ts
npm run typecheck; npm run lint
git add lib/documents/snap.ts lib/documents/snap.test.ts
git commit -m "feat(documents): snapping engine for margins, centers, element edges, and grid"
```

---

### Task 8: PDF renderer

**Files:**
- Create: `lib/documents/renderPdf.tsx`
- Test: `lib/documents/renderPdf.test.ts` (node environment docblock)

**Interfaces:**
- Consumes: `DocumentSpec`, `resolvePageSize` (Task 2), `registerPdfFonts` (Task 1), `resolveTokens`/`TokenMap` (Task 5), `mmToPt` (Task 6).
- Produces: `RenderSpecInput = { spec: DocumentSpec; tokens: TokenMap }`, `renderPdfBlob(inputs, imageUrls): Promise<Blob>` (browser), `renderPdfBuffer(inputs, imageUrls): Promise<Uint8Array>` (node).

- [ ] **Step 1: Write the failing smoke test**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderPdfBuffer } from "./renderPdf";
import { SYSTEM_CERTIFICATE_TEMPLATES } from "../../convex/documents/systemTemplates";
import { sampleTokenMap } from "./tokens";
import { validSpec } from "../../convex-test/documentFixtures";

describe("renderPdf", () => {
  it("renders each system certificate template into a valid PDF", async () => {
    for (const template of SYSTEM_CERTIFICATE_TEMPLATES) {
      const bytes = await renderPdfBuffer([{ spec: template.spec, tokens: sampleTokenMap() }], {});
      expect(bytes.length).toBeGreaterThan(1000);
      const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
      expect(header).toBe("%PDF-");
    }
  });

  it("renders a tokenized spec with sample data", async () => {
    const bytes = await renderPdfBuffer(
      [{ spec: validSpec, tokens: { "recipient.name": "Zephyra" } }],
      {},
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/documents/renderPdf.test.ts`

- [ ] **Step 3: Implement `lib/documents/renderPdf.tsx`**

```tsx
import type { ReactElement } from "react";
import type { DocumentElement, DocumentSpec } from "../../convex/documents/spec";
import { resolvePageSize } from "../../convex/documents/spec";
import { registerPdfFonts } from "./fonts";
import { resolveTokens, type TokenMap } from "./tokens";
import { mmToPt } from "./geometry";

export interface RenderSpecInput {
  spec: DocumentSpec;
  tokens: TokenMap;
}

async function buildDocument(inputs: RenderSpecInput[], imageUrls: Record<string, string>) {
  const pdf = await import("@react-pdf/renderer");
  const { Document, Page, View, Text, Image, Svg, Ellipse, Line } = pdf;
  // In Node (vitest), font files resolve from the repo root; in the browser they are same-origin URLs.
  await registerPdfFonts(typeof window === "undefined" ? "public" : "");

  const pages = inputs.map(({ spec, tokens }, pageIndex) => {
    const { widthMm, heightMm } = resolvePageSize(spec.page);
    const children = spec.elements.map((element) => renderElement(element, tokens, imageUrls));
    return (
      <Page
        key={`page-${pageIndex}`}
        size={[mmToPt(widthMm), mmToPt(heightMm)]}
        style={{ backgroundColor: spec.page.background }}
      >
        {children}
      </Page>
    );
  });

  return <Document>{pages}</Document>;
}

function baseStyle(element: DocumentElement): Record<string, unknown> {
  return {
    position: "absolute",
    top: mmToPt(element.yMm),
    left: mmToPt(element.xMm),
    width: mmToPt(element.widthMm),
    height: mmToPt(element.heightMm),
    opacity: element.opacity,
    ...(element.rotationDeg !== 0 ? { transform: `rotate(${element.rotationDeg}deg)` } : {}),
  };
}

function renderElement(
  element: DocumentElement,
  tokens: TokenMap,
  imageUrls: Record<string, string>,
): ReactElement {
  const key = element.id;
  if (element.type === "text") {
    const supportsWeight = element.fontFamily !== "Great Vibes";
    return (
      <View key={key} style={baseStyle(element)} wrap={false}>
        <Text
          style={{
            fontFamily: element.fontFamily,
            fontSize: element.fontSizePt,
            fontWeight: element.bold && supportsWeight ? 700 : 400,
            fontStyle: element.italic && supportsWeight ? "italic" : "normal",
            textDecoration: element.underline ? "underline" : "none",
            textAlign: element.align,
            color: element.color,
            lineHeight: element.lineHeight,
            letterSpacing: mmToPt(element.letterSpacingMm),
          }}
        >
          {resolveTokens(element.content, tokens)}
        </Text>
      </View>
    );
  }
  if (element.type === "image") {
    const src = imageUrls[element.storageId];
    if (!src) return <View key={key} style={baseStyle(element)} />;
    return <Image key={key} src={src} style={{ ...baseStyle(element), objectFit: element.fit }} wrap={false} />;
  }
  if (element.type === "rect") {
    return (
      <View
        key={key}
        style={{
          ...baseStyle(element),
          backgroundColor: element.fill ?? undefined,
          borderWidth: element.stroke ? mmToPt(element.strokeWidthMm) : 0,
          borderColor: element.stroke ?? undefined,
        }}
        wrap={false}
      />
    );
  }
  if (element.type === "ellipse") {
    const { widthMm, heightMm } = element;
    return (
      <Svg key={key} style={baseStyle(element)} viewBox={`0 0 ${widthMm} ${heightMm}`}>
        <Ellipse
          cx={widthMm / 2}
          cy={heightMm / 2}
          rx={Math.max(widthMm / 2 - element.strokeWidthMm / 2, 0.1)}
          ry={Math.max(heightMm / 2 - element.strokeWidthMm / 2, 0.1)}
          fill={element.fill ?? "none"}
          stroke={element.stroke ?? "none"}
          strokeWidth={element.strokeWidthMm}
        />
      </Svg>
    );
  }
  // line: horizontal rule across the box at its vertical center
  const { widthMm, heightMm } = element;
  return (
    <Svg key={key} style={baseStyle(element)} viewBox={`0 0 ${widthMm} ${heightMm}`}>
      <Line
        x1={0}
        y1={heightMm / 2}
        x2={widthMm}
        y2={heightMm / 2}
        stroke={element.stroke ?? "#000000"}
        strokeWidth={element.strokeWidthMm}
      />
    </Svg>
  );
}

/** Browser: render inputs (one page per entry) to a PDF Blob. */
export async function renderPdfBlob(
  inputs: RenderSpecInput[],
  imageUrls: Record<string, string>,
): Promise<Blob> {
  const { renderToBlob } = await import("@react-pdf/renderer");
  return renderToBlob(await buildDocument(inputs, imageUrls));
}

/** Node (vitest / scripts): render to a Uint8Array. */
export async function renderPdfBuffer(
  inputs: RenderSpecInput[],
  imageUrls: Record<string, string>,
): Promise<Uint8Array> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(await buildDocument(inputs, imageUrls));
}
```

If `@react-pdf/renderer`'s node build fails to load under vitest (pdfkit needing Node built-ins), keep the file identical and change only the test to document the fallback: delete the smoke test file and instead assert PDF output in Task 16's e2e via the True Preview iframe. Only take this fallback if the import itself errors — report it in the task summary.

- [ ] **Step 4: Run tests, gates, commit**

```bash
npx vitest run lib/documents/renderPdf.test.ts
npm run typecheck; npm run lint
git add lib/documents/renderPdf.tsx lib/documents/renderPdf.test.ts
git commit -m "feat(documents): DocumentSpec to PDF renderer via @react-pdf/renderer"
```

---

### Task 9: Editor state reducer + history

**Files:**
- Create: `lib/documents/editorState.ts`
- Test: `lib/documents/editorState.test.ts`

**Interfaces:**
- Produces: `ElementPatch`, `EditorState` (`{ spec; selection; clipboard; past; future }`), `EditorAction` union (`LOAD_SPEC | ADD_ELEMENT | UPDATE_ELEMENTS | DELETE_SELECTED | DUPLICATE_SELECTED | COPY_SELECTED | PASTE | REORDER_ELEMENT | SET_SELECTION | SET_PAGE | UNDO | REDO`), `HISTORY_LIMIT = 100`, `PASTE_OFFSET_MM = 2`, `editorReducer`, `createInitialEditorState(spec)`, `useEditorState(initialSpec): { state; dispatch; canUndo; canRedo }`, `newElementId()`, `nextElementName(spec, base)`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { createInitialEditorState, editorReducer, newElementId, nextElementName } from "./editorState";
import { validSpec } from "../../convex-test/documentFixtures";
import type { DocumentElement, TextElement } from "../../convex/documents/spec";

const patch = { id: "el-1", patch: { xMm: 42 } };

describe("editorReducer", () => {
  it("selects and updates elements with history", () => {
    let s = createInitialEditorState(validSpec);
    s = editorReducer(s, { type: "SET_SELECTION", ids: ["el-1"] });
    expect(s.selection).toEqual(["el-1"]);
    s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [patch] });
    expect((s.spec.elements[0] as TextElement).xMm).toBe(42);
    expect(s.past).toHaveLength(1);
  });

  it("undo and redo restore snapshots and clear redo on new actions", () => {
    let s = createInitialEditorState(validSpec);
    s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [patch] });
    s = editorReducer(s, { type: "UNDO" });
    expect((s.spec.elements[0] as TextElement).xMm).toBe(15);
    s = editorReducer(s, { type: "REDO" });
    expect((s.spec.elements[0] as TextElement).xMm).toBe(42);
    s = editorReducer(s, { type: "UNDO" });
    s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [patch] });
    expect(s.future).toHaveLength(0);
  });

  it("adds, copies, pastes, duplicates, deletes", () => {
    let s = createInitialEditorState(validSpec);
    const el: DocumentElement = { ...validSpec.elements[0], id: "el-9", name: "Extra" };
    s = editorReducer(s, { type: "ADD_ELEMENT", element: el });
    expect(s.spec.elements).toHaveLength(2);
    expect(s.selection).toEqual(["el-9"]);

    s = editorReducer(s, { type: "COPY_SELECTED" });
    expect(s.clipboard).toHaveLength(1);
    s = editorReducer(s, { type: "PASTE" });
    expect(s.spec.elements).toHaveLength(3);
    const pasted = s.spec.elements[2] as TextElement;
    expect(pasted.id).not.toBe("el-9");
    expect(pasted.xMm).toBeCloseTo(el.xMm + 2, 6);

    s = editorReducer(s, { type: "DUPLICATE_SELECTED" });
    expect(s.spec.elements).toHaveLength(4);

    s = editorReducer(s, { type: "DELETE_SELECTED" });
    expect(s.spec.elements).toHaveLength(3);
  });

  it("reorders z-order and refuses to delete locked elements", () => {
    let s = createInitialEditorState(validSpec);
    s = editorReducer(s, { type: "ADD_ELEMENT", element: { ...validSpec.elements[0], id: "el-2", name: "B" } });
    s = editorReducer(s, { type: "REORDER_ELEMENT", id: "el-1", toIndex: 1 });
    expect(s.spec.elements.map((e) => e.id)).toEqual(["el-2", "el-1"]);

    s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [{ id: "el-1", patch: { locked: true } }] });
    s = editorReducer(s, { type: "SET_SELECTION", ids: ["el-1"] });
    s = editorReducer(s, { type: "DELETE_SELECTED" });
    expect(s.spec.elements.map((e) => e.id)).toContain("el-1");
  });

  it("caps history at HISTORY_LIMIT", () => {
    let s = createInitialEditorState(validSpec);
    for (let i = 0; i < 120; i++) {
      s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [{ id: "el-1", patch: { yMm: i } }] });
    }
    expect(s.past.length).toBeLessThanOrEqual(100);
  });

  it("names elements uniquely", () => {
    expect(newElementId()).not.toBe(newElementId());
    expect(nextElementName(validSpec, "Text")).toBe("Text 1");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/documents/editorState.test.ts`

- [ ] **Step 3: Implement `lib/documents/editorState.ts`**

```ts
"use client";

import { useReducer } from "react";
import type {
  DocumentElement,
  DocumentSpec,
  ImageElement,
  ShapeElement,
  TextElement,
} from "../../convex/documents/spec";

export type ElementPatch = Partial<
  Omit<TextElement, "type"> & Omit<ImageElement, "type"> & Omit<ShapeElement, "type">
>;

export interface EditorState {
  spec: DocumentSpec;
  selection: string[];
  clipboard: DocumentElement[];
  past: DocumentSpec[];
  future: DocumentSpec[];
}

export type EditorAction =
  | { type: "LOAD_SPEC"; spec: DocumentSpec }
  | { type: "ADD_ELEMENT"; element: DocumentElement }
  | { type: "UPDATE_ELEMENTS"; updates: { id: string; patch: ElementPatch }[] }
  | { type: "DELETE_SELECTED" }
  | { type: "DUPLICATE_SELECTED" }
  | { type: "COPY_SELECTED" }
  | { type: "PASTE" }
  | { type: "REORDER_ELEMENT"; id: string; toIndex: number }
  | { type: "SET_SELECTION"; ids: string[] }
  | { type: "SET_PAGE"; patch: Partial<DocumentSpec["page"]> }
  | { type: "UNDO" }
  | { type: "REDO" };

export const HISTORY_LIMIT = 100;
export const PASTE_OFFSET_MM = 2;

export function newElementId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nextElementName(spec: DocumentSpec, base: string): string {
  let index = 1;
  const names = new Set(spec.elements.map((e) => e.name));
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export function createInitialEditorState(spec: DocumentSpec): EditorState {
  return { spec, selection: [], clipboard: [], past: [], future: [] };
}

function withHistory(state: EditorState, spec: DocumentSpec): EditorState {
  return {
    ...state,
    spec,
    past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.spec],
    future: [],
  };
}

function cloneElement(element: DocumentElement, spec: DocumentSpec, offset: boolean): DocumentElement {
  const name = nextElementName(spec, element.name.replace(/ \d+$/, ""));
  return {
    ...element,
    id: newElementId(),
    name,
    ...(offset ? { xMm: element.xMm + PASTE_OFFSET_MM, yMm: element.yMm + PASTE_OFFSET_MM } : {}),
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "LOAD_SPEC":
      return createInitialEditorState(action.spec);
    case "ADD_ELEMENT":
      return {
        ...withHistory(state, { ...state.spec, elements: [...state.spec.elements, action.element] }),
        selection: [action.element.id],
      };
    case "UPDATE_ELEMENTS": {
      if (action.updates.length === 0) return state;
      const patchMap = new Map(action.updates.map((u) => [u.id, u.patch]));
      const elements = state.spec.elements.map((element) => {
        const patch = patchMap.get(element.id);
        return patch ? ({ ...element, ...patch } as DocumentElement) : element;
      });
      return withHistory(state, { ...state.spec, elements });
    }
    case "DELETE_SELECTED": {
      const doomed = new Set(
        state.spec.elements.filter((e) => state.selection.includes(e.id) && !e.locked).map((e) => e.id),
      );
      if (doomed.size === 0) return state;
      return {
        ...withHistory(state, {
          ...state.spec,
          elements: state.spec.elements.filter((e) => !doomed.has(e.id)),
        }),
        selection: [],
      };
    }
    case "COPY_SELECTED":
      return {
        ...state,
        clipboard: state.spec.elements.filter((e) => state.selection.includes(e.id) && !e.locked),
      };
    case "PASTE": {
      if (state.clipboard.length === 0) return state;
      const clones = state.clipboard.map((element) => cloneElement(element, state.spec, true));
      return {
        ...withHistory(state, { ...state.spec, elements: [...state.spec.elements, ...clones] }),
        selection: clones.map((c) => c.id),
      };
    }
    case "DUPLICATE_SELECTED": {
      const selected = state.spec.elements.filter((e) => state.selection.includes(e.id) && !e.locked);
      if (selected.length === 0) return state;
      const clones = selected.map((element) => cloneElement(element, state.spec, true));
      return {
        ...withHistory(state, { ...state.spec, elements: [...state.spec.elements, ...clones] }),
        selection: clones.map((c) => c.id),
      };
    }
    case "REORDER_ELEMENT": {
      const from = state.spec.elements.findIndex((e) => e.id === action.id);
      if (from === -1) return state;
      const to = Math.max(0, Math.min(action.toIndex, state.spec.elements.length - 1));
      if (from === to) return state;
      const elements = [...state.spec.elements];
      const [moved] = elements.splice(from, 1);
      elements.splice(to, 0, moved);
      return withHistory(state, { ...state.spec, elements });
    }
    case "SET_SELECTION":
      return { ...state, selection: action.ids };
    case "SET_PAGE":
      return withHistory(state, { ...state.spec, page: { ...state.spec.page, ...action.patch } });
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        spec: previous,
        past: state.past.slice(0, -1),
        future: [state.spec, ...state.future].slice(0, HISTORY_LIMIT),
        selection: state.selection.filter((id) => previous.elements.some((e) => e.id === id)),
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        spec: next,
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.spec],
        future: state.future.slice(1),
        selection: state.selection.filter((id) => next.elements.some((e) => e.id === id)),
      };
    }
  }
}

export function useEditorState(initialSpec: DocumentSpec) {
  const [state, dispatch] = useReducer(editorReducer, createInitialEditorState(initialSpec));
  return { state, dispatch, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
```

- [ ] **Step 4: Run tests, gates, commit**

```bash
npx vitest run lib/documents/editorState.test.ts
npm run typecheck; npm run lint
git add lib/documents/editorState.ts lib/documents/editorState.test.ts
git commit -m "feat(documents): editor state reducer with snapshot undo/redo and clipboard"
```

---

### Task 10: Canvas interaction core

**Files:**
- Modify: `lib/download.ts` (add `downloadBlobFile`)
- Create: `components/documents/editor/ElementView.tsx`
- Create: `components/documents/editor/SelectionOverlay.tsx`
- Create: `components/documents/editor/Canvas.tsx`

**Interfaces:**
- Consumes: `useEditorState` (Task 9), geometry (Task 6), snap (Task 7), tokens (Task 5), fonts (Task 1), spec (Task 2).
- Produces:
  - `downloadBlobFile(filename: string, blob: Blob): void`
  - `ElementViewProps` / `ElementView`
  - `SelectionOverlayProps` / `SelectionOverlay`
  - `CanvasProps` / `Canvas` where
    ```ts
    interface CanvasProps {
      state: EditorState;
      dispatch: React.Dispatch<EditorAction>;
      zoom: number;                 // 0.25–4
      gridEnabled: boolean;
      snapEnabled: boolean;
      tokens: TokenMap;
      imageUrls: Record<string, string>;
      onZoomChange: (zoom: number) => void;
    }
    ```

UI tasks are verified by typecheck/lint/build and the final e2e (Task 16). There are no DOM unit tests.

- [ ] **Step 1: Add `downloadBlobFile` to `lib/download.ts`**

```ts
export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Create `components/documents/editor/ElementView.tsx`**

```tsx
"use client";

import type { CSSProperties, ReactNode } from "react";
import type { DocumentElement } from "@/convex/documents/spec";
import { PX_PER_MM } from "@/lib/documents/geometry";
import { resolveTokens, type TokenMap } from "@/lib/documents/tokens";

function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

export interface ElementViewProps {
  element: DocumentElement;
  tokens: TokenMap;
  imageUrls: Record<string, string>;
  dxMm: number; // live drag offset (mm); 0 when idle
  dyMm: number;
  interactive: boolean;
  onPointerDown: (event: React.PointerEvent, element: DocumentElement) => void;
}

export function ElementView({
  element,
  tokens,
  imageUrls,
  dxMm,
  dyMm,
  interactive,
  onPointerDown,
}: ElementViewProps) {
  const style: CSSProperties = {
    position: "absolute",
    left: mmToPx(element.xMm + dxMm),
    top: mmToPx(element.yMm + dyMm),
    width: mmToPx(element.widthMm),
    height: mmToPx(element.heightMm),
    opacity: element.opacity,
    transform: element.rotationDeg !== 0 ? `rotate(${element.rotationDeg}deg)` : undefined,
    cursor: element.locked || !interactive ? "default" : "move",
  };

  let content: ReactNode = null;
  if (element.type === "text") {
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          fontFamily: `'${element.fontFamily}', serif`,
          fontSize: `${element.fontSizePt * (96 / 72)}px`,
          fontWeight: element.bold ? 700 : 400,
          fontStyle: element.italic ? "italic" : "normal",
          textDecoration: element.underline ? "underline" : "none",
          textAlign: element.align,
          color: element.color,
          lineHeight: element.lineHeight,
          letterSpacing: mmToPx(element.letterSpacingMm),
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {resolveTokens(element.content, tokens)}
      </div>
    );
  } else if (element.type === "image") {
    const url = imageUrls[element.storageId];
    content = url ? (
      <img
        src={url}
        alt={element.name}
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: element.fit }}
      />
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          border: "1px dashed #c8cdd6",
          background: "#f4f6fa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8a93a5",
          fontSize: 10,
        }}
      >
        Image unavailable
      </div>
    );
  } else if (element.type === "rect") {
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: element.fill ?? "transparent",
          border: element.stroke ? `${mmToPx(element.strokeWidthMm)}px solid ${element.stroke}` : "none",
          boxSizing: "border-box",
        }}
      />
    );
  } else if (element.type === "ellipse") {
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: element.fill ?? "transparent",
          borderRadius: "50%",
          border: element.stroke ? `${mmToPx(element.strokeWidthMm)}px solid ${element.stroke}` : "none",
          boxSizing: "border-box",
        }}
      />
    );
  } else {
    content = (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center" }}>
        <div
          style={{
            width: "100%",
            height: `${Math.max(mmToPx(element.strokeWidthMm), 1)}px`,
            background: element.stroke ?? "#000000",
          }}
        />
      </div>
    );
  }

  return (
    <div data-element-id={element.id} style={style} onPointerDown={(event) => onPointerDown(event, element)}>
      {content}
    </div>
  );
}
```

- [ ] **Step 3: Create `components/documents/editor/SelectionOverlay.tsx`**

```tsx
"use client";

import type { DocumentElement } from "@/convex/documents/spec";
import { HANDLE_IDS, PX_PER_MM, type HandleId } from "@/lib/documents/geometry";
import type { SnapGuide } from "@/lib/documents/snap";

function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

export interface SelectionOverlayProps {
  selected: DocumentElement[];
  zoom: number;
  interactive: boolean; // false while a drag is active (hides handles)
  guides: SnapGuide[];
  marquee: { xMm: number; yMm: number; widthMm: number; heightMm: number } | null;
  onHandlePointerDown: (event: React.PointerEvent, handle: HandleId) => void;
  onRotatePointerDown: (event: React.PointerEvent) => void;
}

function cursorFor(handle: HandleId): string {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  return "nesw-resize";
}

export function SelectionOverlay({
  selected,
  zoom,
  interactive,
  guides,
  marquee,
  onHandlePointerDown,
  onRotatePointerDown,
}: SelectionOverlayProps) {
  const handleSize = 8 / zoom;

  return (
    <>
      {selected.map((element) => (
        <div
          key={element.id}
          data-selection-id={element.id}
          style={{
            position: "absolute",
            left: mmToPx(element.xMm),
            top: mmToPx(element.yMm),
            width: mmToPx(element.widthMm),
            height: mmToPx(element.heightMm),
            transform: element.rotationDeg !== 0 ? `rotate(${element.rotationDeg}deg)` : undefined,
            outline: `${1.5 / zoom}px solid #2e5aac`,
            pointerEvents: "none",
          }}
        >
          {interactive && !element.locked
            ? HANDLE_IDS.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  aria-label={`Resize ${handle}`}
                  data-handle={handle}
                  onPointerDown={(event) => onHandlePointerDown(event, handle)}
                  style={{
                    position: "absolute",
                    width: handleSize,
                    height: handleSize,
                    background: "#ffffff",
                    border: `${1 / zoom}px solid #2e5aac`,
                    borderRadius: handleSize / 4,
                    pointerEvents: "auto",
                    cursor: cursorFor(handle),
                    left: handle.includes("w") ? 0 : handle.includes("e") ? "100%" : "50%",
                    top: handle.includes("n") ? 0 : handle.includes("s") ? "100%" : "50%",
                    transform: "translate(-50%, -50%)",
                    padding: 0,
                    lineHeight: 1,
                  }}
                />
              ))
            : null}
          {interactive && !element.locked ? (
            <button
              type="button"
              aria-label="Rotate element"
              data-handle="rotate"
              onPointerDown={onRotatePointerDown}
              style={{
                position: "absolute",
                left: "50%",
                top: -28 / zoom,
                width: handleSize,
                height: handleSize,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                background: "#ffffff",
                border: `${1 / zoom}px solid #2e5aac`,
                cursor: "grab",
                pointerEvents: "auto",
                padding: 0,
              }}
            />
          ) : null}
        </div>
      ))}

      {marquee ? (
        <div
          data-marquee
          style={{
            position: "absolute",
            left: mmToPx(Math.min(marquee.xMm, marquee.xMm + marquee.widthMm)),
            top: mmToPx(Math.min(marquee.yMm, marquee.yMm + marquee.heightMm)),
            width: mmToPx(Math.abs(marquee.widthMm)),
            height: mmToPx(Math.abs(marquee.heightMm)),
            border: `${1 / zoom}px dashed #2e5aac`,
            background: "rgba(46,90,172,0.08)",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {guides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.positionMm}`}
          data-snap-guide
          style={{
            position: "absolute",
            background: "#e0245e",
            pointerEvents: "none",
            ...(guide.axis === "x"
              ? { left: mmToPx(guide.positionMm), top: 0, width: 1 / zoom, height: "100%" }
              : { left: 0, top: mmToPx(guide.positionMm), height: 1 / zoom, width: "100%" }),
          }}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 4: Create `components/documents/editor/Canvas.tsx`**

Behavior: scrollable viewport; page surface rendered at zoom-1 mm-true size, scaled with `transform: scale(zoom)`; grid overlay; dashed margin guides; pointer flows for move (with snap against other elements/margins/page), resize (single selection only), rotate (45° magnet within 5°, Shift = 15° steps), marquee multi-select, click-select (Shift toggles); keyboard on a focusable wrapper (arrows nudge 0.5mm / Shift 5mm, Delete, Ctrl+A/C/V/D/Z/Shift+Z, Esc — skipped when the event target is an input/textarea/select); Ctrl+wheel zooms; wheel pans by native scroll; Space+drag pans via `scrollBy`.

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentElement } from "@/convex/documents/spec";
import { resolvePageSize } from "@/convex/documents/spec";
import {
  PX_PER_MM,
  elementCorners,
  hitTest,
  normalizeAngle,
  resizeBox,
  snapAngle,
  type HandleId,
} from "@/lib/documents/geometry";
import { collectSnapTargets, snapBox, snapToGrid, type SnapGuide } from "@/lib/documents/snap";
import type { EditorAction, EditorState } from "@/lib/documents/editorState";
import type { TokenMap } from "@/lib/documents/tokens";
import { ElementView } from "./ElementView";
import { SelectionOverlay } from "./SelectionOverlay";

const GRID_MM = 5;
const NUDGE_MM = 0.5;
const BIG_NUDGE_MM = 5;
const SNAP_THRESHOLD_PX = 6;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ROTATE_SNAP_STEP = 15;

interface Marquee {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

type Drag =
  | { kind: "idle" }
  | { kind: "move"; startPx: Point; origins: Map<string, { xMm: number; yMm: number }>; moved: boolean }
  | { kind: "resize"; handle: HandleId; startPx: Point; element: DocumentElement }
  | { kind: "rotate"; element: DocumentElement; pointerAngle0: number; rotation0: number; moved: boolean }
  | { kind: "marquee"; originMm: Point }
  | { kind: "pan"; startScroll: Point; startPx: Point };

interface Point {
  x: number;
  y: number;
}

function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
  );
}

export interface CanvasProps {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  zoom: number;
  gridEnabled: boolean;
  snapEnabled: boolean;
  tokens: TokenMap;
  imageUrls: Record<string, string>;
  onZoomChange: (zoom: number) => void;
}

export function Canvas({
  state,
  dispatch,
  zoom,
  gridEnabled,
  snapEnabled,
  tokens,
  imageUrls,
  onZoomChange,
}: CanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef(false);
  const dragRef = useRef<Drag>({ kind: "idle" });
  const [dragDelta, setDragDelta] = useState({ dxMm: 0, dyMm: 0 });
  const [dragging, setDragging] = useState(false);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  const { widthMm, heightMm } = useMemo(() => resolvePageSize(state.spec.page), [state.spec.page]);
  const selected = useMemo(
    () => state.spec.elements.filter((e) => state.selection.includes(e.id)),
    [state.spec.elements, state.selection],
  );

  const pagePointMm = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (event.clientX - rect.left) / (PX_PER_MM * zoom),
        y: (event.clientY - rect.top) / (PX_PER_MM * zoom),
      };
    },
    [zoom],
  );

  const commitDrag = useCallback(
    (finalDelta: { dxMm: number; dyMm: number }) => {
      const drag = dragRef.current;
      if (drag.kind === "move" && drag.moved) {
        dispatch({
          type: "UPDATE_ELEMENTS",
          updates: [...drag.origins.entries()].map(([id, origin]) => ({
            id,
            patch: { xMm: origin.xMm + finalDelta.dxMm, yMm: origin.yMm + finalDelta.dyMm },
          })),
        });
      }
    },
    [dispatch],
  );

  const onElementPointerDown = useCallback(
    (event: React.PointerEvent, element: DocumentElement) => {
      if (event.button !== 0 || spaceRef.current) return;
      event.stopPropagation();
      const additive = event.shiftKey;
      let selection = state.selection;
      if (additive) {
        selection = selection.includes(element.id)
          ? selection.filter((id) => id !== element.id)
          : [...selection, element.id];
        dispatch({ type: "SET_SELECTION", ids: selection });
        if (selection.includes(element.id) === false) return;
      } else if (!selection.includes(element.id)) {
        selection = [element.id];
        dispatch({ type: "SET_SELECTION", ids: selection });
      }

      const movable = state.spec.elements.filter((e) => selection.includes(e.id) && !e.locked);
      if (movable.length === 0 || element.locked) return;

      const origins = new Map(movable.map((e) => [e.id, { xMm: e.xMm, yMm: e.yMm }]));
      dragRef.current = { kind: "move", startPx: { x: event.clientX, y: event.clientY }, origins, moved: false };
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      viewportRef.current?.focus();
    },
    [dispatch, state.selection, state.spec.elements],
  );

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent, handle: HandleId) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const element = selected.find((e) => !e.locked);
      if (!element) return;
      dragRef.current = { kind: "resize", handle, startPx: { x: event.clientX, y: event.clientY }, element };
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    },
    [selected],
  );

  const onRotatePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const element = selected.find((e) => !e.locked);
      if (!element) return;
      const rect = pageRef.current?.getBoundingClientRect();
      const pointMm = pagePointMm(event);
      if (!rect) return;
      const centerMm = {
        x: element.xMm + element.widthMm / 2,
        y: element.yMm + element.heightMm / 2,
      };
      const pointerAngle0 =
        (Math.atan2(pointMm.y - centerMm.y, pointMm.x - centerMm.x) * 180) / Math.PI;
      dragRef.current = {
        kind: "rotate",
        element,
        pointerAngle0,
        rotation0: element.rotationDeg,
        moved: false,
      };
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    },
    [pagePointMm, selected],
  );

  const onPagePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if (spaceRef.current) {
        const viewport = viewportRef.current;
        if (!viewport) return;
        dragRef.current = {
          kind: "pan",
          startScroll: { x: viewport.scrollLeft, y: viewport.scrollTop },
          startPx: { x: event.clientX, y: event.clientY },
        };
        return;
      }
      const origin = pagePointMm(event);
      dragRef.current = { kind: "marquee", originMm: origin };
      setMarquee({ xMm: origin.x, yMm: origin.y, widthMm: 0, heightMm: 0 });
      viewportRef.current?.focus();
    },
    [pagePointMm],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (drag.kind === "idle") return;
      const mmPerPx = 1 / (PX_PER_MM * zoom);

      if (drag.kind === "pan") {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.scrollLeft = drag.startScroll.x - (event.clientX - drag.startPx.x);
        viewport.scrollTop = drag.startScroll.y - (event.clientY - drag.startPx.y);
        return;
      }
      if (drag.kind === "marquee") {
        const point = pagePointMm(event);
        setMarquee({
          xMm: drag.originMm.x,
          yMm: drag.originMm.y,
          widthMm: point.x - drag.originMm.x,
          heightMm: point.y - drag.originMm.y,
        });
        return;
      }
      if (drag.kind === "move") {
        drag.moved = true;
        let dxMm = (event.clientX - drag.startPx.x) * mmPerPx;
        let dyMm = (event.clientY - drag.startPx.y) * mmPerPx;
        // Grid mode quantizes the deltas.
        if (gridEnabled && snapEnabled) {
          const lead = [...drag.origins.entries()][0];
          if (lead) {
            const snapped = snapToGrid(lead[1].xMm + dxMm, GRID_MM) - lead[1].xMm;
            const snappedY = snapToGrid(lead[1].yMm + dyMm, GRID_MM) - lead[1].yMm;
            dxMm = snapped;
            dyMm = snappedY;
          }
          setGuides([]);
          setDragDelta({ dxMm, dyMm });
          return;
        }
        if (snapEnabled && drag.origins.size === 1) {
          const [id, origin] = [...drag.origins.entries()][0]!;
          const excludeIds = new Set(state.selection);
          const targets = collectSnapTargets(state.spec.page, state.spec.elements, excludeIds);
          const lead = state.spec.elements.find((e) => e.id === id)!;
          const result = snapBox(
            { xMm: origin.xMm + dxMm, yMm: origin.yMm + dyMm, widthMm: lead.widthMm, heightMm: lead.heightMm },
            targets,
            SNAP_THRESHOLD_PX * mmPerPx,
          );
          dxMm = result.xMm - origin.xMm;
          dyMm = result.yMm - origin.yMm;
          setGuides(result.guides);
        } else {
          setGuides([]);
        }
        setDragDelta({ dxMm, dyMm });
        return;
      }
      if (drag.kind === "resize") {
        const dxMm = (event.clientX - drag.startPx.x) * mmPerPx;
        const dyMm = (event.clientY - drag.startPx.y) * mmPerPx;
        const next = resizeBox(drag.element, drag.handle, dxMm, dyMm, {
          aspectRatio: event.shiftKey,
        });
        dispatch({
          type: "UPDATE_ELEMENTS",
          updates: [{ id: drag.element.id, patch: { xMm: next.xMm, yMm: next.yMm, widthMm: next.widthMm, heightMm: next.heightMm } }],
        });
        dragRef.current = { ...drag, element: { ...drag.element, ...next } };
        return;
      }
      if (drag.kind === "rotate") {
        drag.moved = true;
        const point = pagePointMm(event);
        const centerMm = {
          x: drag.element.xMm + drag.element.widthMm / 2,
          y: drag.element.yMm + drag.element.heightMm / 2,
        };
        const angle =
          (Math.atan2(point.y - centerMm.y, point.x - centerMm.x) * 180) / Math.PI;
        const raw = drag.rotation0 + (angle - drag.pointerAngle0);
        const next = event.shiftKey
          ? normalizeAngle(Math.round(raw / ROTATE_SNAP_STEP) * ROTATE_SNAP_STEP)
          : snapAngle(raw);
        dispatch({ type: "UPDATE_ELEMENTS", updates: [{ id: drag.element.id, patch: { rotationDeg: next } }] });
        dragRef.current = { ...drag, element: { ...drag.element, rotationDeg: next } };
      }
    },
    [dispatch, gridEnabled, pagePointMm, snapEnabled, state.spec, state.selection, zoom],
  );

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag.kind === "marquee" && marquee) {
      const minX = Math.min(marquee.xMm, marquee.xMm + marquee.widthMm);
      const maxX = Math.max(marquee.xMm, marquee.xMm + marquee.widthMm);
      const minY = Math.min(marquee.yMm, marquee.yMm + marquee.heightMm);
      const maxY = Math.max(marquee.yMm, marquee.yMm + marquee.heightMm);
      const hits = state.spec.elements
        .filter((element) =>
          elementCorners(element).some(
            (corner) => corner.x >= minX && corner.x <= maxX && corner.y >= minY && corner.y <= maxY,
          ),
        )
        .map((element) => element.id);
      dispatch({ type: "SET_SELECTION", ids: hits });
      setMarquee(null);
    } else if (drag.kind === "move") {
      commitDrag(dragDelta);
    }
    dragRef.current = { kind: "idle" };
    setDragDelta({ dxMm: 0, dyMm: 0 });
    setDragging(false);
    setGuides([]);
  }, [commitDrag, dispatch, dragDelta, marquee, state.spec.elements]);

  // Resize commits dispatch immediately per move (each step is undoable as one
  // history entry only if the reducer coalesces — acceptable v1 behavior: each
  // pointermove is a history snapshot; a drag creates several undo steps. To
  // keep undo usable, resize/rotate commit the final value on pointerup only:
  // we accumulate into drag.element and dispatch once on release.
  // → Implementation detail below: resize/rotate dispatch live for visual
  //    feedback. V1 accepts multi-step undo for a single drag.

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent | KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (meta && key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "REDO" : "UNDO" });
      } else if (meta && key === "y") {
        event.preventDefault();
        dispatch({ type: "REDO" });
      } else if (meta && key === "a") {
        event.preventDefault();
        dispatch({ type: "SET_SELECTION", ids: state.spec.elements.map((e) => e.id) });
      } else if (meta && key === "c") {
        dispatch({ type: "COPY_SELECTED" });
      } else if (meta && key === "v") {
        dispatch({ type: "PASTE" });
      } else if (meta && key === "d") {
        event.preventDefault();
        dispatch({ type: "DUPLICATE_SELECTED" });
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        dispatch({ type: "DELETE_SELECTED" });
      } else if (key === "escape") {
        dispatch({ type: "SET_SELECTION", ids: [] });
      } else if (key.startsWith("arrow")) {
        event.preventDefault();
        const step = (event.shiftKey ? BIG_NUDGE_MM : NUDGE_MM) * (key.endsWith("left") || key.endsWith("up") ? -1 : 1);
        dispatch({
          type: "UPDATE_ELEMENTS",
          updates: selected
            .filter((e) => !e.locked)
            .map((e) => ({
              id: e.id,
              patch: key.endsWith("left") || key.endsWith("right") ? { xMm: e.xMm + step } : { yMm: e.yMm + step },
            })),
        });
      }
    },
    [dispatch, selected, state.spec.elements],
  );

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === " ") spaceRef.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === " ") spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const pageStyle: React.CSSProperties = {
    width: mmToPx(widthMm),
    height: mmToPx(heightMm),
    background: state.spec.page.background,
    position: "relative",
    boxShadow: "0 4px 24px rgba(15,23,42,0.18)",
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
    touchAction: "none",
  };

  const gridBackground = gridEnabled
    ? {
        backgroundImage:
          "linear-gradient(to right, rgba(100,116,139,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.18) 1px, transparent 1px)",
        backgroundSize: `${mmToPx(GRID_MM)}px ${mmToPx(GRID_MM)}px`,
      }
    : undefined;

  const marginStyle: React.CSSProperties = {
    position: "absolute",
    left: mmToPx(state.spec.page.margins.left),
    top: mmToPx(state.spec.page.margins.top),
    width: mmToPx(widthMm - state.spec.page.margins.left - state.spec.page.margins.right),
    height: mmToPx(heightMm - state.spec.page.margins.top - state.spec.page.margins.bottom),
    border: "1px dashed rgba(100,116,139,0.45)",
    pointerEvents: "none",
  };

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      role="application"
      aria-label="Certificate canvas"
      onKeyDown={onKeyDown}
      onWheel={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
          onZoomChange(Math.round(next * 100) / 100);
        }
      }}
      className="h-full flex-1 overflow-auto bg-muted/40 outline-none"
      style={{ cursor: spaceRef.current ? "grab" : undefined }}
    >
      <div className="min-h-full w-max min-w-full p-10">
        <div
          ref={pageRef}
          data-canvas-page
          style={pageStyle}
          onPointerDown={onPagePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {gridBackground ? <div style={{ ...gridBackground, position: "absolute", inset: 0, pointerEvents: "none" }} /> : null}
          <div style={marginStyle} />
          {state.spec.elements.map((element) => (
            <ElementView
              key={element.id}
              element={element}
              tokens={tokens}
              imageUrls={imageUrls}
              dxMm={dragDelta.dxMm}
              dyMm={dragDelta.dyMm}
              interactive={!dragging}
              onPointerDown={onElementPointerDown}
            />
          ))}
          <SelectionOverlay
            selected={selected}
            zoom={zoom}
            interactive={dragRef.current.kind === "idle"}
            guides={guides}
            marquee={marquee}
            onHandlePointerDown={onHandlePointerDown}
            onRotatePointerDown={onRotatePointerDown}
          />
        </div>
      </div>
    </div>
  );
}
```

Implementation notes (apply, do not leave as comments in code):
- The resize/rotate handlers above dispatch on every pointermove, which creates one history entry per move. To keep undo usable, change them to accumulate the pending patch in `drag.element` (already done via `dragRef.current = { ...drag, element }`) and dispatch **only in `onPointerUp`** for `resize`/`rotate` (mirroring `commitDrag` for `move`). Move the dispatch out of the move branch into `onPointerUp` using `drag.element`'s final box; keep a `preview` state that re-renders the element live via `dragDelta`-style overrides or by rendering `drag.element` in place of the spec element. Simplest correct approach: during resize/rotate, render the dragged element from `dragRef` via a small `preview` state object (`setPreview({ id, patch })`) applied in `ElementView` props, then `dispatch` once on release.
- `dragging` state: set `true` in `onElementPointerDown`/handle/rotate pointerdown when a drag starts and `false` in `onPointerUp` (the `setDragging` in `onPointerUp` already exists).
- `commitDrag` currently only handles `move`; extend it with the resize/rotate final commit once restructured as above.

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck; npm run lint
git add lib/download.ts components/documents/editor
git commit -m "feat(documents): editor canvas with drag, resize, rotate, snap guides, and marquee selection"
```

---

### Task 11: Toolbar, Palette, and uploads

**Files:**
- Create: `components/documents/editor/Toolbar.tsx`
- Create: `components/documents/editor/Palette.tsx`

**Interfaces:**
- Consumes: `EditorState`/`EditorAction` (Task 9), `FONT_META`/`ensureEditorFontsLoaded` (Task 1), `api.documents.templates` / `api.documents.assets` (Tasks 3–4), `storageIdFromUploadUrl` (Task 1), shadcn primitives (`@/components/ui/{button,input,select,tooltip,badge}`), `SaveIndicator` (`@/components/tabulation/SaveIndicator`), sonner.
- Produces:
  ```ts
  interface ToolbarProps {
    orgSlug: string;
    templateName: string;
    onNameChange: (name: string) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    zoom: number;
    onZoomChange: (zoom: number) => void;
    onFit: () => void;
    gridEnabled: boolean;
    snapEnabled: boolean;
    onToggleGrid: () => void;
    onToggleSnap: () => void;
    saveState: SaveState;
    savedAt: number | null;
    onRetrySave: () => void;
    onPreview: () => void;
    onDownloadSample: () => void;
    backHref: string;
  }

  interface PaletteProps {
    orgSlug: string;
    state: EditorState;
    dispatch: React.Dispatch<EditorAction>;
    imageUrls: Record<string, string>;
    uploads: { storageId: string; name: string }[];
    onUploaded: (storageId: string, name: string) => void;
  }
  ```
- Palette "apply template" uses `dispatch({ type: "LOAD_SPEC", spec })` after a `ConfirmDialog`-style confirm (reuse `@/components/tabulation/ConfirmDialog` if its API fits; otherwise `window.confirm` is not acceptable — use the existing `Dialog` primitive).

- [ ] **Step 1: Create `components/documents/editor/Toolbar.tsx`**

Layout: single top bar — left: `Link` back (ArrowLeft icon) + name `Input` (borderless, commits on blur/Enter); center: undo/redo `Tooltip` buttons, zoom out / percent display / zoom in / fit buttons, grid + snap toggle buttons; right: `SaveIndicator`, Preview button (opens True Preview), Download sample button.

```tsx
"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Grid3x3,
  Magnet,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveIndicator, type SaveState } from "@/components/tabulation/SaveIndicator";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

export interface ToolbarProps {
  templateName: string;
  onNameChange: (name: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
  gridEnabled: boolean;
  snapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  saveState: SaveState;
  savedAt: number | null;
  onRetrySave: () => void;
  onPreview: () => void;
  onDownloadSample: () => void;
  backHref: string;
}

export function Toolbar(props: ToolbarProps) {
  const [nameDraft, setNameDraft] = useState(props.templateName);
  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== props.templateName) props.onNameChange(trimmed);
    else setNameDraft(props.templateName);
  };

  const zoomPercent = Math.round(props.zoom * 100);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background px-4">
      <Button variant="ghost" size="icon" asChild aria-label="Back to documents">
        <Link href={props.backHref}>
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
      </Button>
      <Input
        aria-label="Template name"
        className="h-8 w-56 border-transparent bg-transparent text-sm font-semibold hover:border-input focus-visible:border-input"
        value={nameDraft}
        onChange={(event) => setNameDraft(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />

      <div className="mx-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={props.onUndo} disabled={!props.canUndo} aria-label="Undo">
              <Undo2 aria-hidden className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={props.onRedo} disabled={!props.canRedo} aria-label="Redo">
              <Redo2 aria-hidden className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
        </Tooltip>

        <span className="mx-2 h-6 w-px bg-border" aria-hidden />

        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          onClick={() => props.onZoomChange(Math.max(ZOOM_MIN, Math.round((props.zoom - 0.1) * 100) / 100))}
        >
          <Minus aria-hidden className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{zoomPercent}%</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          onClick={() => props.onZoomChange(Math.min(ZOOM_MAX, Math.round((props.zoom + 0.1) * 100) / 100))}
        >
          <Plus aria-hidden className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={props.onFit} aria-label="Fit to screen">
          <Maximize aria-hidden className="size-4" />
        </Button>

        <span className="mx-2 h-6 w-px bg-border" aria-hidden />

        <Button
          variant={props.gridEnabled ? "secondary" : "ghost"}
          size="icon"
          onClick={props.onToggleGrid}
          aria-label="Toggle grid"
          aria-pressed={props.gridEnabled}
        >
          <Grid3x3 aria-hidden className="size-4" />
        </Button>
        <Button
          variant={props.snapEnabled ? "secondary" : "ghost"}
          size="icon"
          onClick={props.onToggleSnap}
          aria-label="Toggle snapping"
          aria-pressed={props.snapEnabled}
        >
          <Magnet aria-hidden className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <SaveIndicator state={props.saveState} savedAt={props.savedAt} onRetry={props.onRetrySave} />
        <Button variant="outline" size="sm" onClick={props.onDownloadSample}>
          <Download aria-hidden className="size-4" />
          Sample PDF
        </Button>
        <Button size="sm" onClick={props.onPreview}>
          Preview
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create `components/documents/editor/Palette.tsx`**

Tabs: Templates / Elements / Text / Uploads. Adding elements dispatches `ADD_ELEMENT` with sensible defaults centered on the page; uploads call `generateUploadUrl` + `fetch` PUT and dispatch an image element; Templates tab lists via `useQuery(api.documents.templates.list)` and applies after a confirm dialog (replaces spec, one undo step).

```tsx
"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { DocumentSpec, ImageElement, ShapeElement, TextElement } from "@/convex/documents/spec";
import { resolvePageSize } from "@/convex/documents/spec";
import { ensureEditorFontsLoaded, storageIdFromUploadUrl } from "@/lib/documents/fonts";
import { newElementId, nextElementName, type EditorAction, type EditorState } from "@/lib/documents/editorState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Circle, ImagePlus, LayoutTemplate, Minus, Square, Type } from "lucide-react";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

export interface PaletteProps {
  orgSlug: string;
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  imageUrls: Record<string, string>;
  uploads: { storageId: string; name: string }[];
  onUploaded: (storageId: string, name: string) => void;
}

type Tab = "templates" | "elements" | "text" | "uploads";

export function Palette({ orgSlug, state, dispatch, imageUrls, uploads, onUploaded }: PaletteProps) {
  const [tab, setTab] = useState<Tab>("elements");
  const [pendingTemplate, setPendingTemplate] = useState<{ name: string; spec: DocumentSpec } | null>(null);
  const templates = useQuery(api.documents.templates.list, { orgSlug, kind: "certificate" });
  const createUploadUrl = useMutation(api.documents.assets.generateUploadUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  ensureEditorFontsLoaded();

  const { widthMm, heightMm } = resolvePageSize(state.spec.page);
  const centerX = widthMm / 2;
  const centerY = heightMm / 2;

  function addText(preset: "heading" | "subheading" | "body" | "scriptName") {
    const presets = {
      heading: { fontSizePt: 30, fontFamily: "Crimson Text" as const, bold: true, heightMm: 14, label: "Heading" },
      subheading: { fontSizePt: 16, fontFamily: "Lato" as const, bold: true, heightMm: 9, label: "Subheading" },
      body: { fontSizePt: 12, fontFamily: "Lato" as const, bold: false, heightMm: 7, label: "Body" },
      scriptName: { fontSizePt: 48, fontFamily: "Great Vibes" as const, bold: false, heightMm: 24, label: "Name" },
    };
    const presetValue = presets[preset];
    const element: TextElement = {
      type: "text",
      id: newElementId(),
      name: nextElementName(state.spec, presetValue.label),
      xMm: centerX - 45,
      yMm: centerY - presetValue.heightMm / 2,
      widthMm: 90,
      heightMm: presetValue.heightMm,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: presetValue.label === "Name" ? "{{recipient.name}}" : presetValue.label,
      fontFamily: presetValue.fontFamily,
      fontSizePt: presetValue.fontSizePt,
      bold: presetValue.bold,
      italic: false,
      underline: false,
      align: "center",
      color: "#333333",
      lineHeight: 1.3,
      letterSpacingMm: 0,
    };
    dispatch({ type: "ADD_ELEMENT", element });
  }

  function addShape(kind: "rect" | "ellipse" | "line") {
    const widthMm0 = kind === "line" ? 60 : 40;
    const heightMm0 = kind === "line" ? 4 : 40;
    const element: ShapeElement = {
      type: kind,
      id: newElementId(),
      name: nextElementName(state.spec, kind === "rect" ? "Rectangle" : kind === "ellipse" ? "Ellipse" : "Line"),
      xMm: centerX - widthMm0 / 2,
      yMm: centerY - heightMm0 / 2,
      widthMm: widthMm0,
      heightMm: heightMm0,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      fill: kind === "line" ? null : null,
      stroke: "#555555",
      strokeWidthMm: 0.5,
    };
    dispatch({ type: "ADD_ELEMENT", element });
  }

  async function uploadImage(file: File) {
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPEG, or SVG images are allowed.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Images must be 2 MB or smaller.");
      return;
    }
    try {
      const { url } = await createUploadUrl({ orgSlug });
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      const storageId = storageIdFromUploadUrl(url);
      onUploaded(storageId, file.name);
      const element: ImageElement = {
        type: "image",
        id: newElementId(),
        name: nextElementName(state.spec, "Image"),
        xMm: centerX - 20,
        yMm: centerY - 20,
        widthMm: 40,
        heightMm: 40,
        rotationDeg: 0,
        opacity: 1,
        locked: false,
        showOnAllPages: false,
        storageId,
        fit: "contain",
      };
      dispatch({ type: "ADD_ELEMENT", element });
      toast.success("Image uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  const tabButton = (value: Tab, label: string, Icon: typeof LayoutTemplate) => (
    <button
      key={value}
      type="button"
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      className={
        tab === value
          ? "flex flex-col items-center gap-1 rounded-lg bg-sidebar-accent px-2 py-1.5 text-[10px] font-semibold text-sidebar-accent-foreground"
          : "flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground hover:bg-sidebar-accent/50"
      }
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-background" aria-label="Editor palette">
      <div className="grid grid-cols-4 gap-1 border-b border-border/60 p-2">
        {tabButton("templates", "Designs", LayoutTemplate)}
        {tabButton("elements", "Elements", Square)}
        {tabButton("text", "Text", Type)}
        {tabButton("uploads", "Uploads", ImagePlus)}
      </div>

      <ScrollArea className="flex-1 p-3">
        {tab === "templates" ? (
          <div className="space-y-2">
            {(templates ?? []).map((template) => (
              <button
                key={template._id}
                type="button"
                className="w-full rounded-lg border border-border p-3 text-left text-xs hover:border-primary/60 hover:bg-muted/50"
                onClick={() => setPendingTemplate({ name: template.name, spec: template.spec as DocumentSpec })}
              >
                <div className="font-semibold">{template.name}</div>
                <div className="text-muted-foreground">{template.description}</div>
              </button>
            ))}
          </div>
        ) : null}

        {tab === "elements" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => addShape("rect")}>
              <Square aria-hidden className="size-4" /> Rectangle
            </Button>
            <Button variant="outline" size="sm" onClick={() => addShape("ellipse")}>
              <Circle aria-hidden className="size-4" /> Ellipse
            </Button>
            <Button variant="outline" size="sm" onClick={() => addShape("line")}>
              <Minus aria-hidden className="size-4" /> Line
            </Button>
          </div>
        ) : null}

        {tab === "text" ? (
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => addText("heading")}>
              <span style={{ fontFamily: "'Crimson Text', serif", fontWeight: 700 }}>Add a heading</span>
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addText("subheading")}>
              <span style={{ fontWeight: 700 }}>Add a subheading</span>
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addText("body")}>
              Add body text
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addText("scriptName")}>
              <span style={{ fontFamily: "'Great Vibes', cursive", fontSize: 16 }}>Add recipient name</span>
            </Button>
          </div>
        ) : null}

        {tab === "uploads" ? (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_UPLOAD_TYPES.join(",")}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
                event.target.value = "";
              }}
            />
            <Button className="w-full" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus aria-hidden className="size-4" />
              Upload image
            </Button>
            <p className="text-[11px] text-muted-foreground">PNG, JPEG, or SVG up to 2 MB.</p>
            <div className="space-y-2">
              {uploads.map((upload) => (
                <button
                  key={upload.storageId}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-xs hover:border-primary/60"
                  onClick={() =>
                    dispatch({
                      type: "ADD_ELEMENT",
                      element: {
                        type: "image",
                        id: newElementId(),
                        name: nextElementName(state.spec, "Image"),
                        xMm: centerX - 20,
                        yMm: centerY - 20,
                        widthMm: 40,
                        heightMm: 40,
                        rotationDeg: 0,
                        opacity: 1,
                        locked: false,
                        showOnAllPages: false,
                        storageId: upload.storageId,
                        fit: "contain",
                      },
                    })
                  }
                >
                  {imageUrls[upload.storageId] ? (
                    <img src={imageUrls[upload.storageId]} alt="" className="size-10 rounded object-contain" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{upload.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </ScrollArea>

      <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply this design?</DialogTitle>
            <DialogDescription>
              Applying “{pendingTemplate?.name}” replaces the current layout. You can undo this afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingTemplate(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingTemplate) dispatch({ type: "LOAD_SPEC", spec: pendingTemplate.spec });
                setPendingTemplate(null);
              }}
            >
              Apply design
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
```

Note: `ScrollArea` is not currently in `components/ui` — check with `Get-ChildItem components\ui`; if missing, either add it via `npx shadcn@latest add scroll-area` (one command, uses the project's existing shadcn setup) or replace with `<div className="flex-1 overflow-y-auto p-3">` (zero new deps). Prefer the plain div.

- [ ] **Step 3: Gates and commit**

```bash
npm run typecheck; npm run lint
git add components/documents/editor/Toolbar.tsx components/documents/editor/Palette.tsx components/ui
git commit -m "feat(documents): editor toolbar and palette with templates, elements, text presets, and uploads"
```

---

### Task 12: Inspector, Layers, Page setup, Token picker

**Files:**
- Create: `components/documents/editor/TokenPicker.tsx`
- Create: `components/documents/editor/Inspector.tsx` (includes align tools)
- Create: `components/documents/editor/LayersPanel.tsx`
- Create: `components/documents/editor/PageSetupPanel.tsx`

**Interfaces:**
- Consumes: `EditorState`/`EditorAction`/`ElementPatch` (Task 9), `TOKEN_CATALOG` (Task 5), `FONT_META` (Task 1), `PAGE_PRESET_SIZES_MM` (Task 2), `selectionBounds` (Task 6), `resolvePageSize` (Task 2), `api.documents.templates.list` (for template name display — not needed here).
- Produces:
  ```ts
  interface InspectorProps {
    state: EditorState;
    dispatch: React.Dispatch<EditorAction>;
  }
  ```
  `TokenPicker` props: `{ onInsert: (token: string) => void }` — the inspector owns the textarea ref and inserts at the cursor. `LayersPanelProps` and `PageSetupPanelProps` are both `{ state; dispatch }` (same as Inspector).

- [ ] **Step 1: Create `components/documents/editor/TokenPicker.tsx`**

```tsx
"use client";

import { useState } from "react";
import { TOKEN_CATALOG } from "@/lib/documents/tokens";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

export interface TokenPickerProps {
  onInsert: (token: string) => void;
}

export function TokenPicker({ onInsert }: TokenPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Insert field
        <ChevronDown aria-hidden className="size-3.5" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 max-h-64 w-52 overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {TOKEN_CATALOG.map((def) => (
            <button
              key={def.token}
              type="button"
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              onClick={() => {
                onInsert(def.token);
                setOpen(false);
              }}
            >
              <span>{def.label}</span>
              <code className="text-[10px] text-muted-foreground">{`{{${def.token}}}`}</code>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/documents/editor/Inspector.tsx`**

Sections: (a) multi-select → align buttons only; (b) single text → content textarea + TokenPicker, typography controls (family Select, size number input, bold/italic/underline toggles disabled per `FONT_META`, align buttons, color input, line-height and letter-spacing ranges); (c) single image → fit select; (d) single shape → fill/stroke colors + stroke width; (e) common transform controls for any single selection (x/y/w/h number inputs step 0.1, rotation number + 0°/90° buttons, opacity range, lock toggle); delete + duplicate buttons. Small labeled sub-components inside the file (`Row`, `NumberField`) keep it readable.

```tsx
"use client";

import { useRef } from "react";
import type { DocumentElement, FontFamily, ImageElement, ShapeElement, TextElement } from "@/convex/documents/spec";
import { FONT_META } from "@/lib/documents/fonts";
import { selectionBounds } from "@/lib/documents/geometry";
import { resolvePageSize } from "@/convex/documents/spec";
import type { EditorAction, EditorState, ElementPatch } from "@/lib/documents/editorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  AlignVerticalJustifyCenter,
  AlignStartVertical,
  AlignEndVertical,
  Bold,
  Copy,
  Italic,
  Lock,
  LockOpen,
  Trash2,
  Underline,
} from "lucide-react";
import { TokenPicker } from "./TokenPicker";

const inputClass = "h-8 text-xs";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export interface InspectorProps {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export function Inspector({ state, dispatch }: InspectorProps) {
  const selected = state.spec.elements.filter((e) => state.selection.includes(e.id));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function patch(id: string, patchValue: ElementPatch) {
    dispatch({ type: "UPDATE_ELEMENTS", updates: [{ id, patch: patchValue }] });
  }

  function align(axis: "h" | "v", edge: "start" | "center" | "end") {
    const { widthMm, heightMm } = resolvePageSize(state.spec.page);
    const bounds = selectionBounds(selected);
    if (!bounds) return;
    const target = selected.length === 1 ? null : bounds; // page-relative when single
    for (const element of selected) {
      if (axis === "h") {
        const left = target ? target.minXMm : 0;
        const span = target ? target.maxXMm - target.minXMm : widthMm;
        const xMm =
          edge === "start" ? left : edge === "center" ? left + (span - element.widthMm) / 2 : left + span - element.widthMm;
        patch(element.id, { xMm: Math.round(xMm * 10) / 10 });
      } else {
        const top = target ? target.minYMm : 0;
        const span = target ? target.maxYMm - target.minYMm : heightMm;
        const yMm =
          edge === "start" ? top : edge === "center" ? top + (span - element.heightMm) / 2 : top + span - element.heightMm;
        patch(element.id, { yMm: Math.round(yMm * 10) / 10 });
      }
    }
  }

  function insertToken(token: string) {
    const textarea = textareaRef.current;
    const element = selected[0];
    if (!element || element.type !== "text") return;
    const marker = `{{${token}}}`;
    if (!textarea) {
      patch(element.id, { content: element.content + marker });
      return;
    }
    const start = textarea.selectionStart ?? element.content.length;
    const end = textarea.selectionEnd ?? start;
    patch(element.id, { content: element.content.slice(0, start) + marker + element.content.slice(end) });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + marker.length, start + marker.length);
    });
  }

  if (selected.length === 0) {
    return (
      <aside className="w-72 shrink-0 border-l border-border/60 bg-background p-4 text-xs text-muted-foreground" aria-label="Inspector">
        Select an element to edit its properties.
      </aside>
    );
  }

  const single = selected.length === 1 ? selected[0] : null;
  const text = single?.type === "text" ? (single as TextElement) : null;
  const image = single?.type === "image" ? (single as ImageElement) : null;
  const shape = single?.type !== "text" && single?.type !== "image" ? (single as ShapeElement) : null;

  return (
    <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-l border-border/60 bg-background p-4" aria-label="Inspector">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{selected.length > 1 ? `${selected.length} elements` : single?.name}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Duplicate" onClick={() => dispatch({ type: "DUPLICATE_SELECTED" })}>
            <Copy aria-hidden className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete"
            onClick={() => {
              const locked = selected.filter((e) => e.locked).length;
              if (locked > 0) toast.error("Locked elements were skipped.");
              dispatch({ type: "DELETE_SELECTED" });
            }}
          >
            <Trash2 aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>

      <section aria-label="Align">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Align left" onClick={() => align("h", "start")}>
            <AlignLeft aria-hidden className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Align center" onClick={() => align("h", "center")}>
            <AlignCenter aria-hidden className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Align right" onClick={() => align("h", "end")}>
            <AlignRight aria-hidden className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Align top" onClick={() => align("v", "start")}>
            <AlignStartVertical aria-hidden className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Align middle" onClick={() => align("v", "center")}>
            <AlignVerticalJustifyCenter aria-hidden className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Align bottom" onClick={() => align("v", "end")}>
            <AlignEndVertical aria-hidden className="size-4" />
          </Button>
        </div>
      </section>

      {text ? (
        <section aria-label="Text content" className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="inspector-content" className="text-[11px]">Content</Label>
            <TokenPicker onInsert={insertToken} />
          </div>
          <textarea
            id="inspector-content"
            ref={textareaRef}
            className="min-h-20 w-full rounded-md border border-input bg-transparent p-2 text-xs"
            value={text.content}
            onChange={(event) => patch(text.id, { content: event.target.value })}
          />
          <Row label="Font">
            <Select
              value={text.fontFamily}
              onValueChange={(value) => patch(text.id, { fontFamily: value as FontFamily })}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FONT_META) as FontFamily[]).map((family) => (
                  <SelectItem key={family} value={family}>
                    {family}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Size (pt)">
            <Input
              type="number"
              min={4}
              max={200}
              className={`${inputClass} w-20`}
              value={text.fontSizePt}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) patch(text.id, { fontSizePt: Math.min(200, Math.max(4, value)) });
              }}
            />
          </Row>
          <Row label="Style">
            <div className="flex gap-1">
              <Button
                variant={text.bold ? "secondary" : "ghost"}
                size="icon"
                aria-label="Bold"
                disabled={!FONT_META[text.fontFamily].hasBold}
                onClick={() => patch(text.id, { bold: !text.bold })}
              >
                <Bold aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={text.italic ? "secondary" : "ghost"}
                size="icon"
                aria-label="Italic"
                disabled={!FONT_META[text.fontFamily].hasItalic}
                onClick={() => patch(text.id, { italic: !text.italic })}
              >
                <Italic aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={text.underline ? "secondary" : "ghost"}
                size="icon"
                aria-label="Underline"
                onClick={() => patch(text.id, { underline: !text.underline })}
              >
                <Underline aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={text.align === "left" ? "secondary" : "ghost"}
                size="icon"
                aria-label="Align text left"
                onClick={() => patch(text.id, { align: "left" })}
              >
                <AlignLeft aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={text.align === "center" ? "secondary" : "ghost"}
                size="icon"
                aria-label="Align text center"
                onClick={() => patch(text.id, { align: "center" })}
              >
                <AlignCenter aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={text.align === "right" ? "secondary" : "ghost"}
                size="icon"
                aria-label="Align text right"
                onClick={() => patch(text.id, { align: "right" })}
              >
                <AlignRight aria-hidden className="size-3.5" />
              </Button>
            </div>
          </Row>
          <Row label="Color">
            <Input
              type="color"
              className="h-8 w-14 p-0.5"
              value={text.color}
              onChange={(event) => patch(text.id, { color: event.target.value })}
            />
          </Row>
          <Row label={`Line height (${text.lineHeight.toFixed(2)})`}>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.05}
              value={text.lineHeight}
              onChange={(event) => patch(text.id, { lineHeight: Number(event.target.value) })}
            />
          </Row>
          <Row label={`Spacing mm (${text.letterSpacingMm.toFixed(1)})`}>
            <input
              type="range"
              min={-2}
              max={10}
              step={0.1}
              value={text.letterSpacingMm}
              onChange={(event) => patch(text.id, { letterSpacingMm: Number(event.target.value) })}
            />
          </Row>
        </section>
      ) : null}

      {image ? (
        <Row label="Fit">
          <Select value={image.fit} onValueChange={(value) => patch(image.id, { fit: value as ImageElement["fit"] })}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contain">Contain</SelectItem>
              <SelectItem value="cover">Cover</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      ) : null}

      {shape ? (
        <section aria-label="Shape style" className="space-y-1">
          <Row label="Fill">
            <Input
              type="color"
              className="h-8 w-14 p-0.5"
              value={shape.fill ?? "#ffffff"}
              onChange={(event) => patch(shape.id, { fill: event.target.value })}
            />
          </Row>
          <Row label="Stroke">
            <Input
              type="color"
              className="h-8 w-14 p-0.5"
              value={shape.stroke ?? "#ffffff"}
              onChange={(event) => patch(shape.id, { stroke: event.target.value })}
            />
          </Row>
          <Row label="Stroke mm">
            <Input
              type="number"
              min={0}
              max={50}
              step={0.1}
              className={`${inputClass} w-20`}
              value={shape.strokeWidthMm}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) patch(shape.id, { strokeWidthMm: Math.min(50, Math.max(0, value)) });
              }}
            />
          </Row>
        </section>
      ) : null}

      {single ? (
        <section aria-label="Transform" className="space-y-1">
          <Row label="X / Y mm">
            <div className="flex gap-1">
              <Input
                type="number"
                step={0.1}
                className={`${inputClass} w-20`}
                value={Math.round(single.xMm * 10) / 10}
                onChange={(event) => patch(single.id, { xMm: Number(event.target.value) })}
              />
              <Input
                type="number"
                step={0.1}
                className={`${inputClass} w-20`}
                value={Math.round(single.yMm * 10) / 10}
                onChange={(event) => patch(single.id, { yMm: Number(event.target.value) })}
              />
            </div>
          </Row>
          <Row label="W / H mm">
            <div className="flex gap-1">
              <Input
                type="number"
                step={0.1}
                className={`${inputClass} w-20`}
                value={Math.round(single.widthMm * 10) / 10}
                onChange={(event) => patch(single.id, { widthMm: Number(event.target.value) })}
              />
              <Input
                type="number"
                step={0.1}
                className={`${inputClass} w-20`}
                value={Math.round(single.heightMm * 10) / 10}
                onChange={(event) => patch(single.id, { heightMm: Number(event.target.value) })}
              />
            </div>
          </Row>
          <Row label="Rotation°">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step={1}
                className={`${inputClass} w-16`}
                value={Math.round(single.rotationDeg)}
                onChange={(event) => patch(single.id, { rotationDeg: Number(event.target.value) })}
              />
              <Button variant="ghost" size="sm" onClick={() => patch(single.id, { rotationDeg: 0 })}>
                0°
              </Button>
              <Button variant="ghost" size="sm" onClick={() => patch(single.id, { rotationDeg: 90 })}>
                90°
              </Button>
            </div>
          </Row>
          <Row label={`Opacity (${Math.round(single.opacity * 100)}%)`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={single.opacity}
              onChange={(event) => patch(single.id, { opacity: Number(event.target.value) })}
            />
          </Row>
          <Row label="Lock">
            <Button
              variant="outline"
              size="sm"
              onClick={() => patch(single.id, { locked: !single.locked })}
              aria-pressed={single.locked}
            >
              {single.locked ? <Lock aria-hidden className="size-3.5" /> : <LockOpen aria-hidden className="size-3.5" />}
              {single.locked ? "Locked" : "Unlocked"}
            </Button>
          </Row>
        </section>
      ) : null}
    </aside>
  );
}
```

(The `as FontFamily` and `as ImageElement["fit"]` casts on `Select` values are the only assertions — they bridge the select's `string` to the union types at the boundary.)

- [ ] **Step 3: Create `components/documents/editor/LayersPanel.tsx`**

```tsx
"use client";

import type { EditorAction, EditorState } from "@/lib/documents/editorState";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Lock, LockOpen, Trash2 } from "lucide-react";

export interface LayersPanelProps {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export function LayersPanel({ state, dispatch }: LayersPanelProps) {
  // Top of the list = topmost element (reverse z-order).
  const layers = [...state.spec.elements].reverse();

  return (
    <div className="space-y-1" role="list" aria-label="Layers">
      {layers.map((element, index) => {
        const fromTop = index;
        const selected = state.selection.includes(element.id);
        return (
          <div
            key={element.id}
            role="listitem"
            className={
              selected
                ? "flex items-center gap-1 rounded-lg border border-primary/50 bg-primary/5 p-1.5"
                : "flex items-center gap-1 rounded-lg border border-border p-1.5"
            }
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs"
              onClick={() => dispatch({ type: "SET_SELECTION", ids: [element.id] })}
            >
              <span className="text-[9px] uppercase text-muted-foreground">{element.type}</span> {element.name}
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${element.name} up`}
              onClick={() =>
                dispatch({
                  type: "REORDER_ELEMENT",
                  id: element.id,
                  toIndex: state.spec.elements.length - 1 - fromTop,
                })
              }
              disabled={fromTop === 0}
            >
              <ChevronUp aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${element.name} down`}
              onClick={() =>
                dispatch({
                  type: "REORDER_ELEMENT",
                  id: element.id,
                  toIndex: state.spec.elements.length - 1 - (fromTop + 2),
                })
              }
              disabled={fromTop === layers.length - 1}
            >
              <ChevronDown aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={element.locked ? `Unlock ${element.name}` : `Lock ${element.name}`}
              onClick={() =>
                dispatch({
                  type: "UPDATE_ELEMENTS",
                  updates: [{ id: element.id, patch: { locked: !element.locked } }],
                })
              }
            >
              {element.locked ? <Lock aria-hidden className="size-3.5" /> : <LockOpen aria-hidden className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${element.name}`}
              disabled={element.locked}
              onClick={() => {
                dispatch({ type: "SET_SELECTION", ids: [element.id] });
                dispatch({ type: "DELETE_SELECTED" });
              }}
            >
              <Trash2 aria-hidden className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/documents/editor/PageSetupPanel.tsx`**

```tsx
"use client";

import type { PagePreset } from "@/convex/documents/spec";
import type { EditorAction, EditorState } from "@/lib/documents/editorState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface PageSetupPanelProps {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

const PRESETS: PagePreset[] = ["A4", "Letter", "Legal", "A5", "Custom"];

export function PageSetupPanel({ state, dispatch }: PageSetupPanelProps) {
  const page = state.spec.page;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="page-preset" className="text-[11px]">Size</Label>
        <Select
          value={page.preset}
          onValueChange={(value) => dispatch({ type: "SET_PAGE", patch: { preset: value as PagePreset } })}
        >
          <SelectTrigger id="page-preset" className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {preset}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {page.preset === "Custom" ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="page-custom" className="text-[11px]">W × H mm</Label>
          <div id="page-custom" className="flex gap-1">
            <Input
              type="number"
              min={50}
              max={600}
              className="h-8 w-20 text-xs"
              value={page.widthMm ?? 210}
              onChange={(event) =>
                dispatch({ type: "SET_PAGE", patch: { widthMm: Math.min(600, Math.max(50, Number(event.target.value))) } })
              }
            />
            <Input
              type="number"
              min={50}
              max={600}
              className="h-8 w-20 text-xs"
              value={page.heightMm ?? 297}
              onChange={(event) =>
                dispatch({ type: "SET_PAGE", patch: { heightMm: Math.min(600, Math.max(50, Number(event.target.value))) } })
              }
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">Orientation</span>
        <div className="flex gap-1">
          {(["portrait", "landscape"] as const).map((orientation) => (
            <button
              key={orientation}
              type="button"
              onClick={() => dispatch({ type: "SET_PAGE", patch: { orientation } })}
              aria-pressed={page.orientation === orientation}
              className={
                page.orientation === orientation
                  ? "rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-md border border-input px-2 py-1 text-xs"
              }
            >
              {orientation === "portrait" ? "Portrait" : "Landscape"}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[11px] font-medium text-muted-foreground">Margins (mm)</legend>
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <div key={side} className="flex items-center justify-between gap-2">
            <Label htmlFor={`margin-${side}`} className="w-12 text-[11px] capitalize">
              {side}
            </Label>
            <Input
              id={`margin-${side}`}
              type="number"
              min={0}
              max={100}
              step={0.5}
              className="h-8 w-20 text-xs"
              value={page.margins[side]}
              onChange={(event) =>
                dispatch({
                  type: "SET_PAGE",
                  patch: {
                    margins: {
                      ...page.margins,
                      [side]: Math.min(100, Math.max(0, Number(event.target.value))),
                    },
                  },
                })
              }
            />
          </div>
        ))}
      </fieldset>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="page-background" className="text-[11px]">Background</Label>
        <Input
          id="page-background"
          type="color"
          className="h-8 w-14 p-0.5"
          value={page.background}
          onChange={(event) => dispatch({ type: "SET_PAGE", patch: { background: event.target.value } })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck; npm run lint
git add components/documents/editor
git commit -m "feat(documents): inspector with align tools, layers panel, page setup, and token picker"
```

---

### Task 13: True Preview, EditorShell, Studio route, autosave

**Files:**
- Create: `components/documents/editor/TruePreview.tsx`
- Create: `components/documents/editor/EditorShell.tsx`
- Create: `app/studio/[orgSlug]/[templateId]/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–12; `api.documents.templates.{get,update}`; `SaveIndicator`/`SaveState`; sonner.
- Produces: `TruePreviewProps = { open: boolean; onOpenChange: (open: boolean) => void; spec: DocumentSpec; imageUrls: Record<string, string> }`; `EditorShellProps = { orgSlug: string; templateId: string }`; the Studio route renders `EditorShell`.

- [ ] **Step 1: Create `components/documents/editor/TruePreview.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { DocumentSpec } from "@/convex/documents/spec";
import { renderPdfBlob } from "@/lib/documents/renderPdf";
import { sampleTokenMap } from "@/lib/documents/tokens";
import { downloadBlobFile } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Loader2 } from "lucide-react";

export interface TruePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: DocumentSpec;
  imageUrls: Record<string, string>;
}

export function TruePreview({ open, onOpenChange, spec, imageUrls }: TruePreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let revoked = false;
    let createdUrl: string | null = null;
    setBusy(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const blob = await renderPdfBlob([{ spec, tokens: sampleTokenMap() }], imageUrls);
        if (revoked) return;
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return createdUrl;
        });
      } catch (cause) {
        if (!revoked) {
          setError(cause instanceof Error ? cause.message : "Failed to render PDF.");
        }
      } finally {
        if (!revoked) setBusy(false);
      }
    }, 300);
    return () => {
      revoked = true;
      clearTimeout(timer);
    };
  }, [open, spec, imageUrls]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function download() {
    const blob = await renderPdfBlob([{ spec, tokens: sampleTokenMap() }], imageUrls);
    downloadBlobFile("certificate-sample.pdf", blob);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>True preview</DialogTitle>
          <DialogDescription>
            This is the actual PDF output — identical to the downloaded file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex h-[70vh] flex-col gap-2">
          {busy ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
              Rendering…
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : pdfUrl ? (
            <iframe title="PDF preview" src={pdfUrl} className="flex-1 rounded-md border border-border" />
          ) : null}
          <div className="flex justify-end">
            <Button onClick={() => void download()} disabled={busy || Boolean(error)}>
              <Download aria-hidden className="size-4" />
              Download sample
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Note: the `eslint-disable-next-line react-hooks/exhaustive-deps` on the unmount-cleanup effect is not acceptable per project rules. Restructure: keep the current URL in a `useRef<string | null>`, revoke inside `setPdfUrl`'s updater (as written) and in the unmount cleanup via the ref — a `useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, [])` with no reactive deps needs no disable.

- [ ] **Step 2: Create `components/documents/editor/EditorShell.tsx`**

Owns: `useEditorState`, zoom/grid/snap state, uploads session list, image URL map (via `assetUrls` query over spec + uploads storage ids), debounced autosave (1 s) with `SaveState` machine, remote-change warning toast, keyboard shortcut for Ctrl+S (force-save), True Preview dialog, and the three-pane layout: `Palette` / `Canvas` / right column with tabs (Design = `Inspector` + `PageSetupPanel`, Layers = `LayersPanel`).

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { DocumentSpec } from "@/convex/documents/spec";
import { isDocumentSpec } from "@/convex/documents/spec";
import type { EditorAction, EditorState } from "@/lib/documents/editorState";
import { useEditorState } from "@/lib/documents/editorState";
import { sampleTokenMap } from "@/lib/documents/tokens";
import { renderPdfBlob } from "@/lib/documents/renderPdf";
import { downloadBlobFile } from "@/lib/download";
import type { SaveState } from "@/components/tabulation/SaveIndicator";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { PageSetupPanel } from "./PageSetupPanel";
import { Palette } from "./Palette";
import { Toolbar } from "./Toolbar";
import { TruePreview } from "./TruePreview";

export interface EditorShellProps {
  orgSlug: string;
  templateId: string;
}

const AUTOSAVE_DELAY_MS = 1000;

export function EditorShell({ orgSlug, templateId }: EditorShellProps) {
  const template = useQuery(api.documents.templates.get, { orgSlug, templateId });
  const updateTemplate = useMutation(api.documents.templates.update);
  const { state, dispatch, canUndo, canRedo } = useEditorState(
    template && isDocumentSpec(template.spec) ? (template.spec as DocumentSpec) : EMPTY_SPEC,
  );

  const [zoom, setZoom] = useState(1);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"design" | "layers">("design");
  const [name, setName] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [uploads, setUploads] = useState<{ storageId: string; name: string }[]>([]);

  const lastSavedSpecRef = useRef<string>("");
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = name ?? template?.name ?? "";

  const storageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const element of state.spec.elements) {
      if (element.type === "image") ids.add(element.storageId);
    }
    for (const upload of uploads) ids.add(upload.storageId);
    return [...ids];
  }, [state.spec.elements, uploads]);

  const imageUrlsQuery = useQuery(
    api.documents.assets.assetUrls,
    storageIds.length > 0 ? { orgSlug, storageIds } : "skip",
  );
  const imageUrls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [id, url] of Object.entries(imageUrlsQuery ?? {})) {
      if (url) map[id] = url;
    }
    return map;
  }, [imageUrlsQuery]);

  const save = useCallback(
    async (spec: DocumentSpec, nameValue: string) => {
      setSaveState("saving");
      try {
        const result = await updateTemplate({ orgSlug, templateId, spec, name: nameValue });
        lastSavedSpecRef.current = JSON.stringify(spec);
        dirtyRef.current = false;
        setSavedAt(result.updatedAt);
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        toast.error(error instanceof Error ? error.message : "Autosave failed. Changes are kept locally.");
      }
    },
    [orgSlug, templateId, updateTemplate],
  );

  // Debounced autosave on spec changes (skips the initial load).
  useEffect(() => {
    if (!template) return;
    if (lastSavedSpecRef.current === "") {
      lastSavedSpecRef.current = JSON.stringify(state.spec);
      return;
    }
    if (lastSavedSpecRef.current === JSON.stringify(state.spec)) return;
    dirtyRef.current = true;
    setSaveState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void save(state.spec, displayName);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.spec, template, save, displayName]);

  // Warn when another tab saved changes while this tab is clean.
  useEffect(() => {
    if (!template || dirtyRef.current) return;
    const serialized = JSON.stringify(template.spec);
    if (lastSavedSpecRef.current !== "" && serialized !== lastSavedSpecRef.current) {
      toast.warning("This template was changed elsewhere. Reload to see the latest version.");
    }
  }, [template]);

  const fitToScreen = useCallback(() => {
    setZoom(1); // v1: reset to 100%; true fit requires viewport measurement — acceptable simplification documented in the task summary
  }, []);

  const downloadSample = useCallback(async () => {
    try {
      const blob = await renderPdfBlob([{ spec: state.spec, tokens: sampleTokenMap() }], imageUrls);
      downloadBlobFile(`${displayName || "certificate"}.pdf`, blob);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not render the PDF.");
    }
  }, [displayName, imageUrls, state.spec]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirtyRef.current) void save(state.spec, displayName);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayName, save, state.spec]);

  if (template === undefined) {
    return <div className="grid h-dvh place-items-center text-sm text-muted-foreground">Loading studio…</div>;
  }
  if (template === null || template.isSystem || !isDocumentSpec(template.spec)) {
    return (
      <div className="grid h-dvh place-items-center gap-2 text-sm text-muted-foreground">
        Template not available.
        <Button variant="outline" size="sm" onClick={() => history.back()}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <Toolbar
        templateName={displayName}
        onNameChange={(value) => {
          setName(value);
          void save(state.spec, value);
        }}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => dispatch({ type: "UNDO" })}
        onRedo={() => dispatch({ type: "REDO" })}
        zoom={zoom}
        onZoomChange={setZoom}
        onFit={fitToScreen}
        gridEnabled={gridEnabled}
        snapEnabled={snapEnabled}
        onToggleGrid={() => setGridEnabled((value) => !value)}
        onToggleSnap={() => setSnapEnabled((value) => !value)}
        saveState={saveState}
        savedAt={savedAt}
        onRetrySave={() => void save(state.spec, displayName)}
        onPreview={() => setPreviewOpen(true)}
        onDownloadSample={() => void downloadSample()}
        backHref={`/app/${orgSlug}/documents`}
      />
      <div className="flex min-h-0 flex-1">
        <Palette
          orgSlug={orgSlug}
          state={state}
          dispatch={dispatch}
          imageUrls={imageUrls}
          uploads={uploads}
          onUploaded={(storageId, fileName) =>
            setUploads((previous) => [...previous, { storageId, name: fileName }])
          }
        />
        <Canvas
          state={state}
          dispatch={dispatch}
          zoom={zoom}
          gridEnabled={gridEnabled}
          snapEnabled={snapEnabled}
          tokens={sampleTokenMap()}
          imageUrls={imageUrls}
          onZoomChange={setZoom}
        />
        <div className="flex w-72 shrink-0 flex-col border-l border-border/60 bg-background">
          <div className="grid grid-cols-2 border-b border-border/60">
            {(["design", "layers"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRightTab(tab)}
                aria-pressed={rightTab === tab}
                className={
                  rightTab === tab
                    ? "py-2 text-xs font-semibold text-foreground"
                    : "py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {tab === "design" ? "Design" : "Layers"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {rightTab === "design" ? (
              <div className="space-y-4">
                <PageSetupPanel state={state} dispatch={dispatch} />
                <Inspector state={state} dispatch={dispatch} />
              </div>
            ) : (
              <LayersPanel state={state} dispatch={dispatch} />
            )}
          </div>
        </div>
      </div>
      <TruePreview open={previewOpen} onOpenChange={setPreviewOpen} spec={state.spec} imageUrls={imageUrls} />
    </div>
  );
}

const EMPTY_SPEC: DocumentSpec = {
  version: 1,
  page: {
    preset: "A4",
    orientation: "portrait",
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    background: "#FFFFFF",
  },
  elements: [
    {
      type: "text",
      id: "seed-title",
      name: "Heading",
      xMm: 15,
      yMm: 60,
      widthMm: 180,
      heightMm: 16,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: "CERTIFICATE",
      fontFamily: "Crimson Text",
      fontSizePt: 32,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
      color: "#1F3A5F",
      lineHeight: 1.3,
      letterSpacingMm: 2,
    },
  ],
};
```

Note: `useEditorState(template && isDocumentSpec(template.spec) ? template.spec : EMPTY_SPEC)` — the hook's initial value is only used before the first render; when the query resolves later the reducer state must be initialized. Guard this: only render the editor body once `template` is loaded (the `template === undefined` branch already returns early, but the hook runs before that return — initialize `useEditorState(EMPTY_SPEC)` unconditionally and `dispatch({ type: "LOAD_SPEC", spec })` in a `useEffect` when the template first resolves and `lastSavedSpecRef.current === ""`. This avoids the conditional-initialization bug; add that effect.)

- [ ] **Step 3: Create `app/studio/[orgSlug]/[templateId]/page.tsx`**

```tsx
"use client";

import { use } from "react";
import { EditorShell } from "@/components/documents/editor/EditorShell";

export default function StudioPage({
  params,
}: {
  params: Promise<{ orgSlug: string; templateId: string }>;
}) {
  const { orgSlug, templateId } = use(params);
  return <EditorShell orgSlug={orgSlug} templateId={templateId} />;
}
```

- [ ] **Step 4: Gates and commit**

```bash
npm run typecheck; npm run lint
git add components/documents/editor/TruePreview.tsx components/documents/editor/EditorShell.tsx "app/studio"
git commit -m "feat(documents): editor shell with autosave, true PDF preview, and studio route"
```

---

### Task 14: Document template library page and navigation

**Files:**
- Create: `components/documents/DocumentTemplateLibrary.tsx`
- Create: `app/app/[orgSlug]/documents/page.tsx`
- Modify: `app/app/[orgSlug]/layout.tsx` (nav item)

**Interfaces:**
- Consumes: `api.documents.templates.{list,duplicate,remove,create}`, `PageHeader`, `EmptyState`, `ConfirmDialog`, `Button`/`Card`/`Badge`, sonner, `useRouter`.
- Produces: route `/app/[orgSlug]/documents`; nav item "Documents & Certificates" (icon `Award`).

- [ ] **Step 1: Create `components/documents/DocumentTemplateLibrary.tsx`**

Card grid of system + org templates; actions: org → Edit (link to studio) / Duplicate / Delete (ConfirmDialog) / Generate (Task 15 dialog); system → Customize (duplicate then navigate) / Generate. "New blank certificate" button creates from a minimal spec and navigates to the studio. `GenerateCertificatesDialog` is integrated in Task 15 — this task renders a disabled placeholder button labeled "Generate" that Task 15 wires up (or defer adding the button to Task 15 entirely — prefer that: do NOT add a dead button).

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { DocumentSpec } from "@/convex/documents/spec";
import { isDocumentSpec } from "@/convex/documents/spec";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/tabulation/StateBlock";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Award, Copy, FilePlus2, Loader2, Pencil, Trash2 } from "lucide-react";

const BLANK_SPEC: DocumentSpec = {
  version: 1,
  page: {
    preset: "A4",
    orientation: "portrait",
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    background: "#FFFFFF",
  },
  elements: [
    {
      type: "text",
      id: "title",
      name: "Heading",
      xMm: 15,
      yMm: 60,
      widthMm: 180,
      heightMm: 16,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: "CERTIFICATE",
      fontFamily: "Crimson Text",
      fontSizePt: 32,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
      color: "#1F3A5F",
      lineHeight: 1.3,
      letterSpacingMm: 2,
    },
  ],
};

export function DocumentTemplateLibrary({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const templates = useQuery(api.documents.templates.list, { orgSlug, kind: "certificate" });
  const duplicate = useMutation(api.documents.templates.duplicate);
  const create = useMutation(api.documents.templates.create);
  const remove = useMutation(api.documents.templates.remove);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  async function customize(templateId: string, name: string) {
    setBusyId(templateId);
    try {
      const result = await duplicate({ orgSlug, templateId, name: `${name} (copy)` });
      router.push(`/studio/${orgSlug}/${result.templateId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create your copy.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Award}
        title="Documents & Certificates"
        description="Design reusable certificate templates with a drag-and-drop editor, then generate personalized PDFs."
        actions={
          <Button
            onClick={async () => {
              try {
                const result = await create({
                  orgSlug,
                  name: "Untitled certificate",
                  kind: "certificate",
                  spec: BLANK_SPEC,
                });
                router.push(`/studio/${orgSlug}/${result.templateId}`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not create the template.");
              }
            }}
          >
            <FilePlus2 aria-hidden />
            New blank certificate
          </Button>
        }
      />

      {templates === undefined ? (
        <Card className="animate-pulse">
          <CardContent className="space-y-2 py-6">
            <div className="h-5 w-1/3 rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <EmptyState icon={Award} title="No certificate templates" hint="Create a blank template or duplicate a system design." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template._id} className="h-full">
              <CardContent className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-medium">{template.name}</div>
                  {template.isSystem ? <Badge variant="secondary" className="shrink-0">System</Badge> : null}
                </div>
                <p className="min-h-8 text-sm text-muted-foreground">
                  {template.description || "Custom certificate template"}
                </p>
                <div className="mt-auto flex flex-wrap gap-1">
                  {template.isSystem ? (
                    <Button variant="outline" size="sm" disabled={busyId === template._id} onClick={() => void customize(template._id, template.name)}>
                      {busyId === template._id ? <Loader2 aria-hidden className="animate-spin" /> : <Pencil aria-hidden />}
                      Customize
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => router.push(`/studio/${orgSlug}/${template._id}`)}>
                        <Pencil aria-hidden />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === template._id}
                        onClick={() => void customize(template._id, template.name)}
                      >
                        <Copy aria-hidden />
                        Duplicate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget({ id: template._id, name: template.name })}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {deleteTarget ? (
        <ConfirmDialog
          open
          title={`Delete “${deleteTarget.name}”?`}
          description="This cannot be undone. Events already using generated PDFs are unaffected."
          confirmLabel="Delete"
          onConfirm={async () => {
            try {
              await remove({ orgSlug, templateId: deleteTarget.id });
              toast.success("Template deleted.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Delete failed.");
            } finally {
              setDeleteTarget(null);
            }
          }}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
```

Note: read `components/tabulation/ConfirmDialog.tsx` and adapt the props to its real API (the shape above follows the project's dialog conventions; adjust names if they differ). Remove the unused `isDocumentSpec` import if the linter flags it.

- [ ] **Step 2: Create `app/app/[orgSlug]/documents/page.tsx`**

```tsx
"use client";

import { use } from "react";
import { DocumentTemplateLibrary } from "@/components/documents/DocumentTemplateLibrary";

export default function DocumentsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  return <DocumentTemplateLibrary orgSlug={orgSlug} />;
}
```

- [ ] **Step 3: Add the nav item in `app/app/[orgSlug]/layout.tsx`**

Import `Award` from `lucide-react` (add to the existing import list) and insert after the `templates` entry in `NAV_ITEMS`:

```ts
  { href: "documents", label: "Documents & Certificates", icon: Award },
```

- [ ] **Step 4: Gates and commit**

```bash
npm run typecheck; npm run lint
git add components/documents/DocumentTemplateLibrary.tsx "app/app/[orgSlug]/documents" "app/app/[orgSlug]/layout.tsx"
git commit -m "feat(documents): certificate template library page and workspace navigation"
```

---

### Task 15: Generate certificates dialog

**Files:**
- Create: `components/documents/GenerateCertificatesDialog.tsx`
- Modify: `components/documents/DocumentTemplateLibrary.tsx` (wire the Generate button)

**Interfaces:**
- Consumes: `api.events.listByOrg` (returns `{ slug, name, status }[]`), `api.contestants.list({ orgSlug, eventSlug })` (full contestant docs incl. `name`, `number`, `categoryId`), `api.categories.list({ orgSlug, eventSlug })`, `api.results.eventResults({ orgSlug, eventSlug })` (has `final: { categoryId, contestantId, contestantName, rank, totalScore }[]`), `api.documents.assets.assetUrls`, `renderPdfBlob`, `listTokens`, `downloadBlobFile`.
- Produces: `GenerateCertificatesDialogProps = { orgSlug: string; open: boolean; onOpenChange: (open: boolean) => void; template: { _id: Id<"documentTemplates">; name: string; spec: DocumentSpec } }`.

- [ ] **Step 1: Create `components/documents/GenerateCertificatesDialog.tsx`**

Flow: select event → recipient mode (All contestants / By category / By final rank / Manual) → preview count → Generate: builds one `TokenMap` per recipient (event/org/issued tokens shared; recipient tokens from contestant + optional rank/category from results), warns about unresolved tokens used by the spec, renders a single multi-page PDF, downloads `<event>-certificates.pdf`.

```tsx
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { DocumentSpec } from "@/convex/documents/spec";
import type { Id } from "@/convex/_generated/dataModel";
import { listTokens, type TokenMap } from "@/lib/documents/tokens";
import { renderPdfBlob } from "@/lib/documents/renderPdf";
import { downloadBlobFile } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

export interface GenerateCertificatesDialogProps {
  orgSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: { _id: Id<"documentTemplates">; name: string; spec: DocumentSpec };
}

type Mode = "all" | "category" | "rank" | "manual";

export function GenerateCertificatesDialog({ orgSlug, open, onOpenChange, template }: GenerateCertificatesDialogProps) {
  const events = useQuery(api.events.listByOrg, { orgSlug });
  const [eventSlug, setEventSlug] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [categoryId, setCategoryId] = useState("");
  const [rankFrom, setRankFrom] = useState(1);
  const [rankTo, setRankTo] = useState(3);
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  const event = useQuery(api.events.get, eventSlug ? { orgSlug, eventSlug } : "skip");
  const org = useQuery(api.organizations.get, { orgSlug });
  const contestants = useQuery(
    api.contestants.list,
    eventSlug ? { orgSlug, eventSlug } : "skip",
  );
  const categories = useQuery(
    api.categories.list,
    eventSlug ? { orgSlug, eventSlug } : "skip",
  );
  const results = useQuery(
    api.results.eventResults,
    eventSlug ? { orgSlug, eventSlug } : "skip",
  );

  const usedTokens = useMemo(
    () => template.spec.elements.flatMap((element) => (element.type === "text" ? listTokens(element.content) : [])),
    [template.spec],
  );

  const imageStorageIds = useMemo(
    () => template.spec.elements.flatMap((element) => (element.type === "image" ? [element.storageId] : [])),
    [template.spec],
  );
  const assetUrlMap = useQuery(
    open && imageStorageIds.length > 0 ? api.documents.assets.assetUrls : "skip",
    open && imageStorageIds.length > 0 ? { orgSlug, storageIds: imageStorageIds } : "skip",
  );

  const rankByContestant = useMemo(() => {
    const map = new Map<string, number>();
    if (results && !(results instanceof Error)) {
      for (const row of results.final) map.set(row.contestantId, row.rank);
    }
    return map;
  }, [results]);

  const categoryNames = useMemo(
    () => new Map((categories ?? []).map((category) => [category._id, category.name] as const)),
    [categories],
  );

  const selectedContestants = useMemo(() => {
    const all = (contestants ?? []).filter((contestant) => contestant.status === "active");
    if (mode === "all") return all;
    if (mode === "category") return all.filter((contestant) => contestant.categoryId === categoryId);
    if (mode === "rank") {
      return all.filter((contestant) => {
        const rank = rankByContestant.get(contestant._id);
        return rank !== undefined && rank >= rankFrom && rank <= rankTo;
      });
    }
    return all.filter((contestant) => manualIds.has(contestant._id));
  }, [categoryId, contestants, manualIds, mode, rankByContestant, rankFrom, rankTo]);

  const needsRank = usedTokens.includes("recipient.rank");

  async function generate() {
    if (!event || selectedContestants.length === 0) return;
    if (needsRank && rankByContestant.size === 0) {
      toast.error("This template uses {{recipient.rank}} but the event has no published final results.");
      return;
    }
    setGenerating(true);
    try {
      const issuedDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      const common: TokenMap = {
        "event.name": event.name,
        "event.venue": event.venue ?? "",
        "event.date": event.startDate ? new Date(event.startDate).toLocaleDateString() : "",
        "org.name": org?.name ?? "",
        "issued.date": issuedDate,
      };
      const inputs = selectedContestants.map((contestant) => ({
        spec: template.spec,
        tokens: {
          ...common,
          "recipient.name": contestant.name,
          "recipient.number": String(contestant.number),
          "recipient.rank": ordinal(rankByContestant.get(contestant._id)),
          "recipient.category": categoryNames.get(contestant.categoryId) ?? "",
        } satisfies TokenMap,
      }));
      const imageUrls: Record<string, string> = {};
      for (const [id, url] of Object.entries(assetUrlMap ?? {})) {
        if (url) imageUrls[id] = url;
      }
      const blob = await renderPdfBlob(inputs, imageUrls);
      downloadBlobFile(`${event.slug}-certificates.pdf`, blob);
      toast.success(`Generated ${inputs.length} certificate${inputs.length === 1 ? "" : "s"}.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate certificates — {template.name}</DialogTitle>
          <DialogDescription>
            One PDF page is created per recipient using this template’s design and fields.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gen-event">Event</Label>
            <Select value={eventSlug || undefined} onValueChange={(value) => { setEventSlug(value ?? ""); setCategoryId(""); setManualIds(new Set()); }}>
              <SelectTrigger id="gen-event" className="w-full">
                <SelectValue placeholder="Choose an event…" />
              </SelectTrigger>
              <SelectContent>
                {(events ?? []).map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {eventSlug ? (
            <>
              <div className="space-y-1.5">
                <Label>Recipients</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All contestants</SelectItem>
                    <SelectItem value="category">By category</SelectItem>
                    <SelectItem value="rank">By final rank</SelectItem>
                    <SelectItem value="manual">Manual selection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode === "category" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="gen-category">Category</Label>
                  <Select value={categoryId || undefined} onValueChange={(value) => setCategoryId(value ?? "")}>
                    <SelectTrigger id="gen-category" className="w-full">
                      <SelectValue placeholder="Choose a category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(categories ?? []).map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {mode === "rank" ? (
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="gen-rank-from">Rank from</Label>
                    <Input
                      id="gen-rank-from"
                      type="number"
                      min={1}
                      value={rankFrom}
                      onChange={(event_) => setRankFrom(Math.max(1, Number(event_.target.value)))}
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="gen-rank-to">to</Label>
                    <Input
                      id="gen-rank-to"
                      type="number"
                      min={1}
                      value={rankTo}
                      onChange={(event_) => setRankTo(Math.max(1, Number(event_.target.value)))}
                    />
                  </div>
                </div>
              ) : null}

              {mode === "manual" ? (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {(contestants ?? []).map((contestant) => (
                    <label key={contestant._id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={manualIds.has(contestant._id)}
                        onChange={(event_) => {
                          setManualIds((previous) => {
                            const next = new Set(previous);
                            if (event_.target.checked) next.add(contestant._id);
                            else next.delete(contestant._id);
                            return next;
                          });
                        }}
                      />
                      {contestant.name} (No. {contestant.number})
                    </label>
                  ))}
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground" aria-live="polite">
                {selectedContestants.length} recipient{selectedContestants.length === 1 ? "" : "s"} selected.
                {needsRank && rankByContestant.size === 0 ? " Final results are not published — rank fields will be blank." : ""}
              </p>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void generate()} disabled={generating || !eventSlug || selectedContestants.length === 0}>
            {generating ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ordinal(rank: number | undefined): string {
  if (rank === undefined) return "";
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = rank % 100;
  const suffix = suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0];
  return `${rank}${suffix}`;
}
```

Notes:
- `api.events.listByOrg` returns `slug`/`name`, and `api.events.get` returns `venue`/`startDate` (see the results print page usage); let typecheck confirm alignment while implementing.

- [ ] **Step 2: Wire the Generate button into `DocumentTemplateLibrary.tsx`**

Add state `const [generateTarget, setGenerateTarget] = useState<(typeof templates)[number] | null>(null);` (type it against the query return; simplest is `{ _id: Id<"documentTemplates">; name: string; spec: DocumentSpec } | null` with a narrowing check on `isDocumentSpec`). Add to each card's action row:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setGenerateTarget({ _id: template._id, name: template.name, spec: template.spec as DocumentSpec })}
>
  <Sparkles aria-hidden />
  Generate
</Button>
```

and at the bottom of the component:

```tsx
{generateTarget ? (
  <GenerateCertificatesDialog
    orgSlug={orgSlug}
    open
    onOpenChange={(open) => !open && setGenerateTarget(null)}
    template={generateTarget}
  />
) : null}
```

Import `Sparkles` from `lucide-react` and `GenerateCertificatesDialog`.

- [ ] **Step 3: Gates and commit**

```bash
npm run typecheck; npm run lint
git add components/documents
git commit -m "feat(documents): per-recipient certificate generation dialog"
```

---

### Task 16: E2E tests and final validation gates

**Files:**
- Create: `e2e/08-certificate-documents.spec.ts`

**Interfaces:**
- Consumes: the running dev app; `seedE2EDatabase` helper; org-slug env gating pattern from `e2e/07-bulk-import-public-results.spec.ts`.

- [ ] **Step 1: Write the e2e spec**

```ts
import { test, expect } from "@playwright/test";
import { seedE2EDatabase } from "./helpers/seed";

test.describe("8. Documents & certificate studio", () => {
  test.beforeAll(async () => {
    await seedE2EDatabase();
  });

  test("unauthenticated visitors cannot open the documents library", async ({ page }) => {
    await page.goto("/app/e2e-org/documents");
    await expect(page).toHaveURL(/.*\/sign-in\?next=/);
  });

  test("unauthenticated visitors cannot open the studio", async ({ page }) => {
    await page.goto("/studio/e2e-org/00000000000000000000000000");
    // The studio shell loads but the Convex query rejects; either way the canvas never appears.
    await expect(page.getByRole("application", { name: "Certificate canvas" })).toHaveCount(0);
  });

  test("org nav links to documents & certificates", async ({ page }) => {
    test.skip(!process.env.E2E_ORG_SLUG, "Set E2E_ORG_SLUG to run authenticated tests");
    const orgSlug = process.env.E2E_ORG_SLUG!;
    await page.goto(`/app/${orgSlug}/overview`);
    await page.getByRole("link", { name: "Documents & Certificates" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/${orgSlug}/documents$`));
    await expect(page.getByRole("heading", { name: "Documents & Certificates" })).toBeVisible();
  });

  test("duplicate a system template, edit in studio, add text, undo", async ({ page }) => {
    test.skip(!process.env.E2E_ORG_SLUG, "Set E2E_ORG_SLUG to run authenticated tests");
    const orgSlug = process.env.E2E_ORG_SLUG!;
    await page.goto(`/app/${orgSlug}/documents`);
    await page.getByRole("button", { name: /^Customize/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/studio/${orgSlug}/`));
    await expect(page.getByRole("application", { name: "Certificate canvas" })).toBeVisible();

    await page.getByRole("button", { name: "Add body text" }).click();
    await expect(page.locator("[data-selection-id]").first()).toBeVisible();

    await page.keyboard.press("Control+z");
    // The added element is removed; undo is observable via the selection overlay disappearing.
    await expect(page.locator("[data-selection-id]")).toHaveCount(0);
  });

  test("token picker inserts a field into the selected text element", async ({ page }) => {
    test.skip(!process.env.E2E_ORG_SLUG, "Set E2E_ORG_SLUG to run authenticated tests");
    const orgSlug = process.env.E2E_ORG_SLUG!;
    await page.goto(`/app/${orgSlug}/documents`);
    await page.getByRole("button", { name: /^Customize/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/studio/${orgSlug}/`));

    await page.getByRole("button", { name: "Add body text" }).click();
    await page.getByRole("button", { name: "Insert field" }).click();
    await page.getByRole("button", { name: /Recipient name/ }).click();
    await expect(page.getByLabel("Content")).toHaveValue(/{{recipient\.name}}/);
  });
});
```

- [ ] **Step 2: Run e2e (route-protection tests always run; authenticated ones need `E2E_ORG_SLUG`)**

```bash
npm run test:e2e -- e2e/08-certificate-documents.spec.ts
```

Expected: 2 passing route-protection tests, 3 skipped unless `E2E_ORG_SLUG` is set.

- [ ] **Step 3: Run every validation gate and fix anything raised**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

All four must pass. Fix findings in the smallest possible change and re-run until green (per AGENTS.md the build is a required gate — do not declare the task complete while it fails).

- [ ] **Step 4: Commit**

```bash
git add e2e/08-certificate-documents.spec.ts
git commit -m "test(documents): certificate library and studio e2e coverage"
```

---

## Self-Review Checklist (for the executing engineer, run at the end)

1. `npm run build` green; no new eslint findings; no `any` outside the sanctioned `spec: v.any()`.
2. Convex functions: every mutation validates args, enforces `documents.manage` or membership, and writes audit rows.
3. Type consistency spot-checks: `ElementPatch` vs `UPDATE_ELEMENTS` patches; `CanvasProps` matches what `EditorShell` passes; `renderPdfBlob(inputs, imageUrls)` argument order everywhere; `assetUrls` returns `Record<string, string | null>`.
4. Undo works after: drag, resize, rotate, template apply, page change, delete, duplicate, paste.
5. True Preview PDF matches the downloaded sample byte-for-byte (same render call).
6. Locked elements: not draggable, not deletable, not resizable; visible in Layers with lock icon.
7. Cross-org isolation verified by tests (org B cannot read/mutate org A templates).

