import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp({
  env: {
    // First platform owner is bootstrapped from this email during profile
    // provisioning. Set with `npx convex env set PLATFORM_OWNER_EMAIL=...`.
    PLATFORM_OWNER_EMAIL: v.optional(v.string()),
    // Superadmin console credentials. Override the hardcoded defaults per
    // deployment: `npx convex env set SUPERADMIN_USERNAME=... SUPERADMIN_PASSWORD=...`
    SUPERADMIN_USERNAME: v.optional(v.string()),
    SUPERADMIN_PASSWORD: v.optional(v.string()),
    // Shared secret that enables the E2E fixture seeding mutation on dev
    // deployments. Must stay unset in production so seedE2EData refuses all
    // callers. Set with `npx convex env set E2E_SEED_TOKEN=...` on dev only.
    E2E_SEED_TOKEN: v.optional(v.string()),
  },
});

app.use(betterAuth);

export default app;
