export interface Point {
  x: number;
  y: number;
}

export interface RotatedBox {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
}

export const PX_PER_MM = 96 / 25.4;
export const PT_PER_MM = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

export const HANDLE_IDS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type HandleId = (typeof HANDLE_IDS)[number];

export function rotatePoint(p: Point, center: Point, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  // Screen coordinates grow downward, so positive angles rotate clockwise visually.
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

export function boxCenter(box: Pick<RotatedBox, "xMm" | "yMm" | "widthMm" | "heightMm">): Point {
  return { x: box.xMm + box.widthMm / 2, y: box.yMm + box.heightMm / 2 };
}

export function elementCorners(box: RotatedBox): [Point, Point, Point, Point] {
  const center = boxCenter(box);
  const local: [Point, Point, Point, Point] = [
    { x: box.xMm, y: box.yMm },
    { x: box.xMm + box.widthMm, y: box.yMm },
    { x: box.xMm + box.widthMm, y: box.yMm + box.heightMm },
    { x: box.xMm, y: box.yMm + box.heightMm },
  ];
  return local.map((p) => rotatePoint(p, center, box.rotationDeg)) as [Point, Point, Point, Point];
}

export function hitTest(box: RotatedBox, p: Point): boolean {
  const center = boxCenter(box);
  const local = rotatePoint(p, center, -box.rotationDeg);
  return (
    local.x >= box.xMm &&
    local.x <= box.xMm + box.widthMm &&
    local.y >= box.yMm &&
    local.y <= box.yMm + box.heightMm
  );
}

export interface SelectionBounds {
  minXMm: number;
  minYMm: number;
  maxXMm: number;
  maxYMm: number;
}

export function selectionBounds(boxes: RotatedBox[]): SelectionBounds | null {
  if (boxes.length === 0) return null;
  let minXMm = Infinity;
  let minYMm = Infinity;
  let maxXMm = -Infinity;
  let maxYMm = -Infinity;
  for (const box of boxes) {
    for (const corner of elementCorners(box)) {
      minXMm = Math.min(minXMm, corner.x);
      minYMm = Math.min(minYMm, corner.y);
      maxXMm = Math.max(maxXMm, corner.x);
      maxYMm = Math.max(maxYMm, corner.y);
    }
  }
  return { minXMm, minYMm, maxXMm, maxYMm };
}

export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

/** Snaps to the nearest multiple of 45° when within `thresholdDeg`, else returns the input normalized. */
export function snapAngle(deg: number, thresholdDeg = 3): number {
  const target = Math.round(deg / 45) * 45;
  return Math.abs(deg - target) <= thresholdDeg ? normalizeAngle(target) : normalizeAngle(deg);
}

const MIN_SIZE_MM = 2;

/**
 * Rotation-aware resize. `dxMm/dyMm` are world-space pointer deltas; they are
 * transformed into the element's local frame, the box is resized against the
 * opposite anchor, and the center is repositioned so the anchor stays fixed
 * in world space.
 */
export function resizeBox(
  box: RotatedBox,
  handle: HandleId,
  dxMm: number,
  dyMm: number,
  opts: { aspectRatio: boolean },
): RotatedBox {
  const center = boxCenter(box);
  const rotatedPointer = rotatePoint({ x: center.x + dxMm, y: center.y + dyMm }, center, -box.rotationDeg);
  const ldx = rotatedPointer.x - center.x;
  const ldy = rotatedPointer.y - center.y;

  let width = box.widthMm;
  let height = box.heightMm;
  if (handle.includes("e")) width += ldx;
  if (handle.includes("w")) width -= ldx;
  if (handle.includes("s")) height += ldy;
  if (handle.includes("n")) height -= ldy;

  if (opts.aspectRatio && handle.length === 2) {
    const scale = Math.max(width / box.widthMm, height / box.heightMm);
    width = box.widthMm * scale;
    height = box.heightMm * scale;
  }
  width = Math.max(width, MIN_SIZE_MM);
  height = Math.max(height, MIN_SIZE_MM);

  // The anchor is the opposite corner/edge midpoint of the OLD box, expressed
  // in the old local frame; its world position must remain fixed.
  const anchorSignX = handle.includes("w") ? 1 : handle.includes("e") ? -1 : 0;
  const anchorSignY = handle.includes("n") ? 1 : handle.includes("s") ? -1 : 0;
  const oldAnchorLocal = {
    x: anchorSignX * (box.widthMm / 2),
    y: anchorSignY * (box.heightMm / 2),
  };
  const anchorWorld = rotatePoint(
    { x: center.x + oldAnchorLocal.x, y: center.y + oldAnchorLocal.y },
    center,
    box.rotationDeg,
  );

  // The new center places the new anchor corner at the same world position.
  const newAnchorLocal = { x: anchorSignX * (width / 2), y: anchorSignY * (height / 2) };
  const anchorOffset = rotatePoint(newAnchorLocal, { x: 0, y: 0 }, box.rotationDeg);
  const newCenter = { x: anchorWorld.x - anchorOffset.x, y: anchorWorld.y - anchorOffset.y };

  return {
    xMm: newCenter.x - width / 2,
    yMm: newCenter.y - height / 2,
    widthMm: width,
    heightMm: height,
    rotationDeg: box.rotationDeg,
  };
}
