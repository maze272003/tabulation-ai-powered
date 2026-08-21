/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import {
  addOrgMemberWithoutDocumentsManage,
  aliceIdentity,
  bobIdentity,
  createOrgAndEvent,
  setupTest,
} from "./setup";

describe("documents.ai.generateFromPrompt", () => {
  it("rejects members without documents.manage", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await addOrgMemberWithoutDocumentsManage(t, "acme", bobIdentity);
    await expect(
      t.withIdentity(bobIdentity).action(api.documents.ai.generateFromPrompt, {
        orgSlug: "acme",
        prompt: "gold certificate",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("returns UPSTREAM when Gemini is unconfigured (real path, no network)", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    // Each attempt consumes quota but fails at the Gemini call; the second
    // call proves the first attempt's quota did not trigger LIMIT_EXCEEDED.
    for (const prompt of ["gold certificate", "silver certificate"]) {
      await expect(
        t.withIdentity(aliceIdentity).action(api.documents.ai.generateFromPrompt, {
          orgSlug: "acme",
          prompt,
        }),
      ).rejects.toMatchObject({ data: { code: "UPSTREAM" } });
    }
  });

  it("enforces the daily limit after 20 attempts", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    for (let i = 0; i < 20; i++) {
      await t
        .withIdentity(aliceIdentity)
        .action(api.documents.ai.generateFromPrompt, {
          orgSlug: "acme",
          prompt: `certificate attempt ${i}`,
        })
        .catch(() => {});
    }
    await expect(
      t.withIdentity(aliceIdentity).action(api.documents.ai.generateFromPrompt, {
        orgSlug: "acme",
        prompt: "one more",
      }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });

  it("rejects empty and oversized prompts with VALIDATION_ERROR", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    for (const prompt of ["   ", "x".repeat(2001)]) {
      await expect(
        t.withIdentity(aliceIdentity).action(api.documents.ai.generateFromPrompt, {
          orgSlug: "acme",
          prompt,
        }),
      ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    }
  });
});
