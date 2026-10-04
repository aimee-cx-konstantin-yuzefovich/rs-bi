#!/usr/bin/env node
// scripts/verify-n-mode-field-contract.mjs
// ─────────────────────────────────────────────────────────────────────
// RusSilica BI Terminal — Smart Process 1032 N-mode field-contract
// verifier (Phase A live gate for N_MODE_FIELD_CONTRACT_OK).
//
// STRICTLY READ-ONLY against Bitrix24:
//   - crm.item.fields (Y-mode and N-mode metadata)
//   - crm.item.list   (N-mode single-role + full-select structural probes)
// No *.add / *.update / *.delete / batch / configuration calls exist in
// this script. Safety is determined by the Bitrix method, not the HTTP
// verb: HTTP POST to READ-ONLY REST methods only.
//
// Output: structural verdicts ONLY — semantic role names, booleans,
// counts, envelope facts. NEVER business values, company/item/Deal IDs,
// field display titles, grades, quantities, comments, webhook URL,
// tokens, cookies, raw response bodies, or error_description.
//
// Verdicts:
//   N_MODE_FIELD_CONTRACT_OK              — all probes passed
//   N_MODE_FIELD_MAPPING_AMBIGUOUS        — a role had 0 or >1 candidates
//   N_MODE_FULL_SELECT_FAILED             — role probes / full select failed
//   BITRIX_FIELD_NAMING_CONTRACT_CONFLICT — metadata envelope unusable
//   NOT_EXECUTED                          — webhook unavailable (exit 0)
// ─────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url);

// ONE source of truth from production code (no duplicated role registry).
const contract = await jiti.import(
  resolve(root, "src/lib/samples/smart-process-contract.ts")
);
const bitrixFetch = await jiti.import(
  resolve(root, "src/lib/samples/bitrix-fetch.ts")
);

const ENTITY_TYPE_ID = contract.SMART_PROCESS_ENTITY_TYPE_ID;
const CATEGORY_ID = contract.SMART_PROCESS_CATEGORY_ID;
const ROLES = contract.SMART_PROCESS_N_MODE_CUSTOM_ROLES;

/**
 * Role → committed original UF field name (canonical provenance).
 * The relation role (parentId2) is a documented standard field and never
 * participates in UF-name correlation.
 */
function roleOriginalNames() {
  const map = {};
  for (const role of ROLES) {
    map[role] = bitrixFetch.SMART_PROCESS_ROLE_FIELD_IDS[role] ?? null;
  }
  return map;
}

/**
 * READ-ONLY Bitrix REST call. Allowed methods are enforced locally as a
 * second guard on top of intent (fail closed on anything else).
 */
