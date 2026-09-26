// src/lib/samples/bitrix-fetch.ts
// ─────────────────────────────────────────────────────────────────────
// Authoritative server-side Samples data loading via bitrixPost.
//
// HARD REQUIREMENTS (Samples v1 §10):
// - complete dataset for the requested scope — no MAX_PAGES truncation;
// - fail-closed pagination: malformed envelopes and malformed `next`
//   continuation tokens abort the whole request (never a silent partial
//   dataset interpreted as complete, never "empty" on corruption);
// - entity deduplication by ID;
// - all calls through bitrixPost (allowlist, SSRF protections, timeouts).
// ─────────────────────────────────────────────────────────────────────

import { bitrixPost } from "@/lib/bitrix";
import type { BitrixRow } from "./types";
import {
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  DEAL_DIRECTION_FIELD_ID,
} from "./constants";

const PAGE_SIZE = 50;

/** Generic shape of a Bitrix list page. */
interface BitrixListPage {
  result?: BitrixRow[] | Record<string, unknown> | null;
  total?: number;
  next?: unknown;
}

/**
 * Sequentially pages through a Bitrix list method until completion.
 * Fail-closed: throws on malformed envelope, non-advancing/repeated/
 * decreasing/invalid `next`, or transport errors — the caller must never
 * receive a partial dataset that could be mistaken for complete.
 * Deduplicates rows by the given ID field.
 */
export async function fetchAllPages(
  method: string,
  baseParams: Record<string, unknown>,
  idField: string
): Promise<BitrixRow[]> {
  const rows: BitrixRow[] = [];
  const seenIds = new Set<string>();
  const seenStarts = new Set<number>([0]);
  let start = 0;
  let authoritativeTotal: number | null = null;

  // Guard against pathological loops; a legitimate dataset of N rows needs
  // ceil(N/50)+1 pages — 4096 pages ≈ 200k rows, far beyond CRM scale. If the
  // loop exits without a missing `next`, the dataset was too large to be a
  // plausible Bitrix response and we fail closed rather than silently stop.
  const MAX_ITERATIONS = 4096;

  let completed = false;
  let iteration = 0;

  while (iteration++ < MAX_ITERATIONS) {
    const data = await bitrixPost<BitrixListPage>(method, {
      ...baseParams,
      start,
    });

    // A malformed result envelope (null / object without a rows array)
    // means a corrupted Bitrix response — NEVER an authoritative zero.
    const rawResult = data.result;
    const items: BitrixRow[] | undefined = Array.isArray(rawResult)
      ? rawResult
      : rawResult !== null &&
        typeof rawResult === "object" &&
        Array.isArray((rawResult as { items?: unknown }).items)
      ? ((rawResult as { items: BitrixRow[] }).items)
      : undefined;

    if (!items) {
      throw new Error(`Invalid ${method} result envelope from Bitrix`);
    }

    if (data.total !== undefined && data.total !== null && String(data.total).trim() !== "") {
      const parsedTotal = Number(data.total);
      if (Number.isFinite(parsedTotal) && parsedTotal >= 0) {
        if (authoritativeTotal === null) {
          authoritativeTotal = parsedTotal;
        } else if (authoritativeTotal !== parsedTotal) {
          authoritativeTotal = parsedTotal;
        }
      }
    }

    for (const row of items) {
      if (!row || typeof row !== "object") {
        throw new Error(`Invalid row format in ${method} response from Bitrix`);
      }
      const rawId = row[idField] ?? row[idField.toUpperCase()];
      if (rawId === undefined || rawId === null || String(rawId).trim() === "") {
        throw new Error(`Authoritative entity row missing required '${idField}' from Bitrix (${method})`);
      }
      const id = String(rawId).trim();
      if (seenIds.has(id)) {
        throw new Error(`Duplicate entity ID '${id}' received during pagination (${method})`);
      }
      seenIds.add(id);
      rows.push(row);
    }

    // Adversarial Case 2: total > 0 but items empty and next absent
    if (
      authoritativeTotal !== null &&
      authoritativeTotal > 0 &&
      rows.length === 0 &&
      (data.next === undefined || data.next === null)
    ) {
      throw new Error(
        `Total reconciliation failed: Bitrix reported total ${authoritativeTotal} but returned 0 rows without continuation (${method})`
      );
    }

    // Bitrix omits `next` when there are no more pages.
    if (data.next === undefined || data.next === null) {
      completed = true;
      break;
    }

    const nextNum = Number(data.next);
    const isValidNext =
      typeof data.next !== "boolean" &&
      typeof data.next !== "object" &&
      data.next !== "" &&
      Number.isFinite(nextNum) &&
      Number.isInteger(nextNum) &&
      nextNum >= 0 &&
      nextNum > start &&
      !seenStarts.has(nextNum);

    if (!isValidNext) {
      throw new Error(`Invalid pagination next token from Bitrix (${method})`);
    }

    seenStarts.add(nextNum);
    start = nextNum;
  }

  if (!completed) {
    throw new Error("Pagination did not converge for Bitrix list request");
  }

  // Total reconciliation when total was reported
  if (authoritativeTotal !== null) {
    if (rows.length !== authoritativeTotal) {
      throw new Error(
        `Pagination count mismatch: expected ${authoritativeTotal} total rows, received ${rows.length} (${method})`
      );
    }
  }

  return rows;
}

