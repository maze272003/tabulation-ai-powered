"use client";

import type { CSSProperties } from "react";
import type { DocumentSpec } from "@/convex/documents/spec";
import { resolvePageSize } from "@/convex/documents/spec";
import { PX_PER_MM } from "@/lib/documents/geometry";

/** Decorative scaled-down HTML render of a spec — previews only, never edited. */
export function SpecThumbnail({ spec, widthPx }: { spec: DocumentSpec; widthPx: number }) {
  const { widthMm, heightMm } = resolvePageSize(spec.page);
  const scale = widthPx / (widthMm * PX_PER_MM);
  const height = heightMm * PX_PER_MM * scale;
  const mm = (value: number) => `${value * PX_PER_MM * scale}px`;

  return (
    <div
      aria-hidden
      style={{ width: `${widthPx}px`, height: `${height}px`, background: spec.page.background, position: "relative", overflow: "hidden", border: "1px solid rgba(100,116,139,0.35)", borderRadius: 2 }}
    >
      {spec.elements.map((element) => {
        const base: CSSProperties = {
          position: "absolute",
          left: mm(element.xMm),
          top: mm(element.yMm),
          width: mm(element.widthMm),
          height: mm(element.heightMm),
          opacity: element.opacity,
          transform: element.rotationDeg !== 0 ? `rotate(${element.rotationDeg}deg)` : undefined,
        };
        if (element.type === "text") {
          return (
            <div
              key={element.id}
              style={{
                ...base,
                fontFamily: `'${element.fontFamily}', serif`,
                fontSize: `${element.fontSizePt * (96 / 72) * scale}px`,
                fontWeight: element.bold ? 700 : 400,
                fontStyle: element.italic ? "italic" : "normal",
                color: element.color,
                textAlign: element.align,
                lineHeight: element.lineHeight,
                letterSpacing: `${element.letterSpacingMm * PX_PER_MM * scale}px`,
                overflow: "hidden",
                whiteSpace: "nowrap",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {element.content}
            </div>
          );
        }
        if (element.type === "image") {
          // Storage-backed images are not worth fetching at thumbnail scale; a neutral block reads as "image goes here".
          return <div key={element.id} style={{ ...base, background: "rgba(100,116,139,0.15)" }} />;
        }
        if (element.type === "ellipse") {
          return (
            <div
              key={element.id}
              style={{ ...base, borderRadius: "50%", background: element.fill ?? "transparent", border: element.stroke ? `${Math.max(element.strokeWidthMm * PX_PER_MM * scale, 0.5)}px solid ${element.stroke}` : "none", boxSizing: "border-box" }}
            />
          );
        }
        if (element.type === "line") {
          return (
            <div key={element.id} style={{ ...base, display: "flex", alignItems: "center" }}>
              <div style={{ width: "100%", height: `${Math.max(element.strokeWidthMm * PX_PER_MM * scale, 0.5)}px`, background: element.stroke ?? "#000000" }} />
            </div>
          );
        }
        return (
          <div
            key={element.id}
            style={{ ...base, background: element.fill ?? "transparent", border: element.stroke ? `${Math.max(element.strokeWidthMm * PX_PER_MM * scale, 0.5)}px solid ${element.stroke}` : "none", boxSizing: "border-box" }}
          />
        );
      })}
    </div>
  );
}
