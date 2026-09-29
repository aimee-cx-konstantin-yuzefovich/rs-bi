#!/usr/bin/env node
// scripts/verify-samples-field-map.mjs
// ─────────────────────────────────────────────────────────────────────
// RusSilica BI Terminal - Samples Field Map & Filters CRM Verifier.
// Validates configured Samples field IDs against real Bitrix24 CRM schema.
// Strictly READ-ONLY operations (crm.company.fields, crm.deal.fields, crm.status.list).
// Proves both TECHNICAL types and BUSINESS SEMANTICS (field TITLE / metadata).
// ─────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url);

// Import actual constants — ONE source of truth from production code
const crm = await jiti.import(resolve(root, "src/lib/crm-constants.ts"));

export function normalizeTitle(t) {
  if (!t || typeof t !== "string") return "";
  return t
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

// Field Map specification to audit with strict business semantic expectations
export const SAMPLES_FIELD_SPECS = [
  // Company fields
  {
    role: "Образцы",
    entity: "Company",
    configuredId: crm.COMPANY_SAMPLES_FIELD_ID,
    expectedTypes: ["enumeration"],
    acceptedTitles: ["Образцы", "Образцы (статус / наличие)"],
  },
  {
    role: "Дата передачи образцов (multi)",
    entity: "Company",
    configuredId: crm.COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
    expectedTypes: ["date"],
    expectedMultiple: true,
    acceptedTitles: ["Дата передачи образцов"],
  },
  {
    role: "Дата передачи образцов (single)",
    entity: "Company",
    configuredId: crm.COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
    expectedTypes: ["date"],
    expectedMultiple: false,
    acceptedTitles: ["Дата передачи образцов"],
  },
  {
    role: "Марка предоставленных образцов (ГЕЛЬ)",
    entity: "Company",
    configuredId: crm.COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
    expectedTypes: ["enumeration"],
    acceptedTitles: [
      "Марка предоставленных образцов (ГЕЛЬ)",
      "Марка образца (ГЕЛЬ)",
    ],
  },
  {
    role: "Марка предоставленных образцов (ЗОЛЬ)",
    entity: "Company",
    configuredId: crm.COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
    expectedTypes: ["enumeration"],
    acceptedTitles: [
      "Марка предоставленных образцов (ЗОЛЬ)",
      "Марка образца (ЗОЛЬ)",
    ],
  },
  {
    role: "Кол-во переданного образца (ГЕЛЬ)",
    entity: "Company",
    configuredId: crm.COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
    expectedTypes: ["double"],
    acceptedTitles: [
      "Кол-во переданного образца (ГЕЛЬ) кг",
      "Кол-во переданного (ГЕЛЬ)",
      "Кол-во переданного образца (ГЕЛЬ)",
    ],
  },
  {
    role: "Кол-во переданного образца (ЗОЛЬ)",
    entity: "Company",
    configuredId: crm.COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
    expectedTypes: ["double"],
    acceptedTitles: [
      "Кол-во переданного образца (ЗОЛЬ) л",
      "Кол-во переданного (ЗОЛЬ)",
      "Кол-во переданного образца (ЗОЛЬ)",
    ],
  },
  {
    role: "Результат испытаний",
    entity: "Company",
    configuredId: crm.COMPANY_TEST_RESULT_FIELD_ID,
    expectedTypes: ["string", "enumeration"],
    acceptedTitles: ["Результат испытаний"],
  },
  {
    role: "Тип продукта",
    entity: "Company",
    configuredId: crm.COMPANY_PRODUCT_TYPE_FIELD_ID,
    expectedTypes: ["enumeration"],
    expectedMultiple: true,
    acceptedTitles: ["Тип продукта"],
  },
  {
    role: "Область применения — current/new",
    entity: "Company",
    configuredId: crm.COMPANY_APPLICATION_NEW_FIELD_ID,
    expectedTypes: ["enumeration"],
    acceptedTitles: ["Область применения"],
  },
  {
    role: "Область применения — legacy",
    entity: "Company",
    configuredId: crm.COMPANY_APPLICATION_OLD_FIELD_ID,
    expectedTypes: ["enumeration"],
    acceptedTitles: ["Область применения"],
  },
  {
    role: "Направление",
    entity: "Company",
    configuredId: crm.COMPANY_DIRECTION_FIELD_ID,
    expectedTypes: ["enumeration"],
    acceptedTitles: ["Направление"],
  },
  {
    role: "INDUSTRY",
    entity: "Company",
    configuredId: "INDUSTRY",
    expectedTypes: ["crm_status"],
    acceptedTitles: [
      "Сфера деятельности",
      "Отрасль",
      "Отрасль / сфера деятельности",
      "Industry",
    ],
  },

  // Deal fields
  {
    role: "Передача образцов",
    entity: "Deal",
    configuredId: crm.DEAL_SAMPLE_TRANSFER_FIELD_ID,
    expectedTypes: ["enumeration"],
    acceptedTitles: ["Передача образцов"],
  },
  {
    role: "Тестирование образцов",
    entity: "Deal",
    configuredId: crm.DEAL_SAMPLE_TESTING_FIELD_ID,
    expectedTypes: ["enumeration"],
    acceptedTitles: ["Тестирование образцов"],
  },
  {
    role: "Дата отправки образцов",
    entity: "Deal",
    configuredId: crm.DEAL_SAMPLE_SENT_DATE_FIELD_ID,
    expectedTypes: ["date"],
    acceptedTitles: ["Дата отправки образцов"],
  },
  {
    role: "Детали по образцам для ТВЛ",
    entity: "Deal",
    configuredId: crm.DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
    expectedTypes: ["string"],
    acceptedTitles: ["Детали по образцам для ТВЛ"],
  },
  {
    role: "Марка и объём поставки",
    entity: "Deal",
    configuredId: crm.DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
    expectedTypes: ["string"],
    acceptedTitles: ["Марка и объём поставки", "Марка и объем поставки"],
  },
  {
    role: "Направление",
    entity: "Deal",
    configuredId: crm.DEAL_DIRECTION_FIELD_ID,
    expectedTypes: ["enumeration"],
    acceptedTitles: ["Направление"],
  },
];

// Detect BITRIX_WEBHOOK_URL from environment or standard env files only
export function getWebhookUrl() {
  if (process.env.BITRIX_WEBHOOK_URL && process.env.BITRIX_WEBHOOK_URL.trim()) {
    return process.env.BITRIX_WEBHOOK_URL.trim();
  }
  for (const envFile of [".env", ".env.local", ".env.production.local"]) {
    const p = resolve(root, envFile);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("BITRIX_WEBHOOK_URL=")) {
            const val = trimmed
              .slice("BITRIX_WEBHOOK_URL=".length)
              .trim()
              .replace(/^["']|["']$/g, "");
            if (val) return val;
          }
        }
      } catch {
        // ignore read error
      }
    }
  }
  return null;
}

