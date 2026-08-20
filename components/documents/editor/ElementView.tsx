"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
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
  /** Live drag offset in mm; zero when idle. */
  dxMm: number;
  dyMm: number;
  interactive: boolean;
  onPointerDown: (event: ReactPointerEvent, element: DocumentElement) => void;
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
