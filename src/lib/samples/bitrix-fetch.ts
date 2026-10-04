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
import {
  BitrixListInvariantError,
  isBitrixListInvariantError,
  type BitrixListInvariantCategory,
} from "@/lib/bitrix-list-invariant";
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
  SMART_PROCESS_QTY_GEL_FIELD_ID,
  SMART_PROCESS_QTY_SOL_FIELD_ID,
  SMART_PROCESS_TEST_RESULT_FIELD_ID,
  SMART_PROCESS_STAGE_STATUS_ENTITY_ID,
  SMART_PROCESS_STAGE_LABELS,
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
  // Deterministic LOCAL invariant failures (post-transport): the response
  // already arrived and was rejected by a local rule — restarting the
  // identical pagination cannot change the verdict. Task §6: no redundant
  // full-pagination restart for these, while Bitrix transport retry
  // behavior (bitrixPost) stays unchanged. Some invariant categories can
  // legitimately change between restarts (mutable dataset / shifting
  // totals) — those keep the existing restart semantics.
  if (isBitrixListInvariantError(error)) {
    if (DETERMINISTIC_INVARIANT_CATEGORIES.has(error.category)) {
      return false;
    }
    // A stable total mismatch on the SAME one-page response (no `next`
    // token was ever followed, no dedup/ID anomalies involved) is
    // deterministic: the restart would observe the identical page and
    // reach the identical verdict (task §6). Multi-page mismatches may
    // legitimately differ across a restart (dataset shifted between
    // page reads) and keep the existing restart semantics.
    if (
      error.category === "TOTAL_COUNT_MISMATCH" &&
      error.start === 0 &&
      error.nextPresent === false &&
      error.duplicateCount === 0 &&
      error.missingIdCount === 0
    ) {
      return false;
    }
    return true;
  }
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
 * Local invariant categories that are deterministic for a one-page
 * response: re-running the exact same pagination would observe the same
 * rejected response. Categories that may legitimately differ across a
 * restart (mutable datasets, shifting totals) keep retry semantics.
 */
