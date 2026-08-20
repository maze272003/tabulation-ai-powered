"use client";

import { useReducer } from "react";
import type {
  DocumentElement,
  DocumentSpec,
  ImageElement,
  ShapeElement,
  TextElement,
} from "../../convex/documents/spec";

export type ElementPatch = Partial<
  Omit<TextElement, "type"> & Omit<ImageElement, "type"> & Omit<ShapeElement, "type">
>;

export interface EditorState {
  spec: DocumentSpec;
  selection: string[];
  clipboard: DocumentElement[];
  past: DocumentSpec[];
  future: DocumentSpec[];
}

export type EditorAction =
  | { type: "LOAD_SPEC"; spec: DocumentSpec }
  | { type: "ADD_ELEMENT"; element: DocumentElement }
  | { type: "UPDATE_ELEMENTS"; updates: { id: string; patch: ElementPatch }[] }
  | { type: "DELETE_SELECTED" }
  | { type: "DUPLICATE_SELECTED" }
  | { type: "COPY_SELECTED" }
  | { type: "PASTE" }
  | { type: "REORDER_ELEMENT"; id: string; toIndex: number }
  | { type: "SET_SELECTION"; ids: string[] }
  | { type: "SET_PAGE"; patch: Partial<DocumentSpec["page"]> }
  | { type: "UNDO" }
  | { type: "REDO" };

export const HISTORY_LIMIT = 100;
export const PASTE_OFFSET_MM = 2;

export function newElementId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nextElementName(spec: DocumentSpec, base: string): string {
  let index = 1;
  const names = new Set(spec.elements.map((e) => e.name));
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export function createInitialEditorState(spec: DocumentSpec): EditorState {
  return { spec, selection: [], clipboard: [], past: [], future: [] };
}

function withHistory(state: EditorState, spec: DocumentSpec): EditorState {
  return {
    ...state,
    spec,
    past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.spec],
    future: [],
  };
}

function cloneElement(element: DocumentElement, spec: DocumentSpec, offset: boolean): DocumentElement {
  const name = nextElementName(spec, element.name.replace(/ \d+$/, ""));
  return {
    ...element,
    id: newElementId(),
    name,
    ...(offset ? { xMm: element.xMm + PASTE_OFFSET_MM, yMm: element.yMm + PASTE_OFFSET_MM } : {}),
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "LOAD_SPEC":
      return createInitialEditorState(action.spec);
    case "ADD_ELEMENT":
      return {
        ...withHistory(state, { ...state.spec, elements: [...state.spec.elements, action.element] }),
        selection: [action.element.id],
      };
    case "UPDATE_ELEMENTS": {
      if (action.updates.length === 0) return state;
      const patchMap = new Map(action.updates.map((u) => [u.id, u.patch]));
      const elements = state.spec.elements.map((element) => {
        const patch = patchMap.get(element.id);
        return patch ? ({ ...element, ...patch } as DocumentElement) : element;
      });
      return withHistory(state, { ...state.spec, elements });
    }
    case "DELETE_SELECTED": {
      const doomed = new Set(
        state.spec.elements.filter((e) => state.selection.includes(e.id) && !e.locked).map((e) => e.id),
      );
      if (doomed.size === 0) return state;
      return {
        ...withHistory(state, {
          ...state.spec,
          elements: state.spec.elements.filter((e) => !doomed.has(e.id)),
        }),
        selection: [],
      };
    }
    case "COPY_SELECTED":
      return {
        ...state,
        clipboard: state.spec.elements.filter((e) => state.selection.includes(e.id) && !e.locked),
      };
    case "PASTE": {
      if (state.clipboard.length === 0) return state;
      const clones = state.clipboard.map((element) => cloneElement(element, state.spec, true));
      return {
        ...withHistory(state, { ...state.spec, elements: [...state.spec.elements, ...clones] }),
        selection: clones.map((c) => c.id),
      };
    }
    case "DUPLICATE_SELECTED": {
      const selected = state.spec.elements.filter((e) => state.selection.includes(e.id) && !e.locked);
      if (selected.length === 0) return state;
      const clones = selected.map((element) => cloneElement(element, state.spec, true));
      return {
        ...withHistory(state, { ...state.spec, elements: [...state.spec.elements, ...clones] }),
        selection: clones.map((c) => c.id),
      };
    }
    case "REORDER_ELEMENT": {
      const from = state.spec.elements.findIndex((e) => e.id === action.id);
      if (from === -1) return state;
      const to = Math.max(0, Math.min(action.toIndex, state.spec.elements.length - 1));
      if (from === to) return state;
      const elements = [...state.spec.elements];
      const [moved] = elements.splice(from, 1);
      elements.splice(to, 0, moved);
      return withHistory(state, { ...state.spec, elements });
    }
    case "SET_SELECTION":
      return { ...state, selection: action.ids };
    case "SET_PAGE":
      return withHistory(state, { ...state.spec, page: { ...state.spec.page, ...action.patch } });
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        spec: previous,
        past: state.past.slice(0, -1),
        future: [state.spec, ...state.future].slice(0, HISTORY_LIMIT),
        selection: state.selection.filter((id) => previous.elements.some((e) => e.id === id)),
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        spec: next,
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.spec],
        future: state.future.slice(1),
        selection: state.selection.filter((id) => next.elements.some((e) => e.id === id)),
      };
    }
  }
}

export function useEditorState(initialSpec: DocumentSpec) {
  const [state, dispatch] = useReducer(editorReducer, createInitialEditorState(initialSpec));
  return { state, dispatch, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
