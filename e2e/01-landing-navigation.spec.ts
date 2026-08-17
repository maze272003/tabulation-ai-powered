import { test, expect } from "@playwright/test";
import { LandingPage } from "./pages/landing.page";

test.describe("1. Public Landing Page & Navigation Suite", () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.goto();
  });

  test("should render hero section, branding, and action buttons", async () => {
    await landingPage.expectHeroVisible();
  });

  test("should display key feature cards and 3-step workflow guide", async () => {
    await landingPage.expectFeaturesAndWorkflow();
  });

  test("should navigate to sign-in page from header CTA", async ({ page }) => {
    await landingPage.headerSignInBtn.click();
    await expect(page).toHaveURL(/.*\/sign-in/);
  });

  test("should navigate to sign-in from 'Start your event' CTA", async ({ page }) => {
    await landingPage.startEventBtn.click();
    await expect(page).toHaveURL(/.*\/sign-in/);
  });

  test("should navigate to sign-in from 'Judge sign in' CTA", async ({ page }) => {
    await landingPage.judgeSignInBtn.click();
    await expect(page).toHaveURL(/.*\/sign-in/);
  });

  test("should be responsive and display brand appropriately", async ({ page }) => {
    // Test on small viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(landingPage.brandLink).toBeVisible();
    await expect(landingPage.heroHeading).toBeVisible();
  });
});
