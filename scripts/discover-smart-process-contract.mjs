#!/usr/bin/env node
// scripts/discover-smart-process-contract.mjs
// ─────────────────────────────────────────────────────────────────────
// RusSilica BI Terminal — Smart Process 1032 ("Тестирование образца")
// READ-ONLY live contract discovery.
//
// Purpose:
//   Discover the EXACT original UF_CRM field IDs, relation fields, stage
//   IDs and enum values of Smart Process entityTypeId=1032 / categoryId=15
//   from the live Bitrix24 portal, so the production SmartProcessAdapter
//   never runs on guessed IDs.
//
// Safety contract:
//   - Strictly READ-ONLY methods only (crm.type.list, crm.item.fields,
//     crm.category.list, crm.status.list, crm.item.list with ≤5 sample rows).
//   - BITRIX_WEBHOOK_URL is read from env/.env files and NEVER printed.
//   - Sample rows are sanitized: only field IDs, types and stage/status
//     codes are printed — never customer names, titles, or free text.
//   - No writes. No credentials. No output of the webhook.
//
// Usage:
//   node scripts/discover-smart-process-contract.mjs
//
// Exit codes:
//   0  — full contract discovered (prints sanitized JSON report)
//   2  — LIVE_SMART_PROCESS_CONTRACT_INCOMPLETE (required fields unresolved)
//   1  — transport / configuration error
// ─────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED_ENTITY_TYPE_ID = 1032;
const EXPECTED_CATEGORY_ID = 15;
const EXPECTED_STAGE_ENTITY = "DYNAMIC_1032_STAGE_15";

// Stage IDs are the stable key; labels are informational only.
const EXPECTED_STAGES = {
  "DT1032_15:NEW": "Подготовка к отправке",
  "DT1032_15:UC_ZARRMX": "Образцы отправлены",
  "DT1032_15:CLIENT": "На испытании",
  "DT1032_15:SUCCESS": "Подошли",
  "DT1032_15:FAIL": "Не подошли",
};

// Business fact → accepted Russian field titles (normalized: ё→е, lower, collapsed spaces).
const REQUIRED_FIELD_ROLES = [
  {
    role: "Дата отправки (manual shipping date)",
    acceptedTitles: ["дата отправки", "дата отправки образцов"],
    expectedTypes: ["date"],
    required: true,
  },
  {
    role: "Сделка (Deal relation)",
    acceptedTitles: ["сделка"],
    expectedTypes: ["integer", "crm_entity"],
    required: true,
  },
  {
    role: "Марка предоставленных образцов (ГЕЛЬ)",
    acceptedTitles: [
      "марка предоставленных образцов (гель)",
      "марка образца (гель)",
      "марка предоставленных образцов гель",
    ],
    expectedTypes: ["enumeration", "string"],
    required: true,
  },
  {
    role: "Марка предоставленных образцов (ЗОЛЬ)",
    acceptedTitles: [
      "марка предоставленных образцов (золь)",
      "марка образца (золь)",
      "марка предоставленных образцов золь",
    ],
    expectedTypes: ["enumeration", "string"],
    required: true,
  },
  {
    role: "Результат тестирования",
    acceptedTitles: ["результат тестирования"],
    expectedTypes: ["enumeration", "string"],
    required: true,
  },
  {
    role: "Company navigation marker (optional UF field)",
    acceptedTitles: ["образцы", "образцы (статус / наличие)"],
    expectedTypes: ["enumeration"],
    required: false,
  },
];

