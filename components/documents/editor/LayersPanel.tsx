"use client";

import type { EditorAction, EditorState } from "@/lib/documents/editorState";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Lock, LockOpen, Trash2 } from "lucide-react";

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

  return (
    <div className="space-y-1" role="list" aria-label="Layers">
      {layers.map((element, fromTop) => {
        const selected = state.selection.includes(element.id);
        return (
          <div
            key={element.id}
            role="listitem"
            className={
              selected
                ? "flex items-center gap-1 rounded-lg border border-primary/50 bg-primary/5 p-1.5"
                : "flex items-center gap-1 rounded-lg border border-border p-1.5"
            }
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs"
              onClick={() => dispatch({ type: "SET_SELECTION", ids: [element.id] })}
            >
              <span className="text-[9px] uppercase text-muted-foreground">{element.type}</span> {element.name}
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${element.name} up`}
              onClick={() => reorder(element.id, fromTop, 1)}
              disabled={fromTop === 0}
            >
              <ChevronUp aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${element.name} down`}
              onClick={() => reorder(element.id, fromTop, -1)}
              disabled={fromTop === layers.length - 1}
            >
              <ChevronDown aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={element.locked ? `Unlock ${element.name}` : `Lock ${element.name}`}
              onClick={() =>
                dispatch({
                  type: "UPDATE_ELEMENTS",
                  updates: [{ id: element.id, patch: { locked: !element.locked } }],
                })
              }
            >
              {element.locked ? <Lock aria-hidden className="size-3.5" /> : <LockOpen aria-hidden className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${element.name}`}
              disabled={element.locked}
              onClick={() => {
                dispatch({ type: "SET_SELECTION", ids: [element.id] });
                dispatch({ type: "DELETE_SELECTED" });
              }}
            >
              <Trash2 aria-hidden className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
