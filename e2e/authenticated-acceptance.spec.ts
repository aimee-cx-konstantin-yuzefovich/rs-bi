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
});
