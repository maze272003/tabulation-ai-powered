import type { DocumentElement, DocumentPage } from "../../convex/documents/spec";
import { resolvePageSize } from "../../convex/documents/spec";

export interface SnapTargets {
  xLines: number[];
  yLines: number[];
}

export interface SnapGuide {
  axis: "x" | "y";
  positionMm: number;
}

function dedupeSorted(values: number[]): number[] {
  return [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
}

/** Page edges/center, margin lines, and every non-excluded element's edges/center. */
export function collectSnapTargets(
  page: DocumentPage,
  elements: DocumentElement[],
  excludeIds: Set<string>,
): SnapTargets {
  const { widthMm, heightMm } = resolvePageSize(page);
  const xs: number[] = [0, widthMm, widthMm / 2, page.margins.left, widthMm - page.margins.right];
  const ys: number[] = [0, heightMm, heightMm / 2, page.margins.top, heightMm - page.margins.bottom];
  for (const el of elements) {
    if (excludeIds.has(el.id)) continue;
    xs.push(el.xMm, el.xMm + el.widthMm / 2, el.xMm + el.widthMm);
    ys.push(el.yMm, el.yMm + el.heightMm / 2, el.yMm + el.heightMm);
  }
  return { xLines: dedupeSorted(xs), yLines: dedupeSorted(ys) };
}

export interface SnapBoxResult {
  xMm: number;
  yMm: number;
  guides: SnapGuide[];
}

interface SnapCandidate {
  position: number;
  delta: number;
}

function snapAxis(
  candidates: SnapCandidate[],
  lines: number[],
  thresholdMm: number,
): { shift: number; guide: SnapGuide | null } {
  let best: { line: number; delta: number; distance: number } | null = null;
  for (const candidate of candidates) {
    for (const line of lines) {
      const distance = Math.abs(candidate.position - line);
      if (distance <= thresholdMm && (!best || distance < best.distance)) {
        best = { line, delta: candidate.delta, distance };
      }
    }
  }
  if (!best) return { shift: 0, guide: null };
  return { shift: best.line + best.delta - candidates[0].position, guide: { axis: "x", positionMm: best.line } };
}

/** Snaps the box's left/center/right and top/middle/bottom to nearby target lines. */
export function snapBox(
  box: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  targets: SnapTargets,
  thresholdMm: number,
): SnapBoxResult {
  const xCandidates: SnapCandidate[] = [
    { position: box.xMm, delta: 0 },
    { position: box.xMm + box.widthMm / 2, delta: -box.widthMm / 2 },
    { position: box.xMm + box.widthMm, delta: -box.widthMm },
  ];
  const yCandidates: SnapCandidate[] = [
    { position: box.yMm, delta: 0 },
    { position: box.yMm + box.heightMm / 2, delta: -box.heightMm / 2 },
    { position: box.yMm + box.heightMm, delta: -box.heightMm },
  ];

  const x = snapAxis(xCandidates, targets.xLines, thresholdMm);
  const y = snapAxis(yCandidates, targets.yLines, thresholdMm);
  const guides: SnapGuide[] = [];
  if (x.guide) guides.push(x.guide);
  if (y.guide) guides.push({ axis: "y", positionMm: y.guide.positionMm });

  return { xMm: box.xMm + x.shift, yMm: box.yMm + y.shift, guides };
}

export function snapToGrid(valueMm: number, gridMm: number): number {
  // Adding 0 normalizes -0 (from rounding a small negative) to +0 so snapped
  // values stay strictly equal across Object.is-based comparisons.
  return Math.round(valueMm / gridMm) * gridMm + 0;
}
