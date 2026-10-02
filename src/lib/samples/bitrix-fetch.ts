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
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  DEAL_DIRECTION_FIELD_ID,
  isDictionaryBackedSampleField,
  UNCLASSIFIED_LABEL,
} from "./constants";
import {
  SMART_PROCESS_ENTITY_TYPE_ID,
  SMART_PROCESS_CATEGORY_ID,
  SMART_PROCESS_SENT_DATE_FIELD_ID,
  SMART_PROCESS_DEAL_FIELD_ID,
  SMART_PROCESS_GRADE_GEL_FIELD_ID,
  SMART_PROCESS_GRADE_SOL_FIELD_ID,
  SMART_PROCESS_TEST_RESULT_FIELD_ID,
  SMART_PROCESS_HAS_DISCOVERED_CONTRACT,
  assertSmartProcessContractReady,
} from "./smart-process-contract";

const PAGE_SIZE = 50;

/** Generic shape of a Bitrix list page. */
interface BitrixListPage {
  result?: BitrixRow[] | Record<string, unknown> | null;
  total?: number;
  next?: unknown;
}

export const MAX_PAGINATION_ATTEMPTS = 2;
export const PAGINATION_RETRY_DELAY_MS =
  process.env.NODE_ENV === "test" || process.env.VITEST ? 5 : 500;

function isPaginationRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const msg = error.message;
  // Non-retryable invariant/schema corruption errors: fail immediately
  if (
    msg.includes("missing required") ||
    msg.includes("Invalid pagination next token") ||
    msg.includes("contract not verified")
  ) {
    return false;
  }
  return true;
}

/**
 * Sequentially pages through a Bitrix list method until completion.
 * Fail-closed: throws on malformed envelope, non-advancing/repeated/
 * decreasing/invalid `next`, or transport errors — the caller must never
 * receive a partial dataset that could be mistaken for complete.
 * Resilient against transient transport hiccups and mutable Bitrix dataset
 * shifts by restarting the complete pagination from start=0 (max 2 attempts).
 * Deduplicates rows by the given ID field.
 */
export async function fetchAllPages(
  method: string,
  baseParams: Record<string, unknown>,
  idField: string
): Promise<BitrixRow[]> {
  const MAX_ITERATIONS = 4096;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_PAGINATION_ATTEMPTS; attempt++) {
    const attemptStartTime = Date.now();
    const rows: BitrixRow[] = [];
    const seenIds = new Set<string>();
    const seenStarts = new Set<number>([0]);
    let start = 0;
    let authoritativeTotal: number | null = null;
    let completed = false;
    let iteration = 0;

    try {
      while (iteration++ < MAX_ITERATIONS) {
        const data = await bitrixPost<BitrixListPage>(method, {
          ...baseParams,
          start,
        });

        // A malformed result envelope (null / object without a rows array)
        // means a corrupted Bitrix response — NEVER an authoritative zero.
        const rawResult = data?.result;
        const items: BitrixRow[] | undefined = Array.isArray(rawResult)
          ? rawResult
          : rawResult !== null &&
            rawResult !== undefined &&
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
              throw new Error(
                `Inconsistent total reported during pagination: initial ${authoritativeTotal} vs new ${parsedTotal} (${method})`
              );
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
            continue;
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Preserve prior substantive reconciliation error if attempt 2 failed due to envelope exhaustion (e.g. in test fixtures)
      if (!lastError || !errorMessage.includes("result envelope")) {
        lastError = error;
      }
      const duration = Date.now() - attemptStartTime;
      const isRetryable = isPaginationRetryable(error);

      if (attempt < MAX_PAGINATION_ATTEMPTS && isRetryable) {
        console.warn(`[fetchAllPages] Pagination attempt ${attempt}/${MAX_PAGINATION_ATTEMPTS} failed, retrying from start=0`, {
          method,
          pageStart: start,
          attempt,
          durationMs: duration,
          expectedTotal: authoritativeTotal,
          receivedUniqueCount: rows.length,
          retryable: true,
          retriesExhausted: false,
          error: errorMessage,
        });

        await new Promise((resolve) => setTimeout(resolve, PAGINATION_RETRY_DELAY_MS));
        continue;
      }

      console.error(`[fetchAllPages] Pagination attempt ${attempt}/${MAX_PAGINATION_ATTEMPTS} failed`, {
        method,
        pageStart: start,
        attempt,
        durationMs: duration,
        expectedTotal: authoritativeTotal,
        receivedUniqueCount: rows.length,
        retryable: isRetryable,
        retriesExhausted: true,
        error: errorMessage,
      });

      throw lastError ?? error;
    }
  }

  throw lastError ?? new Error(`Pagination failed for ${method}`);
}

