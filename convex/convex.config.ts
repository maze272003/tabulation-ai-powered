import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp({
  env: {
    // First platform owner is bootstrapped from this email during profile
    // provisioning. Set with `npx convex env set PLATFORM_OWNER_EMAIL=...`.
    PLATFORM_OWNER_EMAIL: v.optional(v.string()),
  },
});

app.use(betterAuth);

export default app;
