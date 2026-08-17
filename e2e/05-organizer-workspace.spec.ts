import { test, expect } from "@playwright/test";
import { seedE2EDatabase } from "./helpers/seed";

test.describe("5. Organizer Dashboard & Event Workspace Security Suite", () => {
  test.beforeAll(async () => {
    await seedE2EDatabase();
  });

  test("should enforce unauthenticated route protection on organizer workspace root", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fapp/);
  });

  test("should enforce unauthenticated route protection on organization overview", async ({ page }) => {
    await page.goto("/app/e2e-org/overview");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fapp%2Fe2e-org%2Foverview/);
  });

  test("should enforce unauthenticated route protection on events list", async ({ page }) => {
    await page.goto("/app/e2e-org/events");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fapp%2Fe2e-org%2Fevents/);
  });

  test("should enforce unauthenticated route protection on event creation page", async ({ page }) => {
    await page.goto("/app/e2e-org/events/new");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fapp%2Fe2e-org%2Fevents%2Fnew/);
  });

  test("should enforce unauthenticated route protection on event sub-pages (rounds, categories, accounts)", async ({ page }) => {
    await page.goto("/app/e2e-org/events/e2e-event/rounds");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fapp%2Fe2e-org%2Fevents%2Fe2e-event%2Frounds/);

    await page.goto("/app/e2e-org/events/e2e-event/accounts");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fapp%2Fe2e-org%2Fevents%2Fe2e-event%2Faccounts/);
  });
});
