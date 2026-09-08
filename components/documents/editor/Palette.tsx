"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Award,
  Check,
  Circle,
  Frame,
  ImagePlus,
  LayoutTemplate,
  Minus,
  Palette as PaletteIcon,
  PenTool,
  Search,
  Sparkles,
  Square,
  Tag,
  Type,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type {
  DocumentElement,
  DocumentSpec,
  ImageElement,
  ShapeElement,
  TextElement,
} from "@/convex/documents/spec";
import { isDocumentSpec, resolvePageSize } from "@/convex/documents/spec";
import { ensureEditorFontsLoaded } from "@/lib/documents/fonts";
import {
  newElementId,
  nextElementName,
  type EditorAction,
  type EditorState,
  type ElementPatch,
} from "@/lib/documents/editorState";
import { SpecThumbnail } from "@/components/documents/SpecThumbnail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_THUMBNAIL_ASSETS = 30;

type Tab = "elements" | "text" | "themes" | "templates" | "uploads";

type CertificateTheme = (typeof CERTIFICATE_THEMES)[number];

type TextPreset = "heading" | "subheading" | "body" | "scriptName" | "finePrint";

interface TextPresetSpec {
  baseName: string;
  content: string;
  fontFamily: TextElement["fontFamily"];
  fontSizePt: number;
  bold: boolean;
  heightMm: number;
  color: string;
  letterSpacingMm?: number;
}

const TEXT_PRESETS: Record<TextPreset, TextPresetSpec> = {
  heading: {
    baseName: "Heading",
    content: "CERTIFICATE OF RECOGNITION",
    fontFamily: "Crimson Text",
    fontSizePt: 28,
    bold: true,
    heightMm: 16,
    color: "#1E293B",
    letterSpacingMm: 1.5,
  },
  subheading: {
    baseName: "Subheading",
    content: "THIS CERTIFICATE IS PROUDLY PRESENTED TO",
    fontFamily: "Lato",
    fontSizePt: 13,
    bold: true,
    heightMm: 8,
    color: "#64748B",
    letterSpacingMm: 1,
  },
  scriptName: {
    baseName: "Recipient Name",
    content: "{{recipient.name}}",
    fontFamily: "Great Vibes",
    fontSizePt: 46,
    bold: false,
    heightMm: 22,
    color: "#0F172A",
  },
  body: {
    baseName: "Citation",
    content: "For exemplary performance and outstanding dedication during the event proceedings.",
    fontFamily: "Lato",
    fontSizePt: 11,
    bold: false,
    heightMm: 12,
    color: "#334155",
  },
  finePrint: {
    baseName: "Authority Line",
    content: "Verified & Tabulated through Tabulation AI Official System",
    fontFamily: "Lato",
    fontSizePt: 8,
    bold: false,
    heightMm: 6,
    color: "#94A3B8",
  },
};

const CERTIFICATE_THEMES = [
  {
    name: "Classic Navy & Gold",
    background: "#FDFBF7",
    primary: "#0F2027",
    accent: "#D4AF37",
    secondary: "#475569",
    tag: "Traditional",
  },
  {
    name: "Emerald Prestige",
    background: "#FAF9F5",
    primary: "#064E3B",
    accent: "#D97706",
    secondary: "#047857",
    tag: "Honors",
  },
  {
    name: "Royal Crimson",
    background: "#FFFDF9",
    primary: "#881337",
    accent: "#B45309",
    secondary: "#9F1239",
    tag: "Academic",
  },
  {
    name: "Modern Minimalist",
    background: "#FFFFFF",
    primary: "#0F172A",
    accent: "#3B82F6",
    secondary: "#64748B",
    tag: "Corporate",
  },
  {
    name: "Midnight Obsidian",
    background: "#18181B",
    primary: "#FFFFFF",
    accent: "#EAB308",
    secondary: "#A1A1AA",
    tag: "Luxury Dark",
  },
  {
    name: "Ocean Pearl",
    background: "#F8FAFC",
    primary: "#0C4A6E",
    accent: "#0891B2",
    secondary: "#0369A1",
    tag: "Maritime",
  },
  {
    name: "Champagne Silver",
    background: "#FDFDFB",
    primary: "#1C1917",
    accent: "#79716B",
    secondary: "#A8A29E",
    tag: "Executive",
  },
  {
    name: "Blush Rose Gala",
    background: "#FFF8F8",
    primary: "#9F1239",
    accent: "#E11D48",
    secondary: "#FB7185",
    tag: "Gala",
  },
  {
    name: "Forest Laurel",
    background: "#F7FAF7",
    primary: "#14532D",
    accent: "#65A30D",
    secondary: "#166534",
    tag: "Nature",
  },
  {
    name: "Amethyst Royale",
    background: "#FBFAFF",
    primary: "#4C1D95",
    accent: "#7C3AED",
    secondary: "#6D28D9",
    tag: "Formal",
  },
  {
    name: "Ivory & Bronze",
    background: "#FFFDF8",
    primary: "#7C2D12",
    accent: "#B45309",
    secondary: "#92400E",
    tag: "Heritage",
  },
  {
    name: "Sapphire Starlight",
    background: "#F5F8FF",
    primary: "#1E3A8A",
    accent: "#2563EB",
    secondary: "#3730A3",
    tag: "Championship",
  },
];

