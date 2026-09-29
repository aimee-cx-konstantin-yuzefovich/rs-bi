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

    // 3. Locate Deals scroll container and sticky header using precise data-testid
    const scroll = page.getByTestId("deals-table-scroll");
    await expect(scroll).toBeVisible({ timeout: 15_000 });

    const stickyHeader = page.getByTestId("deals-header-index");
    await expect(stickyHeader).toBeVisible();

    // 4. Assert scroll container has real vertical overflow: scrollHeight > clientHeight
    const hasVerticalOverflow = await scroll.evaluate(
      (el) => el.scrollHeight > el.clientHeight
    );
    expect(hasVerticalOverflow).toBe(true);

    // 5. Capture sticky header bounding box before scroll
    const headerBefore = await stickyHeader.boundingBox();
    expect(headerBefore).not.toBeNull();

    // 6. Capture scroll container bounding box before scroll
    const containerBefore = await scroll.boundingBox();
    expect(containerBefore).not.toBeNull();

    // 7. Set scrollTop = 300
    await scroll.evaluate((el) => {
      el.scrollTop = 300;
    });
    await page.waitForTimeout(200);

    // 8. Verify actual scrollTop > 0
    const actualScrollTop = await scroll.evaluate((el) => el.scrollTop);
    expect(actualScrollTop).toBeGreaterThan(0);

    // 9. Capture sticky header and container bounding boxes after vertical scroll
    const headerAfter = await stickyHeader.boundingBox();
    const containerAfter = await scroll.boundingBox();
    expect(headerAfter).not.toBeNull();
    expect(containerAfter).not.toBeNull();

    // 10. Assert header top is effectively unchanged relative to container:
    // abs((headerAfter.y - containerAfter.y) - (headerBefore.y - containerBefore.y)) <= 3
    const relativeTopBefore = headerBefore!.y - containerBefore!.y;
    const relativeTopAfter = headerAfter!.y - containerAfter!.y;
    expect(Math.abs(relativeTopAfter - relativeTopBefore)).toBeLessThanOrEqual(3);

    // 11. Horizontal sticky check:
    // Before: scrollLeft = 0
    await scroll.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page.waitForTimeout(100);

    // Then: scrollLeft = 200
    await scroll.evaluate((el) => {
      el.scrollLeft = 200;
    });
    await page.waitForTimeout(200);

    const actualScrollLeft = await scroll.evaluate((el) => el.scrollLeft);
    expect(actualScrollLeft).toBeGreaterThan(0);

    // Measure data-testid="deals-header-index" and verify its X remains approximately aligned with scroll container left edge
    const headerHoriz = await stickyHeader.boundingBox();
    const containerHoriz = await scroll.boundingBox();
    expect(headerHoriz).not.toBeNull();
    expect(containerHoriz).not.toBeNull();
    expect(Math.abs(headerHoriz!.x - containerHoriz!.x)).toBeLessThanOrEqual(5);

    // 12. Interaction sanity check:
    // Click one sortable column header (data-testid="deals-header-column")
    const columnHeaderButton = page
      .getByTestId("deals-header-column")
      .first()
      .locator("button");
    if (await columnHeaderButton.isVisible()) {
      await columnHeaderButton.click();
      await page.waitForTimeout(200);
    }

    // Verify column filter button still works if present
    const columnFilterButton = page
      .getByTestId("deals-header-column")
      .first()
      .locator('button[title="Фильтр по столбцу"]');
    if ((await columnFilterButton.count()) > 0) {
      await columnFilterButton.first().click({ force: true });
      await page.waitForTimeout(100);
    }

    // Verify UI remains intact and no uncaught exceptions occurred
    await expect(scroll).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });
});