export async function callBitrixReadOnly(baseUrl, method, body = {}) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBase}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Bitrix call ${method} failed with HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.result;
}

export function evaluateFieldSpec(spec, liveField, statusList = []) {
  if (!liveField) {
    return {
      ROLE: spec.role,
      ENTITY: spec.entity,
      FIELD_ID: spec.configuredId,
      EXPECTED_TITLE: spec.acceptedTitles.join(" | "),
      LIVE_TITLE: "—",
      EXPECTED_TYPE: spec.expectedTypes.join(" | "),
      LIVE_TYPE: "—",
      EXPECTED_MULTIPLE: spec.expectedMultiple !== undefined ? (spec.expectedMultiple ? "Да" : "Нет") : "—",
      LIVE_MULTIPLE: "—",
      SEMANTIC_STATUS: "NOT_FOUND",
      TECHNICAL_STATUS: "NOT_FOUND",
      FINAL_STATUS: "NOT_FOUND",
    };
  }

  const liveTitle =
    liveField.title ||
    liveField.formLabel ||
    liveField.listLabel ||
    liveField.name ||
    "Без названия";
  const liveType = liveField.type || "unknown";
  const liveMultiple = Boolean(liveField.isMultiple);

  // 1. Semantic title check
  const normLiveTitle = normalizeTitle(liveTitle);
  const isSemanticMatch = spec.acceptedTitles.some(
    (accepted) => normalizeTitle(accepted) === normLiveTitle
  );

  // 2. Technical type and multiplicity check
  let isTypeMatch = false;
  if (spec.expectedTypes.includes(liveType)) {
    isTypeMatch = true;
  } else if (spec.expectedTypes.includes("string") && liveType === "enumeration") {
    isTypeMatch = true;
  }

  let isMultipleMatch = true;
  if (spec.expectedMultiple !== undefined && liveMultiple !== spec.expectedMultiple) {
    isMultipleMatch = false;
  }

  // 3. Status list dictionary check for crm_status fields
  let isStatusDictionaryMatch = true;
  if (spec.expectedTypes.includes("crm_status")) {
    const statusType = liveField.statusType;
    if (!statusType) {
      isStatusDictionaryMatch = false;
    } else {
      const dictEntries = Array.isArray(statusList)
        ? statusList.filter((s) => s.ENTITY_ID === statusType)
        : [];
      if (dictEntries.length === 0) {
        isStatusDictionaryMatch = false;
      }
    }
  }

  const isTechMatch = isTypeMatch && isMultipleMatch && isStatusDictionaryMatch;
  const semanticStatus = isSemanticMatch ? "PASS" : "FAIL";
  const technicalStatus = isTechMatch ? "PASS" : "FAIL";
  const finalStatus = isSemanticMatch && isTechMatch ? "PASS" : "FAIL";

  return {
    ROLE: spec.role,
    ENTITY: spec.entity,
    FIELD_ID: spec.configuredId,
    EXPECTED_TITLE: spec.acceptedTitles.join(" | "),
    LIVE_TITLE: liveTitle,
    EXPECTED_TYPE: spec.expectedTypes.join(" | "),
    LIVE_TYPE: liveType,
    EXPECTED_MULTIPLE: spec.expectedMultiple !== undefined ? (spec.expectedMultiple ? "Да" : "Нет") : "—",
    LIVE_MULTIPLE: liveMultiple ? "Да" : "Нет",
    SEMANTIC_STATUS: semanticStatus,
    TECHNICAL_STATUS: technicalStatus,
    FINAL_STATUS: finalStatus,
  };
}

