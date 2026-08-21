import { test, expect } from "@playwright/test";
import { seedE2EDatabase } from "./helpers/seed";

const DRAG_DX_PX = 60;
const DRAG_DY_PX = 40;
const MIN_DRAG_DISPLACEMENT_PX = 40;
const PDF_RENDER_TIMEOUT_MS = 15_000;

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

  test("drag a text element and verify it moved", async ({ page }) => {
    test.skip(!process.env.E2E_ORG_SLUG, "Set E2E_ORG_SLUG to run authenticated tests");
    const orgSlug = process.env.E2E_ORG_SLUG!;
    await page.goto(`/app/${orgSlug}/documents`);
    await page.getByRole("button", { name: /^Customize/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/studio/${orgSlug}/`));
    await expect(page.getByRole("application", { name: "Certificate canvas" })).toBeVisible();

    await page.getByRole("button", { name: "Add body text" }).click();
    const element = page.locator("[data-element-id]").first();
    await expect(element).toBeVisible();
    await element.scrollIntoViewIfNeeded();

    const before = await element.boundingBox();
    if (!before) throw new Error("Element had no bounding box before the drag.");
    const centerX = before.x + before.width / 2;
    const centerY = before.y + before.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + DRAG_DX_PX, centerY + DRAG_DY_PX, { steps: 5 });
    await page.mouse.up();

    // The canvas page is CSS-scaled, so displacement is re-measured from the
    // DOM instead of assuming the raw pointer delta maps 1:1 to layout pixels.
    const after = await element.boundingBox();
    if (!after) throw new Error("Element had no bounding box after the drag.");
    expect(after.x - before.x).toBeGreaterThanOrEqual(MIN_DRAG_DISPLACEMENT_PX);
  });

  test("true preview renders the actual PDF", async ({ page }) => {
    test.skip(!process.env.E2E_ORG_SLUG, "Set E2E_ORG_SLUG to run authenticated tests");
    const orgSlug = process.env.E2E_ORG_SLUG!;
    await page.goto(`/app/${orgSlug}/documents`);
    await page.getByRole("button", { name: /^Customize/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/studio/${orgSlug}/`));

    await page.getByRole("button", { name: "Add body text" }).click();
    await page.getByRole("button", { name: "Preview" }).click();
    // renderToBlob is debounced and async; the iframe mounts only once the
    // blob URL exists, so allow generous time instead of a default timeout.
    await expect(page.locator('iframe[title="PDF preview"]')).toBeVisible({
      timeout: PDF_RENDER_TIMEOUT_MS,
    });

    await page.keyboard.press("Escape");
    await expect(page.locator('iframe[title="PDF preview"]')).toHaveCount(0);
  });
});
