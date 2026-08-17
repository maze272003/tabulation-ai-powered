import { type Page, type Locator, expect } from "@playwright/test";

export class EventWorkspacePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(orgSlug: string, eventSlug: string, tab = "overview") {
    await this.page.goto(`/app/${orgSlug}/events/${eventSlug}/${tab}`);
  }

  async expectEventLoaded(eventName: string) {
    await expect(this.page.getByRole("heading", { name: eventName })).toBeVisible({ timeout: 10000 });
  }

  async expectNavTabs() {
    const nav = this.page.getByRole("navigation", { name: "Event sections" });
    await expect(nav.getByRole("link", { name: /overview/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /accounts/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /rounds/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /categories/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /contestants/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /readiness/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /results/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /settings/i })).toBeVisible();
  }
}
