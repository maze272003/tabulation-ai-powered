"use client";

import { useMemo, useRef, useState } from "react";
import type { FontFamily, ImageElement } from "@/convex/documents/spec";
import { resolvePageSize } from "@/convex/documents/spec";
import { FONT_META } from "@/lib/documents/fonts";
import { distributeGaps, selectionBounds } from "@/lib/documents/geometry";
import { parseNumberInput } from "@/lib/documents/numberInput";
import type { EditorAction, EditorState, ElementPatch } from "@/lib/documents/editorState";
import { BulkStylePanel } from "./BulkStylePanel";
import { ColorSwatches } from "./ColorSwatches";
import { PANEL_INPUT_CLASS, PanelRow } from "./PanelRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Italic,
  Lock,
  LockOpen,
  MousePointerClick,
  Trash2,
  Underline,
} from "lucide-react";
import { TokenPicker } from "./TokenPicker";

/** A local edit held while the user is still interacting, keyed by element id. */
interface CoalescedDraft<T> {
  elementId: string;
  value: T;
}

interface CoalescedValue<T> {
  value: T;
  pending: CoalescedDraft<T> | null;
  edit: (next: T) => void;
  clear: () => void;
}

function useCoalescedValue<T>(elementId: string | null, elementValue: T): CoalescedValue<T> {
  const [draft, setDraft] = useState<CoalescedDraft<T> | null>(null);
  const pending = draft !== null && draft.elementId === elementId ? draft : null;
  return {
    value: pending !== null ? pending.value : elementValue,
    pending,
    edit: (next: T) => {
      if (elementId !== null) setDraft({ elementId, value: next });
    },
    clear: () => setDraft(null),
  };
}

function commitCoalescedValue<T>(control: CoalescedValue<T>, apply: (elementId: string, value: T) => void) {
  const { pending } = control;
  if (pending === null) return;
  apply(pending.elementId, pending.value);
  control.clear();
}

const SIZE_BOUNDS = {
  xMm: { min: -500, max: 1000 },
  yMm: { min: -500, max: 1200 },
  widthMm: { min: 1, max: 600 },
  heightMm: { min: 1, max: 600 },
  rotationDeg: { min: -360, max: 360 },
  fontSizePt: { min: 4, max: 200 },
  strokeWidthMm: { min: 0, max: 50 },
} as const;

export interface InspectorProps {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export function Inspector({ state, dispatch }: InspectorProps) {
  const selected = useMemo(
    () => state.spec.elements.filter((e) => state.selection.includes(e.id)),
    [state.spec.elements, state.selection],
  );

  const single = selected.length === 1 ? selected[0] : null;
  const text = single !== null && single.type === "text" ? single : null;
  const image = single !== null && single.type === "image" ? single : null;
  const shape = single !== null && single.type !== "text" && single.type !== "image" ? single : null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const content = useCoalescedValue(text?.id ?? null, text?.content ?? "");
  const textColor = useCoalescedValue(text?.id ?? null, text?.color ?? "#000000");
  const lineHeight = useCoalescedValue(text?.id ?? null, text?.lineHeight ?? 1.3);
  const letterSpacing = useCoalescedValue(text?.id ?? null, text?.letterSpacingMm ?? 0);
  const fill = useCoalescedValue(shape?.id ?? null, shape?.fill ?? "#ffffff");
  const stroke = useCoalescedValue(shape?.id ?? null, shape?.stroke ?? "#000000");
  const opacity = useCoalescedValue(single?.id ?? null, single?.opacity ?? 1);
  const elementName = useCoalescedValue(single?.id ?? null, single?.name ?? "");

  function patch(id: string, patchValue: ElementPatch) {
    dispatch({ type: "UPDATE_ELEMENTS", updates: [{ id, patch: patchValue }] });
  }

  function commitContent() {
    commitCoalescedValue(content, (id, value) => patch(id, { content: value }));
  }

  function commitTextColor() {
    commitCoalescedValue(textColor, (id, value) => patch(id, { color: value }));
  }

  function commitLineHeight() {
    commitCoalescedValue(lineHeight, (id, value) => patch(id, { lineHeight: value }));
  }

