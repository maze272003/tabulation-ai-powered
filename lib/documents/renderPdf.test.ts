// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderPdfBuffer } from "./renderPdf";
import { SYSTEM_CERTIFICATE_TEMPLATES } from "../../convex/documents/systemTemplates";
import { sampleTokenMap } from "./tokens";
import { validSpec } from "../../convex-test/documentFixtures";

describe("renderPdf", () => {
  it("renders each system certificate template into a valid PDF", async () => {
    for (const template of SYSTEM_CERTIFICATE_TEMPLATES) {
      const bytes = await renderPdfBuffer([{ spec: template.spec, tokens: sampleTokenMap() }], {});
      expect(bytes.length).toBeGreaterThan(1000);
      const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
      expect(header).toBe("%PDF-");
    }
  });

  it("renders a tokenized spec with sample data", async () => {
    const bytes = await renderPdfBuffer(
      [{ spec: validSpec, tokens: { "recipient.name": "Zephyra" } }],
      {},
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });
});
