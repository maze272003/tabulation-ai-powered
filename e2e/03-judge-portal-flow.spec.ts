import { test, expect } from "@playwright/test";
import { SignInPage } from "./pages/signin.page";
import { JudgeWorkspacePage } from "./pages/judge-workspace.page";
import { JudgeSheetPage } from "./pages/judge-sheet.page";
import { seedE2EDatabase } from "./helpers/seed";

test.describe("3. Judge Workspace & Score Entry Suite", () => {
  test.beforeAll(async () => {
    await seedE2EDatabase();
  });

  test("should complete end-to-end judge login, scoring, draft saving, and submission flow", async ({ page }) => {
    test.setTimeout(60000);
    const signInPage = new SignInPage(page);
    const judgeWorkspace = new JudgeWorkspacePage(page);
    const judgeSheet = new JudgeSheetPage(page);

    // 1. Sign in as Judge 1
    await signInPage.goto();
    await signInPage.loginAsJudgeOrStaff("DEMO-2026", "judge1", "password123");

    // 2. Arrive at Judge Workspace
    await expect(page).toHaveURL(/.*\/enter/, { timeout: 15000 });
    await judgeWorkspace.expectWelcome("Judge Sophia");

    // 3. Verify assigned contestants are listed
    await expect(page.getByText("Aria Montgomery")).toBeVisible();
    await expect(page.getByText("Lucas Bennett")).toBeVisible();

    // 4. Open Score Sheet for Aria Montgomery
    await judgeWorkspace.openSheetForContestant("Aria Montgomery");
    await judgeSheet.expectContestant("Aria Montgomery", 1);

    // 5. Fill criteria scores
    await judgeSheet.fillScore("Technical Execution", "9.2");
    await judgeSheet.fillScore("Artistic Presentation", "8.8");

    // 6. Verify total score calculation pill (9.2 + 8.8 = 18.00)
    await expect(judgeSheet.totalScoreBadge).toHaveText("18.00");

    // 7. Save Draft
    await judgeSheet.saveDraft();

    // 8. Submit and Lock with confirmation dialog
    await judgeSheet.submitAndLock();

    // 9. Redirected back to Judge Workspace
    await expect(page).toHaveURL(/.*\/enter/);

    // 10. Re-open sheet to verify immutable/locked status
    await judgeWorkspace.openSheetForContestant("Aria Montgomery");
    await expect(page.getByText(/this sheet is submitted and locked/i)).toBeVisible();

    // 11. Logout
    const logoutBtn = page.getByRole("button", { name: /leave event|log out|sign out/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/.*\/sign-in/);
    }
  });
});
