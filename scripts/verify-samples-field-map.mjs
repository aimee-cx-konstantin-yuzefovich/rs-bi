#!/usr/bin/env node
// scripts/verify-samples-field-map.mjs
// ─────────────────────────────────────────────────────────────────────
// RusSilica BI Terminal - Samples Field Map & Filters CRM Verifier.
// Validates configured Samples field IDs against real Bitrix24 CRM schema.
// Strictly READ-ONLY operations (crm.company.fields, crm.deal.fields, crm.status.list).
// ─────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 1. Detect BITRIX_WEBHOOK_URL
function getWebhookUrl() {
  if (process.env.BITRIX_WEBHOOK_URL && process.env.BITRIX_WEBHOOK_URL.trim()) {
    return process.env.BITRIX_WEBHOOK_URL.trim();
  }
  for (const envFile of [".env.local", ".env"]) {
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

const webhookUrl = getWebhookUrl();

if (!webhookUrl) {
  console.log("LIVE BITRIX FILTER AUDIT: NOT EXECUTED — BITRIX_WEBHOOK_URL NOT AVAILABLE");
  process.exit(0);
}

// 2. Field Map specification to audit
const SAMPLES_FIELD_SPECS = [
  {
    role: "Образцы (статус / наличие)",
    entity: "Company",
    configuredId: "UF_CRM_1753187313314",
    expectedType: "enumeration",
  },
  {
    role: "Дата передачи образцов (мульти)",
    entity: "Company",
    configuredId: "UF_CRM_1764156557536",
    expectedType: "date",
    expectedMultiple: true,
  },
  {
    role: "Дата передачи образцов (одиночная)",
    entity: "Company",
    configuredId: "UF_CRM_1783429999269",
    expectedType: "date",
    expectedMultiple: false,
  },
  {
    role: "Марка образца (ГЕЛЬ)",
    entity: "Company",
    configuredId: "UF_CRM_1764155817232",
    expectedType: "enumeration",
  },
  {
    role: "Марка образца (ЗОЛЬ)",
    entity: "Company",
    configuredId: "UF_CRM_1764155891815",
    expectedType: "enumeration",
  },
  {
    role: "Кол-во переданного (ГЕЛЬ)",
    entity: "Company",
    configuredId: "UF_CRM_1764156004815",
    expectedType: "double",
  },
  {
    role: "Кол-во переданного (ЗОЛЬ)",
    entity: "Company",
    configuredId: "UF_CRM_1764156064272",
    expectedType: "double",
  },
  {
    role: "Результат испытаний",
    entity: "Company",
    configuredId: "UF_CRM_1764156593",
    expectedType: "string",
  },
  {
    role: "Тип продукта",
    entity: "Company",
    configuredId: "UF_CRM_69257BBAB86F6",
    expectedType: "enumeration",
    expectedMultiple: true,
  },
  {
    role: "Область применения (новая)",
    entity: "Company",
    configuredId: "UF_CRM_1781806326214",
    expectedType: "enumeration",
  },
  {
    role: "Область применения (старая)",
    entity: "Company",
    configuredId: "UF_CRM_69257337B8025",
    expectedType: "enumeration",
  },
  {
    role: "Направление",
    entity: "Company",
    configuredId: "UF_CRM_69259C45D3399",
    expectedType: "enumeration",
  },
  {
    role: "Отрасль / сфера деятельности",
    entity: "Company",
    configuredId: "INDUSTRY",
    expectedType: "crm_status",
  },
  {
    role: "Передача образцов (сделка)",
    entity: "Deal",
    configuredId: "UF_CRM_1779386185",
    expectedType: "enumeration",
  },
  {
    role: "Тестирование образцов (сделка)",
    entity: "Deal",
    configuredId: "UF_CRM_1779394379",
    expectedType: "enumeration",
  },
  {
    role: "Дата отправки образцов (сделка)",
    entity: "Deal",
    configuredId: "UF_CRM_1774879952785",
    expectedType: "date",
  },
  {
    role: "Детали по образцам для ТВЛ",
    entity: "Deal",
    configuredId: "UF_CRM_1774880017",
    expectedType: "string",
  },
  {
    role: "Марка и объём поставки",
    entity: "Deal",
    configuredId: "UF_CRM_1779384164284",
    expectedType: "string",
  },
  {
    role: "Направление (сделка)",
    entity: "Deal",
    configuredId: "UF_CRM_6915D8C328208",
    expectedType: "enumeration",
  },
];

async function callBitrixReadOnly(baseUrl, method) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBase}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(`Bitrix call ${method} failed with HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.result;
}

async function verifyFieldMap() {
  console.log("=== RusSilica BI - Live Bitrix Samples Field Map Verification ===");
  console.log("Querying read-only metadata from CRM...");

  try {
    const [companyFields, dealFields, statusList] = await Promise.all([
      callBitrixReadOnly(webhookUrl, "crm.company.fields"),
      callBitrixReadOnly(webhookUrl, "crm.deal.fields"),
      callBitrixReadOnly(webhookUrl, "crm.status.list"),
    ]);

    const results = [];
    let hasMismatch = false;

    for (const spec of SAMPLES_FIELD_SPECS) {
      const fieldRepo = spec.entity === "Company" ? companyFields : dealFields;
      const liveField = fieldRepo ? fieldRepo[spec.configuredId] : undefined;

      if (!liveField) {
        results.push({
          role: spec.role,
          entity: spec.entity,
          id: spec.configuredId,
          crmTitle: "—",
          crmType: "—",
          multiple: "—",
          status: "NOT_FOUND",
        });
        hasMismatch = true;
        continue;
      }

      const crmTitle = liveField.title || liveField.formLabel || liveField.listLabel || "Без названия";
      const crmType = liveField.type || "unknown";
      const isMultiple = Boolean(liveField.isMultiple);

      let status = "OK";
      if (spec.expectedType && crmType !== spec.expectedType && !(spec.expectedType === "string" && crmType === "enumeration")) {
        status = "MISMATCH";
        hasMismatch = true;
      }
      if (spec.expectedMultiple !== undefined && isMultiple !== spec.expectedMultiple) {
        status = "MISMATCH";
        hasMismatch = true;
      }

      results.push({
        role: spec.role,
        entity: spec.entity,
        id: spec.configuredId,
        crmTitle,
        crmType,
        multiple: isMultiple ? "Да" : "Нет",
        status,
        items: liveField.items || [],
      });
    }

    console.log("\n--- Verification Summary Table ---");
    console.table(
      results.map((r) => ({
        "Роль": r.role,
        "Сущность": r.entity,
        "ID в коде": r.id,
        "Название в CRM": r.crmTitle,
        "Тип": r.crmType,
        "Мульти": r.multiple,
        "Статус": r.status,
      }))
    );

    console.log(`\nVerified fields: ${results.length}. Mismatches/Missing: ${results.filter((r) => r.status !== "OK").length}`);

    if (hasMismatch) {
      console.warn("WARNING: Some fields have type/existence mismatches with live CRM.");
      process.exit(1);
    } else {
      console.log("All Samples fields verified successfully against live CRM.");
      process.exit(0);
    }
  } catch (err) {
    console.error("Verification execution error:", err.message);
    process.exit(1);
  }
}

verifyFieldMap();