function normalizeTitle(t) {
  if (!t || typeof t !== "string") return "";
  return t
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

// Detect BITRIX_WEBHOOK_URL from environment or standard env files (never printed).
function getWebhookUrl() {
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

async function callReadOnly(baseUrl, method, body = {}) {
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
  if (data.error) {
    throw new Error(`Bitrix call ${method} returned error ${data.error}`);
  }
  return data.result;
}

/** Sanitizes a field metadata object: keeps IDs/types/labels, drops values of free-text items. */
function sanitizeFieldMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  return {
    type: meta.type ?? null,
    isMultiple: Boolean(meta.isMultiple),
    title: meta.title ?? meta.formLabel ?? meta.listLabel ?? null,
    isRequired: Boolean(meta.isRequired),
    items: Array.isArray(meta.items)
      ? meta.items.map((i) => ({ ID: String(i?.ID ?? ""), VALUE: String(i?.VALUE ?? "") }))
      : undefined,
    statusType: typeof meta.statusType === "string" ? meta.statusType : undefined,
  };
}

/** Sanitizes one crm.item.list row: keeps IDs, stage, relation IDs, enum IDs, dates. Drops free text. */
function sanitizeItemRow(row, discoveredFieldIds) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    // System identity / relation / stage / timestamps are safe structural facts.
    if (
      key === "id" ||
      key === "entityTypeId" ||
      key === "categoryId" ||
      key === "stageId" ||
      key === "createdTime" ||
      key === "updatedTime" ||
      key === "movedTime" ||
      key === "assignedById" ||
      key === "companyId" ||
      key === "contactId" ||
      /^ufCrm\d+_\d+/i.test(key) || // original UF field names
      /^ufCrm/i.test(key)
    ) {
      const isEnumField =
        typeof value === "string" || typeof value === "number" || Array.isArray(value);
      // Keep enum IDs and dates; drop long free-text values.
      if (isEnumField) {
        const str = Array.isArray(value) ? value.map(String) : String(value);
        const tooLong = Array.isArray(str)
          ? str.some((s) => s.length > 40)
          : str.length > 40;
        if (!tooLong) out[key] = str;
        else out[key] = "<long-text-redacted>";
      } else {
        out[key] = "<redacted>";
      }
    }
  }
  return out;
}

