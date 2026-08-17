import { test, expect } from "@playwright/test";
import { seedE2EDatabase } from "./helpers/seed";

test.describe("6. Platform Administration & System Resilience Suite", () => {
  test.beforeAll(async () => {
    await seedE2EDatabase();
  });

  test("should enforce unauthenticated route protection on /platform", async ({ page }) => {
    await page.goto("/platform");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fplatform/);
  });

  test("should enforce unauthenticated route protection on /platform sub-routes", async ({ page }) => {
    await page.goto("/platform/organizations");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fplatform%2Forganizations/);

    await page.goto("/platform/audit");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fplatform%2Faudit/);
  });

  test("should handle non-existent pages with 404 or safe redirect", async ({ page }) => {
    const response = await page.goto("/non-existent-page-xyz-123");
    expect([200, 404]).toContain(response?.status());
  });
});
