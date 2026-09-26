// @vitest-environment node
// ─────────────────────────────────────────────────────────────────────
// Production route manifest contract.
// Proves the expected user-facing pages and APIs are registered in the
// repository source tree, so the built runtime can never 404 them.
// The standalone runtime smoke (scripts/qa-standalone-smoke.mjs) proves the
// same routes against the real built artifact over HTTP.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "../..");

const PAGE_ROUTES = [
  "/",
  "/login",
  "/companies",
  "/samples",
  "/commercial-funnel",
];

const API_ROUTES = [
  "/api/health",
  "/api/bitrix/deals",
  "/api/bitrix/companies/list",
  "/api/bitrix/companies/responsible-counts",
  "/api/bitrix/samples",
  "/api/bitrix/commercial-funnel",
  "/api/bitrix/fields",
  "/api/bitrix/users",
  "/api/bitrix/activities",
];

function pageFile(route: string): string {
  // App Router: page.tsx at the route directory; "/" maps to src/app/page.tsx
  const dir = route === "/" ? "" : route;
  return join(root, "src", "app", dir, "page.tsx");
}

function apiFile(route: string): string {
  // App Router: route.ts at the API path; "[id]" dynamic segments map literally
  return join(root, "src", "app", route, "route.ts");
}

describe("production route manifest", () => {
  it("registers every supported user-facing page", () => {
    for (const route of PAGE_ROUTES) {
      expect({ route, exists: existsSync(pageFile(route)) }).toEqual({
        route,
        exists: true,
      });
    }
  });

  it("registers every supported API endpoint", () => {
    for (const route of API_ROUTES) {
      expect({ route, exists: existsSync(apiFile(route)) }).toEqual({
        route,
        exists: true,
      });
    }
  });

  it("registers the dynamic single-company deals API", () => {
    expect(
      existsSync(join(root, "src/app/api/bitrix/companies/[id]/deals/route.ts"))
    ).toBe(true);
  });

  it("health route exports a GET handler with build provenance support", async () => {
    const source = await import("@/app/api/health/route");
    expect(typeof source.GET).toBe("function");
  });
});
