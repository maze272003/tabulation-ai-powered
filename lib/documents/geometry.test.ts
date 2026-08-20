import { describe, expect, it } from "vitest";
import {
  PX_PER_MM,
  elementCorners,
  hitTest,
  mmToPt,
  normalizeAngle,
  resizeBox,
  rotatePoint,
  selectionBounds,
  snapAngle,
} from "./geometry";

const box = { xMm: 10, yMm: 20, widthMm: 30, heightMm: 40, rotationDeg: 0 };

describe("constants + helpers", () => {
  it("converts units exactly", () => {
    expect(PX_PER_MM).toBeCloseTo(3.779527559, 6);
    expect(mmToPt(25.4)).toBeCloseTo(72, 6);
  });

  it("rotates points clockwise and normalizes angles", () => {
    const p = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(1, 6);
    expect(normalizeAngle(370)).toBeCloseTo(10, 6);
    expect(normalizeAngle(-190)).toBeCloseTo(170, 6);
    expect(snapAngle(43)).toBe(45);
    expect(snapAngle(41)).toBe(41);
  });
});

describe("corners + hit testing", () => {
  it("computes unrotated corners", () => {
    const corners = elementCorners(box);
    expect(corners[0]).toEqual({ x: 10, y: 20 });
    expect(corners[2]).toEqual({ x: 40, y: 60 });
  });

  it("rotates corners around the center", () => {
    const corners = elementCorners({ ...box, rotationDeg: 90 });
    expect(corners[0].x).toBeCloseTo(45, 6);
    expect(corners[0].y).toBeCloseTo(25, 6);
  });

  it("hit-tests through rotation", () => {
    const rotated = { ...box, rotationDeg: 90 };
    expect(hitTest(rotated, { x: 25, y: 40 })).toBe(true);
    expect(hitTest(rotated, { x: 7, y: 40 })).toBe(true);
    expect(hitTest(rotated, { x: 25, y: 22 })).toBe(false);
  });
});

describe("selectionBounds", () => {
  it("returns null for empty input and an AABB for rotated boxes", () => {
    expect(selectionBounds([])).toBeNull();
    const bounds = selectionBounds([box, { ...box, xMm: 100, rotationDeg: 45 }]);
    expect(bounds).not.toBeNull();
    expect(bounds!.minXMm).toBe(10);
    // The 45°-rotated second box reaches 40 - 35/sqrt(2) ≈ 15.2513mm in y.
    expect(bounds!.minYMm).toBeCloseTo(40 - 35 / Math.SQRT2, 6);
  });
});

describe("resizeBox", () => {
  it("grows the south-east handle at rotation 0 keeping the nw corner fixed", () => {
    const next = resizeBox(box, "se", 5, 8, { aspectRatio: false });
    expect(next.xMm).toBeCloseTo(10, 6);
    expect(next.yMm).toBeCloseTo(20, 6);
    expect(next.widthMm).toBeCloseTo(35, 6);
    expect(next.heightMm).toBeCloseTo(48, 6);
  });

  it("grows the north-west handle keeping the se corner fixed", () => {
    const next = resizeBox(box, "nw", 4, 6, { aspectRatio: false });
    expect(next.xMm).toBeCloseTo(14, 6);
    expect(next.yMm).toBeCloseTo(26, 6);
    expect(next.widthMm).toBeCloseTo(26, 6);
    expect(next.heightMm).toBeCloseTo(34, 6);
  });

  it("keeps the opposite anchor fixed in world space when rotated 90°", () => {
    const rotated = { ...box, rotationDeg: 90 };
    const before = elementCorners(rotated);
    const next = resizeBox(rotated, "e", 0, 10, { aspectRatio: false });
    const after = elementCorners(next);
    expect(after[3].x).toBeCloseTo(before[3].x, 3);
    expect(after[3].y).toBeCloseTo(before[3].y, 3);
    // A world-y drag maps to the local x axis at 90°, so width grows and
    // height is unchanged.
    expect(next.widthMm).toBeCloseTo(40, 6);
    expect(next.heightMm).toBeCloseTo(40, 6);
  });

  it("keeps the opposite corner fixed at 45° rotation", () => {
    const rotated = { ...box, rotationDeg: 45 };
    const before = elementCorners(rotated);
    const next = resizeBox(rotated, "nw", 6, -4, { aspectRatio: false });
    const after = elementCorners(next);
    expect(after[2].x).toBeCloseTo(before[2].x, 6);
    expect(after[2].y).toBeCloseTo(before[2].y, 6);
    expect(next.widthMm).toBeCloseTo(30 - Math.SQRT2, 6);
    expect(next.heightMm).toBeCloseTo(40 + 5 * Math.SQRT2, 6);
  });

  it("preserves aspect ratio on corner handles", () => {
    const next = resizeBox(box, "se", 10, 0, { aspectRatio: true });
    expect(next.widthMm / next.heightMm).toBeCloseTo(30 / 40, 6);
  });

  it("applies aspect ratio on single-axis corner drags instead of ignoring them", () => {
    const next = resizeBox(box, "se", -5, 0, { aspectRatio: true });
    expect(next.widthMm).toBeCloseTo(25, 6);
    expect(next.heightMm).toBeCloseTo((25 / 30) * 40, 6);
    expect(next.widthMm / next.heightMm).toBeCloseTo(30 / 40, 6);
  });

  it("enforces a 2mm minimum size", () => {
    const next = resizeBox(box, "se", -100, -100, { aspectRatio: false });
    expect(next.widthMm).toBeGreaterThanOrEqual(2);
    expect(next.heightMm).toBeGreaterThanOrEqual(2);
  });
});
