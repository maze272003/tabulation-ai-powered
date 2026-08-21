import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireOrgMember } from "../lib/authz";
import { appError, ErrorCode } from "../lib/errors";

const MAX_ASSET_URLS = 100;

export const generateUploadUrl = mutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    return await ctx.storage.generateUploadUrl();
  },
});

export const assetUrls = query({
  args: { orgSlug: v.string(), storageIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    if (args.storageIds.length > MAX_ASSET_URLS) {
      throw appError(ErrorCode.VALIDATION_ERROR, "At most 100 storage ids per request");
    }
    const urls: Record<string, string | null> = {};
    for (const storageId of args.storageIds) {
      urls[storageId] = await ctx.storage.getUrl(storageId);
    }
    return urls;
  },
});
