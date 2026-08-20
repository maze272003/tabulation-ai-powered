"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQuery_experimental } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DocumentSpec } from "@/convex/documents/spec";
import { isDocumentSpec } from "@/convex/documents/spec";
import { useEditorState } from "@/lib/documents/editorState";
import { sampleTokenMap } from "@/lib/documents/tokens";
import { renderPdfBlob } from "@/lib/documents/renderPdf";
import { downloadBlobFile } from "@/lib/download";
import type { SaveState } from "@/components/tabulation/SaveIndicator";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { PageSetupPanel } from "./PageSetupPanel";
import { Palette } from "./Palette";
import { Toolbar } from "./Toolbar";
import { TruePreview } from "./TruePreview";

const AUTOSAVE_DELAY_MS = 1000;

export interface EditorShellProps {
  orgSlug: string;
  templateId: Id<"documentTemplates">;
}

type RightTab = "design" | "layers";

interface SessionUpload {
  storageId: string;
  name: string;
}

// Initial reducer state only; LOAD_SPEC replaces it the first time a valid
// template resolves, so this content is never displayed (a guard renders first).
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

function TemplateNotAvailable() {
  return (
    <div className="grid h-dvh place-items-center gap-2 text-sm text-muted-foreground">
      Template not available.
      <Button variant="outline" size="sm" onClick={() => history.back()}>
        Go back
      </Button>
    </div>
  );
}

