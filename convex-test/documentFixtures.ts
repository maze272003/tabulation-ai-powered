import type { DocumentSpec } from "../convex/documents/spec";

export const validSpec: DocumentSpec = {
  version: 1,
  page: {
    preset: "A4",
    orientation: "portrait",
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    background: "#FFFFFF",
  },
  elements: [
    {
      type: "text",
      id: "el-1",
      name: "Title",
      xMm: 15,
      yMm: 40,
      widthMm: 180,
      heightMm: 20,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: "Awarded to {{recipient.name}}",
      fontFamily: "Crimson Text",
      fontSizePt: 30,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
      color: "#1F3A5F",
      lineHeight: 1.2,
      letterSpacingMm: 0,
    },
  ],
};
