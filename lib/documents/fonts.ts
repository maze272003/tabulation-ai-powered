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
  // React Fast Refresh resets module state while the DOM persists, so the
  // injected <style> may already exist even though fontsInjected is false.
  if (document.getElementById("document-editor-fonts")) {
    fontsInjected = true;
    return;
  }
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
    try {
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
    } catch (error) {
      // A transient failure must not poison registration for the whole
      // process; clear the cache so the next call can retry.
      pdfFontsPromise = null;
      throw error;
    }
  })();
  return pdfFontsPromise;
}

