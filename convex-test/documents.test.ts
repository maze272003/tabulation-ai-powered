/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, createOrgAndEvent, setupTest } from "./setup";
import { isDocumentSpec } from "../convex/documents/spec";

describe("documents: system templates", () => {
  it("seeds exactly three valid system certificate templates", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const list = await t.withIdentity(aliceIdentity).query(api.documents.templates.list, {
      orgSlug: "acme",
      kind: "certificate",
    });
    const system = list.filter((x) => x.isSystem);
    expect(system.map((x) => x.name).sort()).toEqual([
      "Classic Border Certificate",
      "Elegant Script Certificate",
      "Modern Minimal Certificate",
    ]);
    for (const tpl of system) {
      expect(isDocumentSpec(tpl.spec)).toBe(true);
    }
  });

  it("is idempotent when seeding runs again", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await t.mutation(api.seed.seedReferenceData, {});
    const list = await t.withIdentity(aliceIdentity).query(api.documents.templates.list, {
      orgSlug: "acme",
      kind: "certificate",
    });
    expect(list.filter((x) => x.isSystem)).toHaveLength(3);
  });
});
