import { describe, expect, it } from "vitest";
import { createInitialEditorState, editorReducer, newElementId, nextElementName } from "./editorState";
import { validSpec } from "../../convex-test/documentFixtures";
import type { DocumentElement, DocumentSpec, TextElement } from "../../convex/documents/spec";

const patch = { id: "el-1", patch: { xMm: 42 } };

describe("editorReducer", () => {
  it("selects and updates elements with history", () => {
    let s = createInitialEditorState(validSpec);
    s = editorReducer(s, { type: "SET_SELECTION", ids: ["el-1"] });
    expect(s.selection).toEqual(["el-1"]);
    s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [patch] });
    expect((s.spec.elements[0] as TextElement).xMm).toBe(42);
    expect(s.past).toHaveLength(1);
  });

  it("undo and redo restore snapshots and clear redo on new actions", () => {
    let s = createInitialEditorState(validSpec);
    s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [patch] });
    s = editorReducer(s, { type: "UNDO" });
    expect((s.spec.elements[0] as TextElement).xMm).toBe(15);
    s = editorReducer(s, { type: "REDO" });
    expect((s.spec.elements[0] as TextElement).xMm).toBe(42);
    s = editorReducer(s, { type: "UNDO" });
    s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [patch] });
    expect(s.future).toHaveLength(0);
  });

  it("adds, copies, pastes, duplicates, deletes", () => {
    let s = createInitialEditorState(validSpec);
    const el: DocumentElement = { ...validSpec.elements[0], id: "el-9", name: "Extra" };
    s = editorReducer(s, { type: "ADD_ELEMENT", element: el });
    expect(s.spec.elements).toHaveLength(2);
    expect(s.selection).toEqual(["el-9"]);

    s = editorReducer(s, { type: "COPY_SELECTED" });
    expect(s.clipboard).toHaveLength(1);
    s = editorReducer(s, { type: "PASTE" });
    expect(s.spec.elements).toHaveLength(3);
    const pasted = s.spec.elements[2] as TextElement;
    expect(pasted.id).not.toBe("el-9");
    expect(pasted.xMm).toBeCloseTo(el.xMm + 2, 6);

    s = editorReducer(s, { type: "DUPLICATE_SELECTED" });
    expect(s.spec.elements).toHaveLength(4);

    s = editorReducer(s, { type: "DELETE_SELECTED" });
    expect(s.spec.elements).toHaveLength(3);
  });

  it("assigns distinct names when pasting multiple clones that share a base name", () => {
    const spec: DocumentSpec = {
      ...validSpec,
      elements: [
        ...validSpec.elements,
        { ...validSpec.elements[0], id: "el-a", name: "Text 1" },
        { ...validSpec.elements[0], id: "el-b", name: "Text 1" },
      ],
    };
    let s = createInitialEditorState(spec);
    s = editorReducer(s, { type: "SET_SELECTION", ids: ["el-a", "el-b"] });
    s = editorReducer(s, { type: "COPY_SELECTED" });
    expect(s.clipboard).toHaveLength(2);
    s = editorReducer(s, { type: "PASTE" });
    const pastedNames = s.spec.elements
      .filter((e) => s.selection.includes(e.id))
      .map((e) => e.name);
    expect(pastedNames).toEqual(["Text 2", "Text 3"]);
  });

  it("reorders z-order and refuses to delete locked elements", () => {
    let s = createInitialEditorState(validSpec);
    s = editorReducer(s, { type: "ADD_ELEMENT", element: { ...validSpec.elements[0], id: "el-2", name: "B" } });
    s = editorReducer(s, { type: "REORDER_ELEMENT", id: "el-1", toIndex: 1 });
    expect(s.spec.elements.map((e) => e.id)).toEqual(["el-2", "el-1"]);

    s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [{ id: "el-1", patch: { locked: true } }] });
    s = editorReducer(s, { type: "SET_SELECTION", ids: ["el-1"] });
    s = editorReducer(s, { type: "DELETE_SELECTED" });
    expect(s.spec.elements.map((e) => e.id)).toContain("el-1");
  });

  it("caps history at HISTORY_LIMIT", () => {
    let s = createInitialEditorState(validSpec);
    for (let i = 0; i < 120; i++) {
      s = editorReducer(s, { type: "UPDATE_ELEMENTS", updates: [{ id: "el-1", patch: { yMm: i } }] });
    }
    expect(s.past.length).toBeLessThanOrEqual(100);
  });

  it("names elements uniquely", () => {
    expect(newElementId()).not.toBe(newElementId());
    expect(nextElementName(validSpec, "Text")).toBe("Text 1");
  });
});