const READ_ONLY_METHODS = new Set(["crm.item.fields", "crm.item.list"]);
async function callReadOnly(webhookUrl, method, body = {}) {
  if (!READ_ONLY_METHODS.has(method)) {
    throw new Error(`Blocked non-read-only method: ${method}`);
  }
  const cleanBase = webhookUrl.replace(/\/+$/, "");
  const response = await fetch(`${cleanBase}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    // Only the status — never the body (error_description stays internal).
    throw new Error(`${method} failed with HTTP ${response.status}`);
  }
  return response.json();
}

function unwrapFields(data) {
  const raw = data?.result;
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    raw.fields &&
    typeof raw.fields === "object"
  ) {
    return raw.fields;
  }
  return raw && typeof raw === "object" ? raw : null;
}

/** Structural first-page probe facts (anonymous counts/booleans only). */
function firstPageFacts(data) {
  const rawResult = data?.result;
  const items = Array.isArray(rawResult)
    ? rawResult
    : rawResult && typeof rawResult === "object" && Array.isArray(rawResult.items)
      ? rawResult.items
      : null;
  if (!items) {
    return { envelopeValid: false, itemCount: 0, rowsWithUsableId: 0, duplicateIdCount: 0, reportedTotal: null, nextPresent: false };
  }
  let rowsWithUsableId = 0;
  const seen = new Set();
  let duplicates = 0;
  for (const row of items) {
    const rawId = row && typeof row === "object" ? (row.id ?? row.ID) : undefined;
    const id = rawId === undefined || rawId === null ? "" : String(rawId).trim();
    if (id === "") continue;
    rowsWithUsableId++;
    if (seen.has(id)) duplicates++;
    else seen.add(id);
  }
  const totalRaw = data?.total;
  const parsedTotal =
    totalRaw === undefined || totalRaw === null ? null : Number(totalRaw);
  return {
    envelopeValid: true,
    itemCount: items.length,
    rowsWithUsableId,
    duplicateIdCount: duplicates,
    reportedTotal:
      parsedTotal !== null && Number.isFinite(parsedTotal) && parsedTotal >= 0
        ? parsedTotal
        : null,
    nextPresent: data?.next !== undefined && data?.next !== null,
  };
}

async function main() {
  console.log("=== RusSilica BI — Smart Process N-mode field-contract verifier ===");
  console.log("READ-ONLY: crm.item.fields + crm.item.list only.");

  const webhookUrl = process.env.BITRIX_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.log("LIVE N-MODE AUDIT: BLOCKED — BITRIX_WEBHOOK_URL NOT AVAILABLE");
    console.log("LIVE AUDIT NOT EXECUTED");
    console.log("N_MODE_FIELD_CONTRACT=NOT_EXECUTED");
    process.exit(0);
    return;
  }

  try {
    // ─── Step 1: metadata (Y + N) — deterministic upperName correlation ───
    const [yMeta, nMeta] = await Promise.all([
      callReadOnly(webhookUrl, "crm.item.fields", {
        entityTypeId: ENTITY_TYPE_ID,
        useOriginalUfNames: "Y",
      }),
      callReadOnly(webhookUrl, "crm.item.fields", {
        entityTypeId: ENTITY_TYPE_ID,
        useOriginalUfNames: "N",
      }),
    ]);
    const yFields = unwrapFields(yMeta);
    const nFields = unwrapFields(nMeta);
    if (!yFields || !nFields) {
      console.log("METADATA_ENVELOPE=UNUSABLE");
      console.log("N_MODE_FIELD_CONTRACT=BITRIX_FIELD_NAMING_CONTRACT_CONFLICT");
      process.exit(1);
      return;
    }

    const originalNames = roleOriginalNames();
    const correlation = contract.correlateSmartProcessNModeFieldNames(
      originalNames,
      nFields
    );

    // Live metadata sanity: the Y-mode key names of the committed roles
    // MUST exist in Y metadata (canonical provenance). Missing role key
    // here means the committed contract drifted from the live portal.
    for (const role of ROLES) {
      const original = originalNames[role];
      if (!original || !(original in yFields)) {
        console.log(`ROLE ${role}: ORIGINAL_FIELD_MISSING_FROM_Y_METADATA`);
        console.log("N_MODE_FIELD_CONTRACT=SMART_PROCESS_CONTRACT_DRIFT");
        process.exit(1);
        return;
      }
    }

    console.log("--- Step 1: metadata correlation (upperName ↔ original UF name) ---");
    for (const role of ROLES) {
      const count = correlation.candidates[role] ?? 0;
      console.log(
        `ROLE ${role}: candidates=${count} ${count === 1 ? "UNIQUE" : count === 0 ? "MISSING" : "AMBIGUOUS"}`
      );
    }
    if (!correlation.complete) {
      console.log("N_MODE_FIELD_CONTRACT=N_MODE_FIELD_MAPPING_AMBIGUOUS");
      process.exit(1);
      return;
    }

    // ─── Step 2: per-role N-mode single-field list probes ───
    console.log("--- Step 2: per-role N-mode single-field list probes ---");
    let rolesAllSelectable = true;
    for (const role of ROLES) {
      const nModeName = correlation.resolved[role];
      const data = await callReadOnly(webhookUrl, "crm.item.list", {
        entityTypeId: ENTITY_TYPE_ID,
        useOriginalUfNames: "N",
        select: ["id", nModeName],
        filter: { categoryId: CATEGORY_ID },
        order: { id: "ASC" },
        start: 0,
      });
      const facts = firstPageFacts(data);
      const ok =
        facts.envelopeValid &&
        facts.itemCount > 0 &&
        facts.rowsWithUsableId === facts.itemCount &&
        facts.duplicateIdCount === 0;
      if (!ok) rolesAllSelectable = false;
      console.log(
        `ROLE ${role}: selectable=${ok} itemCount=${facts.itemCount} rowsWithId=${facts.rowsWithUsableId} duplicates=${facts.duplicateIdCount} total=${facts.reportedTotal} next=${facts.nextPresent}`
      );
    }
    if (!rolesAllSelectable) {
      console.log("N_MODE_FIELD_CONTRACT=N_MODE_FULL_SELECT_FAILED");
      process.exit(1);
      return;
    }

    // ─── Step 3: full proposed N-mode production select probe ───
    console.log("--- Step 3: full N-mode production-select probe ---");
    const fullSelect = [
      ...bitrixFetch.SMART_PROCESS_SYSTEM_SELECT,
      "parentId2",
      ...ROLES.map((role) => correlation.resolved[role]),
    ];
    const fullData = await callReadOnly(webhookUrl, "crm.item.list", {
      entityTypeId: ENTITY_TYPE_ID,
      useOriginalUfNames: "N",
      select: fullSelect,
      filter: { categoryId: CATEGORY_ID },
      order: { id: "ASC" },
      start: 0,
    });
    const full = firstPageFacts(fullData);
    // Role-key structural compatibility: count DISTINCT role keys present
    // on the first row (names are never printed).
    let roleKeysPresent = 0;
    const firstRow =
      full.envelopeValid && full.itemCount > 0
        ? (Array.isArray(fullData.result) ? fullData.result : fullData.result.items)[0]
        : null;
    if (firstRow && typeof firstRow === "object") {
      const keys = new Set(Object.keys(firstRow));
      for (const role of ROLES) {
        if (keys.has(correlation.resolved[role])) roleKeysPresent++;
      }
    }
    const fullOk =
      full.envelopeValid &&
      full.itemCount > 0 &&
      full.rowsWithUsableId === full.itemCount &&
      full.duplicateIdCount === 0 &&
      roleKeysPresent === ROLES.length;
    console.log(
      `FULL_SELECT: ok=${fullOk} itemCount=${full.itemCount} rowsWithId=${full.rowsWithUsableId} duplicates=${full.duplicateIdCount} total=${full.reportedTotal} next=${full.nextPresent} roleKeysPresent=${roleKeysPresent}/${ROLES.length}`
    );
    if (!fullOk) {
      console.log("N_MODE_FIELD_CONTRACT=N_MODE_FULL_SELECT_FAILED");
      process.exit(1);
      return;
    }

    console.log("--- Verdict ---");
    console.log("N_MODE_FIELD_CONTRACT=N_MODE_FIELD_CONTRACT_OK");
    process.exit(0);
  } catch (err) {
    // Only the safe message (HTTP status / blocked method) — never raw
    // response bodies or error_description.
    console.error(`Verification execution error: ${err.message}`);
    console.log("N_MODE_FIELD_CONTRACT=BITRIX_FIELD_NAMING_CONTRACT_CONFLICT");
    process.exit(1);
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
