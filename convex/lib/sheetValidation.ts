import type { Doc } from "../_generated/dataModel";

export function checkValue(
  criterion: Doc<"criteria">,
  value: number,
  eventDecimalPrecision?: number,
): string | null {
  if (value < criterion.minScore || value > criterion.maxScore) {
    return `${criterion.name} must be between ${criterion.minScore} and ${criterion.maxScore}`;
  }
  const allowedPrecision = Math.max(criterion.decimalPrecision ?? 0, eventDecimalPrecision ?? 0);
  const factor = 10 ** allowedPrecision;
  if (Math.abs(value * factor - Math.round(value * factor)) > 1e-6) {
    return `${criterion.name} allows ${allowedPrecision} decimal(s)`;
  }
  return null;
}
