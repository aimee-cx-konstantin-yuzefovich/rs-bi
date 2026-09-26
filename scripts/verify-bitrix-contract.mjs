#!/usr/bin/env node
// scripts/verify-bitrix-contract.mjs
// ─────────────────────────────────────────────────────────────────────
// RusSilica BI Terminal - Upstream Bitrix24 Contract & Schema Verifier.
// Validates field types, required fields, and list structures.
// Usage: node scripts/verify-bitrix-contract.mjs
// ─────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEAL_SAMPLE_TRANSFER_FIELD_ID = "UF_CRM_1779386185";
const DEAL_SAMPLE_TESTING_FIELD_ID = "UF_CRM_1779394379";
const COMPANY_SAMPLES_FIELD_ID = "UF_CRM_1753187313314";

const CRITICAL_DEAL_FIELDS = [
  "ID",
  "STAGE_ID",
  "OPPORTUNITY",
  "CURRENCY_ID",
  "ASSIGNED_BY_ID",
  "COMPANY_ID",
];

const CRITICAL_COMPANY_FIELDS = [
  "ID",
  "TITLE",
  "ASSIGNED_BY_ID",
];

function validateContract({ dealFields, companyFields, dealList, companyList }) {
  const issues = [];

  // 1. Validate deal fields
  if (dealFields) {
    const fields = dealFields.result || dealFields;
    for (const f of CRITICAL_DEAL_FIELDS) {
      if (!fields[f]) {
        issues.push({
          severity: "error",
          entity: "crm.deal.fields",
          field: f,
          message: `Missing critical deal field '${f}'`,
        });
      }
    }
    if (!fields[DEAL_SAMPLE_TRANSFER_FIELD_ID]) {
      issues.push({
        severity: "warning",
        entity: "crm.deal.fields",
        field: DEAL_SAMPLE_TRANSFER_FIELD_ID,
        message: `Missing custom sample transfer field '${DEAL_SAMPLE_TRANSFER_FIELD_ID}'`,
      });
    }
    if (!fields[DEAL_SAMPLE_TESTING_FIELD_ID]) {
      issues.push({
        severity: "warning",
        entity: "crm.deal.fields",
        field: DEAL_SAMPLE_TESTING_FIELD_ID,
        message: `Missing custom sample testing field '${DEAL_SAMPLE_TESTING_FIELD_ID}'`,
      });
    }
    for (const [id, meta] of Object.entries(fields)) {
      if (!meta || typeof meta !== "object") {
        issues.push({
          severity: "error",
          entity: "crm.deal.fields",
          field: id,
          message: "Field metadata must be an object",
        });
      } else if (typeof meta.type !== "string") {
        issues.push({
          severity: "error",
          entity: "crm.deal.fields",
          field: id,
          message: "Field must have a string 'type'",
        });
      }
    }
  }

  // 2. Validate company fields
  if (companyFields) {
    const fields = companyFields.result || companyFields;
    for (const f of CRITICAL_COMPANY_FIELDS) {
      if (!fields[f]) {
        issues.push({
          severity: "error",
          entity: "crm.company.fields",
          field: f,
          message: `Missing critical company field '${f}'`,
        });
      }
    }
    if (!fields[COMPANY_SAMPLES_FIELD_ID]) {
      issues.push({
        severity: "warning",
        entity: "crm.company.fields",
        field: COMPANY_SAMPLES_FIELD_ID,
        message: `Missing custom company samples field '${COMPANY_SAMPLES_FIELD_ID}'`,
      });
    }
  }

  // 3. Validate deal list
  if (dealList) {
    const list = dealList.result || (Array.isArray(dealList) ? dealList : null);
    if (!Array.isArray(list)) {
      issues.push({
        severity: "error",
        entity: "crm.deal.list",
        message: "Deals payload must contain an array 'result'",
      });
    }
  }

  // 4. Validate company list
  if (companyList) {
    const list = companyList.result || (Array.isArray(companyList) ? companyList : null);
    if (!Array.isArray(list)) {
      issues.push({
        severity: "error",
        entity: "crm.company.list",
        message: "Companies payload must contain an array 'result'",
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return { ok: errors.length === 0, errors, warnings, issues };
}

async function run() {
  console.log("=== RusSilica BI - Bitrix Upstream Contract Validation ===");

  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  let payloads = {};

  if (webhookUrl && webhookUrl.startsWith("http")) {
    console.log(`Live Mode: Querying Bitrix webhook at ${new URL(webhookUrl).origin}...`);
    try {
      const cleanUrl = webhookUrl.replace(/\/+$/, "");
      const [dfRes, cfRes, dlRes, clRes] = await Promise.all([
        fetch(`${cleanUrl}/crm.deal.fields.json`).then((r) => r.json()),
        fetch(`${cleanUrl}/crm.company.fields.json`).then((r) => r.json()),
        fetch(`${cleanUrl}/crm.deal.list.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: 0 }),
        }).then((r) => r.json()),
        fetch(`${cleanUrl}/crm.company.list.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: 0 }),
        }).then((r) => r.json()),
      ]);

      payloads = {
        dealFields: dfRes,
        companyFields: cfRes,
        dealList: dlRes,
        companyList: clRes,
      };
    } catch (err) {
      console.error("Failed to query live Bitrix webhook:", err.message);
      process.exit(1);
    }
  } else {
    console.log("Offline / Fixture Mode: Validating against authoritative schema requirements...");
    payloads = {
      dealFields: {
        ID: { type: "integer" },
        STAGE_ID: { type: "crm_status" },
        OPPORTUNITY: { type: "double" },
        CURRENCY_ID: { type: "crm_currency" },
        ASSIGNED_BY_ID: { type: "user" },
        COMPANY_ID: { type: "crm_company" },
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: { type: "enumeration" },
        [DEAL_SAMPLE_TESTING_FIELD_ID]: { type: "enumeration" },
      },
      companyFields: {
        ID: { type: "integer" },
        TITLE: { type: "string" },
        ASSIGNED_BY_ID: { type: "user" },
        [COMPANY_SAMPLES_FIELD_ID]: { type: "date" },
      },
      dealList: { result: [{ ID: "1", STAGE_ID: "WON" }] },
      companyList: { result: [{ ID: "10", TITLE: "Company A" }] },
    };
  }

  const result = validateContract(payloads);

  console.log("--------------------------------------------------------");
  console.log(`Validation Status: ${result.ok ? "PASS" : "FAIL"}`);
  console.log(`Errors:   ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log("--------------------------------------------------------");

  if (result.issues.length > 0) {
    for (const issue of result.issues) {
      const tag = issue.severity === "error" ? "[ERROR]" : "[WARN]";
      console.log(`${tag} ${issue.entity} ${issue.field ? `(${issue.field})` : ""}: ${issue.message}`);
    }
    console.log("--------------------------------------------------------");
  }

  if (!result.ok) {
    console.error("Contract validation failed with critical schema errors.");
    process.exit(1);
  } else {
    console.log("Contract validation passed successfully.");
    process.exit(0);
  }
}

run();