const TOKEN_PRESETS = [
  { token: "recipient.name", label: "Recipient Name", sample: "Juan Dela Cruz", font: "Great Vibes" as const, size: 44, color: "#1E293B" },
  { token: "recipient.rank", label: "Final Rank / Award", sample: "Grand Champion", font: "Crimson Text" as const, size: 22, bold: true, color: "#D97706" },
  { token: "recipient.number", label: "Contestant Number", sample: "No. 07", font: "Lato" as const, size: 14, color: "#64748B" },
  { token: "recipient.category", label: "Category / Division", sample: "Senior Division", font: "Lato" as const, size: 14, bold: true, color: "#334155" },
  { token: "event.name", label: "Event Name", sample: "National Grand Championships 2026", font: "Crimson Text" as const, size: 20, bold: true, color: "#0F172A" },
  { token: "event.date", label: "Event Date", sample: "October 18, 2026", font: "Lato" as const, size: 11, color: "#475569" },
  { token: "event.venue", label: "Venue", sample: "Grand Arena Pavilion", font: "Lato" as const, size: 11, color: "#64748B" },
  { token: "org.name", label: "Organization Name", sample: "World Pageantry & Arts Council", font: "Lato" as const, size: 12, bold: true, color: "#1E293B" },
  { token: "issued.date", label: "Date Issued", sample: "August 20, 2026", font: "Lato" as const, size: 10, color: "#64748B" },
];

export interface PaletteProps {
  orgSlug: string;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  imageUrls: Record<string, string>;
  className?: string;
  onClose?: () => void;
}

