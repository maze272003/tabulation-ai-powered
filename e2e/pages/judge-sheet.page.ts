import { type Page, type Locator, expect } from "@playwright/test";

export class JudgeSheetPage {
  readonly page: Page;
  readonly contestantName: Locator;
  readonly totalScoreBadge: Locator;
  readonly saveDraftBtn: Locator;
  readonly submitAndLockBtn: Locator;
  readonly confirmModalSubmitBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.contestantName = page.getByRole("heading", { level: 1 });
    this.totalScoreBadge = page.locator("text=Total Score").locator("xpath=following-sibling::span");
    this.saveDraftBtn = page.getByRole("button", { name: /save draft/i });
    this.submitAndLockBtn = page.getByRole("button", { name: /submit & lock/i });
    this.confirmModalSubmitBtn = page.getByRole("dialog").getByRole("button", { name: /confirm & lock/i });
  }

  async expectContestant(name: string, number: number) {
    await expect(this.contestantName).toHaveText(name, { timeout: 15000 });
    await expect(this.page.getByText(`#${number}`)).toBeVisible();
  }

  async fillScoreByIndex(index: number, score: string) {
    const input = this.page.locator('input[type="number"]').nth(index);
    await input.fill(score);
  }

  async fillScore(criterionName: string, score: string) {
    const heading = this.page.getByText(criterionName, { exact: false }).first();
    const card = heading.locator("xpath=ancestor::div[contains(@class, 'rounded')]").first();
    const input = card.locator('input[type="number"]');
    if (await input.count() > 0) {
      await input.fill(score);
    } else {
      await this.page.locator('input[type="number"]').first().fill(score);
    }
  }

  async saveDraft() {
    await this.saveDraftBtn.click();
    await expect(this.page.getByText(/draft scores saved/i)).toBeVisible({ timeout: 15000 });
  }

  async submitAndLock() {
    await this.submitAndLockBtn.click();
    await expect(this.page.getByRole("dialog")).toBeVisible({ timeout: 15000 });
    await this.confirmModalSubmitBtn.click();
  }
}
