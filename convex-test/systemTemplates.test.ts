import { describe, expect, it } from "vitest";
import { SYSTEM_CERTIFICATE_TEMPLATES } from "../convex/documents/systemTemplates";
import { isDocumentSpec } from "../convex/documents/spec";

describe("SYSTEM_CERTIFICATE_TEMPLATES", () => {
  it("every system certificate template spec passes isDocumentSpec", () => {
    expect(SYSTEM_CERTIFICATE_TEMPLATES.length).toBeGreaterThan(0);
    for (const template of SYSTEM_CERTIFICATE_TEMPLATES) {
      expect(
        isDocumentSpec(template.spec),
        `Template "${template.name}" failed isDocumentSpec validation`,
      ).toBe(true);
    }
  });
});
