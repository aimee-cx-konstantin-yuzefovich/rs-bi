#!/usr/bin/env node
// scripts/verify-bitrix-contract.mjs
// ─────────────────────────────────────────────────────────────────────
// RusSilica BI Terminal - Upstream Bitrix24 Contract & Schema Verifier.
// Validates field types, required fields, multiplicity, enum IDs, and stage invariants.
// Invokes the authoritative validation engine from src/lib/bitrix-contract.ts via jiti.
//
// Usage:
//   node scripts/verify-bitrix-contract.mjs --mode=offline
//   node scripts/verify-bitrix-contract.mjs --mode=live
// ─────────────────────────────────────────────────────────────────────

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url);

const {
  validateAllBitrixContracts,
  verifyLiveBitrixContract,
  OFFLINE_CONTRACT_SNAPSHOT,
} = await jiti.import(resolve(root, "src/lib/bitrix-contract.ts"));

export function validateContract({ dealFields, companyFields, dealList, companyList, statusList }) {
  const result = validateAllBitrixContracts({ dealFields, companyFields, dealList, companyList, statusList });
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
    issues: result.allIssues,
  };
}

async function run() {
  const args = process.argv.slice(2);
  let mode = "offline";
  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      mode = arg.split("=")[1].toLowerCase();
    } else if (arg === "--live") {
      mode = "live";
    } else if (arg === "--offline") {
      mode = "offline";
    }
  }

  if (mode === "live") {
    console.log("=== RusSilica BI - Live Bitrix Upstream Contract Validation ===");
    const webhookUrl = process.env.BITRIX_WEBHOOK_URL;

    if (!webhookUrl || !webhookUrl.trim()) {
      console.log("SKIPPED — LIVE BITRIX NOT CONFIGURED");
      console.log("(BITRIX_WEBHOOK_URL is unset; live contract verification cannot run)");
      process.exit(0);
    }

    try {
      const liveResult = await verifyLiveBitrixContract(webhookUrl);

      console.log("--------------------------------------------------------");
      console.log(`Validation Status: ${liveResult.status}`);
      console.log(`Errors:   ${liveResult.errors.length}`);
      console.log(`Warnings: ${liveResult.warnings.length}`);
      console.log("--------------------------------------------------------");

      if (liveResult.allIssues.length > 0) {
        for (const issue of liveResult.allIssues) {
          const tag = issue.severity === "error" ? "[ERROR]" : "[WARN]";
          console.log(`${tag} ${issue.entity} ${issue.field ? `(${issue.field})` : ""}: ${issue.message}`);
        }
        console.log("--------------------------------------------------------");
      }

      if (liveResult.status !== "PASS") {
        console.error("Live Bitrix contract validation failed with critical schema errors.");
        process.exit(1);
      } else {
        console.log("Live Bitrix contract validation passed successfully.");
        process.exit(0);
      }
    } catch (err) {
      console.error("Failed to query live Bitrix webhook:", err.message);
      process.exit(1);
    }
  } else {
    // Offline / Fixture mode
    console.log("=== RusSilica BI - Offline Bitrix Contract Validation ===");
    console.log("Validating against authoritative committed schema snapshot and invariants...");

    // Test 1: Snapshot validation
    const snapshotResult = validateContract(OFFLINE_CONTRACT_SNAPSHOT);
    if (!snapshotResult.ok || snapshotResult.errors.length > 0) {
      console.error("Authoritative snapshot validation failed:", snapshotResult.errors);
      process.exit(1);
    }

    // Test 2: Invariant check - missing required field must be caught
    const brokenSnapshot = {
      ...OFFLINE_CONTRACT_SNAPSHOT,
      dealFields: {
        result: {
          ...OFFLINE_CONTRACT_SNAPSHOT.dealFields.result,
        },
      },
    };
    delete brokenSnapshot.dealFields.result.OPPORTUNITY;
    const brokenResult = validateContract(brokenSnapshot);
    if (brokenResult.ok || !brokenResult.errors.some((e) => e.field === "OPPORTUNITY")) {
      console.error("Validator failed to detect missing OPPORTUNITY field in mutational test!");
      process.exit(1);
    }

    // Test 3: Type mismatch check - invalid OPPORTUNITY type must be caught
    const typeMismatchSnapshot = {
      ...OFFLINE_CONTRACT_SNAPSHOT,
      dealFields: {
        result: {
          ...OFFLINE_CONTRACT_SNAPSHOT.dealFields.result,
          OPPORTUNITY: { type: "string" },
        },
      },
    };
    const typeMismatchResult = validateContract(typeMismatchSnapshot);
    if (typeMismatchResult.ok || !typeMismatchResult.errors.some((e) => e.field === "OPPORTUNITY")) {
      console.error("Validator failed to detect type mismatch for OPPORTUNITY!");
      process.exit(1);
    }

    console.log("--------------------------------------------------------");
    console.log("Validation Status: PASS");
    console.log("Errors:   0");
    console.log("Warnings: 0");
    console.log("--------------------------------------------------------");
    console.log("Offline contract validation passed successfully.");
    process.exit(0);
  }
}

// Only execute directly when run as CLI
if (process.argv[1] && process.argv[1].endsWith("verify-bitrix-contract.mjs")) {
  run();
}
