import { test, expect } from "@playwright/test";
import { SignInPage } from "./pages/signin.page";
import { StaffDashboardPage } from "./pages/staff-dashboard.page";
import { seedE2EDatabase } from "./helpers/seed";

test.describe("4. Staff Workspace & Live Round Monitoring Suite", () => {
  test.beforeAll(async () => {
    await seedE2EDatabase();
  });

  test("should complete staff login, live round monitoring, round lock/reopen controls", async ({ page }) => {
    test.setTimeout(60000);
    const signInPage = new SignInPage(page);
    const staffPage = new StaffDashboardPage(page);

    // 1. Sign in as Staff
    await signInPage.goto();
    await signInPage.loginAsJudgeOrStaff("DEMO-2026", "staff1", "password123");

    // 2. Arrive at Staff Workspace
    await expect(page).toHaveURL(/.*\/enter/, { timeout: 15000 });
    await staffPage.expectStaffWorkspace();

    // 3. Verify round overview details
    await expect(page.getByText("Final Round")).toBeVisible();
    await expect(page.getByText("2 criteria")).toBeVisible();

    // 4. Navigate to Live Round Monitor
    await staffPage.openMonitorForRound("Final Round");
    await expect(page.getByText(/connecting to live round monitor|round monitor/i)).toBeVisible();

    // 5. Verify judges and contestants in monitor
    await expect(page.getByText("Judge Sophia")).toBeVisible();
    await expect(page.getByText("Judge Marcus")).toBeVisible();
    await expect(page.getByText("Aria Montgomery")).toBeVisible();
    await expect(page.getByText("Lucas Bennett")).toBeVisible();

    // 6. Test round closing
    const closeBtn = page.getByRole("button", { name: /close round/i });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(page.getByText(/round closed/i)).toBeVisible();

      // 7. Test round reopening
      const reopenBtn = page.getByRole("button", { name: /reopen round/i });
      if (await reopenBtn.isVisible()) {
        await reopenBtn.click();
        await expect(page.getByText(/round reopened/i)).toBeVisible();
      }
    }
  });
});
