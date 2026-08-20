# Canva-Style Certificate Editor & PDF Customization System — Phase 2 Specification

**Date:** 2026-08-20
**Status:** Approved
**Phase:** 2 of the PDF/document customization system (Phase 1 = foundation architecture: DocumentSpec, document templates, PDF engine; Phase 3 = results tables/judge sheets on the same foundation)

---

## 1. Overview

A visual, drag-and-drop certificate editor ("Studio") that lets organizations design professional certificates — text, logos, images, shapes, signatures, dynamic fields — with Canva-grade usability, and generate deterministic, pixel-accurate PDFs (single sample or one page per recipient).

**Core decisions (approved during brainstorming):**

| Decision | Choice |
|---|---|
| Document types (system-wide) | Results printouts, certificates, judge sheets — one engine; Phase 2 ships the certificate editor |
| Editing model | Absolute canvas: every element at exact x/y mm coordinates, drag-and-drop |
| Output | Real PDF files via `@react-pdf/renderer` (deterministic, embedded fonts) — no browser print pipeline, no headless Chrome |
| Template tiers | System defaults → org library → (future) event overrides |
| Dynamic content | Merge tokens + (Phase 3) auto-growing tables |
| Rendering architecture | Hybrid: HTML/CSS editing canvas (60fps interaction) + react-pdf truth engine (same spec, same fonts) |

**Non-goals (Phase 2):** results tables / judge-sheet documents, custom font uploads, QR codes, realtime multi-user editing, persisted version history (undo is session-scoped), email delivery, element grouping, rotation of page orientation mid-template.

---

## 2. Rendering Architecture

```
Editing (60fps)                     Truth & Export
┌───────────────────────────┐       ┌────────────────────────────────┐
│ HTML/CSS canvas            │ commit│ DocumentSpec → @react-pdf/     │
│ • absolute mm-positioned   │──────▶│ renderer → PDF Blob            │
│   divs, z-ordered          │ deboun│ • embedded OFL TTFs            │
│ • drag = CSS transform     │ 300ms │ • deterministic bytes          │
│   (no React re-render)     │       │ • iframe "True Preview"        │
│ • same TTFs via @font-face │       │ • download / per-recipient gen │
└───────────────────────────┘       └────────────────────────────────┘
```

### 2.1 Editing canvas

- Each element renders as an absolutely positioned `<div>` at `x,y,w,h` (mm), scaled by `1mm = 96/25.4 CSS px × zoom`.
- During drag/resize/rotate, transforms are applied to the DOM node directly (pointer events + `requestAnimationFrame`); mm coordinates commit to state on pointer-up.
- Fonts: the exact TTF files embedded in the PDF are loaded via `@font-face` from `public/fonts/` so editor metrics match output metrics.
- Property set is deliberately constrained to where HTML and PDF layout coincide: fixed-width text boxes, explicit `lineHeight`/`letterSpacing`/font size in pt, left/center/right alignment, solid fills, hex colors.

### 2.2 Truth engine & preview

- `lib/documents/renderPdf.tsx`: `DocumentSpec → react-pdf <Document>` tree; `pdfBlob()` via `renderToBuffer` (browser build).
- **True Preview** toggle: renders the actual PDF blob in an `<iframe>` (native browser PDF rendering). The downloaded file is byte-identical to the preview.
- Debounced (300 ms) re-render after edits; PDF generation never blocks interaction.

### 2.3 Fonts (bundled, OFL-licensed)

| Family | Use |
|---|---|
| Inter (Regular/SemiBold/Bold) | body, default |
| Playfair Display (Regular/Bold) | elegant headings |
| Great Vibes (Regular) | script names |

Served from `public/fonts/`, registered in react-pdf via `Font.register({ family, src })` and mirrored as `@font-face`. No user font uploads in Phase 2.

---

## 3. DocumentSpec Model

Shared module: `convex/documents/spec.ts` — single source of truth for types + runtime type guards, importable by Convex functions (bundled) and app code (via `@/convex/documents/spec`).