export function Palette({
  orgSlug,
  state,
  dispatch,
  imageUrls,
  className,
  onClose,
}: PaletteProps) {
  const [tab, setTab] = useState<Tab>("elements");
  const [pendingTemplate, setPendingTemplate] = useState<{ name: string; spec: DocumentSpec } | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const templates = useQuery(api.documents.templates.list, { orgSlug, kind: "certificate" });
  const orgAssets = useQuery(api.documents.assets.listByOrg, { orgSlug });

  const thumbnailStorageIds = useMemo(
    () => (orgAssets ?? []).map((asset) => asset.storageId).slice(0, MAX_THUMBNAIL_ASSETS),
    [orgAssets],
  );

  const orgAssetUrls = useQuery(
    api.documents.assets.assetUrls,
    thumbnailStorageIds.length > 0 ? { orgSlug, storageIds: thumbnailStorageIds } : "skip",
  );

  const createUploadUrl = useMutation(api.documents.assets.generateUploadUrl);
  const recordUpload = useMutation(api.documents.assets.recordUpload);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureEditorFontsLoaded();
  }, []);

  const { widthMm, heightMm } = resolvePageSize(state.spec.page);
  const centerX = widthMm / 2;
  const centerY = heightMm / 2;

  function openApplyTemplateDialog(template: { name: string; spec: unknown }) {
    if (!isDocumentSpec(template.spec)) {
      toast.error("This template has an invalid layout.");
      return;
    }
    setPendingTemplate({ name: template.name, spec: template.spec });
  }

  function addText(preset: TextPreset) {
    const config = TEXT_PRESETS[preset];
    const width = Math.min(160, widthMm - 40);
    const element: TextElement = {
      type: "text",
      id: newElementId(),
      name: nextElementName(state.spec, config.baseName),
      xMm: Math.round((centerX - width / 2) * 10) / 10,
      yMm: Math.round((centerY - config.heightMm / 2) * 10) / 10,
      widthMm: width,
      heightMm: config.heightMm,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: config.content,
      fontFamily: config.fontFamily,
      fontSizePt: config.fontSizePt,
      bold: config.bold,
      italic: false,
      underline: false,
      align: "center",
      color: config.color,
      lineHeight: 1.3,
      letterSpacingMm: config.letterSpacingMm ?? 0,
    };
    dispatch({ type: "ADD_ELEMENT", element });
  }

  function addTokenField(tokenDef: (typeof TOKEN_PRESETS)[number]) {
    const width = Math.min(140, widthMm - 40);
    const height = Math.max(10, Math.round(tokenDef.size * 0.45));
    const element: TextElement = {
      type: "text",
      id: newElementId(),
      name: nextElementName(state.spec, tokenDef.label),
      xMm: Math.round((centerX - width / 2) * 10) / 10,
      yMm: Math.round((centerY - height / 2) * 10) / 10,
      widthMm: width,
      heightMm: height,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: `{{${tokenDef.token}}}`,
      fontFamily: tokenDef.font,
      fontSizePt: tokenDef.size,
      bold: Boolean(tokenDef.bold),
      italic: false,
      underline: false,
      align: "center",
      color: tokenDef.color,
      lineHeight: 1.3,
      letterSpacingMm: 0,
    };
    dispatch({ type: "ADD_ELEMENT", element });
    toast.success(`Added ${tokenDef.label} field`);
  }

  function addBasicShape(kind: "rect" | "ellipse" | "line") {
    if (kind === "line") {
      const element: ShapeElement = {
        type: "line",
        id: newElementId(),
        name: nextElementName(state.spec, "Divider Line"),
        xMm: Math.round((centerX - 40) * 10) / 10,
        yMm: Math.round(centerY * 10) / 10,
        widthMm: 80,
        heightMm: 4,
        rotationDeg: 0,
        opacity: 1,
        locked: false,
        showOnAllPages: false,
        fill: null,
        stroke: "#334155",
        strokeWidthMm: 0.5,
      };
      dispatch({ type: "ADD_ELEMENT", element });
      return;
    }

    const isRect = kind === "rect";
    const element: ShapeElement = {
      type: kind,
      id: newElementId(),
      name: nextElementName(state.spec, isRect ? "Rectangle" : "Circle"),
      xMm: Math.round((centerX - 25) * 10) / 10,
      yMm: Math.round((centerY - 25) * 10) / 10,
      widthMm: 50,
      heightMm: 50,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      fill: isRect ? "#F1F5F9" : null,
      stroke: "#64748B",
      strokeWidthMm: 0.8,
    };
    dispatch({ type: "ADD_ELEMENT", element });
  }

  // Composite preset: Double Certificate Border (outer thin + inner inset)
  function addDoubleBorder() {
    const outerMargin = 8;
    const innerMargin = 13;
    const outer: ShapeElement = {
      type: "rect",
      id: newElementId(),
      name: nextElementName(state.spec, "Outer Border"),
      xMm: outerMargin,
      yMm: outerMargin,
      widthMm: Math.round((widthMm - outerMargin * 2) * 10) / 10,
      heightMm: Math.round((heightMm - outerMargin * 2) * 10) / 10,
      rotationDeg: 0,
      opacity: 1,
      locked: true,
      showOnAllPages: true,
      fill: null,
      stroke: "#0F2027",
      strokeWidthMm: 1.2,
    };
    const inner: ShapeElement = {
      type: "rect",
      id: newElementId(),
      name: nextElementName(state.spec, "Inner Gold Inset"),
      xMm: innerMargin,
      yMm: innerMargin,
      widthMm: Math.round((widthMm - innerMargin * 2) * 10) / 10,
      heightMm: Math.round((heightMm - innerMargin * 2) * 10) / 10,
      rotationDeg: 0,
      opacity: 1,
      locked: true,
      showOnAllPages: true,
      fill: null,
      stroke: "#D4AF37",
      strokeWidthMm: 0.6,
    };
    dispatch({ type: "ADD_ELEMENTS", elements: [outer, inner] });
    toast.success("Added Classic Double Border");
  }

  // Composite preset: Elegant Inset Frame
  function addInsetFrame() {
    const margin = 12;
    const frame: ShapeElement = {
      type: "rect",
      id: newElementId(),
      name: nextElementName(state.spec, "Certificate Frame"),
      xMm: margin,
      yMm: margin,
      widthMm: Math.round((widthMm - margin * 2) * 10) / 10,
      heightMm: Math.round((heightMm - margin * 2) * 10) / 10,
      rotationDeg: 0,
      opacity: 1,
      locked: true,
      showOnAllPages: true,
      fill: null,
      stroke: "#334155",
      strokeWidthMm: 0.8,
    };
    dispatch({ type: "ADD_ELEMENT", element: frame });
    toast.success("Added Inset Frame");
  }

  // Composite preset: Top & Bottom Accent Header/Footer Bars
  function addAccentBars() {
    const barHeight = 4;
    const topBar: ShapeElement = {
      type: "rect",
      id: newElementId(),
      name: nextElementName(state.spec, "Top Accent Bar"),
      xMm: 0,
      yMm: 0,
      widthMm: widthMm,
      heightMm: barHeight,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: true,
      fill: "#0F2027",
      stroke: null,
      strokeWidthMm: 0,
    };
    const bottomBar: ShapeElement = {
      type: "rect",
      id: newElementId(),
      name: nextElementName(state.spec, "Bottom Accent Bar"),
      xMm: 0,
      yMm: Math.round((heightMm - barHeight) * 10) / 10,
      widthMm: widthMm,
      heightMm: barHeight,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: true,
      fill: "#D4AF37",
      stroke: null,
      strokeWidthMm: 0,
    };
    dispatch({ type: "ADD_ELEMENTS", elements: [topBar, bottomBar] });
    toast.success("Added Modern Accent Bars");
  }

  // Composite preset: Single Signature Line
  function addSingleSignature() {
    const yPos = Math.round(Math.min(heightMm - 35, centerY + 40));
    const width = 60;
    const line: ShapeElement = {
      type: "line",
      id: newElementId(),
      name: nextElementName(state.spec, "Signature Line"),
      xMm: Math.round((centerX - width / 2) * 10) / 10,
      yMm: yPos,
      widthMm: width,
      heightMm: 3,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      fill: null,
      stroke: "#1E293B",
      strokeWidthMm: 0.5,
    };
    const label: TextElement = {
      type: "text",
      id: newElementId(),
      name: nextElementName(state.spec, "Signature Label"),
      xMm: Math.round((centerX - width / 2) * 10) / 10,
      yMm: yPos + 4,
      widthMm: width,
      heightMm: 7,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: "Authorized Signature",
      fontFamily: "Lato",
      fontSizePt: 10,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
      color: "#475569",
      lineHeight: 1.2,
      letterSpacingMm: 0.5,
    };
    dispatch({ type: "ADD_ELEMENTS", elements: [line, label] });
    toast.success("Added Signature Block");
  }

  // Composite preset: Dual Signatures (Chairperson & Tabulator)
  function addDualSignatures() {
    const yPos = Math.round(Math.min(heightMm - 35, centerY + 40));
    const width = 55;
    const spacing = 35;
    const leftX = Math.round((centerX - width - spacing / 2) * 10) / 10;
    const rightX = Math.round((centerX + spacing / 2) * 10) / 10;

    const leftLine: ShapeElement = {
      type: "line",
      id: newElementId(),
      name: nextElementName(state.spec, "Chairperson Line"),
      xMm: leftX,
      yMm: yPos,
      widthMm: width,
      heightMm: 3,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      fill: null,
      stroke: "#1E293B",
      strokeWidthMm: 0.5,
    };
    const leftText: TextElement = {
      type: "text",
      id: newElementId(),
      name: nextElementName(state.spec, "Chairperson Label"),
      xMm: leftX,
      yMm: yPos + 4,
      widthMm: width,
      heightMm: 7,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: "Event Chairperson",
      fontFamily: "Lato",
      fontSizePt: 10,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
      color: "#475569",
      lineHeight: 1.2,
      letterSpacingMm: 0.5,
    };

    const rightLine: ShapeElement = {
      type: "line",
      id: newElementId(),
      name: nextElementName(state.spec, "Tabulator Line"),
      xMm: rightX,
      yMm: yPos,
      widthMm: width,
      heightMm: 3,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      fill: null,
      stroke: "#1E293B",
      strokeWidthMm: 0.5,
    };
    const rightText: TextElement = {
      type: "text",
      id: newElementId(),
      name: nextElementName(state.spec, "Tabulator Label"),
      xMm: rightX,
      yMm: yPos + 4,
      widthMm: width,
      heightMm: 7,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: "Chief Tabulator",
      fontFamily: "Lato",
      fontSizePt: 10,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
      color: "#475569",
      lineHeight: 1.2,
      letterSpacingMm: 0.5,
    };

    dispatch({ type: "ADD_ELEMENTS", elements: [leftLine, leftText, rightLine, rightText] });
    toast.success("Added Dual Signature Blocks");
  }

  // Composite preset: Gold Award Seal
  function addAwardSeal() {
    const size = 32;
    const sealCircle: ShapeElement = {
      type: "ellipse",
      id: newElementId(),
      name: nextElementName(state.spec, "Gold Seal Ring"),
      xMm: Math.round((centerX - size / 2) * 10) / 10,
      yMm: Math.round((centerY - size / 2) * 10) / 10,
      widthMm: size,
      heightMm: size,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      fill: "#FFFBEB",
      stroke: "#D97706",
      strokeWidthMm: 1.2,
    };
    const sealText: TextElement = {
      type: "text",
      id: newElementId(),
      name: nextElementName(state.spec, "Seal Badge Text"),
      xMm: Math.round((centerX - (size - 6) / 2) * 10) / 10,
      yMm: Math.round((centerY - 8) * 10) / 10,
      widthMm: size - 6,
      heightMm: 16,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: "OFFICIAL\nSEAL",
      fontFamily: "Crimson Text",
      fontSizePt: 9,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
      color: "#B45309",
      lineHeight: 1.1,
      letterSpacingMm: 0.8,
    };
    dispatch({ type: "ADD_ELEMENTS", elements: [sealCircle, sealText] });
    toast.success("Added Gold Award Seal");
  }

  // Recolors the current selection with a theme: text elements take the
  // primary color, shape strokes the accent, and shape fills the secondary.
  function recolorSelectionFromTheme(theme: CertificateTheme) {
    const updates = state.selection.flatMap((id) => {
      const element = state.spec.elements.find((e) => e.id === id);
      if (!element) return [];
      if (element.type === "text") return [{ id, patch: { color: theme.primary } satisfies ElementPatch }];
      if (element.type === "image") return [];
      const patch: ElementPatch = {};
      if (element.stroke !== null) patch.stroke = theme.accent;
      if (element.fill !== null) patch.fill = theme.secondary;
      return Object.keys(patch).length > 0 ? [{ id, patch }] : [];
    });
    if (updates.length === 0) return;
    dispatch({ type: "UPDATE_ELEMENTS", updates });
    toast.success(`Applied ${theme.name} colors to selection`);
  }

  function addImage(storageId: string) {    const element: ImageElement = {
      type: "image",
      id: newElementId(),
      name: nextElementName(state.spec, "Logo / Image"),
      xMm: Math.round((centerX - 20) * 10) / 10,
      yMm: Math.round((centerY - 20) * 10) / 10,
      widthMm: 40,
      heightMm: 40,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      storageId,
      fit: "contain",
    };
    dispatch({ type: "ADD_ELEMENT", element });
    toast.success("Added image to canvas");
  }

  async function uploadImage(file: File) {
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPEG, or SVG images are allowed.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Images must be 2 MB or smaller.");
      return;
    }
    setIsUploading(true);
    try {
      const url = await createUploadUrl({ orgSlug });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      const { storageId } = (await response.json()) as { storageId?: string };
      if (!storageId) throw new Error("Upload response missing storage id");
      await recordUpload({
        orgSlug,
        storageId,
        name: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      addImage(storageId);
      toast.success("Image uploaded successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!templateSearch.trim()) return templates;
    const q = templateSearch.toLowerCase();
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)),
    );
  }, [templates, templateSearch]);

  const tabButton = (value: Tab, label: string, Icon: LucideIcon) => (
    <button
      key={value}
      type="button"
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      className={
        tab === value
          ? "flex flex-col items-center gap-1 rounded-md bg-primary/10 py-1.5 text-[10px] font-semibold text-primary transition-colors"
          : "flex flex-col items-center gap-1 rounded-md py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      }
    >
      <Icon aria-hidden className="size-4" />
      <span>{label}</span>
    </button>
  );

  return (
    <aside
      className={cn("flex w-64 shrink-0 flex-col border-r border-border/60 bg-background", className)}
      aria-label="Editor palette"
    >
      {/* Tab Navigation Rail */}
      <div className="grid grid-cols-5 gap-0.5 border-b border-border/60 p-1.5 bg-muted/20">
        {tabButton("elements", "Elements", Frame)}
        {tabButton("text", "Text", Type)}
        {tabButton("themes", "Themes", PaletteIcon)}
        {tabButton("templates", "Designs", LayoutTemplate)}
        {tabButton("uploads", "Uploads", ImagePlus)}
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* TAB: ELEMENTS & CERTIFICATE FRAMES */}
        {tab === "elements" ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-[11px] font-semibold text-foreground tracking-wide uppercase mb-2">
                Decorative Frames
              </h4>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={addDoubleBorder}
                  className="flex items-center gap-3 rounded-lg border border-border/80 p-2.5 text-left hover:border-primary/60 hover:bg-muted/40 transition-all group"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-amber-600/70 bg-amber-500/10">
                    <Frame aria-hidden className="size-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold group-hover:text-primary">Classic Double Border</p>
                    <p className="text-[10px] text-muted-foreground">Outer navy + inner gold accent frame</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={addInsetFrame}
                  className="flex items-center gap-3 rounded-lg border border-border/80 p-2.5 text-left hover:border-primary/60 hover:bg-muted/40 transition-all group"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-400 bg-slate-100 dark:bg-slate-800">
                    <Square aria-hidden className="size-4 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold group-hover:text-primary">Thin Inset Frame</p>
                    <p className="text-[10px] text-muted-foreground">Clean, balanced certificate boundary</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={addAccentBars}
                  className="flex items-center gap-3 rounded-lg border border-border/80 p-2.5 text-left hover:border-primary/60 hover:bg-muted/40 transition-all group"
                >
                  <div className="flex size-9 shrink-0 flex-col items-center justify-between rounded-md bg-muted p-1">
                    <div className="h-1 w-full rounded bg-slate-900 dark:bg-slate-100" />
                    <div className="h-1 w-full rounded bg-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold group-hover:text-primary">Modern Header & Footer Bars</p>
                    <p className="text-[10px] text-muted-foreground">Dual horizontal accent bands</p>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-semibold text-foreground tracking-wide uppercase mb-2">
                Signatures & Seals
              </h4>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={addSingleSignature}
                  className="flex items-center gap-3 rounded-lg border border-border/80 p-2.5 text-left hover:border-primary/60 hover:bg-muted/40 transition-all group"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <PenTool aria-hidden className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold group-hover:text-primary">Single Signature Line</p>
                    <p className="text-[10px] text-muted-foreground">Line + Authorized Signature label</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={addDualSignatures}
                  className="flex items-center gap-3 rounded-lg border border-border/80 p-2.5 text-left hover:border-primary/60 hover:bg-muted/40 transition-all group"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <PenTool aria-hidden className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold group-hover:text-primary">Dual Signatures</p>
                    <p className="text-[10px] text-muted-foreground">Chairperson & Chief Tabulator</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={addAwardSeal}
                  className="flex items-center gap-3 rounded-lg border border-border/80 p-2.5 text-left hover:border-primary/60 hover:bg-muted/40 transition-all group"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
                    <Award aria-hidden className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold group-hover:text-primary">Official Award Seal</p>
                    <p className="text-[10px] text-muted-foreground">Gold medallion badge with inscription</p>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-semibold text-foreground tracking-wide uppercase mb-2">
                Basic Shapes
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="h-9 flex-col gap-1 py-1" onClick={() => addBasicShape("rect")}>
                  <Square aria-hidden className="size-3.5" />
                  <span className="text-[10px]">Rect</span>
                </Button>
                <Button variant="outline" size="sm" className="h-9 flex-col gap-1 py-1" onClick={() => addBasicShape("ellipse")}>
                  <Circle aria-hidden className="size-3.5" />
                  <span className="text-[10px]">Circle</span>
                </Button>
                <Button variant="outline" size="sm" className="h-9 flex-col gap-1 py-1" onClick={() => addBasicShape("line")}>
                  <Minus aria-hidden className="size-3.5" />
                  <span className="text-[10px]">Line</span>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* TAB: TEXT & DYNAMIC TOKENS */}
        {tab === "text" ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-[11px] font-semibold text-foreground tracking-wide uppercase mb-2">
                Typography Presets
              </h4>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-2 px-3 text-left"
                  onClick={() => addText("heading")}
                >
                  <div>
                    <p className="font-serif text-sm font-bold tracking-wide text-foreground">Certificate Title</p>
                    <p className="text-[10px] text-muted-foreground">Crimson Text • 28pt Bold</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-2 px-3 text-left"
                  onClick={() => addText("subheading")}
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Award Subheading</p>
                    <p className="text-[10px] text-muted-foreground">Lato • 13pt Bold</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-2 px-3 text-left"
                  onClick={() => addText("scriptName")}
                >
                  <div>
                    <p style={{ fontFamily: "'Great Vibes', cursive" }} className="text-lg text-primary">
                      Recipient Script Name
                    </p>
                    <p className="text-[10px] text-muted-foreground">Great Vibes • 46pt</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-2 px-3 text-left"
                  onClick={() => addText("body")}
                >
                  <div>
                    <p className="text-xs text-foreground">Citation & Body Text</p>
                    <p className="text-[10px] text-muted-foreground">Lato • 11pt Regular</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-2 px-3 text-left"
                  onClick={() => addText("finePrint")}
                >
                  <div>
                    <p className="text-[11px] text-muted-foreground">Fine Print / Authority</p>
                    <p className="text-[10px] text-muted-foreground">Lato • 8pt</p>
                  </div>
                </Button>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Tag aria-hidden className="size-3.5 text-primary" />
                <h4 className="text-[11px] font-semibold text-foreground tracking-wide uppercase">
                  1-Click Tabulation Fields
                </h4>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2.5">
                Insert real competition data fields that auto-populate per recipient:
              </p>
              <div className="space-y-1.5">
                {TOKEN_PRESETS.map((t) => (
                  <button
                    key={t.token}
                    type="button"
                    onClick={() => addTokenField(t)}
                    className="flex w-full items-center justify-between rounded-lg border border-border/70 p-2 text-left hover:border-primary/60 hover:bg-primary/5 transition-all group"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-medium text-foreground group-hover:text-primary truncate">
                        {t.label}
                      </p>
                      <code className="text-[10px] text-muted-foreground">{`{{${t.token}}}`}</code>
                    </div>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      + Add
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* TAB: THEMES & CURATED COLORS */}
        {tab === "themes" ? (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles aria-hidden className="size-3.5 text-amber-500" />
                <h4 className="text-[11px] font-semibold text-foreground tracking-wide uppercase">
                  Certificate Themes
                </h4>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Curated color harmonies designed for certificates and diplomas:
              </p>

              <div className="space-y-3">
                {CERTIFICATE_THEMES.map((theme) => (
                  <div
                    key={theme.name}
                    className="rounded-lg border border-border/80 bg-muted/20 p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{theme.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                        {theme.tag}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        className="size-6 rounded border border-border/60 shadow-2xs"
                        style={{ backgroundColor: theme.background }}
                        title={`Background: ${theme.background}`}
                      />
                      <div
                        className="size-6 rounded border border-border/60 shadow-2xs"
                        style={{ backgroundColor: theme.primary }}
                        title={`Primary: ${theme.primary}`}
                      />
                      <div
                        className="size-6 rounded border border-border/60 shadow-2xs"
                        style={{ backgroundColor: theme.accent }}
                        title={`Accent: ${theme.accent}`}
                      />
                      <div
                        className="size-6 rounded border border-border/60 shadow-2xs"
                        style={{ backgroundColor: theme.secondary }}
                        title={`Secondary: ${theme.secondary}`}
                      />
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="secondary"
                          size="xs"
                          className="text-[10px]"
                          disabled={state.selection.length === 0}
                          onClick={() => recolorSelectionFromTheme(theme)}
                          title="Apply to selected elements: text color ← primary, shape stroke ← accent, shape fill ← secondary"
                        >
                          Recolor
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          className="text-[10px]"
                          onClick={() => {
                            dispatch({
                              type: "SET_PAGE",
                              patch: { background: theme.background },
                            });
                            toast.success(`Applied ${theme.name} background`);
                          }}
                        >
                          Apply BG
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
                      <span>Click to copy:</span>
                      {[theme.primary, theme.accent, theme.secondary, theme.background].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(hex);
                            setCopiedColor(hex);
                            setTimeout(() => setCopiedColor(null), 1500);
                            toast.success(`Copied ${hex}`);
                          }}
                          className="inline-flex items-center gap-1 rounded bg-background px-1.5 py-0.5 border border-border/70 font-mono hover:border-primary transition-colors"
                        >
                          <span className="size-2 rounded-full" style={{ backgroundColor: hex }} />
                          {hex}
                          {copiedColor === hex ? <Check className="size-2.5 text-emerald-500" /> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* TAB: DESIGNS / TEMPLATES */}
        {tab === "templates" ? (
          <div className="space-y-3">
            <div className="relative">
              <Search aria-hidden className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search designs…"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {templates === undefined ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Loading template library…</p>
            ) : filteredTemplates.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No matching templates found.</p>
            ) : (
              <div className="space-y-3">
                {filteredTemplates.map((t) => (
                  <button
                    key={t._id}
                    type="button"
                    onClick={() => openApplyTemplateDialog(t)}
                    className="w-full rounded-lg border border-border/80 bg-card p-2 text-left hover:border-primary/60 hover:shadow-xs transition-all group"
                  >
                    {isDocumentSpec(t.spec) ? (
                      <div className="mb-2 flex justify-center overflow-hidden rounded bg-muted/30 p-2">
                        <SpecThumbnail spec={t.spec} widthPx={180} />
                      </div>
                    ) : null}
                    <div className="font-semibold text-xs text-foreground group-hover:text-primary">
                      {t.name}
                    </div>
                    {t.description ? (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                        {t.description}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* TAB: UPLOADS & LOGOS */}
        {tab === "uploads" ? (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_UPLOAD_TYPES.join(",")}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
                event.target.value = "";
              }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-4 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-all"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ImagePlus aria-hidden className="size-4" />
              </div>
              <p className="text-xs font-semibold text-foreground">
                {isUploading ? "Uploading file…" : "Click to upload image"}
              </p>
              <p className="text-[10px] text-muted-foreground">PNG, JPEG, or SVG up to 2 MB</p>
            </div>

            {orgAssets === undefined ? (
              <p className="text-xs text-muted-foreground text-center py-2">Loading asset registry…</p>
            ) : orgAssets.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                No uploaded assets yet. Upload organization logos, medals, or sponsor graphics.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
                  Saved Assets ({orgAssets.length})
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {orgAssets.map((asset) => {
                    const thumbnailUrl = orgAssetUrls?.[asset.storageId] ?? imageUrls[asset.storageId];
                    return (
                      <button
                        key={asset._id}
                        type="button"
                        className="group flex flex-col items-center rounded-lg border border-border/80 bg-card p-2 text-center hover:border-primary/60 hover:shadow-2xs transition-all"
                        onClick={() => addImage(asset.storageId)}
                      >
                        <div className="flex size-14 items-center justify-center rounded bg-muted/40 p-1 mb-1">
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt=""
                              className="size-full object-contain"
                            />
                          ) : (
                            <ImagePlus className="size-5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="w-full truncate text-[10px] font-medium text-foreground group-hover:text-primary">
                          {asset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Template replacement confirmation dialog */}
      <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Design Template?</DialogTitle>
            <DialogDescription>
              Applying “{pendingTemplate?.name}” will replace your current canvas elements and initialize a new layout. Unsaved manual elements will be cleared.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPendingTemplate(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingTemplate) dispatch({ type: "LOAD_SPEC", spec: pendingTemplate.spec });
                setPendingTemplate(null);
                toast.success(`Loaded "${pendingTemplate?.name}" design`);
              }}
            >
              Apply Design
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