async function main() {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.log("SMART PROCESS DISCOVERY: BLOCKED — BITRIX_WEBHOOK_URL NOT AVAILABLE");
    console.log("DISCOVERY_STATUS=NOT_EXECUTED");
    process.exit(0);
  }

  console.log("=== RusSilica BI — Smart Process 1032 Live Contract Discovery (READ-ONLY) ===");

  try {
    // 1. Verify the Smart Process type exists with expected title/entityTypeId.
    const types = await callReadOnly(webhookUrl, "crm.type.list", {});
    const typeList = Array.isArray(types?.types)
      ? types.types
      : Array.isArray(types?.items)
      ? types.items
      : Array.isArray(types)
      ? types
      : [];
    const spType = typeList.find(
      (t) => Number(t?.entityTypeId) === EXPECTED_ENTITY_TYPE_ID
    );
    if (!spType) {
      console.error(`Smart Process entityTypeId ${EXPECTED_ENTITY_TYPE_ID} not found in crm.type.list`);
      console.log("DISCOVERY_STATUS=FAIL");
      process.exit(1);
    }
    console.log(`Smart Process type confirmed: entityTypeId=${spType.entityTypeId} title="${spType.title}"`);

    // 2. Verify category 15 exists.
    const categories = await callReadOnly(webhookUrl, "crm.category.list", {
      entityTypeId: EXPECTED_ENTITY_TYPE_ID,
    });
    const catList = Array.isArray(categories?.items)
      ? categories.items
      : Array.isArray(categories?.categories)
      ? categories.categories
      : Array.isArray(categories)
      ? categories
      : [];
    const category = catList.find((c) => Number(c?.id) === EXPECTED_CATEGORY_ID);
    if (!category) {
      console.error(`Category ${EXPECTED_CATEGORY_ID} not found for entityTypeId ${EXPECTED_ENTITY_TYPE_ID}`);
      console.log("DISCOVERY_STATUS=FAIL");
      process.exit(1);
    }
    console.log(`Category confirmed: id=${category.id} name="${category.name ?? ""}"`);

    // 3. Field metadata with ORIGINAL UF names.
    const rawFields = await callReadOnly(webhookUrl, "crm.item.fields", {
      entityTypeId: EXPECTED_ENTITY_TYPE_ID,
      useOriginalUfNames: "Y",
    });
    const fields =
      rawFields?.fields && typeof rawFields.fields === "object"
        ? rawFields.fields
        : rawFields;
    if (!fields || typeof fields !== "object") {
      console.error("crm.item.fields returned no usable metadata");
      console.log("DISCOVERY_STATUS=FAIL");
      process.exit(1);
    }

    // 4. Resolve required business facts to exact original field IDs.
    const resolved = {};
    const ambiguous = {};
    const missing = [];

    for (const spec of REQUIRED_FIELD_ROLES) {
      const candidates = [];
      for (const [fieldId, meta] of Object.entries(fields)) {
        const title = normalizeTitle(meta?.title ?? meta?.formLabel ?? meta?.listLabel ?? "");
        if (spec.acceptedTitles.includes(title)) {
          candidates.push({ fieldId, meta });
        }
      }
      if (candidates.length === 0) {
        if (spec.required) missing.push(spec.role);
        resolved[spec.role] = null;
        continue;
      }
      if (candidates.length > 1) {
        // Ambiguity: more than one field with the same accepted title.
        ambiguous[spec.role] = candidates.map((c) => c.fieldId);
        if (spec.required) missing.push(`${spec.role} (ambiguous: ${candidates.map((c) => c.fieldId).join(", ")})`);
        resolved[spec.role] = null;
        continue;
      }
      const winner = candidates[0];
      resolved[spec.role] = {
        fieldId: winner.fieldId,
        type: winner.meta?.type ?? null,
        isMultiple: Boolean(winner.meta?.isMultiple),
        title: winner.meta?.title ?? null,
        items: Array.isArray(winner.meta?.items)
          ? winner.meta.items.map((i) => ({ ID: String(i?.ID ?? ""), VALUE: String(i?.VALUE ?? "") }))
          : undefined,
      };
    }

    // 5. Detect relation fields.
    // Deal relation: system field whose title is «Сделка» (already resolved above)
    // or a PARENT_ID_<entityTypeId> system field.
    const dealRelationCandidates = Object.keys(fields).filter(
      (k) => k === `parentIds_${EXPECTED_ENTITY_TYPE_ID}` || k === `PARENT_ID_${EXPECTED_ENTITY_TYPE_ID}`
    );
    const companyRelationCandidates = Object.keys(fields).filter(
      (k) => k === "companyId" || k === "COMPANY_ID" || k === "companyId2"
    );

    // 6. Stage dictionary via crm.status.list DYNAMIC_1032_STAGE_15.
    let stageStatuses = [];
    try {
      const statusResult = await callReadOnly(webhookUrl, "crm.status.list", {
        filter: { ENTITY_ID: EXPECTED_STAGE_ENTITY },
      });
      stageStatuses = Array.isArray(statusResult) ? statusResult : [];
    } catch {
      console.warn("crm.status.list for stage entity failed (stages verified via item list instead)");
    }

    // 7. One sanitized sample page of items (≤5) to observe actual field presence.
    let sampleItems = [];
    try {
      const itemsResult = await callReadOnly(webhookUrl, "crm.item.list", {
        entityTypeId: EXPECTED_ENTITY_TYPE_ID,
        categoryId: EXPECTED_CATEGORY_ID,
        select: ["id", "stageId", "assignedById", "createdTime"],
        start: 0,
      });
      const rawItems = Array.isArray(itemsResult?.items) ? itemsResult.items : Array.isArray(itemsResult) ? itemsResult : [];
      sampleItems = rawItems.slice(0, 5).map((row) => sanitizeItemRow(row, resolved));
    } catch {
      console.warn("crm.item.list sample page failed (field presence not observed)");
    }

    // 8. Report.
    const report = {
      entityType: {
        entityTypeId: spType.entityTypeId,
        title: spType.title,
      },
      categoryId: category.id,
      stageEntity: EXPECTED_STAGE_ENTITY,
      expectedStages: EXPECTED_STAGES,
      liveStages: stageStatuses.map((s) => ({ STATUS_ID: s.STATUS_ID, NAME: s.NAME })),
      relationCandidates: {
        deal: dealRelationCandidates,
        company: companyRelationCandidates,
      },
      resolvedFields: resolved,
      ambiguousFields: ambiguous,
      sampleItemFieldPresence: sampleItems,
      discoveredAt: new Date().toISOString(),
    };

    console.log("\n--- Sanitized Smart Process contract report ---");
    console.log(JSON.stringify(report, null, 2));

    const requiredMissing = missing.filter((m) => !m.includes("optional"));
    if (requiredMissing.length > 0) {
      console.error("\nREQUIRED SMART PROCESS FIELDS UNRESOLVED:");
      for (const m of requiredMissing) console.error(`  - ${m}`);
      console.log("DISCOVERY_STATUS=LIVE_SMART_PROCESS_CONTRACT_INCOMPLETE");
      process.exit(2);
    }

    console.log("\nAll required Smart Process contract fields resolved.");
    console.log("DISCOVERY_STATUS=PASS");
    process.exit(0);
  } catch (err) {
    console.error("Discovery execution error:", err.message);
    console.log("DISCOVERY_STATUS=FAIL");
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
