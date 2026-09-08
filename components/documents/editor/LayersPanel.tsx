"use client";

import type { EditorAction, EditorState } from "@/lib/documents/editorState";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Frame,
  Image as ImageIcon,
  Layers,
  Lock,
  LockOpen,
  Square,
  Trash2,
  Type,
} from "lucide-react";

export interface LayersPanelProps {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export function LayersPanel({ state, dispatch }: LayersPanelProps) {
  // Top of the list = topmost element (reverse z-order). `elements` is bottom-to-top,
  // so the array index behind visual slot `fromTop` is `length - 1 - fromTop`.
  const layers = [...state.spec.elements].reverse();

  function reorder(id: string, fromTop: number, slots: 1 | -1) {
    const arrayIndex = state.spec.elements.length - 1 - fromTop;
    dispatch({ type: "REORDER_ELEMENT", id, toIndex: arrayIndex + slots });
  }

  function iconFor(type: string) {
    if (type === "text") return <Type className="size-3 text-blue-500" />;
    if (type === "image") return <ImageIcon className="size-3 text-emerald-500" />;
    return <Square className="size-3 text-amber-500" />;
  }

  return (
    <div className="space-y-2" aria-label="Layers panel">
      <div className="flex items-center justify-between px-1 pb-1 border-b border-border/60">
        <div className="flex items-center gap-1.5">
          <Layers aria-hidden className="size-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Canvas Layers</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {layers.length} {layers.length === 1 ? "element" : "elements"}
        </span>
      </div>

      <div className="space-y-1" role="list" aria-label="Layers">
        {layers.map((element, fromTop) => {
          const selected = state.selection.includes(element.id);
          return (
            <div
              key={element.id}
              role="listitem"
              className={`flex items-center gap-1.5 rounded-lg border p-1.5 transition-all ${
                selected
                  ? "border-primary bg-primary/10 shadow-2xs"
                  : "border-border/70 bg-card hover:border-primary/50 hover:bg-muted/40"
              }`}
            >
              <button
                type="button"
                className="flex items-center gap-2 min-w-0 flex-1 truncate text-left text-xs py-0.5 px-1"
                onClick={() => dispatch({ type: "SET_SELECTION", ids: [element.id] })}
              >
                <span className="shrink-0">{iconFor(element.type)}</span>
                <span className="truncate font-medium text-foreground">{element.name}</span>
              </button>

              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${element.name} up in stack`}
                  title="Move Forward"
                  onClick={() => reorder(element.id, fromTop, 1)}
                  disabled={fromTop === 0}
                >
                  <ChevronUp aria-hidden className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${element.name} down in stack`}
                  title="Move Backward"
                  onClick={() => reorder(element.id, fromTop, -1)}
                  disabled={fromTop === layers.length - 1}
                >
                  <ChevronDown aria-hidden className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={element.locked ? `Unlock ${element.name}` : `Lock ${element.name}`}
                  title={element.locked ? "Unlock" : "Lock"}
                  onClick={() =>
                    dispatch({
                      type: "UPDATE_ELEMENTS",
                      updates: [{ id: element.id, patch: { locked: !element.locked } }],
                    })
                  }
                >
                  {element.locked ? (
                    <Lock aria-hidden className="size-3 text-amber-500" />
                  ) : (
                    <LockOpen aria-hidden className="size-3 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${element.name}`}
                  title="Delete"
                  disabled={element.locked}
                  onClick={() => {
                    dispatch({ type: "SET_SELECTION", ids: [element.id] });
                    dispatch({ type: "DELETE_SELECTED" });
                  }}
                >
                  <Trash2 aria-hidden className="size-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
