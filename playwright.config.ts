// playwright.config.ts
// ─────────────────────────────────────────────────────────────────────
// Browser acceptance for RusSilica BI Terminal.
// Runs against the REAL standalone production artifact (never `next dev`).
// `npm run build` must have produced .next/standalone/server.js first.
// No authentication weakening: only unauthenticated boundaries are tested
// unless TEST_CREDENTIALS are provided by an external release authority.
// ─────────────────────────────────────────────────────────────────────

import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const PORT = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 3188;
const EXTERNAL_BASE = process.env.E2E_BASE_URL; // e.g. production URL

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: EXTERNAL_BASE || `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  ...(EXTERNAL_BASE
    ? {}
    : {
        webServer: {
          command: "node scripts/e2e-server.mjs",
          url: `http://127.0.0.1:${PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
});
