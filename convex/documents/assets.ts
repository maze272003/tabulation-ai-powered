import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireOrgMember } from "../lib/authz";

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
    const urls: Record<string, string | null> = {};
    for (const storageId of args.storageIds.slice(0, MAX_ASSET_URLS)) {
      urls[storageId] = await ctx.storage.getUrl(storageId);
    }
    return urls;
  },
});