```ts
type DocumentSpec = {
  version: 1;
  page: {
    preset: "A4" | "Letter" | "Legal" | "A5" | "Custom";
    widthMm: number;   // derived from preset or custom
    heightMm: number;
    orientation: "portrait" | "landscape";
    margins: { top: number; right: number; bottom: number; left: number }; // mm
    background: string; // hex
  };
  elements: Element[];  // array order = z-order (bottom → top)
};

type ElementBase = {
  id: string;            // uuid, client-generated
  name: string;          // layers panel label
  xMm: number; yMm: number; widthMm: number; heightMm: number;
  rotationDeg: number;   // clockwise, around center
  opacity: number;       // 0–1
  locked: boolean;
  showOnAllPages: boolean; // repeats on every generated page (headers/logos)
};

type TextElement = ElementBase & {
  type: "text";
  content: string;       // TokenString: "Awarded to {{recipient.name}}"
  font: FontFamily; fontSizePt: number; bold: boolean; italic: boolean;
  underline: boolean; align: "left" | "center" | "right";
  color: string /*hex*/; lineHeight: number; letterSpacingMm: number;
};

type ImageElement = ElementBase & {
  type: "image";
  storageId: string;     // Convex file storage
  fit: "contain" | "cover";
};

type ShapeElement = ElementBase & {
  type: "rect" | "ellipse" | "line";
  fill: string | null; stroke: string | null; strokeWidthMm: number;
};
```

Palette presets map onto these types: "Logo"/"Photo" → `image`, "Signature" → `image` (transparent PNG expected), "Signature line" → `line`. Signatures are presets, not engine concepts.

### 3.1 Tokens

Catalog (resolved client-side from existing queries):

```
recipient.name  recipient.number  recipient.rank  recipient.category
event.name      event.venue       event.date
org.name        issued.date
```

- Parser: `{{token}}` inline in text content; unknown/missing tokens render as `[token]` fallback text, never throw.
- Editor canvas shows a **sample recipient** (first contestant or mock "Juan Dela Cruz") so dynamic text is always visible while editing.
- Token picker in the inspector inserts at cursor.

---

## 4. Editor UX & Interaction

### 4.1 Layout (Canva-like, three panes)

```
┌──────────────────────────────────────────────────────────────┐
│ Toolbar: back | name | undo redo | zoom | grid snap | preview│
├──────────┬───────────────────────────────────┬───────────────┤
│ Palette  │           Canvas                   │ Inspector     │
│ tabs:    │  • page surface (mm-true)          │ • element     │
│ Templates│  • rulers + grid + snap guides     │   properties  │
│ Elements │  • selection overlays/handles      │ • align tools │
│ Text     │  • zoom 25–400%, pan               │ • layers      │
│ Uploads  │                                   │ • page setup  │
└──────────┴───────────────────────────────────┴───────────────┘
```

- Palette: Templates (system + org, one-click apply = replace spec), Elements (rect/ellipse/line/image/signature presets), Text (heading/subheading/body style presets), Uploads (org image library).
- Inspector is context-sensitive: multi-select shows align tools; text selection shows typography controls; page tab shows size/orientation/margins/background.

### 4.2 Interaction model

| Capability | Behavior |
|---|---|
| Move | Pointer drag; CSS transform during drag; mm commit on drop |
| Resize | 8 handles; corner handles preserve aspect with Shift; math in pure `geometry.ts` (rotated-box aware) |
| Rotate | Handle above selection; free rotate; magnet snap at 0/45/90/135/180/225/270/315; Shift = 15° steps |
| Snapping | Pure `snap.ts`: margins, page center axes, other elements' edges/centers (dynamic red guides), optional 5mm grid; threshold in screen px (constant feel at any zoom) |
| Multi-select | Marquee on empty canvas, Shift-click add/remove; group move/align/delete/duplicate |
| Align | L/C/R/T/M/B within selection bounds; page bounds when single element selected |
| Z-order | Layers panel (drag reorder, rename, lock — no visibility toggle in v1), bring forward / send backward |
| Clipboard | Ctrl+C/V internal; paste offset +2mm; Ctrl+D duplicate |
| Undo/Redo | Ctrl+Z / Ctrl+Shift+Z; snapshot history capped at 100; session-scoped |
| Nudge | Arrows 0.5mm; Shift+Arrows 5mm |
| Zoom | Ctrl+wheel, +/- buttons, fit-to-screen; 25–400% |
| Pan | Space+drag, middle-mouse drag, wheel scroll |
| Delete | Del/Backspace (locked elements exempt); Ctrl+A select all; Esc deselect |

