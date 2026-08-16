import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { seedReferenceDataInternal } from "./seed";
import { maybeBootstrapPlatformOwner } from "./platform/bootstrap";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    return profile;
  },
});

export const ensureUserProfile = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"userProfiles">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Not signed in",
      });
    }
    await seedReferenceDataInternal(ctx);
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (existing) {
      const email = identity.email ?? existing.email;
      await ctx.db.patch(existing._id, {
        name: identity.name ?? existing.name,
        email,
        image: identity.pictureUrl ?? existing.image,
        lastLoginAt: Date.now(),
      });
      await maybeBootstrapPlatformOwner(ctx, { ...existing, email });
      return existing._id;
    }
    const settings = await ctx.db.query("platformSettings").first();
    if (settings && !settings.allowSignups) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "New signups are temporarily closed",
      });
    }
    const email = identity.email ?? "";
    const id = await ctx.db.insert("userProfiles", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "",
      email,
      image: identity.pictureUrl ?? "",
      platformRole: null,
      status: "active",
      lastLoginAt: Date.now(),
    });
    await maybeBootstrapPlatformOwner(ctx, { _id: id, email, platformRole: null });
    return id;
  },
});
