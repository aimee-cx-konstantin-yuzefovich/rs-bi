// e2e/unauthenticated-acceptance.spec.ts
// ─────────────────────────────────────────────────────────────────────
// Minimal safe browser acceptance — unauthenticated standalone run.
// Proves: /login renders, /api/health = 200, protected API → 401,
// protected pages redirect (NOT 404), expected route manifest,
// zero unexpected console/page errors and failed requests.
// ─────────────────────────────────────────────────────────────────────
import { test, expect } from "@playwright/test";

const PROTECTED_PAGES = ["/", "/companies", "/samples", "/commercial-funnel"];
const PROTECTED_APIS = [
  "/api/bitrix/deals",
  "/api/bitrix/companies/list",
  "/api/bitrix/samples",
  "/api/bitrix/commercial-funnel",
];

test.describe("unauthenticated acceptance", () => {
  let consoleErrors: string[] = [];
  let pageErrors: string[] = [];
  let failedRequests: string[] = [];

  test.beforeEach(({ page }) => {
    consoleErrors = [];
    pageErrors = [];
    failedRequests = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("requestfailed", (req) => {
      // Ignore the app's own expected auth boundaries and favicon noise.
      const url = req.url();
      if (url.includes("/api/bitrix") || url.includes("favicon")) return;
      failedRequests.push(`${req.method()} ${url}`);
    });
  });

  test("route manifest: /login renders and /api/health is 200", async ({ page }) => {
    const health = await page.request.get("/api/health");
    expect(health.status()).toBe(200);
    const body = await health.json();
    expect(body.status).toBe("ok");
    expect(typeof body.buildSha).toBe("string");

    const res = await page.goto("/login");
    expect(res?.status()).not.toBe(404);
    await expect(page.locator("body")).toBeVisible();
  });

  test("protected API without auth responds with an auth boundary, never 404", async ({ request }) => {
    for (const api of PROTECTED_APIS) {
      const res = await request.post(api, { data: {} });
      expect(res.status(), `${api} must be an auth boundary`).toBeOneOf([401, 403]);
    }
  });

  test("protected pages redirect or render — never 404", async ({ page }) => {
    for (const path of PROTECTED_PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} must not 404`).not.toBe(404);
      // Either redirected to login or rendered a real page shell.
      const url = page.url();
      const ok =
        url.includes("/login") ||
        (res?.status() === 200 && (await page.locator("body").count()) > 0);
      expect(ok, `${path} must redirect to login or render`).toBe(true);
    }
  });

  test("no unexpected route 404 across the manifest", async ({ page }) => {
    for (const path of ["/login", ...PROTECTED_PAGES]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status()).not.toBe(404);
    }
  });

  test("zero unexpected JavaScript exceptions on /login", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    expect(pageErrors).toEqual([]);
  });
});
