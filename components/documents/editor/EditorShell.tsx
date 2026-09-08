"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQuery_experimental } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DocumentSpec } from "@/convex/documents/spec";
import { isDocumentSpec, resolvePageSize } from "@/convex/documents/spec";
import { useEditorState, type ElementPatch } from "@/lib/documents/editorState";
import { sampleTokenMap } from "@/lib/documents/tokens";
import { renderPdfBlob } from "@/lib/documents/renderPdf";
import { downloadBlobFile } from "@/lib/download";
import type { SaveState } from "@/components/tabulation/SaveIndicator";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Copy,
  FileText,
  Keyboard,
  Layers,
  Maximize,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { PageSetupPanel } from "./PageSetupPanel";
import { Palette } from "./Palette";
import { Toolbar } from "./Toolbar";
import { TruePreview } from "./TruePreview";
import { ShortcutsDialog } from "./ShortcutsDialog";

const AUTOSAVE_DELAY_MS = 1000;

export interface EditorShellProps {
  orgSlug: string;
  templateId: Id<"documentTemplates">;
}

type RightTab = "inspector" | "page" | "layers";
type MobileSheet = "palette" | "inspector" | "page" | "layers" | null;

const EMPTY_SPEC: DocumentSpec = {
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
      id: "seed-title",
      name: "Heading",
      xMm: 15,
      yMm: 60,
      widthMm: 180,
      heightMm: 16,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: "CERTIFICATE",
      fontFamily: "Crimson Text",
      fontSizePt: 32,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
      color: "#1F3A5F",
      lineHeight: 1.3,
      letterSpacingMm: 2,
    },
  ],
};

function StudioSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-background animate-pulse overflow-hidden">
      {/* Header skeleton */}
      <div className="flex h-14 items-center justify-between border-b border-border/60 px-4 bg-card/60">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-md bg-muted" />
          <div className="h-5 w-48 rounded bg-muted" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 rounded bg-muted" />
          <div className="h-8 w-28 rounded bg-muted" />
        </div>
      </div>
      {/* Workspace skeleton */}
      <div className="flex flex-1 min-h-0">
        <div className="w-64 border-r border-border/60 bg-muted/20 p-3 space-y-3">
          <div className="h-8 w-full rounded bg-muted" />
          <div className="space-y-2 pt-2">
            <div className="h-14 w-full rounded bg-muted" />
            <div className="h-14 w-full rounded bg-muted" />
            <div className="h-14 w-full rounded bg-muted" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-muted/30 p-10">
          <div className="h-[75%] aspect-4/3 rounded bg-card border border-border/60 shadow-lg" />
        </div>
        <div className="w-72 border-l border-border/60 bg-muted/20 p-3 space-y-3">
          <div className="h-8 w-full rounded bg-muted" />
          <div className="space-y-2 pt-2">
            <div className="h-24 w-full rounded bg-muted" />
            <div className="h-28 w-full rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateNotAvailable({ orgSlug }: { orgSlug: string }) {
  return (
    <div className="grid h-dvh place-items-center bg-muted/10 p-4">
      <div className="max-w-md w-full rounded-xl border border-border/80 bg-card p-6 text-center space-y-4 shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">Template Not Available</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This document template could not be loaded. It may have been deleted, moved, or you might not have access permissions.
          </p>
        </div>
        <div className="pt-2 flex justify-center gap-2">
          <Link href={`/app/${orgSlug}/documents`}>
            <Button variant="default" size="sm">
              Return to Documents
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function EditorShell({ orgSlug, templateId }: EditorShellProps) {
  const templateQuery = useQuery_experimental({
    query: api.documents.templates.get,
    args: { orgSlug, templateId },
  });
  const template = templateQuery.status === "success" ? templateQuery.data : undefined;
  const updateTemplate = useMutation(api.documents.templates.update);
  const { state, dispatch, canUndo, canRedo } = useEditorState(EMPTY_SPEC);

  const [zoom, setZoom] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showMargins, setShowMargins] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("inspector");
  // Tracks the previous selection to auto-switch to the inspector tab without
  // a setState-in-effect cascade (React's "adjust state during render" pattern).
  const [prevSelection, setPrevSelection] = useState(state.selection);
  if (prevSelection !== state.selection) {
    setPrevSelection(state.selection);
    if (state.selection.length > 0) {
      setRightTab("inspector");
    }
  }
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [name, setName] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const lastSavedSpecRef = useRef("");
  const dirtyRef = useRef(false);
  const pendingSpecRef = useRef<string | null>(null);

  const displayName = name ?? template?.name ?? "";
  const sampleTokens = useMemo(() => sampleTokenMap(), []);
  const { widthMm, heightMm } = useMemo(() => resolvePageSize(state.spec.page), [state.spec.page]);

  const selectedElements = useMemo(
    () => state.spec.elements.filter((e) => state.selection.includes(e.id)),
    [state.spec.elements, state.selection],
  );
  const singleSelected = selectedElements.length === 1 ? selectedElements[0] : null;

  const storageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const element of state.spec.elements) {
      if (element.type === "image") ids.add(element.storageId);
    }
    return [...ids];
  }, [state.spec.elements]);

  const assetUrls = useQuery(
    api.documents.assets.assetUrls,
    storageIds.length > 0 ? { orgSlug, storageIds } : "skip",
  );

  const imageUrls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [storageId, url] of Object.entries(assetUrls ?? {})) {
      if (url) map[storageId] = url;
    }
    return map;
  }, [assetUrls]);

  const save = useCallback(
    async (spec: DocumentSpec, nameValue: string) => {
      const serialized = JSON.stringify(spec);
      setSaveState("saving");
      pendingSpecRef.current = serialized;
      try {
        const result = await updateTemplate({
          orgSlug,
          templateId,
          spec,
          ...(nameValue ? { name: nameValue } : {}),
        });
        lastSavedSpecRef.current = serialized;
        const isLatestAttempt = pendingSpecRef.current === serialized;
        if (isLatestAttempt) {
          pendingSpecRef.current = null;
          dirtyRef.current = false;
          setSavedAt(result.updatedAt);
          setSaveState("saved");
        }
      } catch (error) {
        if (pendingSpecRef.current === serialized) {
          pendingSpecRef.current = null;
        }
        const specPersisted = lastSavedSpecRef.current === serialized;
        dirtyRef.current = !specPersisted;
        setSaveState(specPersisted ? "saved" : "error");
        toast.error(
          error instanceof Error ? error.message : "Autosave failed. Changes are kept locally.",
        );
      }
    },
    [orgSlug, templateId, updateTemplate],
  );

  useEffect(() => {
    if (!template || lastSavedSpecRef.current !== "" || !isDocumentSpec(template.spec)) return;
    dispatch({ type: "LOAD_SPEC", spec: template.spec });
    lastSavedSpecRef.current = JSON.stringify(template.spec);
    setHydrated(true);
  }, [template, dispatch]);

  useEffect(() => {
    if (!hydrated) return;
    if (lastSavedSpecRef.current === JSON.stringify(state.spec)) return;
    dirtyRef.current = true;
    setSaveState("dirty");
    const timer = setTimeout(() => {
      void save(state.spec, displayName);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hydrated, state.spec, displayName, save]);

  useEffect(() => {
    if (!template || !hydrated || dirtyRef.current || pendingSpecRef.current !== null) return;
    if (JSON.stringify(template.spec) !== lastSavedSpecRef.current) {
      toast.warning("This template was changed elsewhere. Reload to see the latest version.");
    }
  }, [template, hydrated]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileSheet !== null) {
        event.preventDefault();
        setMobileSheet(null);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirtyRef.current) void save(state.spec, displayName);
      }
      if (event.key === "?" && !event.ctrlKey && !event.metaKey && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayName, mobileSheet, save, state.spec]);

  const fitToScreen = useCallback(() => {
    setFitRequest((count) => count + 1);
  }, []);

  const downloadSample = useCallback(async () => {
    try {
      const blob = await renderPdfBlob([{ spec: state.spec, tokens: sampleTokens }], imageUrls);
      downloadBlobFile(`${displayName || "certificate"}.pdf`, blob);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not render the PDF.");
    }
  }, [displayName, imageUrls, sampleTokens, state.spec]);

  function centerSelectionOnPage(axis: "h" | "v") {
    const updates = selectedElements.map((element) => {
      const patch: ElementPatch = {};
      if (axis === "h") {
        patch.xMm = Math.round(((widthMm - element.widthMm) / 2) * 10) / 10;
      } else {
        patch.yMm = Math.round(((heightMm - element.heightMm) / 2) * 10) / 10;
      }
      return { id: element.id, patch };
    });
    dispatch({ type: "UPDATE_ELEMENTS", updates });
    toast.success("Centered on page");
  }

  if (templateQuery.status === "error") {
    return <TemplateNotAvailable orgSlug={orgSlug} />;
  }
  if (template === undefined) {
    return <StudioSkeleton />;
  }
  if (template.isSystem || !isDocumentSpec(template.spec)) {
    return <TemplateNotAvailable orgSlug={orgSlug} />;
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground select-none">
      {/* Top Application Toolbar */}
      <Toolbar
        templateName={displayName}
        onNameChange={(value) => {
          setName(value);
          void save(state.spec, value);
        }}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => dispatch({ type: "UNDO" })}
        onRedo={() => dispatch({ type: "REDO" })}
        zoom={zoom}
        onZoomChange={setZoom}
        onFit={fitToScreen}
        gridEnabled={gridEnabled}
        snapEnabled={snapEnabled}
        onToggleGrid={() => setGridEnabled((value) => !value)}
        onToggleSnap={() => setSnapEnabled((value) => !value)}
        showMargins={showMargins}
        onToggleMargins={() => setShowMargins((value) => !value)}
        saveState={saveState}
        savedAt={savedAt}
        onRetrySave={() => void save(state.spec, displayName)}
        onPreview={() => setPreviewOpen(true)}
        onDownloadSample={() => void downloadSample()}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        backHref={`/app/${orgSlug}/documents`}
      />

      {/* Main Studio Body: Palette, Canvas, Panels */}
      <div className="flex min-h-0 flex-1 relative overflow-hidden">
        {/* Collapsible Left Palette (Desktop docked) */}
        {!leftPanelCollapsed ? (
          <div className="hidden lg:flex shrink-0">
            <Palette
              orgSlug={orgSlug}
              state={state}
              dispatch={dispatch}
              imageUrls={imageUrls}
            />
          </div>
        ) : null}

        {/* Central Interactive Design Canvas */}
        <Canvas
          state={state}
          dispatch={dispatch}
          zoom={zoom}
          gridEnabled={gridEnabled}
          snapEnabled={snapEnabled}
          showMargins={showMargins}
          tokens={sampleTokens}
          imageUrls={imageUrls}
          fitRequest={fitRequest}
          onZoomChange={setZoom}
        />

        {/* Collapsible Right Properties Panel (Desktop docked) */}
        {!rightPanelCollapsed ? (
          <div className="hidden lg:flex w-72 shrink-0 flex-col border-l border-border/60 bg-background z-10">
            {/* Smart Tab Switcher */}
            <div className="grid grid-cols-3 border-b border-border/60 p-1 bg-muted/20" role="tablist" aria-label="Editor panels">
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === "inspector"}
                onClick={() => setRightTab("inspector")}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                  rightTab === "inspector"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <SlidersHorizontal className="size-3" />
                <span>Inspect</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === "page"}
                onClick={() => setRightTab("page")}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                  rightTab === "page"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="size-3" />
                <span>Page</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === "layers"}
                onClick={() => setRightTab("layers")}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                  rightTab === "layers"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="size-3" />
                <span>Layers</span>
              </button>
            </div>

            {/* Panel Content Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {rightTab === "inspector" ? (
                <Inspector state={state} dispatch={dispatch} />
              ) : rightTab === "page" ? (
                <PageSetupPanel state={state} dispatch={dispatch} />
              ) : (
                <LayersPanel state={state} dispatch={dispatch} />
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Floating Mobile/Tablet Quick Action Pill when elements are selected */}
      {selectedElements.length > 0 && mobileSheet === null ? (
        <div className="fixed bottom-16 inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-25 flex items-center justify-between sm:justify-center gap-1 p-1 sm:px-2.5 bg-card/95 backdrop-blur-md border border-border/80 rounded-xl sm:rounded-full shadow-lg lg:hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-1.5 pl-1.5 pr-1 min-w-0">
            <span className="size-1.5 rounded-full bg-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate max-w-[90px] sm:max-w-[130px]">
              {singleSelected ? singleSelected.name : `${selectedElements.length} items`}
            </span>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <Button
              variant="secondary"
              size="xs"
              className="h-7 text-xs gap-1 px-2 font-medium"
              onClick={() => setMobileSheet("inspector")}
            >
              <SlidersHorizontal className="size-3.5 text-primary" />
              <span>Inspect</span>
            </Button>

            <Button
              variant="ghost"
              size="xs"
              className="h-7 text-xs gap-1 px-1.5"
              onClick={() => centerSelectionOnPage("h")}
              title="Center Horizontally"
            >
              <AlignHorizontalDistributeCenter className="size-3.5" />
              <span className="hidden sm:inline">Center X</span>
            </Button>

            <Button
              variant="ghost"
              size="xs"
              className="h-7 text-xs gap-1 px-1.5"
              onClick={() => centerSelectionOnPage("v")}
              title="Center Vertically"
            >
              <AlignVerticalDistributeCenter className="size-3.5" />
              <span className="hidden sm:inline">Center Y</span>
            </Button>

            <Button
              variant="ghost"
              size="xs"
              className="h-7 text-xs gap-1 px-1.5"
              onClick={() => dispatch({ type: "DUPLICATE_SELECTED" })}
              title="Duplicate"
            >
              <Copy className="size-3.5" />
              <span className="hidden sm:inline">Copy</span>
            </Button>

            <Button
              variant="ghost"
              size="xs"
              className="h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => dispatch({ type: "DELETE_SELECTED" })}
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon-xs"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => dispatch({ type: "SET_SELECTION", ids: [] })}
              title="Deselect"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Desktop Bottom Studio Status & Precision Telemetry Bar */}
      <footer className="hidden lg:flex h-8 shrink-0 items-center justify-between border-t border-border/60 bg-card/90 backdrop-blur-xs px-3 text-[11px] text-muted-foreground z-20">
        {/* Left: Selection telemetry and dimensions */}
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setLeftPanelCollapsed((v) => !v)}
            title={leftPanelCollapsed ? "Show Elements Palette" : "Hide Elements Palette"}
            className="text-muted-foreground hover:text-foreground"
          >
            {leftPanelCollapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
          </Button>

          <span className="h-3.5 w-px bg-border/60" aria-hidden />

          {singleSelected ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-foreground truncate">{singleSelected.name}</span>
              <span className="font-mono text-[10px]">
                {Math.round(singleSelected.widthMm)} × {Math.round(singleSelected.heightMm)} mm
              </span>
              <span className="text-muted-foreground font-mono text-[10px]">
                (X: {Math.round(singleSelected.xMm)}, Y: {Math.round(singleSelected.yMm)})
              </span>
            </div>
          ) : selectedElements.length > 1 ? (
            <div className="flex items-center gap-1.5 text-foreground font-medium">
              <span className="size-1.5 rounded-full bg-primary" />
              <span>{selectedElements.length} elements selected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Canvas:</span>
              <span>{state.spec.page.preset} ({widthMm} × {heightMm} mm)</span>
              <span>• {state.spec.elements.length} elements</span>
            </div>
          )}
        </div>

        {/* Center: Quick Page Centering Actions when element is selected */}
        {selectedElements.length > 0 ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              className="h-5 text-[10px] gap-1 px-1.5"
              onClick={() => centerSelectionOnPage("h")}
              title="Center selected on Page Horizontally"
            >
              <AlignHorizontalDistributeCenter className="size-3" />
              Center Page X
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="h-5 text-[10px] gap-1 px-1.5"
              onClick={() => centerSelectionOnPage("v")}
              title="Center selected on Page Vertically"
            >
              <AlignVerticalDistributeCenter className="size-3" />
              Center Page Y
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="h-5 text-[10px] gap-1 px-1.5"
              onClick={() => dispatch({ type: "DUPLICATE_SELECTED" })}
              title="Duplicate (Ctrl+D)"
            >
              <Copy className="size-3" />
              Duplicate
            </Button>
          </div>
        ) : null}

        {/* Right: Quick Zoom, Shortcuts & Panel Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Keyboard className="size-3" />
            <span className="hidden sm:inline">Shortcuts</span>
            <kbd className="rounded border border-border/80 bg-muted px-1 font-mono text-[9px]">?</kbd>
          </button>

          <span className="h-3.5 w-px bg-border/60" aria-hidden />

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={fitToScreen}
            title="Fit to screen"
            className="text-muted-foreground hover:text-foreground"
          >
            <Maximize className="size-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setRightPanelCollapsed((v) => !v)}
            title={rightPanelCollapsed ? "Show Properties Panel" : "Hide Properties Panel"}
            className="text-muted-foreground hover:text-foreground"
          >
            {rightPanelCollapsed ? <PanelRightOpen className="size-3.5" /> : <PanelRightClose className="size-3.5" />}
          </Button>
        </div>
      </footer>

      {/* Mobile/Tablet Bottom Navigation Bar */}
      <nav
        aria-label="Mobile studio navigation"
        className="flex lg:hidden h-14 shrink-0 items-center justify-around border-t border-border/60 bg-card/95 backdrop-blur-md px-1 z-20"
      >
        {/* 1. Add elements */}
        <button
          type="button"
          onClick={() => setMobileSheet((s) => (s === "palette" ? null : "palette"))}
          className={cn(
            "flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[54px] rounded-lg py-1 px-2 text-xs font-medium transition-colors",
            mobileSheet === "palette"
              ? "bg-primary/10 text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground active:bg-muted/40",
          )}
        >
          <Plus className="size-4" />
          <span className="text-[10px]">Add</span>
        </button>

        {/* 2. Layers */}
        <button
          type="button"
          onClick={() => setMobileSheet((s) => (s === "layers" ? null : "layers"))}
          className={cn(
            "relative flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[54px] rounded-lg py-1 px-2 text-xs font-medium transition-colors",
            mobileSheet === "layers"
              ? "bg-primary/10 text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground active:bg-muted/40",
          )}
        >
          <div className="relative">
            <Layers className="size-4" />
            {state.spec.elements.length > 0 ? (
              <span className="absolute -top-1.5 -right-2 flex size-3.5 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-bold text-primary-foreground">
                {state.spec.elements.length}
              </span>
            ) : null}
          </div>
          <span className="text-[10px]">Layers</span>
        </button>

        {/* 3. Inspect */}
        <button
          type="button"
          onClick={() => setMobileSheet((s) => (s === "inspector" ? null : "inspector"))}
          className={cn(
            "relative flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[54px] rounded-lg py-1 px-2 text-xs font-medium transition-colors",
            mobileSheet === "inspector"
              ? "bg-primary/10 text-primary font-semibold"
              : selectedElements.length > 0
              ? "text-primary hover:text-primary active:bg-muted/40"
              : "text-muted-foreground hover:text-foreground active:bg-muted/40",
          )}
        >
          <div className="relative">
            <SlidersHorizontal className="size-4" />
            {selectedElements.length > 0 ? (
              <span className="absolute -top-1 -right-1.5 size-2 rounded-full bg-primary" />
            ) : null}
          </div>
          <span className="text-[10px]">Inspect</span>
        </button>

        {/* 4. Page Setup */}
        <button
          type="button"
          onClick={() => setMobileSheet((s) => (s === "page" ? null : "page"))}
          className={cn(
            "flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[54px] rounded-lg py-1 px-2 text-xs font-medium transition-colors",
            mobileSheet === "page"
              ? "bg-primary/10 text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground active:bg-muted/40",
          )}
        >
          <FileText className="size-4" />
          <span className="text-[10px]">Page</span>
        </button>

        {/* 5. Fit Screen */}
        <button
          type="button"
          onClick={fitToScreen}
          className="flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[54px] rounded-lg py-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground active:bg-muted/40 transition-colors"
        >
          <Maximize className="size-4" />
          <span className="text-[10px]">Fit</span>
        </button>
      </nav>

      {/* Mobile Bottom Sheet Drawer for Palette / Inspector / Page / Layers */}
      {mobileSheet !== null ? (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-2xs z-40 lg:hidden animate-in fade-in duration-200"
            onClick={() => setMobileSheet(null)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              mobileSheet === "palette"
                ? "Add Elements Palette"
                : mobileSheet === "inspector"
                ? "Element Inspector"
                : mobileSheet === "page"
                ? "Page Setup"
                : "Canvas Layers"
            }
            className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-3 sm:w-[540px] z-50 flex flex-col bg-background border border-border/80 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[82dvh] lg:hidden animate-in slide-in-from-bottom duration-250 ease-out"
          >
            {/* Touch drag pill handle */}
            <div className="mx-auto my-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden" />

            {/* Sheet header */}
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 px-4">
              <div className="flex items-center gap-2">
                {mobileSheet === "palette" ? (
                  <>
                    <Plus className="size-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Add to Certificate</span>
                  </>
                ) : mobileSheet === "inspector" ? (
                  <>
                    <SlidersHorizontal className="size-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      {singleSelected
                        ? `Inspect: ${singleSelected.name}`
                        : selectedElements.length > 1
                        ? `Inspect (${selectedElements.length} items)`
                        : "Element Properties"}
                    </span>
                  </>
                ) : mobileSheet === "page" ? (
                  <>
                    <FileText className="size-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Page & Certificate Setup</span>
                  </>
                ) : (
                  <>
                    <Layers className="size-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      Canvas Layers ({state.spec.elements.length})
                    </span>
                  </>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setMobileSheet(null)}
                aria-label="Close panel"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Sheet scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 overscroll-contain">
              {mobileSheet === "palette" ? (
                <Palette
                  orgSlug={orgSlug}
                  state={state}
                  dispatch={dispatch}
                  imageUrls={imageUrls}
                  className="w-full border-r-0 h-auto"
                />
              ) : mobileSheet === "inspector" ? (
                <Inspector state={state} dispatch={dispatch} />
              ) : mobileSheet === "page" ? (
                <PageSetupPanel state={state} dispatch={dispatch} />
              ) : (
                <LayersPanel state={state} dispatch={dispatch} />
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* Modals: True PDF Preview & Shortcuts Cheat Sheet */}
      <TruePreview open={previewOpen} onOpenChange={setPreviewOpen} spec={state.spec} imageUrls={imageUrls} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