async function main() {
  const webhookUrl = getWebhookUrl();

  if (!webhookUrl) {
    console.log("LIVE BITRIX FILTER AUDIT: BLOCKED — BITRIX_WEBHOOK_URL NOT AVAILABLE");
    console.log("LIVE AUDIT NOT EXECUTED");
    console.log("LIVE_AUDIT_STATUS=NOT_EXECUTED");
    process.exit(0);
  }

  console.log("=== RusSilica BI - Live Bitrix Samples Field Map Verification ===");
  console.log("Querying read-only metadata from CRM...");

  try {
    const [companyFields, dealFields, statusList] = await Promise.all([
      callBitrixReadOnly(webhookUrl, "crm.company.fields"),
      callBitrixReadOnly(webhookUrl, "crm.deal.fields"),
      callBitrixReadOnly(webhookUrl, "crm.status.list"),
    ]);

    const results = [];
    let hasFailure = false;

    for (const spec of SAMPLES_FIELD_SPECS) {
      const fieldRepo = spec.entity === "Company" ? companyFields : dealFields;
      const liveField = fieldRepo ? fieldRepo[spec.configuredId] : undefined;
      const row = evaluateFieldSpec(spec, liveField, statusList);
      results.push(row);
      if (row.FINAL_STATUS !== "PASS") {
        hasFailure = true;
      }
    }

    console.log("\n--- Verification Summary Table ---");
    console.table(results);

    const total = results.length;
    const passed = results.filter((r) => r.FINAL_STATUS === "PASS").length;
    const failed = results.filter((r) => r.FINAL_STATUS === "FAIL").length;
    const notFound = results.filter((r) => r.FINAL_STATUS === "NOT_FOUND").length;

    console.log(`\nVerified fields: ${total}. PASS: ${passed}, FAIL: ${failed}, NOT_FOUND: ${notFound}`);

    if (hasFailure) {
      console.warn("WARNING: Some fields have semantic or technical mismatches with live CRM.");
      console.log("LIVE_AUDIT_STATUS=FAIL");
      process.exit(1);
    } else {
      console.log("All Samples fields verified successfully against live CRM.");
      console.log("LIVE_AUDIT_STATUS=PASS");
      process.exit(0);
    }
  } catch (err) {
    console.error("Verification execution error:", err.message);
    console.log("LIVE_AUDIT_STATUS=FAIL");
    process.exit(1);
  }
}

// Only run main when invoked as main script
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
