import type { Doc } from "../_generated/dataModel";

export function checkValue(criterion: Doc<"criteria">, value: number): string | null {
  if (value < criterion.minScore || value > criterion.maxScore) {
    return `${criterion.name} must be between ${criterion.minScore} and ${criterion.maxScore}`;
  }
  const factor = 10 ** criterion.decimalPrecision;
  if (Math.abs(value * factor - Math.round(value * factor)) > 1e-9) {
    return `${criterion.name} allows ${criterion.decimalPrecision} decimal(s)`;
  }
  return null;
}
