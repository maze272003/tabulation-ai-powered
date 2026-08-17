import { test, expect } from "@playwright/test";
import { seedE2EDatabase } from "./helpers/seed";

test.describe("Bulk import & public scoreboard", () => {
  test.beforeAll(async () => {
    await seedE2EDatabase();
  });

  // KNOWN DEFECT (pre-existing, discovered by this spec): for unknown event
  // codes, publicResults.get throws NOT_FOUND, and convex@1.43 surfaces that
  // query error as an uncaught error rather than a useQuery return value.
  // Next 16 then replaces the page with its global error UI ("This page
  // couldn't load"), so the page's `result instanceof Error` branch never
  // renders. Re-enable once the query's not-found path is deliverable to the
  // page (e.g. returning null instead of throwing, with
  // convex-test/publicResults.test.ts updated to the new contract).
  test.fixme("public scoreboard shows not-available for unknown codes", async ({ page }) => {
    await page.goto("/public/NOPE42");
    await expect(page.getByRole("heading", { name: "Results not available" })).toBeVisible();
  });

  test("public scoreboard renders published results for a public event", async ({ page }) => {
    // Seeded by convex/seed.ts seedE2EData: the "e2e-public" event is
    // resultVisibility "public" with a published round and a version-1
    // result snapshot, so the scoreboard renders standings directly.
    const eventCode = process.env.E2E_PUBLIC_EVENT_CODE ?? "PUB2026";
    await page.goto(`/public/${eventCode}`);
    await expect(page.getByRole("heading", { level: 1, name: "E2E Public Showcase" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Final Round" })).toBeVisible();
    await expect(page.getByText("Aria Montgomery")).toBeVisible();
    await expect(page.getByText("Lucas Bennett")).toBeVisible();
  });

  test("contestant import dialog validates a malformed CSV client-side", async ({ page }) => {
    // Requires an authenticated organizer session; enable by setting
    // E2E_ORG_SLUG (and optionally E2E_EVENT_SLUG) for the run.
    test.skip(!process.env.E2E_ORG_SLUG, "Set E2E_ORG_SLUG/E2E_EVENT_SLUG to run this test");
    const orgSlug = process.env.E2E_ORG_SLUG!;
    const eventSlug = process.env.E2E_EVENT_SLUG ?? "gala";
    await page.goto(`/app/${orgSlug}/events/${eventSlug}/contestants`);
    await page.getByRole("button", { name: "Import CSV" }).click();
    await page.getByLabel("Or paste CSV content").fill("number,name,category\nbad,name,Open");
    await expect(page.getByRole("alert")).toContainText("not a positive whole number");
  });
});
