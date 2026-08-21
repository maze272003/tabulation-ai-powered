/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, addOrgMemberWithoutDocumentsManage, createOrgAndEvent, setupTest } from "./setup";
import { isDocumentSpec } from "../convex/documents/spec";
import { validSpec } from "./documentFixtures";

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

describe("documents: template CRUD authz and validation", () => {
  async function orgTemplateId(t: ReturnType<typeof setupTest>) {
    const created = await t.withIdentity(aliceIdentity).mutation(api.documents.templates.create, {
      orgSlug: "acme",
      name: "My Certificate",
      kind: "certificate",
      spec: validSpec,
    });
    return created.templateId;
  }

  it("creates, updates, and reads back an org template", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const templateId = await orgTemplateId(t);
    const renamed = {
      ...validSpec,
      elements: [...validSpec.elements, { ...validSpec.elements[0], id: "el-2", name: "Second" }],
    };
    await t.withIdentity(aliceIdentity).mutation(api.documents.templates.update, {
      orgSlug: "acme", templateId, name: "Renamed", spec: renamed,
    });
    const got = await t.withIdentity(aliceIdentity).query(api.documents.templates.get, { orgSlug: "acme", templateId });
    expect(got.name).toBe("Renamed");
    expect(got.spec.elements).toHaveLength(2);
  });

  it("rejects non-members", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    // Provision bob so the assertion exercises membership rejection, not profile absence.
    await t.withIdentity(bobIdentity).mutation(api.auth.ensureUserProfile, {});
    const templateId = await orgTemplateId(t);
    await expect(
      t.withIdentity(bobIdentity).query(api.documents.templates.get, { orgSlug: "acme", templateId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("rejects invalid specs on create and update", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.documents.templates.create, {
        orgSlug: "acme", name: "Bad", kind: "certificate", spec: { hello: "world" },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    const templateId = await orgTemplateId(t);
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.documents.templates.update, {
        orgSlug: "acme", templateId, spec: { version: 1, page: null },
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it("refuses to update or delete system templates and isolates orgs", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const list = await t.withIdentity(aliceIdentity).query(api.documents.templates.list, { orgSlug: "acme", kind: "certificate" });
    const systemId = list.find((x) => x.isSystem)!._id;
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.documents.templates.update, { orgSlug: "acme", templateId: systemId, name: "Nope" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.documents.templates.remove, { orgSlug: "acme", templateId: systemId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

    await createOrgAndEvent(t, bobIdentity, { orgSlug: "bobs", eventSlug: "expo" });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.documents.templates.update, {
        orgSlug: "bobs", templateId: systemId, name: "Hijack",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

    // Org templates from another org are invisible (NOT_FOUND, not FORBIDDEN).
    const aliceTemplateId = await orgTemplateId(t);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.documents.templates.update, {
        orgSlug: "bobs", templateId: aliceTemplateId, name: "Hijack",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("duplicates a system template into the org with provenance", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const list = await t.withIdentity(aliceIdentity).query(api.documents.templates.list, { orgSlug: "acme", kind: "certificate" });
    const systemId = list.find((x) => x.isSystem)!._id;
    const { templateId } = await t.withIdentity(aliceIdentity).mutation(api.documents.templates.duplicate, {
      orgSlug: "acme", templateId: systemId, name: "My Classic",
    });
    const got = await t.withIdentity(aliceIdentity).query(api.documents.templates.get, { orgSlug: "acme", templateId });
    expect(got.name).toBe("My Classic");
    expect(got.isSystem).toBe(false);
    expect(got.sourceTemplateId).toBe(systemId);
  });

  it("writes audit rows for create and remove", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const templateId = await orgTemplateId(t);
    await t.withIdentity(aliceIdentity).mutation(api.documents.templates.remove, { orgSlug: "acme", templateId });
    const audit = await t.withIdentity(aliceIdentity).query(api.audit.listByOrg, {
      orgSlug: "acme",
      paginationOpts: { numItems: 50, cursor: null },
    });
    const actions = audit.page.map((row: { action: string; resourceType: string }) => `${row.action}:${row.resourceType}`);
    expect(actions).toContain("documentTemplate.created:documentTemplate");
    expect(actions).toContain("documentTemplate.deleted:documentTemplate");
  });
});

describe("documents: read-only member and asset url limits", () => {
  it("lets a member without documents.manage list and get templates", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const { templateId } = await t.withIdentity(aliceIdentity).mutation(api.documents.templates.create, {
      orgSlug: "acme", name: "My Certificate", kind: "certificate", spec: validSpec,
    });
    await addOrgMemberWithoutDocumentsManage(t, "acme", bobIdentity);

    const list = await t.withIdentity(bobIdentity).query(api.documents.templates.list, {
      orgSlug: "acme", kind: "certificate",
    });
    expect(list.length).toBeGreaterThan(0);
    const got = await t.withIdentity(bobIdentity).query(api.documents.templates.get, {
      orgSlug: "acme", templateId,
    });
    expect(got._id).toBe(templateId);
  });

  it("rejects template writes for a member without documents.manage", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const { templateId } = await t.withIdentity(aliceIdentity).mutation(api.documents.templates.create, {
      orgSlug: "acme", name: "My Certificate", kind: "certificate", spec: validSpec,
    });
    await addOrgMemberWithoutDocumentsManage(t, "acme", bobIdentity);
    const bob = t.withIdentity(bobIdentity);

    await expect(
      bob.mutation(api.documents.templates.create, { orgSlug: "acme", name: "Nope", kind: "certificate", spec: validSpec }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      bob.mutation(api.documents.templates.update, { orgSlug: "acme", templateId, name: "Nope" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      bob.mutation(api.documents.templates.duplicate, { orgSlug: "acme", templateId, name: "Nope" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      bob.mutation(api.documents.templates.remove, { orgSlug: "acme", templateId }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("rejects assetUrls with more than 100 storage ids", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).query(api.documents.assets.assetUrls, {
        orgSlug: "acme",
        storageIds: Array.from({ length: 101 }, (_, i) => `storage-${i}`),
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });
});
