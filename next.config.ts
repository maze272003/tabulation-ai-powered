import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: The build script runs TypeScript 7 (`tsc --noEmit`) before Next.js,
  // which serves as the project's type gate. We previously set
  // `typescript.ignoreBuildErrors: true` to work around a TS7/Next 16 compiler
  // API mismatch; re-tested on 2026-08-12 and Next 16.3 + TS 7 now type-checks
  // cleanly during `next build`, so the override has been removed.
};

export default nextConfig;
