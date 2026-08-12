import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: identity.name ?? existing.name,
        email: identity.email ?? existing.email,
        image: identity.pictureUrl ?? existing.image,
        lastLoginAt: Date.now(),
      });
      return existing._id;
    }
    const id = await ctx.db.insert("userProfiles", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "",
      email: identity.email ?? "",
      image: identity.pictureUrl ?? "",
      platformRole: null,
      status: "active",
      lastLoginAt: Date.now(),
    });
    return id;
  },
});
