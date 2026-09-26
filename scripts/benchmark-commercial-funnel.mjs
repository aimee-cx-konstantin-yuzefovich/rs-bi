#!/usr/bin/env node
// scripts/benchmark-commercial-funnel.mjs
// ─────────────────────────────────────────────────────────────────────
// Scale benchmark runner for RusSilica Commercial Funnel.
// Runs benchmark test suite via Vitest runner.
// Usage: node scripts/benchmark-commercial-funnel.mjs
// ─────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testFile = resolve(root, "src/__tests__/commercial-funnel-benchmark.test.ts");

console.log("=== RusSilica BI - Commercial Funnel Scale Benchmark ===");
console.log(`Target: ${testFile}`);

const child = spawnSync("npx", ["vitest", "run", testFile], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

process.exit(child.status ?? 0);
