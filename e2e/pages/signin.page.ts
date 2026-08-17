import { type Page, type Locator, expect } from "@playwright/test";

export class SignInPage {
  readonly page: Page;
  readonly orgTab: Locator;
  readonly eventTab: Locator;
  readonly googleSignInBtn: Locator;
  readonly eventCodeInput: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitEventBtn: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.orgTab = page.locator("#tab-owner-login");
    this.eventTab = page.locator("#tab-event-login");
    this.googleSignInBtn = page.locator("#btn-google-signin");
    this.eventCodeInput = page.locator("#eventCode");
    this.usernameInput = page.locator("#username");
    this.passwordInput = page.locator("#password");
    this.submitEventBtn = page.locator("#btn-event-login-submit");
    this.errorMessage = page.locator("#judge-login-error");
  }

  async goto(params?: string) {
    await this.page.goto(params ? `/sign-in?${params}` : "/sign-in");
  }

  async switchToOrgTab() {
    await this.orgTab.click();
    await expect(this.googleSignInBtn).toBeVisible();
  }

  async switchToEventTab() {
    await this.eventTab.click();
    await expect(this.eventCodeInput).toBeVisible();
  }

  async loginAsJudgeOrStaff(eventCode: string, username: string, pass: string) {
    await this.switchToEventTab();
    await this.eventCodeInput.fill(eventCode);
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(pass);
    await this.submitEventBtn.click();
  }

  async expectError(messagePattern?: string | RegExp) {
    await expect(this.errorMessage).toBeVisible({ timeout: 15000 });
    if (messagePattern) {
      await expect(this.errorMessage).toHaveText(messagePattern, { timeout: 15000 });
    }
  }
}
