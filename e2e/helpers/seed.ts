import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

/**
 * Seeds the shared E2E fixture event. The backend mutation is gated by the
 * E2E_SEED_TOKEN deployment secret — set it in the dev deployment
 * (`npx convex env set E2E_SEED_TOKEN=...`) and export the same value here
 * before running Playwright. Production deployments leave it unset, which
 * disables seeding entirely.
 */
export async function seedE2EDatabase() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "https://calculating-viper-382.convex.cloud";
  const seedToken = process.env.E2E_SEED_TOKEN;
  if (!seedToken) {
    throw new Error(
      "E2E_SEED_TOKEN is not set. Configure it on the dev deployment with " +
        "`npx convex env set E2E_SEED_TOKEN=...` and export it in your shell before running e2e tests.",
    );
  }
  const client = new ConvexHttpClient(convexUrl);
  const result = await client.mutation(api.seed.seedE2EData, { token: seedToken });
  return result;
}
