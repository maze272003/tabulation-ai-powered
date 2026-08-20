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
const CUSTOM_SIZE_BOUNDS = { min: 50, max: 600 } as const;
const MARGIN_BOUNDS = { min: 0, max: 100 } as const;

/** Parses a numeric input, returning null for non-finite values (typing "-") so the patch is skipped. */
function parseNumberInput(raw: string, min: number, max: number): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

export function PageSetupPanel({ state, dispatch }: PageSetupPanelProps) {
  const page = state.spec.page;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="page-preset" className="text-[11px]">
          Size
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
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="page-custom-width" className="text-[11px]">
            W × H mm
          </Label>
          <div className="flex gap-1">
            <Input
              id="page-custom-width"
              type="number"
              min={CUSTOM_SIZE_BOUNDS.min}
              max={CUSTOM_SIZE_BOUNDS.max}
              className="h-8 w-20 text-xs"
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
            <Input
              id="page-custom-height"
              type="number"
              min={CUSTOM_SIZE_BOUNDS.min}
              max={CUSTOM_SIZE_BOUNDS.max}
              className="h-8 w-20 text-xs"
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
              min={MARGIN_BOUNDS.min}
              max={MARGIN_BOUNDS.max}
              step={0.5}
              className="h-8 w-20 text-xs"
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
          </div>
        ))}
      </fieldset>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="page-background" className="text-[11px]">
          Background
        </Label>
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
