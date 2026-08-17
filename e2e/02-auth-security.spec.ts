import { test, expect } from "@playwright/test";
import { SignInPage } from "./pages/signin.page";
import { seedE2EDatabase } from "./helpers/seed";

test.describe("2. Authentication & Access Security Suite", () => {
  let signInPage: SignInPage;

  test.beforeAll(async () => {
    await seedE2EDatabase();
  });

  test.beforeEach(async ({ page }) => {
    signInPage = new SignInPage(page);
    await signInPage.goto();
  });

  test("should render dual-tab sign in interface", async () => {
    await expect(signInPage.orgTab).toBeVisible();
    await expect(signInPage.eventTab).toBeVisible();
  });

  test("should display Google SSO button on Organization tab", async () => {
    await signInPage.switchToOrgTab();
    await expect(signInPage.googleSignInBtn).toBeVisible();
    await expect(signInPage.googleSignInBtn).toContainText(/continue with google/i);
  });

  test("should prefill event code from URL query parameter", async ({ page }) => {
    await page.goto("/sign-in?code=DEMO-2026");
    await signInPage.switchToEventTab();
    await expect(signInPage.eventCodeInput).toHaveValue("DEMO-2026");
  });

  test("should reject invalid event code and credentials with descriptive error message", async () => {
    await signInPage.loginAsJudgeOrStaff("INVALID-CODE", "wronguser", "badpass123");
    await signInPage.expectError(/authentication failed|not found/i);
  });

  test("should redirect unauthenticated access to /enter back to /sign-in", async ({ page }) => {
    await page.goto("/enter");
    await expect(page).toHaveURL(/.*\/sign-in/);
  });

  test("should redirect unauthenticated access to /app back to /sign-in with next parameter", async ({ page }) => {
    await page.goto("/app/e2e-org/events");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fapp%2Fe2e-org%2Fevents/);
  });

  test("should redirect unauthenticated access to /platform back to /sign-in with next parameter", async ({ page }) => {
    await page.goto("/platform");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fplatform/);
  });
});
