import { type Page, type Locator, expect } from "@playwright/test";

export class JudgeWorkspacePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly roundsSection: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.roundsSection = page.locator("main");
  }

  async goto() {
    await this.page.goto("/enter");
  }

  async expectWelcome(judgeName: string) {
    await expect(this.page.getByText(`Welcome, ${judgeName}`)).toBeVisible({ timeout: 20000 });
  }

  async openSheetForContestant(contestantName: string) {
    const heading = this.page.getByRole("heading", { name: contestantName }).first();
    const card = heading.locator("xpath=ancestor::div[contains(@class, 'p-4')]").first();
    const sheetLink = card.getByRole("link", { name: /score sheet|view sheet/i }).first();
    await sheetLink.click();
    await expect(this.page).toHaveURL(/.*\/enter\/sheet\/.*/, { timeout: 15000 });
  }
}
