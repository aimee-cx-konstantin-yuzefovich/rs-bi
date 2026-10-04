// e2e/authenticated-acceptance.spec.ts
// ─────────────────────────────────────────────────────────────────────
// Authenticated browser acceptance — GATED.
// Runs ONLY when a legitimate external test credential is provided via
// E2E_TEST_USERNAME / E2E_TEST_PASSWORD. There is no backdoor: the suite
// logs in through the real /login flow. Without credentials the suite
// reports NOT EXECUTED (skipped), never silently passes.
// ─────────────────────────────────────────────────────────────────────
import { test, expect } from "@playwright/test";

const hasCredential =
  !!process.env.E2E_TEST_USERNAME && !!process.env.E2E_TEST_PASSWORD;

test.skip(!hasCredential, "AUTHENTICATED BROWSER ACCEPTANCE REQUIRES EXTERNAL TEST CREDENTIAL");

test.describe("authenticated acceptance", () => {
  test("login → dashboard journey loads with zero unexpected errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/login");
    // Real login flow — no backdoor, no auth disabling.
    await page.fill('input[name="username"], input[type="text"]', process.env.E2E_TEST_USERNAME!);
    await page.fill('input[name="password"], input[type="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button[type="submit"]');

    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 });

    for (const path of ["/", "/companies", "/samples", "/commercial-funnel"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status()).not.toBe(404);
      expect(res?.status()).not.toBe(500);
    }

    // Zero unexpected JS exceptions across the journey.
    expect(pageErrors).toEqual([]);
  });

  // Data-state smoke for the Smart Process surfaces (semantic, never
  // screenshot-based). Each page must reach a truthful end state: either
  // the registry/tabs render, or an explicit truthful error state with a
  // retry is shown — never an infinite spinner, and raw technical IDs
  // must not leak into the DOM.
  test("/samples reaches a truthful end state (no infinite loading, no raw ID leak)", async ({ page }) => {
    await login(page);
    await page.goto("/samples", { waitUntil: "domcontentloaded" });
    // Truthful end states: the registry table, the explicit unavailable
    // state («Данные недоступны…Повторить загрузку»), or the filters bar.
    await expect(
      page
        .locator(
          '[data-testid="samples-table-scroll"], [data-testid="samples-filters"], :text("Данные недоступны из-за ошибки загрузки")'
        )
        .first()
    ).toBeVisible({ timeout: 60_000 });
    // Raw Bitrix UF/token identifiers never leak into user-facing content.
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/UF_CRM_\d+/);
    expect(body).not.toMatch(/DT1032_15:/);
    expect(body).not.toMatch(/parentId2/);
  });

  test("/commercial-funnel reaches a truthful end state (no infinite loading, no raw ID leak)", async ({ page }) => {
    await login(page);
    await page.goto("/commercial-funnel", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[data-testid="funnel-tabs"], :text("Повторить"), :text("повторить")').first()
    ).toBeVisible({ timeout: 60_000 });
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/UF_CRM_\d+/);
    expect(body).not.toMatch(/DT1032_15:/);
  });
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="username"], input[type="text"]', process.env.E2E_TEST_USERNAME!);
  await page.fill('input[name="password"], input[type="password"]', process.env.E2E_TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 });
}