  function commitLetterSpacing() {
    commitCoalescedValue(letterSpacing, (id, value) => patch(id, { letterSpacingMm: value }));
  }

  function commitFill() {
    commitCoalescedValue(fill, (id, value) => patch(id, { fill: value }));
  }

  function commitStroke() {
    commitCoalescedValue(stroke, (id, value) => patch(id, { stroke: value }));
  }

  function commitOpacity() {
    commitCoalescedValue(opacity, (id, value) => patch(id, { opacity: value }));
  }

  function commitElementName() {
    commitCoalescedValue(elementName, (id, value) => {
      const trimmed = value.trim();
      if (trimmed.length === 0 || trimmed === single?.name) return;
      patch(id, { name: trimmed });
    });
  }

  function align(axis: "h" | "v", edge: "start" | "center" | "end") {
    const { widthMm, heightMm } = resolvePageSize(state.spec.page);
    const group = selected.length > 1 ? selectionBounds(selected) : null;
    const left = group?.minXMm ?? 0;
    const top = group?.minYMm ?? 0;
    const spanX = group ? group.maxXMm - group.minXMm : widthMm;
    const spanY = group ? group.maxYMm - group.minYMm : heightMm;

    const updates = selected.map((element) => {
      if (axis === "h") {
        const xMm =
          edge === "start"
            ? left
            : edge === "center"
              ? left + (spanX - element.widthMm) / 2
              : left + spanX - element.widthMm;
        return { id: element.id, patch: { xMm: Math.round(xMm * 10) / 10 } };
      }
      const yMm =
        edge === "start"
          ? top
          : edge === "center"
            ? top + (spanY - element.heightMm) / 2
            : top + spanY - element.heightMm;
      return { id: element.id, patch: { yMm: Math.round(yMm * 10) / 10 } };
    });
    dispatch({ type: "UPDATE_ELEMENTS", updates });
  }

  function centerOnPage(axis: "h" | "v" | "both") {
    const { widthMm, heightMm } = resolvePageSize(state.spec.page);
    const updates = selected.map((element) => {
      const p: ElementPatch = {};
      if (axis === "h" || axis === "both") {
        p.xMm = Math.round(((widthMm - element.widthMm) / 2) * 10) / 10;
      }
      if (axis === "v" || axis === "both") {
        p.yMm = Math.round(((heightMm - element.heightMm) / 2) * 10) / 10;
      }
      return { id: element.id, patch: p };
    });
    dispatch({ type: "UPDATE_ELEMENTS", updates });
    toast.success("Centered on page");
  }

  function changeLayerOrder(direction: "front" | "back" | "up" | "down") {
    if (!single) return;
    const currentIndex = state.spec.elements.findIndex((e) => e.id === single.id);
    if (currentIndex === -1) return;

    let toIndex = currentIndex;
    if (direction === "front") {
      toIndex = state.spec.elements.length - 1;
    } else if (direction === "back") {
      toIndex = 0;
    } else if (direction === "up") {
      toIndex = Math.min(state.spec.elements.length - 1, currentIndex + 1);
    } else if (direction === "down") {
      toIndex = Math.max(0, currentIndex - 1);
    }

    if (toIndex !== currentIndex) {
      dispatch({ type: "REORDER_ELEMENT", id: single.id, toIndex });
    }
  }

  function transformCase(mode: "upper" | "lower" | "title") {
    if (!text) return;
    const current = content.value;
    let transformed = current;
    if (mode === "upper") {
      transformed = current.toUpperCase();
    } else if (mode === "lower") {
      transformed = current.toLowerCase();
    } else if (mode === "title") {
      transformed = current.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase());
    }
    content.edit(transformed);
    patch(text.id, { content: transformed });
    content.clear();
  }

