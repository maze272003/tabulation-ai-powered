import { test, expect } from "@playwright/test";
import { seedE2EDatabase } from "./helpers/seed";

test.describe("8. Documents & certificate studio", () => {
  test.beforeAll(async () => {
    await seedE2EDatabase();
  });

  test("unauthenticated visitors cannot open the documents library", async ({ page }) => {
    await page.goto("/app/e2e-org/documents");
    await expect(page).toHaveURL(/.*\/sign-in\?next=/);
  });

  test("unauthenticated visitors cannot open the studio", async ({ page }) => {
    await page.goto("/studio/e2e-org/00000000000000000000000000");
    // The studio shell loads but the Convex query rejects; either way the canvas never appears.
    await expect(page.getByRole("application", { name: "Certificate canvas" })).toHaveCount(0);
  });

  test("org nav links to documents & certificates", async ({ page }) => {
    test.skip(!process.env.E2E_ORG_SLUG, "Set E2E_ORG_SLUG to run authenticated tests");
    const orgSlug = process.env.E2E_ORG_SLUG!;
    await page.goto(`/app/${orgSlug}/overview`);
    await page.getByRole("link", { name: "Documents & Certificates" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/${orgSlug}/documents$`));
    await expect(page.getByRole("heading", { name: "Documents & Certificates" })).toBeVisible();
  });

  test("duplicate a system template, edit in studio, add text, undo", async ({ page }) => {
    test.skip(!process.env.E2E_ORG_SLUG, "Set E2E_ORG_SLUG to run authenticated tests");
    const orgSlug = process.env.E2E_ORG_SLUG!;
    await page.goto(`/app/${orgSlug}/documents`);
    await page.getByRole("button", { name: /^Customize/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/studio/${orgSlug}/`));
    await expect(page.getByRole("application", { name: "Certificate canvas" })).toBeVisible();

    await page.getByRole("button", { name: "Add body text" }).click();
    await expect(page.locator("[data-selection-id]").first()).toBeVisible();

    await page.keyboard.press("Control+z");
    // The added element is removed; undo is observable via the selection overlay disappearing.
    await expect(page.locator("[data-selection-id]")).toHaveCount(0);
  });

  test("token picker inserts a field into the selected text element", async ({ page }) => {
    test.skip(!process.env.E2E_ORG_SLUG, "Set E2E_ORG_SLUG to run authenticated tests");
    const orgSlug = process.env.E2E_ORG_SLUG!;
    await page.goto(`/app/${orgSlug}/documents`);
    await page.getByRole("button", { name: /^Customize/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/studio/${orgSlug}/`));

    await page.getByRole("button", { name: "Add body text" }).click();
    await page.getByRole("button", { name: "Insert field" }).click();
    await page.getByRole("button", { name: /Recipient name/ }).click();
    await expect(page.getByLabel("Content")).toHaveValue(/{{recipient\.name}}/);
  });
});
