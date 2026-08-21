"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Circle, ImagePlus, LayoutTemplate, Minus, Square, Type, type LucideIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { DocumentSpec, ImageElement, ShapeElement, TextElement } from "@/convex/documents/spec";
import { isDocumentSpec, resolvePageSize } from "@/convex/documents/spec";
import { ensureEditorFontsLoaded, storageIdFromUploadUrl } from "@/lib/documents/fonts";
import { newElementId, nextElementName, type EditorAction, type EditorState } from "@/lib/documents/editorState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/svg+xml"];

type TextPreset = "heading" | "subheading" | "body" | "scriptName";

interface TextPresetSpec {
  baseName: string;
  content: string;
  fontFamily: TextElement["fontFamily"];
  fontSizePt: number;
  bold: boolean;
  heightMm: number;
}

const TEXT_PRESETS: Record<TextPreset, TextPresetSpec> = {
  heading: {
    baseName: "Heading",
    content: "Heading",
    fontFamily: "Crimson Text",
    fontSizePt: 30,
    bold: true,
    heightMm: 14,
  },
  subheading: {
    baseName: "Subheading",
    content: "Subheading",
    fontFamily: "Lato",
    fontSizePt: 16,
    bold: true,
    heightMm: 9,
  },
  body: {
    baseName: "Body",
    content: "Body",
    fontFamily: "Lato",
    fontSizePt: 12,
    bold: false,
    heightMm: 7,
  },
  scriptName: {
    baseName: "Name",
    content: "{{recipient.name}}",
    fontFamily: "Great Vibes",
    fontSizePt: 48,
    bold: false,
    heightMm: 24,
  },
};

const SHAPE_DEFAULTS = {
  rect: { baseName: "Rectangle", widthMm: 40, heightMm: 40 },
  ellipse: { baseName: "Ellipse", widthMm: 40, heightMm: 40 },
  line: { baseName: "Line", widthMm: 60, heightMm: 4 },
} as const satisfies Record<ShapeElement["type"], { baseName: string; widthMm: number; heightMm: number }>;

export interface PaletteProps {
  orgSlug: string;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  imageUrls: Record<string, string>;
}

type Tab = "templates" | "elements" | "text" | "uploads";

export function Palette({ orgSlug, state, dispatch, imageUrls }: PaletteProps) {
  const [tab, setTab] = useState<Tab>("elements");
  const [pendingTemplate, setPendingTemplate] = useState<{ name: string; spec: DocumentSpec } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const templates = useQuery(api.documents.templates.list, { orgSlug, kind: "certificate" });
  const orgAssets = useQuery(api.documents.assets.listByOrg, { orgSlug });
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
    const element: TextElement = {
      type: "text",
      id: newElementId(),
      name: nextElementName(state.spec, config.baseName),
      xMm: centerX - 45,
      yMm: centerY - config.heightMm / 2,
      widthMm: 90,
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
      color: "#333333",
      lineHeight: 1.3,
      letterSpacingMm: 0,
    };
    dispatch({ type: "ADD_ELEMENT", element });
  }

  function addShape(kind: ShapeElement["type"]) {
    const config = SHAPE_DEFAULTS[kind];
    const element: ShapeElement = {
      type: kind,
      id: newElementId(),
      name: nextElementName(state.spec, config.baseName),
      xMm: centerX - config.widthMm / 2,
      yMm: centerY - config.heightMm / 2,
      widthMm: config.widthMm,
      heightMm: config.heightMm,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      fill: null,
      stroke: "#555555",
      strokeWidthMm: 0.5,
    };
    dispatch({ type: "ADD_ELEMENT", element });
  }

  function addImage(storageId: string) {
    const element: ImageElement = {
      type: "image",
      id: newElementId(),
      name: nextElementName(state.spec, "Image"),
      xMm: centerX - 20,
      yMm: centerY - 20,
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
      // generateUploadUrl returns the upload URL string directly.
      const url = await createUploadUrl({ orgSlug });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      const storageId = storageIdFromUploadUrl(url);
      await recordUpload({
        orgSlug,
        storageId,
        name: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      addImage(storageId);
      toast.success("Image uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  const tabButton = (value: Tab, label: string, Icon: LucideIcon) => (
    <button
      key={value}
      type="button"
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      className={
        tab === value
          ? "flex flex-col items-center gap-1 rounded-lg bg-sidebar-accent px-2 py-1.5 text-[10px] font-semibold text-sidebar-accent-foreground"
          : "flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground hover:bg-sidebar-accent/50"
      }
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-background" aria-label="Editor palette">
      <div className="grid grid-cols-4 gap-1 border-b border-border/60 p-2">
        {tabButton("templates", "Designs", LayoutTemplate)}
        {tabButton("elements", "Elements", Square)}
        {tabButton("text", "Text", Type)}
        {tabButton("uploads", "Uploads", ImagePlus)}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "templates" ? (
          templates === undefined ? (
            <p className="text-xs text-muted-foreground">Loading designs…</p>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No designs available yet.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template._id}
                  type="button"
                  className="w-full rounded-lg border border-border p-3 text-left text-xs hover:border-primary/60 hover:bg-muted/50"
                  onClick={() => openApplyTemplateDialog(template)}
                >
                  <div className="font-semibold">{template.name}</div>
                  <div className="text-muted-foreground">{template.description}</div>
                </button>
              ))}
            </div>
          )
        ) : null}

        {tab === "elements" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => addShape("rect")}>
              <Square aria-hidden className="size-4" /> Rectangle
            </Button>
            <Button variant="outline" size="sm" onClick={() => addShape("ellipse")}>
              <Circle aria-hidden className="size-4" /> Ellipse
            </Button>
            <Button variant="outline" size="sm" onClick={() => addShape("line")}>
              <Minus aria-hidden className="size-4" /> Line
            </Button>
          </div>
        ) : null}

        {tab === "text" ? (
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => addText("heading")}>
              <span style={{ fontFamily: "'Crimson Text', serif", fontWeight: 700 }}>Add a heading</span>
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addText("subheading")}>
              <span style={{ fontWeight: 700 }}>Add a subheading</span>
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addText("body")}>
              Add body text
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addText("scriptName")}>
              <span style={{ fontFamily: "'Great Vibes', cursive", fontSize: 16 }}>Add recipient name</span>
            </Button>
          </div>
        ) : null}

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
            <Button className="w-full" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
              <ImagePlus aria-hidden className="size-4" />
              {isUploading ? "Uploading…" : "Upload image"}
            </Button>
            <p className="text-[11px] text-muted-foreground">PNG, JPEG, or SVG up to 2 MB.</p>
            {orgAssets === undefined ? (
              <p className="text-xs text-muted-foreground">Loading uploads…</p>
            ) : orgAssets.length === 0 ? (
              <p className="text-xs text-muted-foreground">Uploaded images will appear here.</p>
            ) : (
              <div className="space-y-2">
                {orgAssets.map((asset) => (
                  <button
                    key={asset._id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-xs hover:border-primary/60"
                    onClick={() => addImage(asset.storageId)}
                  >
                    {imageUrls[asset.storageId] ? (
                      <img
                        src={imageUrls[asset.storageId]}
                        alt=""
                        className="size-10 rounded object-contain"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply this design?</DialogTitle>
            <DialogDescription>
              Applying “{pendingTemplate?.name}” replaces the current layout and clears the undo history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingTemplate(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingTemplate) dispatch({ type: "LOAD_SPEC", spec: pendingTemplate.spec });
                setPendingTemplate(null);
              }}
            >
              Apply design
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
