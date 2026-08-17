import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

export async function seedE2EDatabase() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "https://calculating-viper-382.convex.cloud";
  const client = new ConvexHttpClient(convexUrl);
  const result = await client.mutation(api.seed.seedE2EData, {});
  return result;
}
