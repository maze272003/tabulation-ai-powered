"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Download,
  Grid3x3,
  Magnet,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveIndicator, type SaveState } from "@/components/tabulation/SaveIndicator";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;

export interface ToolbarProps {
  templateName: string;
  onNameChange: (name: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
  gridEnabled: boolean;
  snapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  saveState: SaveState;
  savedAt: number | null;
  onRetrySave: () => void;
  onPreview: () => void;
  onDownloadSample: () => void;
  backHref: string;
}

export function Toolbar(props: ToolbarProps) {
  const [nameDraft, setNameDraft] = useState(props.templateName);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== props.templateName) {
      props.onNameChange(trimmed);
    } else {
      setNameDraft(props.templateName);
    }
  };

  const adjustZoom = (delta: number) =>
    props.onZoomChange(
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((props.zoom + delta) * 100) / 100)),
    );

  const zoomPercent = Math.round(props.zoom * 100);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        render={<Link href={props.backHref} />}
        aria-label="Back to documents"
      >
        <ArrowLeft aria-hidden className="size-4" />
      </Button>
      <Input
        aria-label="Template name"
        className="h-8 w-56 border-transparent bg-transparent text-sm font-semibold hover:border-input focus-visible:border-input"
        value={nameDraft}
        onChange={(event) => setNameDraft(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />

      <div className="mx-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={props.onUndo}
                disabled={!props.canUndo}
                aria-label="Undo"
              />
            }
          >
            <Undo2 aria-hidden className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={props.onRedo}
                disabled={!props.canRedo}
                aria-label="Redo"
              />
            }
          >
            <Redo2 aria-hidden className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
        </Tooltip>

        <span className="mx-2 h-6 w-px bg-border" aria-hidden />

        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          onClick={() => adjustZoom(-ZOOM_STEP)}
        >
          <Minus aria-hidden className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{zoomPercent}%</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          onClick={() => adjustZoom(ZOOM_STEP)}
        >
          <Plus aria-hidden className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={props.onFit} aria-label="Fit to screen">
          <Maximize aria-hidden className="size-4" />
        </Button>

        <span className="mx-2 h-6 w-px bg-border" aria-hidden />

        <Button
          variant={props.gridEnabled ? "secondary" : "ghost"}
          size="icon"
          onClick={props.onToggleGrid}
          aria-label="Toggle grid"
          aria-pressed={props.gridEnabled}
        >
          <Grid3x3 aria-hidden className="size-4" />
        </Button>
        <Button
          variant={props.snapEnabled ? "secondary" : "ghost"}
          size="icon"
          onClick={props.onToggleSnap}
          aria-label="Toggle snapping"
          aria-pressed={props.snapEnabled}
        >
          <Magnet aria-hidden className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <SaveIndicator state={props.saveState} savedAt={props.savedAt} onRetry={props.onRetrySave} />
        <Button variant="outline" size="sm" onClick={props.onDownloadSample}>
          <Download aria-hidden className="size-4" />
          Sample PDF
        </Button>
        <Button size="sm" onClick={props.onPreview}>
          Preview
        </Button>
      </div>
    </header>
  );
}
