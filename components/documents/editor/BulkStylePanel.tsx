"use client";

import { useMemo, useState } from "react";
import type { FontFamily, ShapeElement, TextElement } from "@/convex/documents/spec";
import { FONT_META } from "@/lib/documents/fonts";
import { parseNumberInput } from "@/lib/documents/numberInput";
import type { EditorAction, ElementPatch } from "@/lib/documents/editorState";
import type { DocumentElement } from "@/convex/documents/spec";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Lock,
  LockOpen,
  Underline,
} from "lucide-react";
import { ColorSwatches } from "./ColorSwatches";
import { PANEL_INPUT_CLASS, PanelRow } from "./PanelRow";

export interface BulkStylePanelProps {
  selected: DocumentElement[];
  dispatch: React.Dispatch<EditorAction>;
}

/**
 * A local edit held while the user is still interacting, keyed to the
 * selection so in-progress drafts never leak across selection changes
 * (same coalescing pattern as the single-element Inspector).
 */
function useKeyedDraft<T>(selectionKey: string, initial: T) {
  const [draft, setDraft] = useState<{ key: string; value: T } | null>(null);
  const pending = draft !== null && draft.key === selectionKey;
  return {
    value: pending ? draft.value : initial,
    pending,
    edit: (next: T) => setDraft({ key: selectionKey, value: next }),
    clear: () => setDraft(null),
  };
}

/**
 * Batch styling for multi-selection: typography, colors, opacity, and lock
 * state applied to every matching element in the selection in one undo step.
 */
