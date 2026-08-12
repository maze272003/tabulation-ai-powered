import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userProfiles: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    image: v.string(),
    platformRole: v.union(v.null(), v.literal("platform_owner")),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("suspended")),
    lastLoginAt: v.number(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),
});