### 4.3 Editor state

- `useEditorState`: `useReducer` store `{ spec, selection, clipboard }`; history = spec snapshots in the reducer (structural share by reference; specs are small JSON).
- **Autosave**: debounced 1 s → `documents.updateTemplate`; existing `SaveIndicator` component surfaces saving/saved/error states.
- Multi-tab conflict: last-write-wins; a toast warns when the underlying document changed remotely (compare `updatedAt` on save response).

---

## 5. Convex Surface

### 5.1 Schema (`convex/schema.ts` addition)

```
documentTemplates: {
  orgId: Id<"organizations"> | null,   // null = system-provided
  kind: "certificate" | "results" | "judgeSheet",   // Phase 2 seeds certificates
  name: string,
  description: string,
  spec: any (DocumentSpec — runtime-validated on every write),
  isSystem: boolean,
  sourceTemplateId: Id<"documentTemplates"> | null,
  updatedBy: Id<"userProfiles"> | null,
}
.index("by_org_id")  .index("by_kind")   // system rows queried via isSystem filter like eventTemplates
```

### 5.2 Functions (`convex/documents/templates.ts`)

- `list({ orgSlug, kind? })` — `requireOrgMember`; returns system + org templates (mirrors `eventTemplates.list` pattern).
- `get({ orgSlug, templateId })` — membership-gated read.
- `create({ orgSlug, name, kind, spec? })` — `documents.manage` permission; validates spec; audit.
- `update({ orgSlug, templateId, name?, spec? })` — permission; rejects `isSystem`; validates spec; audit.
- `duplicate({ orgSlug, templateId, name })` — permission; copies any visible template (system included) into an org template; audit.
- `remove({ orgSlug, templateId })` — permission; rejects system; audit.

Every mutation re-validates the spec with the shared runtime guards — corrupt specs cannot persist.

### 5.3 Assets (`convex/documents/assets.ts`)

- `generateUploadUrl` mutation — `requireOrgMember` (uploads are org-scoped; storageId recorded on first spec save).
- `assetUrl({ orgSlug, storageId })` query — membership-gated `ctx.storage.getUrl`.
- Client-side validation: PNG/JPG/SVG only, ≤ 2 MB.

### 5.4 Permissions & seeding

- New permission `documents.manage`, seeded via the existing `roles.ts` pattern to Organizer+Admin roles.
- **System templates** (3): Classic Border, Modern Minimal, Elegant Script — code-defined specs in `convex/documents/systemTemplates.ts`, materialized idempotently by the seeding routine used for system `eventTemplates`.

---

## 6. Routing & Navigation

| Route | Purpose |
|---|---|
| `app/app/[orgSlug]/documents/page.tsx` | Template library inside org shell: gallery (system + org), duplicate-and-customize, delete, "Generate certificates" entry |
| `app/studio/[orgSlug]/[templateId]/page.tsx` | Full-screen editor in its own shell (pattern of `app/enter/*`) — the org shell's `max-w-6xl` content area cannot contain a canvas app |

- Org nav gains **"Documents & Certificates"** in `NAV_ITEMS` (icon: `Award`).

---

## 7. Certificate Generation Flow

**Generate dialog** (launched from library):

