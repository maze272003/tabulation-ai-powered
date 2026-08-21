/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { deleteUnreferencedOrgAssets } from "../convex/documents/assets";
import { validSpec } from "./documentFixtures";
import {
  addOrgMemberWithoutDocumentsManage,
  aliceIdentity,
  bobIdentity,
  createOrgAndEvent,
  setupTest,
} from "./setup";

// convex-test ids have the shape `<counter digits><tableName>`, and its
// storage syscalls reject ids without a recognizable table suffix. Fake
// storage ids need that shape for ctx.storage.getUrl to behave like the real
// backend (null for a missing blob) instead of throwing on id validation.
const registeredStorageId = "000000000000000000000001_storage";
const unregisteredStorageId = "000000000000000000000002_storage";

const uploadArgs = {
  orgSlug: "acme",
  storageId: registeredStorageId,
  name: "logo.png",
  contentType: "image/png",
  sizeBytes: 1024,
} as const;

async function acmeOrgId(t: ReturnType<typeof setupTest>): Promise<Id<"organizations">> {
  const org = await t.run(async (ctx) =>
    ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", "acme"))
      .unique(),
  );
  if (!org) throw new Error("acme org not found");
  return org._id;
}

describe("documents: org asset registry", () => {
  it("rejects recordUpload for a member without documents.manage", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await addOrgMemberWithoutDocumentsManage(t, "acme", bobIdentity);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.documents.assets.recordUpload, uploadArgs),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("rejects invalid recordUpload payloads", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const alice = t.withIdentity(aliceIdentity);
    const invalidPayloads = [
      { ...uploadArgs, storageId: "" },
      { ...uploadArgs, name: "   " },
      { ...uploadArgs, contentType: "image/gif" },
      { ...uploadArgs, sizeBytes: 0 },
      { ...uploadArgs, sizeBytes: 2 * 1024 * 1024 + 1 },
      { ...uploadArgs, sizeBytes: 1.5 },
    ];
    for (const payload of invalidPayloads) {
      await expect(
        alice.mutation(api.documents.assets.recordUpload, payload),
      ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    }
  });

  it("upserts by (orgId, storageId): re-recording patches instead of duplicating", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const alice = t.withIdentity(aliceIdentity);
    await alice.mutation(api.documents.assets.recordUpload, uploadArgs);
    await alice.mutation(api.documents.assets.recordUpload, {
      ...uploadArgs,
      name: "renamed.png",
      sizeBytes: 2048,
    });
    const assets = await alice.query(api.documents.assets.listByOrg, { orgSlug: "acme" });
    expect(assets).toHaveLength(1);
    expect(assets[0].name).toBe("renamed.png");
    expect(assets[0].sizeBytes).toBe(2048);
  });

  it("scopes listByOrg to the caller's organization", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await createOrgAndEvent(t, bobIdentity, { orgSlug: "bobs", eventSlug: "expo" });
    await t.withIdentity(aliceIdentity).mutation(api.documents.assets.recordUpload, {
      orgSlug: "acme",
      storageId: "alice-asset",
      name: "a.png",
      contentType: "image/png",
      sizeBytes: 10,
    });
    await t.withIdentity(bobIdentity).mutation(api.documents.assets.recordUpload, {
      orgSlug: "bobs",
      storageId: "bob-asset",
      name: "b.png",
      contentType: "image/png",
      sizeBytes: 20,
    });
    const bobAssets = await t
      .withIdentity(bobIdentity)
      .query(api.documents.assets.listByOrg, { orgSlug: "bobs" });
    expect(bobAssets.map((asset) => asset.storageId)).toEqual(["bob-asset"]);
  });

  it("maps unregistered storage ids to null without erroring", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const alice = t.withIdentity(aliceIdentity);
    await alice.mutation(api.documents.assets.recordUpload, uploadArgs);
    // The test backend has no uploaded blob for the registered id either, so
    // both entries resolve to null. The contract under test: unregistered ids
    // map to null (not an error) and every requested id gets an entry.
    const urls = await alice.query(api.documents.assets.assetUrls, {
      orgSlug: "acme",
      storageIds: [uploadArgs.storageId, unregisteredStorageId],
    });
    expect(Object.keys(urls)).toHaveLength(2);
    expect(urls[unregisteredStorageId]).toBeNull();
    expect(urls[uploadArgs.storageId]).toBeNull();
  });

  it("handles malformed storage ids gracefully without throwing", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const alice = t.withIdentity(aliceIdentity);
    await alice.mutation(api.documents.assets.recordUpload, {
      ...uploadArgs,
      storageId: "upload",
    });
    const urls = await alice.query(api.documents.assets.assetUrls, {
      orgSlug: "acme",
      storageIds: ["upload"],
    });
    expect(urls).toEqual({ upload: null });
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

  it("deleteUnreferencedOrgAssets removes only unreferenced assets", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const alice = t.withIdentity(aliceIdentity);
    await alice.mutation(api.documents.assets.recordUpload, {
      ...uploadArgs,
      storageId: "asset-a",
      name: "a.png",
    });
    await alice.mutation(api.documents.assets.recordUpload, {
      ...uploadArgs,
      storageId: "asset-b",
      name: "b.png",
    });

    const orgId = await acmeOrgId(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("documentTemplates", {
        orgId,
        kind: "certificate",
        name: "With Logo",
        description: "",
        spec: {
          ...validSpec,
          elements: [
            ...validSpec.elements,
            {
              type: "image",
              id: "el-img",
              name: "Logo",
              xMm: 10,
              yMm: 10,
              widthMm: 30,
              heightMm: 30,
              rotationDeg: 0,
              opacity: 1,
              locked: false,
              showOnAllPages: false,
              storageId: "asset-a",
              fit: "contain",
            },
          ],
        },
        isSystem: false,
        updatedAt: Date.now(),
      });
    });

    await t.run((ctx) => deleteUnreferencedOrgAssets(ctx, orgId));

    const remaining = await alice.query(api.documents.assets.listByOrg, { orgSlug: "acme" });
    expect(remaining.map((asset) => asset.storageId)).toEqual(["asset-a"]);
  });
});
