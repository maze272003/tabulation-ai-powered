const SVG_PATH_REGEX = /^[MmLlHhVvCcSsQqTtAaZz0-9, .\-]+$/;

function formatCoord(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

/**
 * Validates whether a given string is a safe, strictly-formed SVG path.
 * Rejects any script tags, HTML elements, or invalid characters.
 */
export function validateSvgSignature(svgPath: string): boolean {
  if (!svgPath || typeof svgPath !== "string") return false;
  const trimmed = svgPath.trim();
  if (trimmed.length === 0) return false;
  return SVG_PATH_REGEX.test(trimmed);
}

/**
 * Converts an array of pointer coordinates into a smoothed quadratic bezier SVG path.
 */
export function pointsToSvgPath(points: Array<[number, number]>): string {
  if (!points || points.length === 0) return "";
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M${formatCoord(x)} ${formatCoord(y)} L${formatCoord(x + 0.1)} ${formatCoord(y + 0.1)}`;
  }

  let d = `M${formatCoord(points[0][0])} ${formatCoord(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev[0] + curr[0]) / 2;
    const midY = (prev[1] + curr[1]) / 2;
    d += ` Q${formatCoord(prev[0])} ${formatCoord(prev[1])} ${formatCoord(midX)} ${formatCoord(midY)}`;
  }
  const last = points[points.length - 1];
  d += ` L${formatCoord(last[0])} ${formatCoord(last[1])}`;
  return d;
}

/**
 * Formats a 64-character hex hash into an executive, readable security code.
 * Example: E3B0-C442-98FC-1C14
 */
export function formatVerificationHash(fullHash: string): string {
  if (!fullHash) return "";
  const clean = fullHash.replace(/[^a-fA-F0-9]/g, "").slice(0, 16).toUpperCase();
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    chunks.push(clean.slice(i, i + 4));
  }
  return chunks.join("-");
}

/**
 * Generates an authentic cursive vector SVG path from typed text.
 * Used for typed signature mode across multiple font stylistic flourishes.
 */
export function textToSvgPath(name: string, styleIndex: number = 0): string {
  const cleanName = (name || "Signature").trim();
  const points: Array<[number, number]> = [];
  let currentX = 20;
  const baseY = 80;

  // Initial decorative stroke
  points.push([currentX, baseY]);
  points.push([currentX + 5, baseY - 30]);
  points.push([currentX + 15, baseY + 10]);

  for (let i = 0; i < cleanName.length; i++) {
    const char = cleanName[i];
    const code = char.charCodeAt(0);
    const heightMod = (code % 25) - 12;
    const flourish = (styleIndex * 5) % 15;

    currentX += 14;
    points.push([currentX, baseY + heightMod]);
    points.push([currentX + 7, baseY - 15 - flourish]);
    points.push([currentX + 14, baseY + 5]);
  }

  // Terminal flourish line
  points.push([currentX + 30, baseY - 5]);
  points.push([currentX + 60, baseY - 15]);
  points.push([currentX + 10, baseY + 25]);
  points.push([currentX + 70, baseY + 20]);

  return pointsToSvgPath(points);
}