1. Pick event (existing `events.listByOrg`).
2. Pick recipients: all contestants / by category / by rank range / manual multi-select (`contestants` + `results` queries).
3. Client renders one page per recipient via the truth engine with tokens resolved (merged multi-page PDF).
4. Download via blob anchor (existing `lib/download.ts` pattern).

Editor preview always binds the sample recipient; generation never runs in Convex (PDFs are not persisted).

---

## 8. Error Handling

| Failure | Handling |
|---|---|
| Corrupt/invalid spec on write | Mutation rejects with typed `appError`; guards live in shared spec module |
| Upload fails / wrong type / too large | Client pre-validation + server storage errors → sonner toast |
| PDF render error | True Preview shows error state naming the failing element id; canvas editing unaffected |
| Autosave failure | `SaveIndicator` error state + retry on next edit; unsaved indicator prevents silent loss |
| Concurrent edit (two tabs) | `updatedAt` compare on save → last-write-wins + warning toast |
| Missing token data | Renders `[token]` fallback text; generation dialog warns before producing PDFs with unresolved tokens |

---

## 9. Testing

- **Unit (Vitest, node env):**
  - `geometry.ts` — rotation math, rotated-box resize anchors, hit-testing
  - `snap.ts` — margin/center/element/grid guides, thresholds, no-candidate cases
  - token parser/resolver — unknown token, missing data, nested text
  - spec guards — valid/invalid fixture matrix
  - `renderPdf` smoke — `renderToBuffer` produces `%PDF` header bytes for each system template
- **Integration (convex-test):** authz matrix — non-member rejected; member without `documents.manage` rejected; system template update/delete rejected; cross-org isolation; audit rows written; spec validation rejects tampered payloads.
- **E2E (Playwright):** library → duplicate system template → add text element → drag → undo → insert token → True Preview renders → download enabled.
- **Gates:** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all green.

---

## 10. File Layout (new code)

```
convex/documents/
  spec.ts               types + runtime guards (shared)
  systemTemplates.ts    3 system certificate specs + idempotent seed
  templates.ts          CRUD queries/mutations (authz + audit)
  assets.ts             upload URL + asset URL
lib/documents/
  fonts.ts              family registry + @font-face injection
  tokens.ts             catalog, parser, resolver, sample data
  geometry.ts           pure rotate/resize/hit-test math
  snap.ts               pure snapping engine
  renderPdf.tsx         spec → react-pdf tree → blob
  editorState.ts        useEditorState reducer + history
components/documents/
  DocumentTemplateLibrary.tsx
  GenerateCertificatesDialog.tsx
  editor/
    EditorShell.tsx  Canvas.tsx  ElementView.tsx  SelectionOverlay.tsx
    Rulers.tsx  Guides.tsx  Toolbar.tsx  Palette.tsx  Inspector.tsx
    LayersPanel.tsx  PageSetupPanel.tsx  TokenPicker.tsx  TruePreview.tsx
app/app/[orgSlug]/documents/page.tsx
app/studio/[orgSlug]/[templateId]/page.tsx (+ layout.tsx)
public/fonts/*.ttf
```

Dependencies added: `@react-pdf/renderer` only.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| HTML canvas vs PDF metric drift (line wrapping edge cases) | Same TTFs both sides; fixed-width boxes; constrained property set; True Preview is one click away and is the exported artifact itself |
| `@react-pdf/renderer` browser-bundle quirks in Next 16 | Isolate all react-pdf imports behind `lib/documents/renderPdf.tsx` (dynamic import, client-only); Node smoke test pins behavior |
| Large image uploads bloat spec renders | 2 MB cap; images referenced by storageId, never inlined |
| Autosave conflicts | last-write-wins + remote-change toast (documented limitation) |
| Undo memory growth | Snapshot cap 100; elements structurally shared |

---

## 12. Phase 3 Hooks (built-for, not built-in)

- `table` element type + `growsDown` pagination (results documents)
- Event-tier template overrides (resolution: event → org → system)
- Judge-sheet document kinds
- Additional token sources (round scores, judges)
