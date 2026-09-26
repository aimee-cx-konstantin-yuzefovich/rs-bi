#!/usr/bin/env node
// scripts/verify-bitrix-contract.mjs
// ─────────────────────────────────────────────────────────────────────
// RusSilica BI Terminal - Upstream Bitrix24 Contract & Schema Verifier.
// Validates field types, required fields, and list structures.
//
// Usage:
//   node scripts/verify-bitrix-contract.mjs --mode=offline
//   node scripts/verify-bitrix-contract.mjs --mode=live
// ─────────────────────────────────────────────────────────────────────

import { URL } from "node:url";

const DEAL_SAMPLE_TRANSFER_FIELD_ID = "UF_CRM_1779386185";
const DEAL_SAMPLE_TESTING_FIELD_ID = "UF_CRM_1779394379";
const DEAL_SAMPLE_SENT_DATE_FIELD_ID = "UF_CRM_1774879952785";
const PAYMENT_STATUS_FIELD_ID = "UF_CRM_1584464068013";

const COMPANY_SAMPLES_FIELD_ID = "UF_CRM_1753187313314";
const COMPANY_SAMPLES_DATE_MULTI_FIELD_ID = "UF_CRM_1764156557536";

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

export function validateContract({ dealFields, companyFields, dealList, companyList, statusList }) {
  const issues = [];

  // 1. Validate deal fields
  if (dealFields) {
    const raw = dealFields.result || dealFields;
    const fields = typeof raw === "object" && raw !== null ? raw : {};
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
      } else {
        const typeStr = meta.type.toLowerCase();
        if (id === "OPPORTUNITY" && !["double", "float", "number"].includes(typeStr)) {
          issues.push({
            severity: "error",
            entity: "crm.deal.fields",
            field: "OPPORTUNITY",
            message: `Field 'OPPORTUNITY' expected numeric type (double), found '${meta.type}'`,
          });
        }
        if (
          (id === DEAL_SAMPLE_TRANSFER_FIELD_ID || id === DEAL_SAMPLE_TESTING_FIELD_ID) &&
          typeStr !== "enumeration"
        ) {
          issues.push({
            severity: "error",
            entity: "crm.deal.fields",
            field: id,
            message: `Field '${id}' expected enumeration type, found '${meta.type}'`,
          });
        }
        if (meta.items !== undefined && !Array.isArray(meta.items)) {
          issues.push({
            severity: "error",
            entity: "crm.deal.fields",
            field: id,
            message: `Field '${id}' property 'items' must be an array when present`,
          });
        }
      }
    }
  }

  // 2. Validate company fields
  if (companyFields) {
    const raw = companyFields.result || companyFields;
    const fields = typeof raw === "object" && raw !== null ? raw : {};
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
    for (const [id, meta] of Object.entries(fields)) {
      if (!meta || typeof meta !== "object") {
        issues.push({
          severity: "error",
          entity: "crm.company.fields",
          field: id,
          message: "Field metadata must be an object",
        });
      } else if (typeof meta.type !== "string") {
        issues.push({
          severity: "error",
          entity: "crm.company.fields",
          field: id,
          message: "Field must have a string 'type'",
        });
      } else if (id === "TITLE" && meta.type.toLowerCase() !== "string") {
        issues.push({
          severity: "error",
          entity: "crm.company.fields",
          field: "TITLE",
          message: `Field 'TITLE' expected string type, found '${meta.type}'`,
        });
      }
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

  // 5. Validate status list
  if (statusList) {
    const list = statusList.result || (Array.isArray(statusList) ? statusList : null);
    if (!Array.isArray(list)) {
      issues.push({
        severity: "error",
        entity: "crm.status.list",
        message: "Status payload must contain an array 'result'",
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return { ok: errors.length === 0, errors, warnings, issues };
}

// Authoritative schema snapshots for offline testing
const OFFLINE_SNAPSHOT = {
  dealFields: {
    result: {
      ID: { type: "integer" },
      STAGE_ID: { type: "crm_status" },
      OPPORTUNITY: { type: "double" },
      CURRENCY_ID: { type: "crm_currency" },
      ASSIGNED_BY_ID: { type: "user" },
      COMPANY_ID: { type: "crm_company" },
      DATE_CREATE: { type: "datetime" },
      BEGINDATE: { type: "date" },
      CLOSEDATE: { type: "date" },
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: {
        type: "enumeration",
        items: [{ ID: "1", VALUE: "Передано" }],
      },
      [DEAL_SAMPLE_TESTING_FIELD_ID]: {
        type: "enumeration",
        items: [{ ID: "2", VALUE: "В работе" }],
      },
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: { type: "date" },
      [PAYMENT_STATUS_FIELD_ID]: {
        type: "enumeration",
        items: [{ ID: "113", VALUE: "Оплачен" }],
      },
    },
  },
  companyFields: {
    result: {
      ID: { type: "integer" },
      TITLE: { type: "string" },
      ASSIGNED_BY_ID: { type: "user" },
      DATE_CREATE: { type: "datetime" },
      [COMPANY_SAMPLES_FIELD_ID]: { type: "date" },
      [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: { type: "date" },
    },
  },
  dealList: { result: [{ ID: "1", STAGE_ID: "WON", OPPORTUNITY: 1000 }] },
  companyList: { result: [{ ID: "10", TITLE: "Company A" }] },
  statusList: {
    result: [
      { STATUS_ID: "WON", NAME: "Сделка успешна" },
      { STATUS_ID: "LOSE", NAME: "Сделка проиграна" },
    ],
  },
};

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
      const parsedUrl = new URL(webhookUrl.trim());
      if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
        throw new Error(`Unsupported webhook protocol: ${parsedUrl.protocol}`);
      }
      console.log(`Live Mode: Querying Bitrix webhook at ${parsedUrl.origin}...`);

      const cleanUrl = webhookUrl.trim().replace(/\/+$/, "");
      const fetchWithTimeout = async (endpoint, postBody) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const res = await fetch(`${cleanUrl}/${endpoint}`, {
            method: postBody ? "POST" : "GET",
            headers: { "Content-Type": "application/json" },
            body: postBody ? JSON.stringify(postBody) : undefined,
            signal: controller.signal,
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText} from ${endpoint}`);
          }
          return await res.json();
        } finally {
          clearTimeout(timer);
        }
      };

      const [dealFields, companyFields, dealList, companyList, statusList] = await Promise.all([
        fetchWithTimeout("crm.deal.fields.json"),
        fetchWithTimeout("crm.company.fields.json"),
        fetchWithTimeout("crm.deal.list.json", { start: 0 }),
        fetchWithTimeout("crm.company.list.json", { start: 0 }),
        fetchWithTimeout("crm.status.list.json", { filter: { ENTITY_ID: "DEAL_STAGE" } }).catch(() => ({ result: [] })),
      ]);

      const result = validateContract({ dealFields, companyFields, dealList, companyList, statusList });

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
    const snapshotResult = validateContract(OFFLINE_SNAPSHOT);
    if (!snapshotResult.ok || snapshotResult.errors.length > 0) {
      console.error("Authoritative snapshot validation failed:", snapshotResult.errors);
      process.exit(1);
    }

    // Test 2: Invariant check - missing required field must be caught
    const brokenSnapshot = {
      ...OFFLINE_SNAPSHOT,
      dealFields: {
        result: {
          ...OFFLINE_SNAPSHOT.dealFields.result,
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
      ...OFFLINE_SNAPSHOT,
      dealFields: {
        result: {
          ...OFFLINE_SNAPSHOT.dealFields.result,
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