/** Fixed company SELECT — only fields the Samples layer consumes. */
export const SAMPLES_COMPANY_SELECT = [
  "ID",
  "TITLE",
  "ASSIGNED_BY_ID",
  "INDUSTRY",
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
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

/**
 * Fixed Smart Process SELECT — only fields the canonical sample contract
 * consumes. Uses the live-discovered original UF names; system fields
 * (id, stageId, assignedById, createdTime, companyId) are always included.
 */
export const SMART_PROCESS_ITEM_SELECT = [
  "id",
  "title",
  "stageId",
  "assignedById",
  "createdTime",
  "companyId",
  ...(SMART_PROCESS_SENT_DATE_FIELD_ID ? [SMART_PROCESS_SENT_DATE_FIELD_ID] : []),
  ...(SMART_PROCESS_DEAL_FIELD_ID ? [SMART_PROCESS_DEAL_FIELD_ID] : []),
  ...(SMART_PROCESS_GRADE_GEL_FIELD_ID ? [SMART_PROCESS_GRADE_GEL_FIELD_ID] : []),
  ...(SMART_PROCESS_GRADE_SOL_FIELD_ID ? [SMART_PROCESS_GRADE_SOL_FIELD_ID] : []),
  ...(SMART_PROCESS_TEST_RESULT_FIELD_ID ? [SMART_PROCESS_TEST_RESULT_FIELD_ID] : []),
];

/**
 * Fetches the COMPLETE relevant Smart Process 1032 (categoryId 15)
 * population via fail-closed pagination. Fail-closed contract gate first:
 * an unverified contract never reaches the transport.
 *
 * Scope semantics: `companyId` narrows to one company's items (Company
 * Preview). `responsibleId` is deliberately NOT applied to the Smart
 * Process — the SP item's own ASSIGNED_BY_ID may differ from the company
 * owner, and filtering by it would fabricate attribution.
 */
export async function fetchSmartProcessSampleItems(
  scope: FetchSamplesScope = {}
): Promise<BitrixRow[]> {
  assertSmartProcessContractReady();

  const filter: Record<string, unknown> = { categoryId: SMART_PROCESS_CATEGORY_ID };
  if (scope.companyId) filter.companyId = scope.companyId;

  return fetchAllPages(
    "crm.item.list",
    {
      entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
      useOriginalUfNames: "Y",
      select: SMART_PROCESS_ITEM_SELECT,
      SELECT: SMART_PROCESS_ITEM_SELECT,
      filter,
      FILTER: filter,
      order: { id: "ASC" },
      ORDER: { id: "ASC" },
    },
    "id"
  );
}

export interface FieldLabelMaps {
  /** fieldId -> (rawValue -> label). */
  labels: Record<string, Record<string, string>>;
  /** crm_status entity ids still needing crm.status.list resolution. */
  statusTypes: Record<string, string>;
  partial?: boolean;
}

/**
 * Fetches field metadata for enum/status label resolution.
 * Non-fatal by contract: on failure returns whatever was collected so far
 * (possibly empty) — the aggregate then passes raw values through.
 */
export async function fetchFieldLabelMaps(): Promise<FieldLabelMaps> {
  const labels: Record<string, Record<string, string>> = {};
  const statusTypes: Record<string, string> = {};
  let partial = false;

  const targets: Array<{ method: string; prefix: string }> = [
    { method: "crm.company.fields", prefix: "" },
    { method: "crm.deal.fields", prefix: "" },
    // Smart Process enum metadata (Результат тестирования, marks) —
    // non-fatal like the other field sources; raw values pass through
    // when unavailable. Only attempted when the contract is discovered.
    ...(SMART_PROCESS_HAS_DISCOVERED_CONTRACT
      ? [{ method: "crm.item.fields", prefix: "" }]
      : []),
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
      }>(method, method === "crm.item.fields" ? { entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID, useOriginalUfNames: "Y" } : {});
      const rawResult = data.result;
      const fields =
        rawResult && typeof rawResult === "object" && (rawResult as Record<string, unknown>).fields
          ? ((rawResult as Record<string, unknown>).fields as Record<
              string,
              {
                items?: Array<{ ID: string; VALUE: string }>;
                statusType?: string;
              }
            >)
          : rawResult;
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
      partial = true;
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
      partial = true;
    }
  }

  return { labels, statusTypes, ...(partial ? { partial: true } : {}) };
}

/** Builds a LabelResolver over fetched label maps (with fail-closed unclassified fallback for dictionary fields). */
export function makeLabelResolver(
  labels: Record<string, Record<string, string>>
): (fieldId: string, rawValue: string) => string {
  return (fieldId, rawValue) => {
    const map = labels[fieldId];
    if (map && map[rawValue] !== undefined) {
      return map[rawValue];
    }
    if (isDictionaryBackedSampleField(fieldId)) {
      if (map && Object.keys(map).length > 0 && /^\d+$/.test(rawValue)) {
        return UNCLASSIFIED_LABEL;
      }
    }
    return rawValue;
  };
}
