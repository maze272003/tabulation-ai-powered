import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex-test/**/*.test.ts"],
    alias: {
      convex: "convex-test/convex-shim.ts",
    },
  },
});