const DETERMINISTIC_INVARIANT_CATEGORIES: ReadonlySet<BitrixListInvariantCategory> = new Set([
  "INVALID_RESULT_ENVELOPE",
  "INVALID_ROW",
  "MISSING_REQUIRED_ID",
  "INVALID_NEXT_TOKEN",
  "NON_ADVANCING_NEXT",
]);

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
    // Safe anonymous counters for invariant diagnostics (no identity data).
    let duplicateCount = 0;
    let missingIdCount = 0;
    let lastPageItemCount: number | undefined = undefined;
    let lastNextPresent: boolean | undefined = undefined;

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
          throw new BitrixListInvariantError(
            method,
            "INVALID_RESULT_ENVELOPE",
            `Invalid ${method} result envelope from Bitrix`,
            { start }
          );
        }

        if (data.total !== undefined && data.total !== null && String(data.total).trim() !== "") {
          const parsedTotal = Number(data.total);
          if (Number.isFinite(parsedTotal) && parsedTotal >= 0) {
            if (authoritativeTotal === null) {
              authoritativeTotal = parsedTotal;
            } else if (authoritativeTotal !== parsedTotal) {
              throw new BitrixListInvariantError(
                method,
                "INCONSISTENT_TOTAL",
                `Inconsistent total reported during pagination: initial ${authoritativeTotal} vs new ${parsedTotal} (${method})`,
                {
                  reportedTotal: parsedTotal,
                  pageItemCount: items.length,
                  accumulatedUniqueCount: rows.length,
                  duplicateCount,
                  missingIdCount,
                  start,
                  nextPresent: data.next !== undefined && data.next !== null,
                }
              );
            }
          }
        }

        for (const row of items) {
          if (!row || typeof row !== "object") {
            throw new BitrixListInvariantError(
              method,
              "INVALID_ROW",
              `Invalid row format in ${method} response from Bitrix`,
              {
                pageItemCount: items.length,
                accumulatedUniqueCount: rows.length,
                duplicateCount,
                missingIdCount,
                start,
                nextPresent: data.next !== undefined && data.next !== null,
              }
            );
          }
          const rawId = row[idField] ?? row[idField.toUpperCase()];
          if (rawId === undefined || rawId === null || String(rawId).trim() === "") {
            missingIdCount++;
            throw new BitrixListInvariantError(
              method,
              "MISSING_REQUIRED_ID",
              `Authoritative entity row missing required '${idField}' from Bitrix (${method})`,
              {
                pageItemCount: items.length,
                accumulatedUniqueCount: rows.length,
                duplicateCount,
                missingIdCount,
                start,
                nextPresent: data.next !== undefined && data.next !== null,
              }
            );
          }
          const id = String(rawId).trim();
          if (seenIds.has(id)) {
            duplicateCount++;
            continue;
          }
          seenIds.add(id);
          rows.push(row);
        }

        lastPageItemCount = items.length;
        lastNextPresent = data.next !== undefined && data.next !== null;

        // Adversarial Case 2: total > 0 but items empty and next absent
        if (
          authoritativeTotal !== null &&
          authoritativeTotal > 0 &&
          rows.length === 0 &&
          (data.next === undefined || data.next === null)
        ) {
          throw new BitrixListInvariantError(
            method,
            "TOTAL_WITH_EMPTY_LAST_PAGE",
            `Total reconciliation failed: Bitrix reported total ${authoritativeTotal} but returned 0 rows without continuation (${method})`,
            {
              reportedTotal: authoritativeTotal,
              pageItemCount: items.length,
              accumulatedUniqueCount: rows.length,
              duplicateCount,
              missingIdCount,
              start,
              nextPresent: false,
            }
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
          // Distinguish malformed tokens from repeated/decreasing (non-advancing)
          // tokens — both fail-closed, but the category differs.
          const nextIsFiniteNonNegativeInteger =
            typeof data.next !== "boolean" &&
            typeof data.next !== "object" &&
            data.next !== "" &&
            Number.isFinite(nextNum) &&
            Number.isInteger(nextNum) &&
            nextNum >= 0;
          throw new BitrixListInvariantError(
            method,
            nextIsFiniteNonNegativeInteger ? "NON_ADVANCING_NEXT" : "INVALID_NEXT_TOKEN",
            `Invalid pagination next token from Bitrix (${method})`,
            {
              pageItemCount: items.length,
              accumulatedUniqueCount: rows.length,
              duplicateCount,
              missingIdCount,
              start,
              nextPresent: true,
            }
          );
        }

        seenStarts.add(nextNum);
        start = nextNum;
      }

      if (!completed) {
        throw new BitrixListInvariantError(
          method,
          "PAGINATION_DID_NOT_CONVERGE",
          "Pagination did not converge for Bitrix list request",
          {
            pageItemCount: lastPageItemCount,
            accumulatedUniqueCount: rows.length,
            duplicateCount,
            missingIdCount,
            start,
            nextPresent: lastNextPresent,
            ...(authoritativeTotal !== null ? { reportedTotal: authoritativeTotal } : {}),
          }
        );
      }

      // Total reconciliation when total was reported
      if (authoritativeTotal !== null) {
        if (rows.length !== authoritativeTotal) {
          throw new BitrixListInvariantError(
            method,
            "TOTAL_COUNT_MISMATCH",
            `Pagination count mismatch: expected ${authoritativeTotal} total rows, received ${rows.length} (${method})`,
            {
              reportedTotal: authoritativeTotal,
              pageItemCount: lastPageItemCount,
              accumulatedUniqueCount: rows.length,
              duplicateCount,
              missingIdCount,
              start,
              nextPresent: lastNextPresent,
            }
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

/**
 * Fetches the sample-active Deal population.
 *
 * SCOPE CONTRACT (Company-grain responsible scope): the documented Samples
 * `responsibleId` is a COMPANY responsible filter (Company `ASSIGNED_BY_ID`,
 * identical to the Companies browser) — it is consumed by
 * `fetchSampleCompanies` and must NEVER be applied here as a Deal
 * `ASSIGNED_BY_ID` filter. Deal responsible and Company responsible may
 * differ; evidence of allowed companies is aggregated regardless of who owns
 * the individual Deal. Caller-side COMPANY-grain scoping
 * (`AggregateOptions.allowedCompanyIds`) enforces the allowed-company set.
 */
export async function fetchSampleDeals(
  scope: { companyId?: string } = {}
): Promise<BitrixRow[]> {
  const filter: Record<string, string> = {};
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
 * Standard (non-UF) Smart Process fields the canonical sample contract
 * consumes. These are documented Universal CRM fields whose camelCase names
 * are fixed by the official contract — independent of
 * `useOriginalUfNames`. `id` is the documented item identifier and is
 * ALWAYS part of every production read (required-ID invariant is never
 * weakened).
 */
export const SMART_PROCESS_SYSTEM_SELECT = [
  "id",
  "title",
  "stageId",
  "assignedById",
  "createdTime",
  "companyId",
] as const;

/**
 * Semantic role → Smart Process SELECT field id. Roles let diagnostics and
 * partition definitions speak about required fields WITHOUT exposing raw
 * UF field ids in user-facing or diagnostic output. The Deal relation uses
 * the canonical `parentId2` universal field (a relation, not a UF field).
 */
export const SMART_PROCESS_ROLE_FIELD_IDS: Readonly<Record<string, string>> = {
  SENT_DATE: SMART_PROCESS_SENT_DATE_FIELD_ID,
  DEAL_RELATION: SMART_PROCESS_DEAL_FIELD_ID,
  GRADE_GEL: SMART_PROCESS_GRADE_GEL_FIELD_ID,
  GRADE_SOL: SMART_PROCESS_GRADE_SOL_FIELD_ID,
  QTY_GEL: SMART_PROCESS_QTY_GEL_FIELD_ID,
  QTY_SOL: SMART_PROCESS_QTY_SOL_FIELD_ID,
  TEST_RESULT: SMART_PROCESS_TEST_RESULT_FIELD_ID,
};

/**
 * Semantic roles in the exact canonical production select order (after the
 * system fields). Only roles whose committed field id resolved non-empty
 * participate — an unverified/empty field id is never sent upstream.
 */
export const SMART_PROCESS_REQUIRED_ROLES: readonly string[] = [
  "SENT_DATE",
  "DEAL_RELATION",
  "GRADE_GEL",
  "GRADE_SOL",
  "QTY_GEL",
  "QTY_SOL",
  "TEST_RESULT",
].filter((role) => Boolean(SMART_PROCESS_ROLE_FIELD_IDS[role]));

/**
 * Candidate partition composition for the select-interaction workaround
 * (diagnostic §7 / remediation §8). Verified LIVE by the pipeline
 * diagnostic's partition probes before any production remediation — never
 * assumed. Initial split (task §7 example, subject to live measurement):
 * system + relation + sent date + result vs. the four grade/quantity
 * fields. Every partition read includes the documented `id` and is merged
 * strictly by exact string item ID.
 *
 * Exactly the FIRST partition carries the full system select; remaining
 * partitions carry `id` plus their roles only, keeping each field fact in
 * ONE partition (no duplicated facts for a merge to arbitrate).
 */
export interface SmartProcessPartitionDefinition {
  /** Partition carries the full production system select. */
  includeSystemSelect: boolean;
  /** Semantic role fields carried by this partition (field-disjoint). */
  roles: readonly string[];
}

export const SMART_PROCESS_CANDIDATE_PARTITION_ROLES: readonly SmartProcessPartitionDefinition[] = [
  {
    includeSystemSelect: true,
    roles: ["DEAL_RELATION", "SENT_DATE", "TEST_RESULT"].filter(
      (role) => SMART_PROCESS_ROLE_FIELD_IDS[role] !== undefined
    ),
  },
  {
    includeSystemSelect: false,
    roles: ["GRADE_GEL", "GRADE_SOL", "QTY_GEL", "QTY_SOL"].filter(
      (role) => SMART_PROCESS_ROLE_FIELD_IDS[role] !== undefined
    ),
  },
];

/**
 * Builds the concrete SELECT for one partition: the system select (or the
 * documented `id` alone) plus the partition's role fields. `id` is always
 * present — the required-ID invariant holds for every partition read.
 */
export function buildSmartProcessPartitionSelect(
  partition: SmartProcessPartitionDefinition
): string[] {
  const fields: string[] = partition.includeSystemSelect
    ? [...SMART_PROCESS_SYSTEM_SELECT]
    : ["id"];
  for (const role of partition.roles) {
    const fieldId = SMART_PROCESS_ROLE_FIELD_IDS[role];
    if (!fieldId) {
      throw new Error(`Unknown Smart Process semantic role: ${role}`);
    }
    if (!fields.includes(fieldId)) fields.push(fieldId);
  }
  return fields;
}

/**
 * Verifies the committed candidate partitions cover the complete required
 * production contract (every required role present in ≥1 partition).
 * Deterministic local gate — throws BEFORE any transport work when the
 * committed composition is incomplete, so a coverage gap can never
 * silently drop a required field from production reads.
 */
export function assertPartitionsCoverContract(): void {
  const covered = new Set<string>();
  for (const partition of SMART_PROCESS_CANDIDATE_PARTITION_ROLES) {
    for (const role of partition.roles) covered.add(role);
  }
  const missing = SMART_PROCESS_REQUIRED_ROLES.filter((role) => !covered.has(role));
  if (missing.length > 0) {
    throw new Error(
      `Smart Process partition composition does not cover required roles: ${missing.join(", ")}`
    );
  }
}

/**
 * Fixed Smart Process SELECT — only fields the canonical sample contract
 * consumes. Uses the live-discovered original UF names; system fields
 * (id, stageId, assignedById, createdTime, companyId) are always included.
 * Derived from the semantic role registry in the exact production order —
 * never retyped at call sites.
 */
export const SMART_PROCESS_ITEM_SELECT: string[] = [
  ...SMART_PROCESS_SYSTEM_SELECT,
  ...SMART_PROCESS_REQUIRED_ROLES.map((role) => SMART_PROCESS_ROLE_FIELD_IDS[role]),
];

/**
 * Read-only live Smart Process stage directory loader (`crm.status.list`,
 * ENTITY_ID = DYNAMIC_1032_STAGE_15).
 *
 * Separation of responsibilities:
 * - BUSINESS SEMANTICS stay keyed on the committed stable stage IDs and
 *   `SMART_PROCESS_STAGE_SEMANTICS` — this loader NEVER influences
 *   active/terminal classification;
 * - DISPLAY LABELS prefer the live NAME for a known committed stage ID;
 * - the static Russian labels are only a fallback while the directory is
 *   temporarily unavailable;
 * - unknown stage IDs must never be classified by matching Russian names.
 *
 * Non-fatal by contract: on failure returns the committed static labels with
 * `available: false` so callers can disclose the fallback.
 */
export interface SmartProcessStageDirectory {
  /** stageId -> display label (live NAME for known IDs, static fallback). */
  labels: Record<string, string>;
  /** True when the live crm.status.list directory was reachable. */
  available: boolean;
}

export async function fetchSmartProcessStageDirectory(): Promise<SmartProcessStageDirectory> {
  // Static labels as fallback for the committed stage IDs.
  const labels: Record<string, string> = { ...SMART_PROCESS_STAGE_LABELS };
  let available = false;

  try {
    const data = await bitrixPost<{
      result?: Array<{ STATUS_ID: string; NAME: string }>;
    }>("crm.status.list", {
      filter: { ENTITY_ID: SMART_PROCESS_STAGE_STATUS_ENTITY_ID },
    });
    if (Array.isArray(data.result)) {
      for (const s of data.result) {
        const stageId = String(s.STATUS_ID ?? "").trim();
        const name = String(s.NAME ?? "").trim();
        // Only known committed stage IDs receive live display labels;
        // unknown stage IDs keep their neutral unclassified treatment and
        // are never classified by matching Russian wording.
        if (stageId && name && stageId in labels) {
          labels[stageId] = name;
        }
      }
      available = true;
    }
  } catch {
    // Non-fatal: static labels remain the fallback; available=false discloses it.
  }

  return { labels, available };
}

/**
 * Builds the EXACT production `crm.item.list` request parameters for the
 * Smart Process 1032 (categoryId 15) population — the ONE shared source of
 * truth consumed BOTH by `fetchSmartProcessSampleItems` (production helper)
 * AND by the Samples pipeline diagnostic's direct first-page comparison
 * probe. Parameter parity between the raw probe and the wrapped helper is
 * guaranteed structurally, never by copying literals.
 *
 * Scope semantics: `companyId` narrows to one company's items (Company
 * Preview). `responsibleId` is deliberately NOT applied to the Smart
 * Process — the SP item's own ASSIGNED_BY_ID may differ from the company
 * owner, and filtering by it would fabricate attribution.
 */
export function buildSmartProcessListParams(
  scope: FetchSamplesScope = {}
): Record<string, unknown> {
  return buildSmartProcessListParamsWithSelect(scope, SMART_PROCESS_ITEM_SELECT);
}

/**
 * Select-parameterized variant of `buildSmartProcessListParams`. EVERY other
 * request parameter (entityTypeId, categoryId filter, order, start,
 * useOriginalUfNames, transport) is byte-identical to the production
 * builder — the ONLY variable is `select`. This is the structural
 * parameter-parity guarantee for the select matrix and for the partitioned
 * production reads: any measured select difference is attributable to the
 * selected fields alone.
 *
 * `select` must always contain the documented `id` field (required-ID
 * invariant — never weakened, never substituted by an alternate key).
 *
 * `options.useOriginalUfNames` exists ONLY for the diagnostic Y/N
 * comparison (§5): UF-name-mode can be compared with STANDARD fields only —
 * a request carrying custom UF field ids must never be sent with "N"
 * (the official contract changes the expected custom field names).
 */
export function buildSmartProcessListParamsWithSelect(
  scope: FetchSamplesScope = {},
  select: readonly string[],
  options: { useOriginalUfNames?: "Y" | "N" } = {}
): Record<string, unknown> {
  if (!select.includes("id")) {
    throw new Error("Smart Process select must always include the documented 'id' field");
  }
  const filter: Record<string, unknown> = { categoryId: SMART_PROCESS_CATEGORY_ID };
  if (scope.companyId) filter.companyId = scope.companyId;

  // Smart Process request contract: ONLY official Universal CRM parameters
  // (`select`, `filter`, `order`, `useOriginalUfNames`) — duplicate uppercase
  // aliases (SELECT/FILTER/ORDER) must never be sent to `crm.item.list`.
  return {
    entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
    useOriginalUfNames: options.useOriginalUfNames ?? "Y",
    select,
    filter,
    order: { id: "ASC" },
  };
}

/**
 * Partitioned transport activation gate (live-measurement owned).
 *
 * The partitioned read contract is enabled ONLY while the live select
 * matrix proves every committed partition select independently delivers
 * the documented `id`. The production measurement (admin select matrix,
 * verdict USE_ORIGINAL_UF_NAMES_Y_BREAKS_ID) proved the opposite:
 * useOriginalUfNames="Y" drops `id` from EVERY select on this portal —
 * including ["id"] alone — so partitioned Y-mode reads cannot succeed and
 * enabling them would double the request load for a guaranteed failure.
 * The gate flips to enabled only after a live matrix verdict
 * SELECT_MATRIX_OK for the committed composition (e.g. after a portal
 * behavior fix or a verified useOriginalUfNames="N" production contract —
 * the latter requires the official naming contract to be re-verified
 * live first; never hand-converted).
 */
const SMART_PROCESS_PARTITIONED_READ_ENABLED = false;

/**
 * Fetches the COMPLETE relevant Smart Process 1032 (categoryId 15)
 * population via fail-closed pagination. Fail-closed contract gate first:
 * an unverified contract never reaches the transport.
 *
 * Transport contract: the full production select in ONE fail-closed
 * pagination while partitioning is disabled (see
 * SMART_PROCESS_PARTITIONED_READ_ENABLED). When enabled, production reads
 * use the ID-bearing PARTITIONED contract: the committed partitions are
 * each read with the full existing fail-closed pagination and merged
 * strictly by exact string item ID
 * (fetchAndMergeSmartProcessPartitions). On any partition/merge/ID-set
 * inconsistency the WHOLE read is retried exactly once from scratch; a
 * second mismatch fails closed with SMART_PROCESS_PARTITION_SET_MISMATCH.
 * No positional merge, no silent row drops, no fabricated fields, no
 * per-item requests.
 */
export async function fetchSmartProcessSampleItems(
  scope: FetchSamplesScope = {}
): Promise<BitrixRow[]> {
  assertSmartProcessContractReady();
  if (SMART_PROCESS_PARTITIONED_READ_ENABLED) {
    return fetchAndMergeSmartProcessPartitions(scope);
  }
  return fetchAllPages("crm.item.list", buildSmartProcessListParams(scope), "id");
}

/** Stable fail-closed category for strict partition ID-set reconciliation. */
const PARTITION_SET_MISMATCH_MESSAGE =
  "SMART_PROCESS_PARTITION_SET_MISMATCH: partitioned Smart Process reads resolved to different item ID sets";

/** Local deterministic error: partitions resolved to different ID sets. */
class SmartProcessPartitionSetMismatchError extends Error {
  constructor() {
    super(PARTITION_SET_MISMATCH_MESSAGE);
    this.name = "SmartProcessPartitionSetMismatchError";
  }
}

/**
 * Extracts the exact string item ID from one partition row (documented `id`,
 * uppercase `ID` accepted as the same documented identifier casing — never
 * an alternate invented key).
 */
function partitionRowId(row: BitrixRow): string {
  return String(row.id ?? row.ID ?? "").trim();
}

/**
 * ONE complete partitioned read: every committed partition is fetched via
 * the existing fail-closed `fetchAllPages` pagination (unchanged transport
 * retry semantics), per-partition ID sets are collected, and rows are
 * merged strictly by exact string item ID.
 *
 * Throws `SmartProcessPartitionSetMismatchError` when the partitions did
 * not resolve to the identical ID set (mutable-data divergence, §10) — the
 * ONLY condition that triggers the caller's single whole-read retry. Any
 * other failure (transport, pagination invariant, missing id) propagates
 * immediately and is never retried at this layer (§9: fail closed).
 */
async function runPartitionedReadOnce(
  scope: FetchSamplesScope
): Promise<Map<string, BitrixRow>> {
  const merged = new Map<string, BitrixRow>();
  let referenceIdSet: Set<string> | null = null;

  for (const partition of SMART_PROCESS_CANDIDATE_PARTITION_ROLES) {
    const rows = await fetchAllPages(
      "crm.item.list",
      // Scope (companyId) applies to EVERY partition — a scoped read must
      // never see out-of-scope items in any partition.
      buildSmartProcessListParamsWithSelect(scope, buildSmartProcessPartitionSelect(partition)),
      "id"
    );
    const partitionIds = new Set<string>();
    for (const row of rows) {
      const id = partitionRowId(row);
      if (id === "") {
        // Defensive: fetchAllPages already rejects id-less rows; this
        // keeps the merge invariant locally airtight.
        throw new Error(PARTITION_SET_MISMATCH_MESSAGE);
      }
      partitionIds.add(id);
      const existing = merged.get(id);
      if (existing) {
        // Same item seen in a second partition: merge field-wise by exact
        // ID. Partition role sets are disjoint by contract (each field
        // fact lives in exactly one partition), so this never arbitrates
        // conflicting values.
        merged.set(id, { ...existing, ...row });
      } else {
        merged.set(id, row);
      }
    }
    if (referenceIdSet === null) {
      referenceIdSet = partitionIds;
    } else {
      const reference = referenceIdSet;
      if (reference.size !== partitionIds.size) {
        throw new SmartProcessPartitionSetMismatchError();
      }
      for (const id of reference) {
        if (!partitionIds.has(id)) throw new SmartProcessPartitionSetMismatchError();
      }
    }
  }

  return merged;
}

/**
 * ONE small partitioned-read helper: reads every committed ID-bearing
 * partition through the existing fail-closed pagination and merges strictly
 * by exact string item ID. On ID-set divergence (mutable data between
 * sequential reads) the WHOLE partitioned read is retried exactly once from
 * scratch; a second divergence fails closed with
 * SMART_PROCESS_PARTITION_SET_MISMATCH. No positional merge, no silent row
 * drops, no fabricated fields, no per-item requests, no loops.
 */
export async function fetchAndMergeSmartProcessPartitions(
  scope: FetchSamplesScope = {}
): Promise<BitrixRow[]> {
  assertPartitionsCoverContract();

  let merged: Map<string, BitrixRow>;
  try {
    merged = await runPartitionedReadOnce(scope);
  } catch (error) {
    if (!(error instanceof SmartProcessPartitionSetMismatchError)) throw error;
    // §10: retry the WHOLE partitioned read exactly once from scratch.
    merged = await runPartitionedReadOnce(scope);
  }
  return [...merged.values()];
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

/**
 * Builds a LabelResolver over fetched label maps.
 *
 * Data-trust contract for known dictionary-backed (enum/crm_status) Sample
 * fields (`isDictionaryBackedSampleField`):
 * - mapped ID  → mapped label;
 * - unknown ID → `UNCLASSIFIED_LABEL` («Не классифицировано»);
 * - missing or empty metadata map → `UNCLASSIFIED_LABEL` for numeric raw
 *   values (metadata gap must never leak raw enum IDs to UI/Excel);
 * - non-numeric raw values pass through verbatim (legacy dictionary fields
 *   may contain genuine text labels — never blank real business values).
 *
 * Verified free-text fields are NOT dictionary-backed and keep raw values.
 */
export function makeLabelResolver(
  labels: Record<string, Record<string, string>>
): (fieldId: string, rawValue: string) => string {
  return (fieldId, rawValue) => {
    const map = labels[fieldId];
    if (map && map[rawValue] !== undefined) {
      return map[rawValue];
    }
    if (isDictionaryBackedSampleField(fieldId) && /^\d+$/.test(rawValue)) {
      // Unknown numeric enum ID (mapped metadata or missing/empty map):
      // fail closed to the neutral label — raw IDs never reach the UI.
      return UNCLASSIFIED_LABEL;
    }
    return rawValue;
  };
}
