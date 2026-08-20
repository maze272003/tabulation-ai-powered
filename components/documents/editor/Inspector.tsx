"use client";

import { useRef } from "react";
import type { FontFamily, ImageElement } from "@/convex/documents/spec";
import { resolvePageSize } from "@/convex/documents/spec";
import { FONT_META } from "@/lib/documents/fonts";
import { selectionBounds } from "@/lib/documents/geometry";
import type { EditorAction, EditorState, ElementPatch } from "@/lib/documents/editorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
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

// Bounds mirror isDocumentSpec in convex/documents/spec.ts so the inspector can
// never patch an element into a state that fails validation on save.
const SIZE_BOUNDS = {
  xMm: { min: -500, max: 1000 },
  yMm: { min: -500, max: 1200 },
  widthMm: { min: 1, max: 600 },
  heightMm: { min: 1, max: 600 },
  rotationDeg: { min: -360, max: 360 },
  fontSizePt: { min: 4, max: 200 },
  strokeWidthMm: { min: 0, max: 50 },
} as const;

/** Parses a numeric input, returning null for non-finite values (typing "-") so the patch is skipped. */
function parseNumberInput(raw: string, min: number, max: number): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

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

  // A single selection aligns against the page; a group aligns each element
  // within the group's own bounds. One dispatch keeps it a single undo step.
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
      <aside
        className="w-72 shrink-0 border-l border-border/60 bg-background p-4 text-xs text-muted-foreground"
        aria-label="Inspector"
      >
        Select an element to edit its properties.
      </aside>
    );
  }

  const single = selected.length === 1 ? selected[0] : null;
  const text = single !== null && single.type === "text" ? single : null;
  const image = single !== null && single.type === "image" ? single : null;
  const shape = single !== null && single.type !== "text" && single.type !== "image" ? single : null;

  return (
    <aside
      className="w-72 shrink-0 space-y-4 overflow-y-auto border-l border-border/60 bg-background p-4"
      aria-label="Inspector"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">
          {selected.length > 1 ? `${selected.length} elements` : single?.name}
        </span>
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
            <Label htmlFor="inspector-content" className="text-[11px]">
              Content
            </Label>
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
              onValueChange={(value) => {
                if (value !== null) patch(text.id, { fontFamily: value as FontFamily });
              }}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(FONT_META).map((family) => (
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
              min={SIZE_BOUNDS.fontSizePt.min}
              max={SIZE_BOUNDS.fontSizePt.max}
              className={`${inputClass} w-20`}
              value={text.fontSizePt}
              onChange={(event) => {
                const value = parseNumberInput(event.target.value, SIZE_BOUNDS.fontSizePt.min, SIZE_BOUNDS.fontSizePt.max);
                if (value !== null) patch(text.id, { fontSizePt: value });
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
              min={SIZE_BOUNDS.strokeWidthMm.min}
              max={SIZE_BOUNDS.strokeWidthMm.max}
              step={0.1}
              className={`${inputClass} w-20`}
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
                onChange={(event) => {
                  const value = parseNumberInput(event.target.value, SIZE_BOUNDS.xMm.min, SIZE_BOUNDS.xMm.max);
                  if (value !== null) patch(single.id, { xMm: value });
                }}
              />
              <Input
                type="number"
                step={0.1}
                className={`${inputClass} w-20`}
                value={Math.round(single.yMm * 10) / 10}
                onChange={(event) => {
                  const value = parseNumberInput(event.target.value, SIZE_BOUNDS.yMm.min, SIZE_BOUNDS.yMm.max);
                  if (value !== null) patch(single.id, { yMm: value });
                }}
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
                onChange={(event) => {
                  const value = parseNumberInput(event.target.value, SIZE_BOUNDS.widthMm.min, SIZE_BOUNDS.widthMm.max);
                  if (value !== null) patch(single.id, { widthMm: value });
                }}
              />
              <Input
                type="number"
                step={0.1}
                className={`${inputClass} w-20`}
                value={Math.round(single.heightMm * 10) / 10}
                onChange={(event) => {
                  const value = parseNumberInput(event.target.value, SIZE_BOUNDS.heightMm.min, SIZE_BOUNDS.heightMm.max);
                  if (value !== null) patch(single.id, { heightMm: value });
                }}
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
                onChange={(event) => {
                  const value = parseNumberInput(
                    event.target.value,
                    SIZE_BOUNDS.rotationDeg.min,
                    SIZE_BOUNDS.rotationDeg.max,
                  );
                  if (value !== null) patch(single.id, { rotationDeg: value });
                }}
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
