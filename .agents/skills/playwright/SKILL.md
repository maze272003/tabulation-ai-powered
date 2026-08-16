---
name: playwright
description: "End-to-end browser automation and testing using Playwright in Antigravity."
---

# Playwright Automation & E2E Testing Guide

This skill guides the AI agent and developers in writing, running, debugging, and maintaining robust, production-grade Playwright tests for web applications.

## Quick CLI Reference

```bash
# Run all end-to-end tests
npm run test:e2e

# Run tests in UI Mode (interactive debugger & time travel)
npm run test:e2e:ui

# Run tests with visible browser
npm run test:e2e:headed

# Run a specific test file
npx playwright test e2e/smoke.spec.ts

# Run tests on Chromium only
npx playwright test --project=chromium

# Debug a specific test step-by-step
npx playwright test --debug

# View last test HTML report
npm run test:e2e:report

# Install or update browser binaries
npx playwright install chromium
```

---

## Best Practices & Principles

### 1. Resilient Locators (User-Facing First)
Always prefer user-visible locators and accessibility roles over brittle CSS selectors or XPath:

* **Role (Preferred)**: `page.getByRole('button', { name: 'Sign in' })`
* **Label**: `page.getByLabel('Password')`
* **Placeholder**: `page.getByPlaceholder('Enter your email')`
* **Text**: `page.getByText('Event command center')`
* **TestId (Fallback)**: `page.getByTestId('submit-score-btn')`

**Avoid:**
* Brittle paths: `page.locator('div > div:nth-child(3) > button')`
* CSS class selectors tied to styling: `page.locator('.btn-primary-lg')`

---

### 2. Auto-Waiting & Web Assertions
Playwright automatically waits for elements to be actionable before clicking or filling. Always use asynchronous `expect` web assertions:

```typescript
import { test, expect } from '@playwright/test';

test('landing page loads and has action buttons', async ({ page }) => {
  await page.goto('/');

  // Assertion automatically waits up to 5s for element state
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});
```

**Avoid manual sleep calls:**
```typescript
// ❌ Bad: Arbitrary timeouts lead to flakiness
await page.waitForTimeout(5000);

// ✅ Good: Wait for actual condition or state
await expect(page.getByText('Ready to score')).toBeVisible();
```

---

### 3. Page Object Model (POM) Structure
For complex flows (e.g. event creation, tabulation, scoring), encapsulate page interactions in Page Objects under `e2e/pages/`:

```typescript
// e2e/pages/landing-page.ts
import { type Page, type Locator } from '@playwright/test';

export class LandingPage {
  readonly page: Page;
  readonly signInLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.signInLink = page.getByRole('link', { name: /sign in/i });
  }

  async goto() {
    await this.page.goto('/');
  }
}
```

---

### 4. Working with Dynamic & Realtime State (Convex / WebSockets)
When testing pages with realtime Convex subscriptions or optimistic UI:
1. Ensure the local development server and Convex backend are reachable.
2. Use `await expect(locator).toHaveText(...)` or `await expect(locator).toBeVisible()` to handle asynchronous data synchronization cleanly.
3. Handle authentication using Playwright `storageState` fixtures when testing authenticated routes.

---

### 5. Debugging Failed Tests
When a test fails:
1. Review the generated traces and screenshots in `test-results/`.
2. Launch trace viewer: `npx playwright show-trace test-results/<test-name>/trace.zip`.
3. Run in UI mode: `npm run test:e2e:ui`.
