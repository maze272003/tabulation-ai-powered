import { test, expect } from "@playwright/test";

test.describe("Landing Page & Basic Navigation Smoke Tests", () => {
  test("should render the landing page with main header, branding, and hero section", async ({
    page,
  }) => {
    await page.goto("/");

    // Verify main brand name in header
    const brand = page.locator("header").getByRole("link", { name: "Tabulation" });
    await expect(brand).toBeVisible();

    // Verify primary hero heading
    const heroHeading = page.getByRole("heading", {
      level: 1,
      name: /run fair, transparent scoring/i,
    });
    await expect(heroHeading).toBeVisible();

    // Verify call-to-action buttons
    const startEventBtn = page.getByRole("link", { name: /start your event/i });
    await expect(startEventBtn).toBeVisible();

    const judgeSignInBtn = page.getByRole("link", { name: /judge sign in/i });
    await expect(judgeSignInBtn).toBeVisible();
  });

  test("should display key feature highlights and workflow steps", async ({
    page,
  }) => {
    await page.goto("/");

    // Check Features section heading
    const featuresHeading = page.getByRole("heading", {
      name: /everything a tabulation team needs/i,
    });
    await expect(featuresHeading).toBeVisible();

    // Check specific feature cards
    await expect(page.getByText("Event command center")).toBeVisible();
    await expect(page.getByText("Secure judge access")).toBeVisible();
    await expect(page.getByText("Instant tabulation")).toBeVisible();

    // Check workflow section
    const workflowHeading = page.getByRole("heading", {
      name: /from draft to results in three steps/i,
    });
    await expect(workflowHeading).toBeVisible();
  });

  test("should navigate to sign-in page from header", async ({ page }) => {
    await page.goto("/");

    // Click 'Sign in' button from header
    const headerSignInBtn = page.locator("header").getByRole("link", { name: "Sign in", exact: true });
    await expect(headerSignInBtn).toBeVisible();
    await headerSignInBtn.click();

    // Should arrive at sign-in page
    await expect(page).toHaveURL(/.*sign-in/);
  });
});
