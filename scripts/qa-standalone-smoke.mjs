#!/usr/bin/env node
// scripts/qa-standalone-smoke.mjs
// ─────────────────────────────────────────────────────────────────────
// Standalone runtime smoke — release evidence, never `next dev`.
// Builds nothing: run AFTER `npm run build`. Starts the real artifact
// (NODE_ENV=production node .next/standalone/server.js) with safe test
// configuration and verifies over HTTP:
//   /api/health           → 200 with buildSha present
//   /login                → renders
//   protected API (no auth) → 401 (auth boundary, never 404)
//   protected pages       → 200 or redirect to /login, NEVER 404
// Exit 0 = PASS, exit 1 = FAIL.
// ─────────────────────────────────────────────────────────────────────

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const serverPath = join(repoRoot, ".next", "standalone", "server.js");

if (!existsSync(serverPath)) {
  console.error("FAIL: .next/standalone/server.js not found. Run `npm run build` first.");
  process.exit(1);
}

const PORT = 3177;
const BASE = `http://127.0.0.1:${PORT}`;

// Safe test configuration: disposable SQLite, no Bitrix webhook, test secrets.
const workDir = mkdtempSync(join(tmpdir(), "rs-bi-standalone-smoke."));
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  HOSTNAME: "127.0.0.1",
  DATABASE_URL: `file:${join(workDir, "smoke.db")}`,
  NEXTAUTH_SECRET: "standalone-smoke-not-a-runtime-secret",
  PROXY_SECRET: "standalone-smoke-not-a-runtime-secret",
  BITRIX_WEBHOOK_URL: "",
  NEXT_TELEMETRY_DISABLED: "1",
};

// Static assets and public/ are copied into standalone by `npm run build`.
// Prisma client resolution: standalone output normally includes it via
// serverExternalPackages; provide node_modules fallback path.
const prismaSrc = join(repoRoot, "node_modules", ".prisma");
const prismaDst = join(repoRoot, ".next", "standalone", "node_modules", ".prisma");
if (existsSync(prismaSrc) && !existsSync(prismaDst)) {
  rmSync(prismaDst, { recursive: true, force: true });
}

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function fetchWithTimeout(path, opts = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${path}`, { redirect: "manual", ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

const child = spawn("node", [serverPath], {
  cwd: repoRoot,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
child.stdout.on("data", (d) => (serverLog += d));
child.stderr.on("data", (d) => (serverLog += d));

let started = false;
try {
  // Wait for readiness (max ~60s)
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetchWithTimeout("/api/health", {}, 2000);
      if (res.status === 200) { started = true; break; }
    } catch { /* not ready yet */ }
    await sleep(500);
  }

  if (!started) {
    record("standalone server started", false, serverLog.slice(-2000));
  } else {
    record("standalone server started", true);

    // 1. /api/health → 200 + buildSha present (truthful: value or "unknown")
    const health = await fetchWithTimeout("/api/health");
    const healthBody = await health.json().catch(() => null);
    record(
      "/api/health returns 200",
      health.status === 200,
      `status=${health.status}`
    );
    record(
      "/api/health reports buildSha",
      healthBody && typeof healthBody.buildSha === "string" && healthBody.buildSha.length > 0,
      `buildSha=${healthBody?.buildSha}`
    );

    // 2. /login renders
    const login = await fetchWithTimeout("/login");
    const loginHtml = await login.text().catch(() => "");
    record(
      "/login renders (200, HTML)",
      login.status === 200 && /<html|<div|<body/i.test(loginHtml),
      `status=${login.status}`
    );

    // 3. Protected API unauthenticated → auth boundary (401/403), never 404
    for (const api of [
      "/api/bitrix/deals",
      "/api/bitrix/companies/list",
      "/api/bitrix/samples",
      "/api/bitrix/commercial-funnel",
    ]) {
      const res = await fetchWithTimeout(api, {
        method: api === "/api/bitrix/deals" || api === "/api/bitrix/companies/list" ? "POST" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const boundary = res.status === 401 || res.status === 403;
      record(
        `${api} unauthenticated → auth boundary`,
        boundary,
        `status=${res.status}${boundary ? "" : " (expected 401/403)"}`
      );
    }

    // 4. Protected pages → 200 or redirect to login, NEVER 404
    for (const page of ["/", "/companies", "/samples", "/commercial-funnel"]) {
      const res = await fetchWithTimeout(page);
      const location = res.headers.get("location") || "";
      const isRedirect = res.status >= 300 && res.status < 400;
      const ok = res.status === 200 || (isRedirect && !location.includes("404"));
      record(
        `${page} exists (200 or redirect)`,
        ok && res.status !== 404,
        `status=${res.status}${location ? ` location=${location}` : ""}`
      );
    }
  }
} catch (err) {
  record("smoke execution", false, String(err));
} finally {
  child.kill("SIGTERM");
  await sleep(500);
  if (!child.killed) child.kill("SIGKILL");
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
}

const failed = results.filter((r) => !r.pass);
console.log("");
console.log(`Standalone runtime smoke: ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length} checks)`);
if (failed.length > 0 && serverLog) {
  console.log("--- server log tail ---");
  console.log(serverLog.slice(-3000));
}
process.exit(failed.length === 0 ? 0 : 1);
