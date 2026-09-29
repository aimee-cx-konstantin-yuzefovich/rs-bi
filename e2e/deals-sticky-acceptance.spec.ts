// e2e/deals-sticky-acceptance.spec.ts
// ─────────────────────────────────────────────────────────────────────
// Real Authenticated Deals Sticky Header Browser Acceptance.
// Runs against the real standalone production application.
// Requires legitimate external test credentials via E2E_TEST_USERNAME and
// E2E_TEST_PASSWORD. Strictly NO auth backdoors or weakened guards.
// When credentials are not available, skips with:
// "AUTHENTICATED DEALS STICKY ACCEPTANCE: NOT EXECUTED — CREDENTIAL REQUIRED"
// ─────────────────────────────────────────────────────────────────────

import { test, expect } from "@playwright/test";

const hasCredential =
  Boolean(process.env.E2E_TEST_USERNAME?.trim()) &&
  Boolean(process.env.E2E_TEST_PASSWORD?.trim());

test.skip(
  !hasCredential,
  "AUTHENTICATED DEALS STICKY ACCEPTANCE: NOT EXECUTED — CREDENTIAL REQUIRED"
);

test.describe("authenticated deals sticky header acceptance", () => {
  test("Deals table header remains fixed relative to vertical scroll container", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    // 1. Authenticate via real /login flow
    await page.goto("/login");
    await page.fill(
      'input[name="username"], input[type="text"]',
      process.env.E2E_TEST_USERNAME!
    );
    await page.fill(
      'input[name="password"], input[type="password"]',
      process.env.E2E_TEST_PASSWORD!
    );
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000,
    });

    // 2. Open Deals page
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // 3. Locate Deals virtualized table and scroll container
    const tableLocator = page.locator("table");
    await expect(tableLocator).toBeVisible({ timeout: 15_000 });

    const theadLocator = page.locator("thead");
    await expect(theadLocator).toBeVisible();

    // Scroll container is the parent element with overflow
    const scrollContainerLocator = page.locator("div.overflow-auto, div.overflow-y-auto").first();
    await expect(scrollContainerLocator).toBeVisible();

    // 4. Record header bounding box before scroll
    const headerBoxBefore = await theadLocator.boundingBox();
    const containerBox = await scrollContainerLocator.boundingBox();
    expect(headerBoxBefore).not.toBeNull();
    expect(containerBox).not.toBeNull();

    // 5. Scroll table vertically by 300px
    await scrollContainerLocator.evaluate((el) => {
      el.scrollTop = 300;
    });
    await page.waitForTimeout(200);

    // 6. Record header bounding box after scroll
    const headerBoxAfter = await theadLocator.boundingBox();
    expect(headerBoxAfter).not.toBeNull();

    // The header top relative to the viewport/container must remain sticky
    expect(Math.abs(headerBoxAfter!.y - headerBoxBefore!.y)).toBeLessThanOrEqual(5);

    // 7. Test horizontal scroll and sticky first column (№)
    await scrollContainerLocator.evaluate((el) => {
      el.scrollLeft = 200;
    });
    await page.waitForTimeout(200);

    const firstColHeader = page.locator("th").first();
    const firstColBox = await firstColHeader.boundingBox();
    expect(firstColBox).not.toBeNull();

    // The first column '№' header must remain at or near container left edge
    expect(firstColBox!.x).toBeGreaterThanOrEqual(containerBox!.x - 2);
    expect(firstColBox!.x).toBeLessThanOrEqual(containerBox!.x + 10);

    // 8. Assert zero uncaught page errors
    expect(pageErrors).toEqual([]);
  });
});
