import { describe, expect, it } from "vitest";
import {
  formatScore,
  roundStatusLabel,
  roundStatusTone,
  sheetStatusLabel,
  sheetStatusTone,
  tieResolvedByLabel,
} from "./status";

describe("formatScore", () => {
  it("keeps trailing zeros at the requested precision", () => {
    expect(formatScore(89.2, 2)).toBe("89.20");
    expect(formatScore(87.5, 1)).toBe("87.5");
    expect(formatScore(100, 0)).toBe("100");
  });

  it("renders an em dash for missing values", () => {
    expect(formatScore(null, 2)).toBe("—");
    expect(formatScore(undefined, 1)).toBe("—");
  });
});

describe("status vocabulary", () => {
  it("labels every sheet status with a tone", () => {
    for (const status of ["not_started", "in_progress", "submitted", "locked"] as const) {
      expect(sheetStatusLabel[status].length).toBeGreaterThan(0);
      expect(sheetStatusTone[status]).toBeDefined();
    }
  });

  it("labels every round status with a tone", () => {
    for (const status of ["open", "closed", "published"] as const) {
      expect(roundStatusLabel[status].length).toBeGreaterThan(0);
      expect(roundStatusTone[status]).toBeDefined();
    }
  });

  it("labels tie resolution sources", () => {
    expect(tieResolvedByLabel.criteria_cascade).toBe("criteria cascade");
    expect(tieResolvedByLabel.judge_firsts).toBe("judge firsts");
    expect(tieResolvedByLabel.manual).toBe("manual");
    expect(tieResolvedByLabel.none).toBe("—");
  });
});
