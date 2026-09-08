"use client";

import { useMemo } from "react";
import type { PagePreset } from "@/convex/documents/spec";
import { resolvePageSize } from "@/convex/documents/spec";
import { parseNumberInput } from "@/lib/documents/numberInput";
import type { EditorAction, EditorState } from "@/lib/documents/editorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, SlidersHorizontal } from "lucide-react";

export interface PageSetupPanelProps {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

const PRESETS: PagePreset[] = ["A4", "Letter", "Legal", "A5", "Custom"];
const CUSTOM_SIZE_BOUNDS = { min: 50, max: 600 } as const;
const MARGIN_BOUNDS = { min: 0, max: 100 } as const;

const BG_SWATCHES = [
  { label: "Parchment", hex: "#FDFBF7" },
  { label: "Soft Cream", hex: "#FAF9F5" },
  { label: "Pure White", hex: "#FFFFFF" },
  { label: "Warm Ivory", hex: "#FFFDF9" },
  { label: "Dark Slate", hex: "#0F172A" },
  { label: "Obsidian", hex: "#18181B" },
];

export function PageSetupPanel({ state, dispatch }: PageSetupPanelProps) {
  const page = state.spec.page;
  const { widthMm, heightMm } = useMemo(() => resolvePageSize(page), [page]);

  function applyMarginPreset(sizeMm: number) {
    dispatch({
      type: "SET_PAGE",
      patch: {
        margins: { top: sizeMm, right: sizeMm, bottom: sizeMm, left: sizeMm },
      },
    });
  }

  return (
    <div className="space-y-4" aria-label="Page setup panel">
      {/* Dimensions Telemetry Card */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileText aria-hidden className="size-3.5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {page.preset} ({page.orientation === "landscape" ? "Landscape" : "Portrait"})
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">
              {widthMm} × {heightMm} mm
            </p>
          </div>
        </div>
      </div>

      {/* Preset Picker */}
      <div className="space-y-3 rounded-lg border border-border/60 p-3 bg-card">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="page-preset" className="text-xs font-semibold text-foreground">
            Page Size Preset
          </Label>
          <Select
            value={page.preset}
            onValueChange={(value) => {
              const preset = PRESETS.find((option) => option === value);
              if (preset) dispatch({ type: "SET_PAGE", patch: { preset } });
            }}
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
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
            <Label htmlFor="page-custom-width" className="text-[11px] text-muted-foreground">
              Custom (W × H mm)
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="page-custom-width"
                type="number"
                min={CUSTOM_SIZE_BOUNDS.min}
                max={CUSTOM_SIZE_BOUNDS.max}
                className="h-8 w-18 text-xs"
                value={page.widthMm ?? 210}
                onChange={(event) => {
                  const value = parseNumberInput(
                    event.target.value,
                    CUSTOM_SIZE_BOUNDS.min,
                    CUSTOM_SIZE_BOUNDS.max,
                  );
                  if (value !== null) dispatch({ type: "SET_PAGE", patch: { widthMm: value } });
                }}
              />
              <span className="text-xs text-muted-foreground">×</span>
              <Input
                id="page-custom-height"
                type="number"
                min={CUSTOM_SIZE_BOUNDS.min}
                max={CUSTOM_SIZE_BOUNDS.max}
                className="h-8 w-18 text-xs"
                value={page.heightMm ?? 297}
                onChange={(event) => {
                  const value = parseNumberInput(
                    event.target.value,
                    CUSTOM_SIZE_BOUNDS.min,
                    CUSTOM_SIZE_BOUNDS.max,
                  );
                  if (value !== null) dispatch({ type: "SET_PAGE", patch: { heightMm: value } });
                }}
              />
            </div>
          </div>
        ) : null}

        {/* Orientation Toggle */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
          <span className="text-xs font-semibold text-foreground">Orientation</span>
          <div className="flex gap-1">
            {(["portrait", "landscape"] as const).map((orientation) => (
              <button
                key={orientation}
                type="button"
                onClick={() => dispatch({ type: "SET_PAGE", patch: { orientation } })}
                aria-pressed={page.orientation === orientation}
                className={
                  page.orientation === orientation
                    ? "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-2xs transition-all"
                    : "rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-all"
                }
              >
                {orientation === "portrait" ? "Portrait" : "Landscape"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Margins */}
      <fieldset className="space-y-2.5 rounded-lg border border-border/60 p-3 bg-card">
        <div className="flex items-center justify-between">
          <legend className="text-xs font-semibold text-foreground">Print Margins (mm)</legend>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" className="text-[10px] h-5 px-1" onClick={() => applyMarginPreset(10)}>
              10mm
            </Button>
            <Button variant="ghost" size="xs" className="text-[10px] h-5 px-1" onClick={() => applyMarginPreset(15)}>
              15mm
            </Button>
            <Button variant="ghost" size="xs" className="text-[10px] h-5 px-1" onClick={() => applyMarginPreset(20)}>
              20mm
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["top", "bottom", "left", "right"] as const).map((side) => (
            <div key={side} className="flex items-center justify-between gap-2">
              <Label htmlFor={`margin-${side}`} className="text-[11px] text-muted-foreground capitalize">
                {side}
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  id={`margin-${side}`}
                  type="number"
                  min={MARGIN_BOUNDS.min}
                  max={MARGIN_BOUNDS.max}
                  step={0.5}
                  className="h-7 w-16 text-xs text-right"
                  value={page.margins[side]}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, MARGIN_BOUNDS.min, MARGIN_BOUNDS.max);
                    if (value !== null) {
                      dispatch({
                        type: "SET_PAGE",
                        patch: { margins: { ...page.margins, [side]: value } },
                      });
                    }
                  }}
                />
                <span className="text-[10px] text-muted-foreground">mm</span>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Background Color */}
      <div className="space-y-2 rounded-lg border border-border/60 p-3 bg-card">
        <div className="flex items-center justify-between">
          <Label htmlFor="page-background" className="text-xs font-semibold text-foreground">
            Page Background
          </Label>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground">{page.background}</span>
            <Input
              id="page-background"
              type="color"
              className="size-6 p-0.5 rounded border border-border cursor-pointer"
              value={page.background}
              onChange={(event) => dispatch({ type: "SET_PAGE", patch: { background: event.target.value } })}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          {BG_SWATCHES.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              title={swatch.label}
              onClick={() => dispatch({ type: "SET_PAGE", patch: { background: swatch.hex } })}
              style={{ backgroundColor: swatch.hex }}
              className={`size-5 rounded-full border shadow-2xs hover:scale-125 transition-transform ${
                page.background.toLowerCase() === swatch.hex.toLowerCase()
                  ? "ring-2 ring-primary ring-offset-1 border-primary"
                  : "border-border/80"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
