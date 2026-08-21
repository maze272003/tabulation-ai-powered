import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireOrgMember, requirePermission } from "../lib/authz";
import { appError, ErrorCode } from "../lib/errors";
import { writeAudit } from "../lib/audit";

const MAX_ASSET_URLS = 100;
const MAX_STORAGE_ID_LENGTH = 128;
const MAX_ASSET_NAME_LENGTH = 200;
const MAX_ASSET_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_ORG_ASSETS_LISTED = 200;
const ALLOWED_ASSET_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

export const generateUploadUrl = mutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    return await ctx.storage.generateUploadUrl();
  },
});

export const recordUpload = mutation({
  args: {
    orgSlug: v.string(),
    storageId: v.string(),
    name: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "documents.manage",
    });
    if (args.storageId.length < 1 || args.storageId.length > MAX_STORAGE_ID_LENGTH) {
      throw appError(ErrorCode.VALIDATION_ERROR, "storageId must be 1-128 characters");
    }
    const name = args.name.trim();
    if (name.length < 1 || name.length > MAX_ASSET_NAME_LENGTH) {
      throw appError(ErrorCode.VALIDATION_ERROR, "name must be 1-200 characters after trimming");
    }
    if (!ALLOWED_ASSET_CONTENT_TYPES.has(args.contentType)) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        "contentType must be image/png, image/jpeg, or image/svg+xml",
      );
    }
    if (!Number.isInteger(args.sizeBytes) || args.sizeBytes < 1 || args.sizeBytes > MAX_ASSET_SIZE_BYTES) {
      throw appError(ErrorCode.VALIDATION_ERROR, "sizeBytes must be an integer between 1 and 2 MiB");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("documentAssets")
      .withIndex("by_org_id_and_storage_id", (q) =>
        q.eq("orgId", actx.org._id).eq("storageId", args.storageId),
      )
      .unique();
    let assetId: Id<"documentAssets">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        contentType: args.contentType,
        sizeBytes: args.sizeBytes,
        createdAt: now,
      });
      assetId = existing._id;
    } else {
      assetId = await ctx.db.insert("documentAssets", {
        orgId: actx.org._id,
        storageId: args.storageId,
        name,
        contentType: args.contentType,
        sizeBytes: args.sizeBytes,
        createdAt: now,
      });
    }
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "documentAsset.recorded",
      resourceType: "documentAsset", resourceId: assetId, after: { name, storageId: args.storageId },
    });
  },
});

export const listByOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    const assets = await ctx.db
      .query("documentAssets")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .order("desc")
      .take(MAX_ORG_ASSETS_LISTED);
    // Upserts refresh createdAt without changing _creationTime (the index's
    // tiebreak), so a final sort is needed to order the page by createdAt.
    return [...assets].sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const assetUrls = query({
  args: { orgSlug: v.string(), storageIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    if (args.storageIds.length > MAX_ASSET_URLS) {
      throw appError(ErrorCode.VALIDATION_ERROR, "At most 100 storage ids per request");
    }
    const urls: Record<string, string | null> = {};
    for (const storageId of args.storageIds) {
      const asset = await ctx.db
        .query("documentAssets")
        .withIndex("by_org_id_and_storage_id", (q) =>
          q.eq("orgId", actx.org._id).eq("storageId", storageId),
        )
        .unique();
      // Unregistered ids resolve to null rather than erroring so stale spec
      // references degrade gracefully in the editor.
      if (!asset) {
        urls[storageId] = null;
        continue;
      }
      urls[storageId] = await ctx.storage.getUrl(storageId);
    }
    return urls;
  },
});

function isImageElementReferencing(value: unknown, storageId: string): boolean {
  if (typeof value !== "object" || value === null) return false;
  const element = value as Record<string, unknown>;
  return element.type === "image" && element.storageId === storageId;
}

// Template specs are persisted as v.any(); defensive runtime checks keep a
// malformed historical spec from crashing the whole cleanup pass.
function specReferencesStorageId(spec: unknown, storageId: string): boolean {
  if (typeof spec !== "object" || spec === null) return false;
  const elements = (spec as Record<string, unknown>).elements;
  return Array.isArray(elements) && elements.some((element) => isImageElementReferencing(element, storageId));
}

export async function deleteUnreferencedOrgAssets(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<void> {
  const assets = await ctx.db
    .query("documentAssets")
    .withIndex("by_org_id", (q) => q.eq("orgId", orgId))
    .collect();
  const templates = await ctx.db
    .query("documentTemplates")
    .withIndex("by_org_id", (q) => q.eq("orgId", orgId))
    .collect();

  for (const asset of assets) {
    const referenced = templates.some((template) =>
      specReferencesStorageId(template.spec, asset.storageId),
    );
    if (referenced) continue;
    try {
      await ctx.storage.delete(asset.storageId);
    } catch {
      // The blob may already be gone; the registry row must still be removed
      // so the registry stays consistent with storage.
    }
    await ctx.db.delete(asset._id);
  }
}
