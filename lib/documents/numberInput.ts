/** Parses a numeric input, returning null for non-finite values (typing "-") so the patch is skipped. */
export function parseNumberInput(raw: string, min: number, max: number): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}
