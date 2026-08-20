import type { ReactElement } from "react";
import type { Style } from "@react-pdf/types";
import type { DocumentElement, DocumentSpec } from "../../convex/documents/spec";
import { resolvePageSize } from "../../convex/documents/spec";
import { registerPdfFonts } from "./fonts";
import { resolveTokens, type TokenMap } from "./tokens";
import { mmToPt } from "./geometry";

export interface RenderSpecInput {
  spec: DocumentSpec;
  tokens: TokenMap;
}

type PdfModule = typeof import("@react-pdf/renderer");

async function buildDocument(inputs: RenderSpecInput[], imageUrls: Record<string, string>) {
  const pdf = await import("@react-pdf/renderer");
  const { Document, Page } = pdf;
  // In Node (vitest), font files resolve from the repo root; in the browser they are same-origin URLs.
  await registerPdfFonts(typeof window === "undefined" ? "public" : "");

  const pages = inputs.map(({ spec, tokens }, pageIndex) => {
    const { widthMm, heightMm } = resolvePageSize(spec.page);
    const children = spec.elements.map((element) => renderElement(pdf, element, tokens, imageUrls));
    return (
      <Page
        key={`page-${pageIndex}`}
        size={[mmToPt(widthMm), mmToPt(heightMm)]}
        style={{ backgroundColor: spec.page.background }}
      >
        {children}
      </Page>
    );
  });

  return <Document>{pages}</Document>;
}

function baseStyle(element: DocumentElement): Style {
  return {
    position: "absolute",
    top: mmToPt(element.yMm),
    left: mmToPt(element.xMm),
    width: mmToPt(element.widthMm),
    height: mmToPt(element.heightMm),
    opacity: element.opacity,
    ...(element.rotationDeg !== 0 ? { transform: `rotate(${element.rotationDeg}deg)` } : {}),
  };
}

function renderElement(
  pdf: PdfModule,
  element: DocumentElement,
  tokens: TokenMap,
  imageUrls: Record<string, string>,
): ReactElement {
  const { View, Text, Image, Svg, Ellipse, Line } = pdf;
  const key = element.id;
  if (element.type === "text") {
    const supportsWeight = element.fontFamily !== "Great Vibes";
    return (
      <View key={key} style={baseStyle(element)} wrap={false}>
        <Text
          style={{
            fontFamily: element.fontFamily,
            fontSize: element.fontSizePt,
            fontWeight: element.bold && supportsWeight ? 700 : 400,
            fontStyle: element.italic && supportsWeight ? "italic" : "normal",
            textDecoration: element.underline ? "underline" : "none",
            textAlign: element.align,
            color: element.color,
            lineHeight: element.lineHeight,
            letterSpacing: mmToPt(element.letterSpacingMm),
          }}
        >
          {resolveTokens(element.content, tokens)}
        </Text>
      </View>
    );
  }
  if (element.type === "image") {
    const src = imageUrls[element.storageId];
    if (!src) return <View key={key} style={baseStyle(element)} />;
    return <Image key={key} src={src} style={{ ...baseStyle(element), objectFit: element.fit }} />;
  }
  if (element.type === "rect") {
    return (
      <View
        key={key}
        style={{
          ...baseStyle(element),
          backgroundColor: element.fill ?? undefined,
          borderWidth: element.stroke ? mmToPt(element.strokeWidthMm) : 0,
          borderColor: element.stroke ?? undefined,
        }}
        wrap={false}
      />
    );
  }
  if (element.type === "ellipse") {
    const { widthMm, heightMm } = element;
    return (
      <Svg key={key} style={baseStyle(element)} viewBox={`0 0 ${widthMm} ${heightMm}`}>
        <Ellipse
          cx={widthMm / 2}
          cy={heightMm / 2}
          rx={Math.max(widthMm / 2 - element.strokeWidthMm / 2, 0.1)}
          ry={Math.max(heightMm / 2 - element.strokeWidthMm / 2, 0.1)}
          fill={element.fill ?? "none"}
          stroke={element.stroke ?? "none"}
          strokeWidth={element.strokeWidthMm}
        />
      </Svg>
    );
  }
  // line: horizontal rule across the box at its vertical center
  const { widthMm, heightMm } = element;
  return (
    <Svg key={key} style={baseStyle(element)} viewBox={`0 0 ${widthMm} ${heightMm}`}>
      <Line
        x1={0}
        y1={heightMm / 2}
        x2={widthMm}
        y2={heightMm / 2}
        stroke={element.stroke ?? "#000000"}
        strokeWidth={element.strokeWidthMm}
      />
    </Svg>
  );
}

/** Browser: render inputs (one page per entry) to a PDF Blob. */
export async function renderPdfBlob(
  inputs: RenderSpecInput[],
  imageUrls: Record<string, string>,
): Promise<Blob> {
  // v4 removed `renderToBlob`; the blob API is the `pdf` instance's `toBlob()`.
  const { pdf } = await import("@react-pdf/renderer");
  return pdf(await buildDocument(inputs, imageUrls)).toBlob();
}

/** Node (vitest / scripts): render to a Uint8Array. */
export async function renderPdfBuffer(
  inputs: RenderSpecInput[],
  imageUrls: Record<string, string>,
): Promise<Uint8Array> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(await buildDocument(inputs, imageUrls));
}
