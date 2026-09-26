#!/usr/bin/env node
// scripts/e2e-server.mjs
// Starts the real standalone artifact for browser acceptance with safe
// test configuration. Requires a prior `npm run build`.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const PORT = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 3188;
const workDir = mkdtempSync(join(tmpdir(), "rs-bi-e2e."));

const child = spawn(
  "node",
  [join(repoRoot, ".next", "standalone", "server.js")],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: `file:${join(workDir, "e2e.db")}`,
      NEXTAUTH_SECRET: "e2e-not-a-runtime-secret",
      PROXY_SECRET: "e2e-not-a-runtime-secret",
      BITRIX_WEBHOOK_URL: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
  }
);

const shutdown = () => {
  child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code) => process.exit(code ?? 0));
