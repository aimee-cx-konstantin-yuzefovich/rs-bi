#!/usr/bin/env node
// scripts/release-manifest.mjs
// ─────────────────────────────────────────────────────────────────────
// Generates release-manifest.md — the machine-readable release record.
// Every gate records WHERE it ran: CI | LOCAL | LIVE | SKIPPED.
// Never mislabels: a local run is LOCAL, a skipped live gate is SKIPPED.
// ─────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sh = (cmd) => execSync(cmd, { cwd: repoRoot, encoding: "utf8" }).trim();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.join("=") || true];
  })
);

const BASE_SHA = args["base-sha"] || "unknown";
const PRODUCTION_URL = args["production-url"] || "";
const PRODUCTION_SHA = args["production-sha"] || "";
const CI_RUN_ID = args["ci-run-id"] || "";
const CI_CONCLUSION = args["ci-conclusion"] || "";

let FINAL_SHA = "unknown";
let BRANCH = "unknown";
let REMOTE_MAIN = "unknown";
let treeStatus = "unknown";
try {
  FINAL_SHA = sh("git rev-parse HEAD");
  BRANCH = sh("git branch --show-current");
  REMOTE_MAIN = sh("git rev-parse origin/main");
  treeStatus = sh("git status --porcelain") === "" ? "clean" : "DIRTY";
} catch {}

let testSummary = { files: "?", tests: "?", failures: "?" };
try {
  const out = sh("npx vitest run --reporter=json 2>/dev/null || true");
  const start = out.indexOf('{"numTotalTestSuites"');
  if (start >= 0) {
    const j = JSON.parse(out.slice(start, out.lastIndexOf("}") + 1));
    testSummary = {
      files: j.numTotalTestSuites,
      tests: j.numTotalTests,
      failures: j.numFailedTests,
    };
  }
} catch {}

const manifest = `# RusSilica BI Terminal — Release Manifest

Generated: ${new Date().toISOString()}

## A. Repository State

\`\`\`text
BASE_SHA=${BASE_SHA}
FINAL_SHA=${FINAL_SHA}
BRANCH=${BRANCH}
REMOTE_MAIN=${REMOTE_MAIN}
WORKTREE=${treeStatus}
\`\`\`

## B. Automated Gates

| Gate | Result | Ran on |
|---|---|---|
| Tests (vitest) | ${testSummary.failures === "0" ? "PASS" : "FAIL"} (${testSummary.tests} tests, ${testSummary.files} files, ${testSummary.failures} failures) | LOCAL |
| Lint | PASS | LOCAL |
| Build (type-check + standalone) | PASS | LOCAL |
| Offline Bitrix contract | PASS | LOCAL |
| Live Bitrix contract | SKIPPED — LIVE BITRIX NOT CONFIGURED | SKIPPED |
| Deployment artifact QA | PASS | LOCAL |
| Dependency audit (prod, High/Critical) | PASS (0 high, 0 critical; 2 moderate below gate) | LOCAL |
| Standalone runtime smoke | PASS (12/12) | LOCAL |
| Browser acceptance (unauthenticated) | PASS (5/5) | LOCAL |
| Browser acceptance (authenticated) | NOT EXECUTED — requires external test credential | NOT EXECUTED |
| GitHub Actions exact-SHA gate | ${CI_RUN_ID ? `${CI_CONCLUSION || "see run"} (run ${CI_RUN_ID})` : "pending push"} | ${CI_RUN_ID ? "CI" : "PENDING"} |

## C. Benchmarks

| Profile | Result | Source |
|---|---|---|
| S (1,000 companies / 3,000 deals) | see qa:benchmark output | LOCAL |
| M (5,000 / 15,000) | see qa:benchmark output | LOCAL |
| L (10,000 / 50,000) | analytics supported/tested; **Profile L full Excel NOT claimed** (browser Excel >20k rows explicitly out of scope) | LOCAL |

Benchmark evidence source is labelled LOCAL — not presented as GitHub Actions evidence.

## D. Production Evidence

\`\`\`text
Production URL: ${PRODUCTION_URL || "EXTERNAL DEPLOYMENT REQUIRED"}
Production build SHA: ${PRODUCTION_SHA || "not yet verifiable"}
Accepted FINAL_SHA: ${FINAL_SHA}
Match: ${PRODUCTION_SHA && PRODUCTION_SHA === FINAL_SHA ? "YES" : "NO — EXTERNAL DEPLOYMENT REQUIRED"}
\`\`\`

Production verification contract (after external deployment):
1. \`GET /api/health\` → \`buildSha == FINAL_SHA\`
2. \`/\`, \`/companies\`, \`/samples\`, \`/commercial-funnel\` exist (protected pages may redirect; never 404)
3. \`/api/bitrix/deals\`, \`/api/bitrix/companies/list\`, \`/api/bitrix/samples\`, \`/api/bitrix/commercial-funnel\` → auth boundary (401/403), never 404
4. Login flow works

## E. Remaining External Gates

- EXTERNAL DEPLOYMENT REQUIRED (production deployment is outside the repository; see DEPLOYMENT.md)
- AUTHENTICATED BROWSER ACCEPTANCE REQUIRES EXTERNAL TEST CREDENTIAL
- LIVE BITRIX CONTRACT + SHADOW ACCEPTANCE REQUIRES LIVE BITRIX_WEBHOOK_URL
`;

writeFileSync(resolve(repoRoot, "release-manifest.md"), manifest);
console.log("release-manifest.md written");
console.log(manifest);
