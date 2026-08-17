import { type Page, type Locator, expect } from "@playwright/test";

export class LandingPage {
  readonly page: Page;
  readonly brandLink: Locator;
  readonly heroHeading: Locator;
  readonly startEventBtn: Locator;
  readonly judgeSignInBtn: Locator;
  readonly headerSignInBtn: Locator;
  readonly featuresHeading: Locator;
  readonly workflowHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.brandLink = page.locator("header").getByRole("link", { name: "Tabulation" });
    this.heroHeading = page.getByRole("heading", {
      level: 1,
      name: /run fair, transparent scoring/i,
    });
    this.startEventBtn = page.getByRole("button", { name: /start your event/i });
    this.judgeSignInBtn = page.getByRole("button", { name: /judge sign in/i });
    this.headerSignInBtn = page.locator("header").getByRole("button", { name: "Sign in", exact: true });
    this.featuresHeading = page.getByRole("heading", {
      name: /everything a tabulation team needs/i,
    });
    this.workflowHeading = page.getByRole("heading", {
      name: /from draft to results in three steps/i,
    });
  }

  async goto() {
    await this.page.goto("/");
  }

  async expectHeroVisible() {
    await expect(this.brandLink).toBeVisible();
    await expect(this.heroHeading).toBeVisible();
    await expect(this.startEventBtn).toBeVisible();
    await expect(this.judgeSignInBtn).toBeVisible();
  }

  async expectFeaturesAndWorkflow() {
    await expect(this.featuresHeading).toBeVisible();
    await expect(this.page.getByText("Event command center")).toBeVisible();
    await expect(this.page.getByText("Secure judge access")).toBeVisible();
    await expect(this.page.getByText("Instant tabulation")).toBeVisible();
    await expect(this.workflowHeading).toBeVisible();
  }
}
