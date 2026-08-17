import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    testTimeout: 30000,
    include: ["convex-test/**/*.test.ts", "components/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
