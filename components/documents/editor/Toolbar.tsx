"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  Grid3x3,
  Keyboard,
  Layers,
  Magnet,
  Maximize,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveIndicator, type SaveState } from "@/components/tabulation/SaveIndicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  showMargins: boolean;
  onToggleMargins: () => void;
  saveState: SaveState;
  savedAt: number | null;
  onRetrySave: () => void;
  onPreview: () => void;
  onDownloadSample: () => void;
  onOpenShortcuts: () => void;
  backHref: string;
}

export function Toolbar(props: ToolbarProps) {
  const [nameDraft, setNameDraft] = useState(props.templateName);
  const lastSeenTemplateNameRef = useRef(props.templateName);
  const nameInputFocusedRef = useRef(false);
  const userEditedNameRef = useRef(false);

  useEffect(() => {
    const previousTemplateName = lastSeenTemplateNameRef.current;
    lastSeenTemplateNameRef.current = props.templateName;
    if (props.templateName === previousTemplateName) return;
    if (nameInputFocusedRef.current) return;
    if (nameDraft !== previousTemplateName) return;
    userEditedNameRef.current = false;
    setNameDraft(props.templateName);
  }, [props.templateName, nameDraft]);

  const commitName = () => {
    nameInputFocusedRef.current = false;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== props.templateName && userEditedNameRef.current) {
      props.onNameChange(trimmed);
      return;
    }
    userEditedNameRef.current = false;
    setNameDraft(props.templateName);
  };

  const adjustZoom = (delta: number) =>
    props.onZoomChange(
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((props.zoom + delta) * 100) / 100)),
    );

  const zoomPercent = Math.round(props.zoom * 100);

  return (
    <header className="flex h-13 sm:h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/95 backdrop-blur-xs px-2.5 sm:px-4 z-20">
      {/* Left section: Back Navigation & Template Title */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                render={<Link href={props.backHref} />}
                aria-label="Back to documents"
              />
            }
          >
            <ArrowLeft aria-hidden className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Back to Certificates & Documents</TooltipContent>
        </Tooltip>

        <span className="h-4 sm:h-5 w-px bg-border/80" aria-hidden />

        <div className="relative flex items-center group max-w-[130px] sm:max-w-xs md:max-w-sm">
          <Input
            aria-label="Template name"
            className="h-7 sm:h-8 border-transparent bg-transparent px-1.5 sm:px-2 text-xs sm:text-sm font-semibold hover:border-input focus-visible:border-input transition-colors w-28 sm:w-44 md:w-56 truncate"
            value={nameDraft}
            onChange={(event) => {
              userEditedNameRef.current = true;
              setNameDraft(event.target.value);
            }}
            onFocus={() => {
              nameInputFocusedRef.current = true;
            }}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <Pencil className="absolute right-1.5 size-3 text-muted-foreground opacity-0 group-hover:opacity-60 pointer-events-none transition-opacity hidden sm:block" />
        </div>
      </div>

      {/* Middle section: Desktop History, Zoom, and Canvas View Controls */}
      <div className="hidden md:flex items-center gap-1">
        {/* Undo / Redo */}
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={props.onUndo}
                  disabled={!props.canUndo}
                  aria-label="Undo last change"
                />
              }
            >
              <Undo2 aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={props.onRedo}
                  disabled={!props.canRedo}
                  aria-label="Redo undone change"
                />
              }
            >
              <Redo2 aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
        </div>

        <span className="mx-1 h-5 w-px bg-border/60" aria-hidden />

        {/* Zoom Controls */}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => adjustZoom(-ZOOM_STEP)}
          >
            <Minus aria-hidden className="size-3.5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="w-13 py-1 text-center text-xs font-mono font-medium text-foreground hover:bg-muted rounded transition-colors"
                />
              }
            >
              {zoomPercent}%
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-32">
              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Zoom Level</DropdownMenuLabel>
              {ZOOM_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset}
                  onClick={() => props.onZoomChange(preset)}
                  className="justify-between text-xs font-mono"
                >
                  <span>{Math.round(preset * 100)}%</span>
                  {zoomPercent === Math.round(preset * 100) ? <Check className="size-3.5 text-primary" /> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={props.onFit} className="text-xs">
                Fit to screen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => adjustZoom(ZOOM_STEP)}
          >
            <Plus aria-hidden className="size-3.5" />
          </Button>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={props.onFit}
                  aria-label="Fit to screen"
                />
              }
            >
              <Maximize aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Fit to Screen</TooltipContent>
          </Tooltip>
        </div>

        <span className="mx-1 h-5 w-px bg-border/60" aria-hidden />

        {/* Canvas Guide Toggles */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={props.gridEnabled ? "secondary" : "ghost"}
                  size="icon-sm"
                  onClick={props.onToggleGrid}
                  aria-label="Toggle grid"
                  aria-pressed={props.gridEnabled}
                />
              }
            >
              <Grid3x3 aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{props.gridEnabled ? "Hide Grid" : "Show Grid"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={props.snapEnabled ? "secondary" : "ghost"}
                  size="icon-sm"
                  onClick={props.onToggleSnap}
                  aria-label="Toggle snapping"
                  aria-pressed={props.snapEnabled}
                />
              }
            >
              <Magnet aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{props.snapEnabled ? "Snapping Enabled" : "Snapping Disabled"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={props.showMargins ? "secondary" : "ghost"}
                  size="icon-sm"
                  onClick={props.onToggleMargins}
                  aria-label="Toggle margin guides"
                  aria-pressed={props.showMargins}
                />
              }
            >
              <Layers aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{props.showMargins ? "Hide Margin Guides" : "Show Margin Guides"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Right section: Mobile Undo/Redo, Autosave, Mobile Menu, Preview */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Mobile Undo/Redo right in toolbar */}
        <div className="flex md:hidden items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={props.onUndo}
            disabled={!props.canUndo}
            aria-label="Undo"
          >
            <Undo2 aria-hidden className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={props.onRedo}
            disabled={!props.canRedo}
            aria-label="Redo"
          >
            <Redo2 aria-hidden className="size-3.5" />
          </Button>
        </div>

        <SaveIndicator state={props.saveState} savedAt={props.savedAt} onRetry={props.onRetrySave} />

        {/* Mobile More Options Dropdown */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="More options"
                />
              }
            >
              <MoreHorizontal aria-hidden className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Studio Options</DropdownMenuLabel>
              <DropdownMenuItem onClick={props.onDownloadSample} className="text-xs gap-2">
                <Download className="size-3.5" />
                <span>Download Sample PDF</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={props.onToggleGrid} className="text-xs justify-between">
                <span>Show Grid</span>
                {props.gridEnabled ? <Check className="size-3.5 text-primary" /> : null}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={props.onToggleSnap} className="text-xs justify-between">
                <span>Snapping</span>
                {props.snapEnabled ? <Check className="size-3.5 text-primary" /> : null}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={props.onToggleMargins} className="text-xs justify-between">
                <span>Margin Guides</span>
                {props.showMargins ? <Check className="size-3.5 text-primary" /> : null}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={props.onOpenShortcuts} className="text-xs gap-2">
                <Keyboard className="size-3.5" />
                <span>Shortcuts</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden md:flex"
                onClick={props.onOpenShortcuts}
                aria-label="Keyboard shortcuts"
              />
            }
          >
            <Keyboard aria-hidden className="size-4 text-muted-foreground hover:text-foreground" />
          </TooltipTrigger>
          <TooltipContent>Keyboard Shortcuts (?)</TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex gap-1.5 text-xs font-medium"
          onClick={props.onDownloadSample}
        >
          <Download aria-hidden className="size-3.5" />
          <span>Sample PDF</span>
        </Button>

        <Button
          size="sm"
          className="gap-1 sm:gap-1.5 text-xs font-semibold shadow-xs px-2 sm:px-3"
          onClick={props.onPreview}
        >
          <Eye aria-hidden className="size-3.5" />
          <span className="hidden xs:inline">Preview</span>
        </Button>
      </div>
    </header>
  );
}