  function insertToken(token: string) {
    const textarea = textareaRef.current;
    const element = selected[0];
    if (!element || element.type !== "text") return;
    const currentContent = content.value;
    const marker = `{{${token}}}`;
    if (!textarea) {
      patch(element.id, { content: currentContent + marker });
      content.clear();
      return;
    }
    const start = textarea.selectionStart ?? currentContent.length;
    const end = textarea.selectionEnd ?? start;
    patch(element.id, { content: currentContent.slice(0, start) + marker + currentContent.slice(end) });
    content.clear();
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + marker.length, start + marker.length);
    });
  }

  if (selected.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground space-y-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <MousePointerClick aria-hidden className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">No Element Selected</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Click any text, shape, or logo on the canvas to inspect and adjust properties, typography, and alignments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-label="Inspector">
      {/* Header & Quick Action Buttons */}
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <div className="min-w-0 pr-2">
          <span className="text-xs font-semibold text-foreground truncate block">
            {selected.length > 1 ? `${selected.length} elements selected` : single?.name}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
            {selected.length > 1 ? "Multi-Selection" : single?.type}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Duplicate"
            title="Duplicate (Ctrl+D)"
            onClick={() => dispatch({ type: "DUPLICATE_SELECTED" })}
          >
            <Copy aria-hidden className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete"
            title="Delete element"
            onClick={() => {
              const locked = selected.filter((e) => e.locked).length;
              if (locked > 0) toast.error("Locked elements were skipped.");
              dispatch({ type: "DELETE_SELECTED" });
            }}
          >
            <Trash2 aria-hidden className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Element Name (single selection) */}
      {single ? (
        <section aria-label="Element name" className="rounded-lg border border-border/60 p-2.5 bg-card">
          <PanelRow label="Element Name">
            <Input
              className={`${PANEL_INPUT_CLASS} w-38`}
              value={elementName.value}
              maxLength={80}
              onChange={(event) => elementName.edit(event.target.value)}
              onBlur={commitElementName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </PanelRow>
        </section>
      ) : null}

      {/* Alignment & Page Centering Controls */}
      <section aria-label="Alignment controls" className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-wide text-foreground uppercase">Align Selection</span>
          <span className="text-[10px] text-muted-foreground">Relative</span>
        </div>
        <div className="grid grid-cols-6 gap-1">
          <Button variant="outline" size="icon-xs" aria-label="Align left" title="Align Left" onClick={() => align("h", "start")}>
            <AlignLeft aria-hidden className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" aria-label="Align center" title="Align Center Horizontally" onClick={() => align("h", "center")}>
            <AlignCenter aria-hidden className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" aria-label="Align right" title="Align Right" onClick={() => align("h", "end")}>
            <AlignRight aria-hidden className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" aria-label="Align top" title="Align Top" onClick={() => align("v", "start")}>
            <AlignStartVertical aria-hidden className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" aria-label="Align middle" title="Align Middle Vertically" onClick={() => align("v", "center")}>
            <AlignVerticalJustifyCenter aria-hidden className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" aria-label="Align bottom" title="Align Bottom" onClick={() => align("v", "end")}>
            <AlignEndVertical aria-hidden className="size-3.5" />
          </Button>
        </div>

        {/* Page Centering Shortcut Buttons */}
        <div className="pt-1 flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="xs"
            className="flex-1 text-[10px] gap-1 h-6"
            onClick={() => centerOnPage("h")}
            title="Center horizontally across the entire page"
          >
            <AlignHorizontalDistributeCenter aria-hidden className="size-3" />
            Center Page X
          </Button>
          <Button
            variant="secondary"
            size="xs"
            className="flex-1 text-[10px] gap-1 h-6"
            onClick={() => centerOnPage("v")}
            title="Center vertically across the entire page"
          >
            <AlignVerticalDistributeCenter aria-hidden className="size-3" />
            Center Page Y
          </Button>
        </div>
      </section>

      {/* Even spacing distribution across three or more elements */}
      {selected.length >= 3 ? (
        <div className="flex items-center gap-1.5" role="group" aria-label="Distribute evenly">
          <Button
            variant="secondary"
            size="xs"
            className="flex-1 text-[10px] gap-1 h-6"
            onClick={() => dispatch({ type: "UPDATE_ELEMENTS", updates: distributeGaps(selected, "h") })}
            title="Space selected elements evenly between the outermost edges (horizontal)"
          >
            <AlignHorizontalSpaceAround aria-hidden className="size-3" />
            Distribute H
          </Button>
          <Button
            variant="secondary"
            size="xs"
            className="flex-1 text-[10px] gap-1 h-6"
            onClick={() => dispatch({ type: "UPDATE_ELEMENTS", updates: distributeGaps(selected, "v") })}
            title="Space selected elements evenly between the outermost edges (vertical)"
          >
            <AlignVerticalSpaceAround aria-hidden className="size-3" />
            Distribute V
          </Button>
        </div>
      ) : null}

      {/* Layer Stacking Order */}
      {single ? (
        <section aria-label="Layer ordering" className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-2">
          <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">Layer Order</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => changeLayerOrder("front")}
              title="Bring to Front"
              aria-label="Bring to Front"
            >
              <ArrowUpToLine aria-hidden className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => changeLayerOrder("up")}
              title="Bring Forward"
              aria-label="Bring Forward"
            >
              <ChevronsUp aria-hidden className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => changeLayerOrder("down")}
              title="Send Backward"
              aria-label="Send Backward"
            >
              <ChevronsDown aria-hidden className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => changeLayerOrder("back")}
              title="Send to Back"
              aria-label="Send to Back"
            >
              <ArrowDownToLine aria-hidden className="size-3" />
            </Button>
          </div>
        </section>
      ) : null}

      {/* Batch styling controls for multi-selection */}
      {selected.length > 1 ? <BulkStylePanel selected={selected} dispatch={dispatch} /> : null}

      {/* TEXT ELEMENT SPECIFIC PROPERTIES */}
      {text ? (
        <section aria-label="Text content" className="space-y-3 rounded-lg border border-border/60 p-3 bg-card">
          <div className="flex items-center justify-between">
            <Label htmlFor="inspector-content" className="text-xs font-semibold text-foreground">
              Text Content
            </Label>
            <TokenPicker onInsert={insertToken} />
          </div>

          <textarea
            id="inspector-content"
            ref={textareaRef}
            className="min-h-18 w-full rounded-md border border-input bg-transparent p-2 text-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
            value={content.value}
            onChange={(event) => content.edit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                commitContent();
              }
            }}
            onBlur={commitContent}
          />

          {/* Quick Case Transform buttons */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-1">Case:</span>
            <Button variant="ghost" size="xs" className="text-[10px] h-6 px-1.5" onClick={() => transformCase("upper")}>
              UPPER
            </Button>
            <Button variant="ghost" size="xs" className="text-[10px] h-6 px-1.5" onClick={() => transformCase("lower")}>
              lower
            </Button>
            <Button variant="ghost" size="xs" className="text-[10px] h-6 px-1.5" onClick={() => transformCase("title")}>
              Title
            </Button>
          </div>

          {/* Font Family Selector */}
          <PanelRow label="Font Family">
            <Select
              value={text.fontFamily}
              onValueChange={(value) => {
                if (value !== null) patch(text.id, { fontFamily: value as FontFamily });
              }}
            >
              <SelectTrigger className="h-8 w-38 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(FONT_META).map((family) => {
                  const meta = FONT_META[family as FontFamily];
                  return (
                    <SelectItem key={family} value={family}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <span style={{ fontFamily: family }}>{family}</span>
                        <span className="text-[9px] text-muted-foreground uppercase">{meta.category}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </PanelRow>

          {/* Font Size */}
          <PanelRow label="Font Size">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={SIZE_BOUNDS.fontSizePt.min}
                max={SIZE_BOUNDS.fontSizePt.max}
                className={`${PANEL_INPUT_CLASS} w-16 text-right`}
                value={text.fontSizePt}
                onChange={(event) => {
                  const value = parseNumberInput(event.target.value, SIZE_BOUNDS.fontSizePt.min, SIZE_BOUNDS.fontSizePt.max);
                  if (value !== null) patch(text.id, { fontSizePt: value });
                }}
              />
              <span className="text-xs text-muted-foreground">pt</span>
            </div>
          </PanelRow>

          {/* Text Style: Bold, Italic, Underline, Alignment */}
          <PanelRow label="Style & Align">
            <div className="flex gap-1">
              <Button
                variant={text.bold ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Bold"
                disabled={!FONT_META[text.fontFamily].hasBold}
                onClick={() => patch(text.id, { bold: !text.bold })}
              >
                <Bold aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={text.italic ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Italic"
                disabled={!FONT_META[text.fontFamily].hasItalic}
                onClick={() => patch(text.id, { italic: !text.italic })}
              >
                <Italic aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={text.underline ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Underline"
                onClick={() => patch(text.id, { underline: !text.underline })}
              >
                <Underline aria-hidden className="size-3.5" />
              </Button>
              <span className="h-4 w-px bg-border my-auto mx-0.5" />
              <Button
                variant={text.align === "left" ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Align text left"
                onClick={() => patch(text.id, { align: "left" })}
              >
                <AlignLeft aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={text.align === "center" ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Align text center"
                onClick={() => patch(text.id, { align: "center" })}
              >
                <AlignCenter aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant={text.align === "right" ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Align text right"
                onClick={() => patch(text.id, { align: "right" })}
              >
                <AlignRight aria-hidden className="size-3.5" />
              </Button>
            </div>
          </PanelRow>

          {/* Color with Quick Swatches */}
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
                textColor.edit(hex);
                patch(text.id, { color: hex });
              }}
            />
          </div>

          {/* Spacing & Line Height */}
          <PanelRow label={`Line Height (${lineHeight.value.toFixed(2)})`}>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.05}
              className="w-28 accent-primary"
              value={lineHeight.value}
              onChange={(event) => lineHeight.edit(Number(event.target.value))}
              onPointerUp={commitLineHeight}
              onKeyUp={commitLineHeight}
            />
          </PanelRow>

          <PanelRow label={`Letter Space (${letterSpacing.value.toFixed(1)}mm)`}>
            <input
              type="range"
              min={-2}
              max={8}
              step={0.2}
              className="w-28 accent-primary"
              value={letterSpacing.value}
              onChange={(event) => letterSpacing.edit(Number(event.target.value))}
              onPointerUp={commitLetterSpacing}
              onKeyUp={commitLetterSpacing}
            />
          </PanelRow>
        </section>
      ) : null}

      {/* SHAPE SPECIFIC PROPERTIES */}
      {shape ? (
        <section aria-label="Shape styling" className="space-y-3 rounded-lg border border-border/60 p-3 bg-card">
          <span className="text-xs font-semibold text-foreground block">Shape & Border Styling</span>

          {/* Fill Color */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Fill Color</span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant={shape.fill === null ? "secondary" : "ghost"}
                  size="xs"
                  className="text-[10px] h-6 px-1.5"
                  onClick={() => patch(shape.id, { fill: null })}
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
              value={fill.value}
              onSelect={(hex) => {
                fill.edit(hex);
                patch(shape.id, { fill: hex });
              }}
            />
          </div>

          {/* Stroke Color */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Stroke Color</span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant={shape.stroke === null ? "secondary" : "ghost"}
                  size="xs"
                  className="text-[10px] h-6 px-1.5"
                  onClick={() => patch(shape.id, { stroke: null })}
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
              value={stroke.value}
              onSelect={(hex) => {
                stroke.edit(hex);
                patch(shape.id, { stroke: hex });
              }}
            />
          </div>

          {/* Stroke Width */}
          <PanelRow label="Stroke Thickness">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={SIZE_BOUNDS.strokeWidthMm.min}
                max={SIZE_BOUNDS.strokeWidthMm.max}
                step={0.2}
                className={`${PANEL_INPUT_CLASS} w-16 text-right`}
                value={shape.strokeWidthMm}
                onChange={(event) => {
                  const value = parseNumberInput(
                    event.target.value,
                    SIZE_BOUNDS.strokeWidthMm.min,
                    SIZE_BOUNDS.strokeWidthMm.max,
                  );
                  if (value !== null) patch(shape.id, { strokeWidthMm: value });
                }}
              />
              <span className="text-xs text-muted-foreground">mm</span>
            </div>
          </PanelRow>
        </section>
      ) : null}

      {/* IMAGE ELEMENT PROPERTIES */}
      {image ? (
        <section aria-label="Image styling" className="space-y-3 rounded-lg border border-border/60 p-3 bg-card">
          <span className="text-xs font-semibold text-foreground block">Image Properties</span>
          <PanelRow label="Display Fit">
            <Select
              value={image.fit}
              onValueChange={(value) => {
                if (value !== null) patch(image.id, { fit: value as ImageElement["fit"] });
              }}
            >
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">Contain (Fit)</SelectItem>
                <SelectItem value="cover">Cover (Fill)</SelectItem>
              </SelectContent>
            </Select>
          </PanelRow>
        </section>
      ) : null}

      {/* TRANSFORM & POSITIONING (ALL SINGLE ELEMENTS) */}
      {single ? (
        <section aria-label="Transform" className="space-y-3 rounded-lg border border-border/60 p-3 bg-card">
          <span className="text-xs font-semibold text-foreground block">Position & Dimensions</span>

          <PanelRow label="X / Y (mm)">
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">X:</span>
                <Input
                  type="number"
                  step={0.5}
                  className={`${PANEL_INPUT_CLASS} w-16`}
                  value={Math.round(single.xMm * 10) / 10}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, SIZE_BOUNDS.xMm.min, SIZE_BOUNDS.xMm.max);
                    if (value !== null) patch(single.id, { xMm: value });
                  }}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Y:</span>
                <Input
                  type="number"
                  step={0.5}
                  className={`${PANEL_INPUT_CLASS} w-16`}
                  value={Math.round(single.yMm * 10) / 10}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, SIZE_BOUNDS.yMm.min, SIZE_BOUNDS.yMm.max);
                    if (value !== null) patch(single.id, { yMm: value });
                  }}
                />
              </div>
            </div>
          </PanelRow>

          <PanelRow label="W / H (mm)">
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">W:</span>
                <Input
                  type="number"
                  step={0.5}
                  className={`${PANEL_INPUT_CLASS} w-16`}
                  value={Math.round(single.widthMm * 10) / 10}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, SIZE_BOUNDS.widthMm.min, SIZE_BOUNDS.widthMm.max);
                    if (value !== null) patch(single.id, { widthMm: value });
                  }}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">H:</span>
                <Input
                  type="number"
                  step={0.5}
                  className={`${PANEL_INPUT_CLASS} w-16`}
                  value={Math.round(single.heightMm * 10) / 10}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, SIZE_BOUNDS.heightMm.min, SIZE_BOUNDS.heightMm.max);
                    if (value !== null) patch(single.id, { heightMm: value });
                  }}
                />
              </div>
            </div>
          </PanelRow>

          <PanelRow label="Rotation">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step={1}
                className={`${PANEL_INPUT_CLASS} w-14`}
                value={Math.round(single.rotationDeg)}
                onChange={(event) => {
                  const value = parseNumberInput(
                    event.target.value,
                    SIZE_BOUNDS.rotationDeg.min,
                    SIZE_BOUNDS.rotationDeg.max,
                  );
                  if (value !== null) patch(single.id, { rotationDeg: value });
                }}
              />
              <Button variant="ghost" size="xs" className="text-[10px] h-6 px-1" onClick={() => patch(single.id, { rotationDeg: 0 })}>
                0°
              </Button>
              <Button variant="ghost" size="xs" className="text-[10px] h-6 px-1" onClick={() => patch(single.id, { rotationDeg: 90 })}>
                90°
              </Button>
              <Button variant="ghost" size="xs" className="text-[10px] h-6 px-1" onClick={() => patch(single.id, { rotationDeg: 180 })}>
                180°
              </Button>
            </div>
          </PanelRow>

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

          <PanelRow label="Element Lock">
            <Button
              variant={single.locked ? "secondary" : "outline"}
              size="xs"
              className="gap-1.5"
              onClick={() => patch(single.id, { locked: !single.locked })}
              aria-pressed={single.locked}
            >
              {single.locked ? <Lock aria-hidden className="size-3 text-amber-500" /> : <LockOpen aria-hidden className="size-3 text-muted-foreground" />}
              <span>{single.locked ? "Locked" : "Unlocked"}</span>
            </Button>
          </PanelRow>
        </section>
      ) : null}
    </div>
  );
}
