"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { DocumentElement } from "@/convex/documents/spec";
import { HANDLE_IDS, PX_PER_MM, type HandleId } from "@/lib/documents/geometry";
import type { SnapGuide } from "@/lib/documents/snap";

const ACCENT_COLOR = "#2e5aac";

function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

export interface SelectionOverlayProps {
  selected: DocumentElement[];
  zoom: number;
  /** False while a drag is active; hides the transform handles. */
  interactive: boolean;
  guides: SnapGuide[];
  marquee: { xMm: number; yMm: number; widthMm: number; heightMm: number } | null;
  onHandlePointerDown: (event: ReactPointerEvent, handle: HandleId) => void;
  onRotatePointerDown: (event: ReactPointerEvent) => void;
}

function cursorFor(handle: HandleId): string {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  return "nesw-resize";
}

function handleButtonStyle(sizePx: number, zoom: number): CSSProperties {
  return {
    position: "absolute",
    width: sizePx,
    height: sizePx,
    background: "#ffffff",
    border: `${1 / zoom}px solid ${ACCENT_COLOR}`,
    pointerEvents: "auto",
    padding: 0,
    lineHeight: 1,
    transform: "translate(-50%, -50%)",
  };
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
  const handleSizePx = 8 / zoom;
  // Resize/rotate handles apply to a single unlocked selection only.
  const transformable = interactive && selected.length === 1 && !selected[0].locked;

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
            outline: `${1.5 / zoom}px solid ${ACCENT_COLOR}`,
            pointerEvents: "none",
          }}
        >
          {transformable
            ? HANDLE_IDS.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  aria-label={`Resize ${handle}`}
                  data-handle={handle}
                  onPointerDown={(event) => onHandlePointerDown(event, handle)}
                  style={{
                    ...handleButtonStyle(handleSizePx, zoom),
                    borderRadius: handleSizePx / 4,
                    cursor: cursorFor(handle),
                    left: handle.includes("w") ? 0 : handle.includes("e") ? "100%" : "50%",
                    top: handle.includes("n") ? 0 : handle.includes("s") ? "100%" : "50%",
                  }}
                />
              ))
            : null}
          {transformable ? (
            <button
              type="button"
              aria-label="Rotate element"
              data-handle="rotate"
              onPointerDown={onRotatePointerDown}
              style={{
                ...handleButtonStyle(handleSizePx, zoom),
                left: "50%",
                top: -28 / zoom,
                borderRadius: "50%",
                cursor: "grab",
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
            border: `${1 / zoom}px dashed ${ACCENT_COLOR}`,
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