/** Fixed company SELECT — only fields the Samples layer consumes. */
export const SAMPLES_COMPANY_SELECT = [
  "ID",
  "TITLE",
  "ASSIGNED_BY_ID",
  "INDUSTRY",
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
];

/** Fixed deal SELECT — minimal, only sample-related + identity fields. */
export const SAMPLES_DEAL_SELECT = [
  "ID",
  "TITLE",
  "STAGE_ID",
  "COMPANY_ID",
  "ASSIGNED_BY_ID",
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  DEAL_DIRECTION_FIELD_ID,
];

export interface FetchSamplesScope {
  /** Server-side responsible filter (same semantics as Companies browser). */
  responsibleId?: string;
  /** Single-company scope (Company Preview «Образцы» section). */
  companyId?: string;
}

export async function fetchSampleCompanies(
  scope: FetchSamplesScope
): Promise<BitrixRow[]> {
  const filter: Record<string, string> = {};
  if (scope.responsibleId) filter.ASSIGNED_BY_ID = scope.responsibleId;
  if (scope.companyId) filter.ID = scope.companyId;
  return fetchAllPages(
    "crm.company.list",
    {
      SELECT: SAMPLES_COMPANY_SELECT,
      FILTER: Object.keys(filter).length > 0 ? filter : undefined,
      ORDER: { ID: "ASC" },
    },
    "ID"
  );
}

export async function fetchSampleDeals(
  scope: FetchSamplesScope
): Promise<BitrixRow[]> {
  const filter: Record<string, string> = {};
  if (scope.responsibleId) filter.ASSIGNED_BY_ID = scope.responsibleId;
  if (scope.companyId) filter.COMPANY_ID = scope.companyId;
  return fetchAllPages(
    "crm.deal.list",
    {
      SELECT: SAMPLES_DEAL_SELECT,
      FILTER: Object.keys(filter).length > 0 ? filter : undefined,
      ORDER: { ID: "ASC" },
    },
    "ID"
  );
}

export interface FieldLabelMaps {
  /** fieldId -> (rawValue -> label). */
  labels: Record<string, Record<string, string>>;
  /** crm_status entity ids still needing crm.status.list resolution. */
  statusTypes: Record<string, string>;
}

/**
 * Fetches field metadata for enum/status label resolution.
 * Non-fatal by contract: on failure returns whatever was collected so far
 * (possibly empty) — the aggregate then passes raw values through.
 */
export async function fetchFieldLabelMaps(): Promise<FieldLabelMaps> {
  const labels: Record<string, Record<string, string>> = {};
  const statusTypes: Record<string, string> = {};

  const targets: Array<{ method: string; prefix: string }> = [
    { method: "crm.company.fields", prefix: "" },
    { method: "crm.deal.fields", prefix: "" },
  ];

  for (const { method } of targets) {
    try {
      const data = await bitrixPost<{
        result?: Record<
          string,
          {
            items?: Array<{ ID: string; VALUE: string }>;
            statusType?: string;
          }
        > | null;
      }>(method, {});
      const fields = data.result;
      if (!fields || typeof fields !== "object") continue;
      for (const [fieldId, meta] of Object.entries(fields)) {
        if (meta && Array.isArray(meta.items)) {
          const map: Record<string, string> = {};
          for (const item of meta.items) {
            if (item && item.ID !== undefined && item.VALUE !== undefined) {
              map[String(item.ID)] = String(item.VALUE);
            }
          }
          if (Object.keys(map).length > 0) labels[fieldId] = map;
        }
        if (meta && typeof meta.statusType === "string") {
          statusTypes[fieldId] = meta.statusType;
        }
      }
    } catch {
      // Non-fatal: raw values pass through, quality flags surface the gap.
    }
  }

  // Resolve crm_status fields (e.g. company INDUSTRY) via crm.status.list.
  for (const [fieldId, entityId] of Object.entries(statusTypes)) {
    try {
      const data = await bitrixPost<{
        result?: Array<{ STATUS_ID: string; NAME: string }>;
      }>("crm.status.list", { filter: { ENTITY_ID: entityId } });
      if (Array.isArray(data.result)) {
        const map: Record<string, string> = {};
        for (const s of data.result) {
          map[String(s.STATUS_ID)] = String(s.NAME);
        }
        if (Object.keys(map).length > 0) labels[fieldId] = map;
      }
    } catch {
      // Non-fatal.
    }
  }

  return { labels, statusTypes };
}

/** Builds a LabelResolver over fetched label maps (identity fallback). */
export function makeLabelResolver(
  labels: Record<string, Record<string, string>>
): (fieldId: string, rawValue: string) => string {
  return (fieldId, rawValue) => {
    const map = labels[fieldId];
    if (!map) return rawValue;
    return map[rawValue] ?? rawValue;
  };
}
