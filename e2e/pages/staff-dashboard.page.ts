import { type Page, type Locator, expect } from "@playwright/test";

export class StaffDashboardPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
  }

  async goto() {
    await this.page.goto("/enter");
  }

  async expectStaffWorkspace() {
    await expect(this.page.getByRole("heading", { name: /staff portal/i })).toBeVisible({ timeout: 20000 });
  }

  async openMonitorForRound(roundName: string) {
    const roundCard = this.page.locator(`text=${roundName}`).locator("xpath=ancestor::div[contains(@class, 'rounded')]").first();
    const monitorLink = roundCard.getByRole("link", { name: /live monitor/i });
    await monitorLink.click();
    await expect(this.page).toHaveURL(/.*\/enter\/staff\/rounds\/.*\/monitor/, { timeout: 15000 });
  }

  async closeRound() {
    const closeBtn = this.page.getByRole("button", { name: /close round/i });
    await closeBtn.click();
    await expect(this.page.getByText(/round closed/i)).toBeVisible({ timeout: 10000 });
  }

  async reopenRound() {
    const reopenBtn = this.page.getByRole("button", { name: /reopen round/i });
    await reopenBtn.click();
    await expect(this.page.getByText(/round reopened/i)).toBeVisible({ timeout: 10000 });
  }
}
