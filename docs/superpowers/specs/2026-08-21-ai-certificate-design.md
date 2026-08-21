# AI Certificate Design Generation — Specification

**Date:** 2026-08-21
**Status:** Approved
**Depends on:** Certificate editor (2026-08-20 spec, fully shipped)

---

## 1. Overview

Users describe the event/theme in a prompt ("elegant gold pageant certificate, navy & gold"); Gemini returns up to 3 **design intents** (structured style choices — never coordinates); a deterministic **compiler** maps each intent to a valid `DocumentSpec`; the user picks a variant on the library page and it opens in the studio for normal editing.

**Core decisions (approved):**
- **Intent + compiler**: Gemini never produces mm coordinates — the compiler owns layout deterministically, so output quality is guaranteed and fully testable without mocking Gemini.
- **3 variants per generation**: one Gemini call returns `{ variants: [...] }`; each compiles independently; user previews all three.
- Nothing persists until the user picks a variant (generation is a read-only action; one quota unit each).

## 2. Data flow

```
AiCertificateCard (library page)
  └─ generateFromPrompt({ orgSlug, prompt })        convex/documents/ai.ts [action]
       requirePermission("documents.manage")
       consumeAiQuota("ai_document_designs", 20/day)
       buildCertificateIntents(prompt, geminiGenerateJson)   convex/lib/certificateAi.ts
         validate → retry-once on malformed → reject off-topic
       compileDesignIntent(intent) → DocumentSpec    lib/documents/designCompiler.ts
       → { variants: [{ name, description, spec }] } | { rejected: true, reason }
  └─ "Use this design" → api.documents.templates.create → navigate to studio
```

## 3. DesignIntent schema (validated)

```ts
type DesignIntent = {
  name: string;                          // 1–60
  description: string;                   // 1–160
  orientation: "portrait" | "landscape";
  frame: "classic-double" | "minimal" | "modern-bar" | "ornate";
  palette: { background: string; primary: string; accent: string; ink: string }; // #RRGGBB enforced
  scriptFont: "Great Vibes";
  headingFont: "Crimson Text" | "Lato";
  text: {
    title: string;                       // 1–60
    subtitle?: string;                   // ≤60
    presentedLine: string;               // 1–80
    citation: string;                    // 1–120
    dateLine: string;                    // 1–60
    signatureLabels: [string, string];   // each 1–40
  };
};
```

- Gemini contract: `{ "variants": [intent, intent, intent] }` (exactly 3 requested, ≥1 accepted) or `{ "rejected": true, "reason": "..." }` for off-topic/injection.
- `buildCertificateIntents(prompt, callLlm)` mirrors `buildTemplateDraft`: strict validation, retry-once feeding the validation error back, `LlmCaller` injected for tests.

## 4. Compiler rules (deterministic)

- Page: A4 (landscape flip per intent); margins 15mm.
- Vertical bands (fractions of printable height): org header (top), title+subtitle block, presented-line, script recipient name, name rule, citation, date, signature row (bottom) — classic-double/ornate add frames; modern-bar adds a left accent bar; minimal adds nothing extra.
- Color mapping: page background ← `palette.background`; frames/rules ← `accent`; title/recipient ← `primary`; body text ← `ink`; heading font ← `headingFont`; recipient always Great Vibes 52–56pt.
- Tokens: `{{org.name}}` (header), `{{recipient.name}}` (script), `{{event.name}}` in citation (appended if Gemini omitted it), `{{issued.date}}` in dateLine (appended likewise).
- Guarantee: `compileDesignIntent` output **always passes `isDocumentSpec`** — all lengths clamped, positions computed, ids fixed per band.

## 5. Quota

`AI_USAGE_RESOURCES.documentDesigns = "ai_document_designs"`, `DOCUMENT_DESIGN_DAILY_LIMIT = 20` (org/day). LIMIT_EXCEEDED surfaces the established toast copy.

## 6. Surfaces

- `AiCertificateCard` on the library page (prompt → busy → 3 variant cards with `SpecThumbnail` scaled HTML preview + name/description → Use design / Regenerate). Mirrors `AiEventWizardCard` UX conventions.
- `SpecThumbnail`: pure div renderer of a spec at an arbitrary pixel width (scaled fonts/borders; images render as neutral placeholders).

## 7. Error handling

| Failure | Behavior |
|---|---|
| Off-topic/injection | `{ rejected, reason }` shown inline (friendly), no quota waste beyond the single unit |
| Malformed JSON (after retry) | UPSTREAM error toast "could not design — try rewording" |
| Gemini/key failure | UPSTREAM typed error pass-through |
| Quota exhausted | LIMIT_EXCEEDED toast (established copy) |
| Viewer (no documents.manage) | FORBIDDEN |

## 8. Testing

- Validator matrix (malformed hex/enums/lengths; rejected path; retry-once; happy 3-variant) — pure, fake `callLlm`.
- Compiler golden tests (4 frames × landscape; token injection incl. append rules; always-`isDocumentSpec`; bounds within page).
- convex-test: permission deny (Viewer helper), quota row consumed + limit, UPSTREAM when key unconfigured (real action path).
- Gated e2e: AI card renders on the library page.

## 9. Out of scope (v1)

Refine-with-AI loop, AI image/logo generation, direct-spec generation mode, custom font choices beyond the two heading families, persistence of rejected generations.