export function BulkStylePanel({ selected, dispatch }: BulkStylePanelProps) {
  const texts = useMemo(
    () => selected.filter((element): element is TextElement => element.type === "text"),
    [selected],
  );
  const shapes = useMemo(
    () =>
      selected.filter(
        (element): element is ShapeElement =>
          element.type === "rect" || element.type === "ellipse" || element.type === "line",
      ),
    [selected],
  );

  const leadText = texts[0] ?? null;
  const leadShape = shapes[0] ?? null;
  const lead = selected[0] ?? null;

  const selectionKey = useMemo(() => selected.map((element) => element.id).sort().join("|"), [selected]);
  const textColor = useKeyedDraft(selectionKey, leadText?.color ?? "#000000");
  const fill = useKeyedDraft(selectionKey, leadShape?.fill ?? "#ffffff");
  const stroke = useKeyedDraft(selectionKey, leadShape?.stroke ?? "#000000");
  const opacity = useKeyedDraft(selectionKey, lead?.opacity ?? 1);

  function patchAll(patchValue: ElementPatch) {
    dispatch({
      type: "UPDATE_ELEMENTS",
      updates: selected.map((element) => ({ id: element.id, patch: patchValue })),
    });
  }

  function patchTexts(patchValue: ElementPatch) {
    dispatch({
      type: "UPDATE_ELEMENTS",
      updates: texts.map((element) => ({ id: element.id, patch: patchValue })),
    });
  }

  function patchShapes(patchValue: ElementPatch) {
    dispatch({
      type: "UPDATE_ELEMENTS",
      updates: shapes.map((element) => ({ id: element.id, patch: patchValue })),
    });
  }

  function commitTextColor() {
    if (textColor.pending) {
      patchTexts({ color: textColor.value });
      textColor.clear();
    }
  }

  function commitFill() {
    if (fill.pending) {
      patchShapes({ fill: fill.value });
      fill.clear();
    }
  }

  function commitStroke() {
    if (stroke.pending) {
      patchShapes({ stroke: stroke.value });
      stroke.clear();
    }
  }

  function commitOpacity() {
    if (opacity.pending) {
      patchAll({ opacity: opacity.value });
      opacity.clear();
    }
  }

  const summary = [
    texts.length > 0 ? `${texts.length} text` : null,
    shapes.length > 0 ? `${shapes.length} shape${shapes.length === 1 ? "" : "s"}` : null,
    selected.length - texts.length - shapes.length > 0
      ? `${selected.length - texts.length - shapes.length} image${selected.length - texts.length - shapes.length === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4" aria-label="Batch styling">
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <span className="text-xs font-semibold text-foreground">Batch Styling</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">{summary}</span>
      </div>

      {/* Batch typography for all selected text elements */}
      {leadText ? (
        <section aria-label="Batch text styling" className="space-y-3 rounded-lg border border-border/60 p-3 bg-card">
          <span className="text-xs font-semibold text-foreground block">Text Styling</span>

          <PanelRow label="Font Family">
            <Select
              value={leadText.fontFamily}
              onValueChange={(value) => {
                if (value !== null) patchTexts({ fontFamily: value as FontFamily });
              }}
            >
              <SelectTrigger className="h-8 w-38 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(FONT_META).map((family) => (
                  <SelectItem key={family} value={family}>
                    <span style={{ fontFamily: family }}>{family}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PanelRow>

          <PanelRow label="Font Size">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={4}
                max={200}
                className={`${PANEL_INPUT_CLASS} w-16 text-right`}
                value={leadText.fontSizePt}
                onChange={(event) => {
                  const value = parseNumberInput(event.target.value, 4, 200);
                  if (value !== null) patchTexts({ fontSizePt: value });
                }}
              />
              <span className="text-xs text-muted-foreground">pt</span>
            </div>
          </PanelRow>

          <PanelRow label="Style & Align">
            <div className="flex gap-1">
              <Button
                variant={leadText.bold ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Toggle bold"
                disabled={!FONT_META[leadText.fontFamily].hasBold}
                onClick={() => patchTexts({ bold: !leadText.bold })}
              >
                <Bold aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={leadText.italic ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Toggle italic"
                disabled={!FONT_META[leadText.fontFamily].hasItalic}
                onClick={() => patchTexts({ italic: !leadText.italic })}
              >
                <Italic aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={leadText.underline ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Toggle underline"
                onClick={() => patchTexts({ underline: !leadText.underline })}
              >
                <Underline aria-hidden className="size-3.5" />
              </Button>
              <span className="h-4 w-px bg-border my-auto mx-0.5" />
              <Button
                variant={leadText.align === "left" ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Align text left"
                onClick={() => patchTexts({ align: "left" })}
              >
                <AlignLeft aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={leadText.align === "center" ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Align text center"
                onClick={() => patchTexts({ align: "center" })}
              >
                <AlignCenter aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={leadText.align === "right" ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Align text right"
                onClick={() => patchTexts({ align: "right" })}
              >
                <AlignRight aria-hidden className="size-3.5" />
              </Button>
            </div>
          </PanelRow>

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Text Color</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-muted-foreground">{textColor.value}</span>
                <Input
                  type="color"
                  className="size-6 p-0.5 rounded border border-border cursor-pointer"
                  value={textColor.value}
                  onChange={(event) => textColor.edit(event.target.value)}
                  onBlur={commitTextColor}
                />
              </div>
            </div>
            <ColorSwatches
              value={textColor.value}
              onSelect={(hex) => {
                patchTexts({ color: hex });
                textColor.clear();
              }}
            />
          </div>
        </section>
      ) : null}

      {/* Batch fill/stroke for all selected shapes */}
      {leadShape ? (
        <section aria-label="Batch shape styling" className="space-y-3 rounded-lg border border-border/60 p-3 bg-card">
          <span className="text-xs font-semibold text-foreground block">Shape Styling</span>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Fill Color</span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant={leadShape.fill === null ? "secondary" : "ghost"}
                  size="xs"
                  className="text-[10px] h-6 px-1.5"
                  onClick={() => patchShapes({ fill: null })}
                >
                  None
                </Button>
                <Input
                  type="color"
                  className="size-6 p-0.5 rounded border border-border cursor-pointer"
                  value={fill.value}
                  onChange={(event) => fill.edit(event.target.value)}
                  onBlur={commitFill}
                />
              </div>
            </div>
            <ColorSwatches
              value={fill.pending ? fill.value : leadShape.fill ?? undefined}
              onSelect={(hex) => {
                patchShapes({ fill: hex });
                fill.clear();
              }}
            />
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Stroke Color</span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant={leadShape.stroke === null ? "secondary" : "ghost"}
                  size="xs"
                  className="text-[10px] h-6 px-1.5"
                  onClick={() => patchShapes({ stroke: null })}
                >
                  None
                </Button>
                <Input
                  type="color"
                  className="size-6 p-0.5 rounded border border-border cursor-pointer"
                  value={stroke.value}
                  onChange={(event) => stroke.edit(event.target.value)}
                  onBlur={commitStroke}
                />
              </div>
            </div>
            <ColorSwatches
              value={stroke.pending ? stroke.value : leadShape.stroke ?? undefined}
              onSelect={(hex) => {
                patchShapes({ stroke: hex });
                stroke.clear();
              }}
            />
          </div>

          <PanelRow label="Stroke Width">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={50}
                step={0.2}
                className={`${PANEL_INPUT_CLASS} w-16 text-right`}
                value={leadShape.strokeWidthMm}
                onChange={(event) => {
                  const value = parseNumberInput(event.target.value, 0, 50);
                  if (value !== null) patchShapes({ strokeWidthMm: value });
                }}
              />
              <span className="text-xs text-muted-foreground">mm</span>
            </div>
          </PanelRow>
        </section>
      ) : null}

      {/* Shared properties across every selected element */}
      <section aria-label="Batch shared properties" className="space-y-3 rounded-lg border border-border/60 p-3 bg-card">
        <span className="text-xs font-semibold text-foreground block">All Elements</span>

        <PanelRow label={`Opacity (${Math.round(opacity.value * 100)}%)`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            className="w-28 accent-primary"
            value={opacity.value}
            onChange={(event) => opacity.edit(Number(event.target.value))}
            onPointerUp={commitOpacity}
            onKeyUp={commitOpacity}
          />
        </PanelRow>

        <PanelRow label="Lock State">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="xs"
              className="gap-1.5 text-[10px]"
              onClick={() => patchAll({ locked: true })}
            >
              <Lock aria-hidden className="size-3 text-amber-500" />
              Lock All
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="gap-1.5 text-[10px]"
              onClick={() => patchAll({ locked: false })}
            >
              <LockOpen aria-hidden className="size-3 text-muted-foreground" />
              Unlock All
            </Button>
          </div>
        </PanelRow>
      </section>
    </div>
  );
}
