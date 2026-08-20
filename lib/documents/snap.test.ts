import { describe, expect, it } from "vitest";
import { collectSnapTargets, snapBox, snapToGrid } from "./snap";
import { validSpec } from "../../convex-test/documentFixtures";
import type { DocumentElement } from "../../convex/documents/spec";

const page = validSpec.page;

describe("collectSnapTargets", () => {
  it("includes margins, page edges, centers, and other element edges/centers", () => {
    const other: DocumentElement = {
      ...validSpec.elements[0],
      id: "other",
      xMm: 50,
      yMm: 60,
      widthMm: 100,
      heightMm: 40,
    };
    const targets = collectSnapTargets(page, [other], new Set(["moved"]));
    for (const x of [0, 15, 105, 195, 210, 50, 150, 100]) {
      expect(targets.xLines).toContain(x);
    }
    for (const y of [0, 15, 148.5, 282, 297, 60, 100, 80]) {
      expect(targets.yLines).toContain(y);
    }
  });

  it("excludes elements whose ids are in excludeIds", () => {
    // Offset from page lines: the fixture element sits exactly on the margin/center
    // lines, so excluding it would not change the deduped line count.
    const el: DocumentElement = { ...validSpec.elements[0], xMm: 40, widthMm: 50 };
    const withEl = collectSnapTargets(page, [el], new Set());
    const withoutEl = collectSnapTargets(page, [el], new Set([el.id]));
    expect(withoutEl.xLines.length).toBeLessThan(withEl.xLines.length);
  });
});

describe("snapBox", () => {
  it("snaps left edge to a nearby line and reports the guide", () => {
    const result = snapBox({ xMm: 13, yMm: 20, widthMm: 100, heightMm: 40 }, { xLines: [15], yLines: [] }, 3);
    expect(result.xMm).toBe(15);
    expect(result.guides).toEqual([{ axis: "x", positionMm: 15 }]);
    expect(result.yMm).toBe(20);
  });

  it("prefers the closest line when multiple are within threshold", () => {
    // 13.5 would be an exact tie between 12 and 15; 13.25 is unambiguously closest to 12.
    const result = snapBox({ xMm: 13.25, yMm: 0, widthMm: 10, heightMm: 10 }, { xLines: [15, 12], yLines: [] }, 3);
    expect(result.xMm).toBe(12);
  });

  it("checks center and right edges too, and never moves when nothing is close", () => {
    const centered = snapBox({ xMm: 50.5, yMm: 0, widthMm: 10, heightMm: 10 }, { xLines: [55], yLines: [] }, 1);
    expect(centered.xMm).toBe(50);
    const rightEdge = snapBox({ xMm: 45.5, yMm: 0, widthMm: 10, heightMm: 10 }, { xLines: [55], yLines: [] }, 1);
    expect(rightEdge.xMm).toBe(45);
    const far = snapBox({ xMm: 50, yMm: 0, widthMm: 10, heightMm: 10 }, { xLines: [100], yLines: [] }, 1);
    expect(far.xMm).toBe(50);
    expect(far.guides).toEqual([]);
  });
});

describe("snapToGrid", () => {
  it("rounds to the grid step", () => {
    expect(snapToGrid(12.4, 5)).toBe(10);
    expect(snapToGrid(12.6, 5)).toBe(15);
    expect(snapToGrid(-2.4, 5)).toBe(0);
  });
});