export function EditorShell({ orgSlug, templateId }: EditorShellProps) {
  // Object-form hook: templates.get throws a NOT_FOUND ConvexError for missing
  // or inaccessible templates, and the legacy useQuery rethrows query errors
  // during render (hitting the error boundary). This form surfaces failures as
  // values so the guard chain below can render friendly UI instead.
  const templateQuery = useQuery_experimental({
    query: api.documents.templates.get,
    args: { orgSlug, templateId },
  });
  const template = templateQuery.status === "success" ? templateQuery.data : undefined;
  const updateTemplate = useMutation(api.documents.templates.update);
  // Initialized unconditionally: the query resolves after the first render,
  // so the spec reaches the reducer via LOAD_SPEC instead of hook arguments.
  const { state, dispatch, canUndo, canRedo } = useEditorState(EMPTY_SPEC);

  const [zoom, setZoom] = useState(1);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("design");
  const [name, setName] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [uploads, setUploads] = useState<SessionUpload[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Serialized spec of the last acknowledged save ("" until first resolution).
  const lastSavedSpecRef = useRef("");
  // True when local edits diverge from lastSavedSpecRef; mirrors autosave state.
  const dirtyRef = useRef(false);
  // Spec currently being written; masks our own subscription echo so the
  // remote-change warning cannot race the mutation's promise resolution.
  const pendingSpecRef = useRef<string | null>(null);

  const displayName = name ?? template?.name ?? "";
  const sampleTokens = useMemo(() => sampleTokenMap(), []);

  const storageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const element of state.spec.elements) {
      if (element.type === "image") ids.add(element.storageId);
    }
    for (const upload of uploads) ids.add(upload.storageId);
    return [...ids];
  }, [state.spec.elements, uploads]);

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
      setSaveState("saving");
      pendingSpecRef.current = JSON.stringify(spec);
      try {
        const result = await updateTemplate({
          orgSlug,
          templateId,
          spec,
          ...(nameValue ? { name: nameValue } : {}),
        });
        lastSavedSpecRef.current = pendingSpecRef.current;
        pendingSpecRef.current = null;
        dirtyRef.current = false;
        setSavedAt(result.updatedAt);
        setSaveState("saved");
      } catch (error) {
        pendingSpecRef.current = null;
        setSaveState("error");
        toast.error(
          error instanceof Error ? error.message : "Autosave failed. Changes are kept locally.",
        );
      }
    },
    [orgSlug, templateId, updateTemplate],
  );

  // First valid resolution only: adopt the template spec into the reducer and
  // seed the autosave baseline. Later template updates never clobber local
  // edits; they only trigger the remote-change warning below.
  useEffect(() => {
    if (!template || lastSavedSpecRef.current !== "" || !isDocumentSpec(template.spec)) return;
    dispatch({ type: "LOAD_SPEC", spec: template.spec });
    lastSavedSpecRef.current = JSON.stringify(template.spec);
    setHydrated(true);
  }, [template, dispatch]);

  // Debounced autosave keyed on the serialized spec. The `hydrated` gate skips
  // the initial load: it flips exactly when the baseline above is seeded, so
  // the adopted spec is never compared against the placeholder spec.
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

  // Warn when the template was saved elsewhere while this tab is clean. Our
  // own writes are masked by pendingSpecRef (subscription echo can arrive
  // before the mutation promise resolves).
  useEffect(() => {
    if (!template || !hydrated || dirtyRef.current || pendingSpecRef.current !== null) return;
    if (JSON.stringify(template.spec) !== lastSavedSpecRef.current) {
      toast.warning("This template was changed elsewhere. Reload to see the latest version.");
    }
  }, [template, hydrated]);

  // Ctrl/Cmd+S force-saves when there are unsaved changes.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirtyRef.current) void save(state.spec, displayName);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayName, save, state.spec]);

  const fitToScreen = useCallback(() => {
    // v1: reset to 100%; true fit-to-viewport needs measurements, deferred.
    setZoom(1);
  }, []);

  const downloadSample = useCallback(async () => {
    try {
      const blob = await renderPdfBlob([{ spec: state.spec, tokens: sampleTokens }], imageUrls);
      downloadBlobFile(`${displayName || "certificate"}.pdf`, blob);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not render the PDF.");
    }
  }, [displayName, imageUrls, sampleTokens, state.spec]);

  if (templateQuery.status === "error") {
    return <TemplateNotAvailable />;
  }
  if (template === undefined) {
    return (
      <div className="grid h-dvh place-items-center text-sm text-muted-foreground">
        Loading studio…
      </div>
    );
  }
  if (template.isSystem || !isDocumentSpec(template.spec)) {
    return <TemplateNotAvailable />;
  }

  return (
    <div className="flex h-dvh flex-col">
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
        saveState={saveState}
        savedAt={savedAt}
        onRetrySave={() => void save(state.spec, displayName)}
        onPreview={() => setPreviewOpen(true)}
        onDownloadSample={() => void downloadSample()}
        backHref={`/app/${orgSlug}/documents`}
      />
      <div className="flex min-h-0 flex-1">
        <Palette
          orgSlug={orgSlug}
          state={state}
          dispatch={dispatch}
          imageUrls={imageUrls}
          uploads={uploads}
          onUploaded={(storageId, fileName) =>
            setUploads((previous) => [...previous, { storageId, name: fileName }])
          }
        />
        <Canvas
          state={state}
          dispatch={dispatch}
          zoom={zoom}
          gridEnabled={gridEnabled}
          snapEnabled={snapEnabled}
          tokens={sampleTokens}
          imageUrls={imageUrls}
          onZoomChange={setZoom}
        />
        <div className="flex w-72 shrink-0 flex-col border-l border-border/60 bg-background">
          <div className="grid grid-cols-2 border-b border-border/60" role="tablist" aria-label="Editor panels">
            {(["design", "layers"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={rightTab === tab}
                onClick={() => setRightTab(tab)}
                className={
                  rightTab === tab
                    ? "py-2 text-xs font-semibold text-foreground"
                    : "py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {tab === "design" ? "Design" : "Layers"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {rightTab === "design" ? (
              <div className="space-y-4">
                <PageSetupPanel state={state} dispatch={dispatch} />
                <Inspector state={state} dispatch={dispatch} />
              </div>
            ) : (
              <LayersPanel state={state} dispatch={dispatch} />
            )}
          </div>
        </div>
      </div>
      <TruePreview open={previewOpen} onOpenChange={setPreviewOpen} spec={state.spec} imageUrls={imageUrls} />
    </div>
  );
}
