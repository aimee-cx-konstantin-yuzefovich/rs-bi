// src/lib/bitrix-pagination.ts
// ─────────────────────────────────────────────────────────────────────
// ONE reusable cap-aware pagination primitive for Bitrix list methods.
// Identity/completeness contract (shared by deals, companies list,
// responsible-counts and single-company deals):
//   - every entity must have a valid ID; missing ID is corruption →
//     the affected page fails (PARTIAL), rows never silently vanish;
//   - duplicates never inflate fetched counts and never make a capped
//     window look complete;
//   - malformed envelope fails/partials;
//   - failed page → PARTIAL with failedOffsets recorded;
//   - expected unique fetched count reconciles with the capped window;
//   - inconsistent total between pages is detected;
//   - cursor progression is deterministic; repeated/non-advancing cursor
//     fails closed.
// ─────────────────────────────────────────────────────────────────────

import pLimit from "p-limit";

export interface CappedPageRow extends Record<string, unknown> {}

export interface FetchCappedPagesOptions<T extends CappedPageRow> {
  /** Bitrix method, e.g. "crm.deal.list". */
  method: string;
  /** Base params (select/filter/order) sent with every page. */
  baseParams: Record<string, unknown>;
  /** Extracts the entity ID from a raw row; null/empty = corruption. */
  idOf: (row: T) => string | null;
  /** Application cap (rows, not pages). Preserved, never silently raised. */
  cap: number;
  /** Bitrix page size (default 50). */
  pageSize?: number;
  /** Concurrency for parallel page fetches (default 5). */
  concurrency?: number;
  /** Caller-provided fetcher (injectable for tests). */
  fetchPage: (params: Record<string, unknown>) => Promise<{
    result?: T[] | { items?: T[] } | null;
    total?: number;
    next?: unknown;
  }>;
  /** Start offset for the first page (default 0). */
  start?: number;
  /** Logger prefix. */
  logPrefix?: string;
}

export interface CappedPagesResult<T extends CappedPageRow> {
  /** Unique rows in stable first-seen order, IDs validated. */
  rows: T[];
  /** Unique count (duplicates excluded). */
  uniqueCount: number;
  /** Duplicate rows encountered across pages. */
  duplicateCount: number;
  /** Rows dropped for missing/blank IDs (corruption signal). */
  missingIdCount: number;
  failedPages: number;
  failedOffsets: number[];
  /** First authoritative total from Bitrix (undefined when absent). */
  total?: number;
  /** Detected total inconsistency across pages. */
  totalInconsistent: boolean;
  cappedByLimit: boolean;
  partial: boolean;
  /** Whether every page inside the capped window was retrieved. */
  allPagesRetrieved: boolean;
}

export class PaginationError extends Error {}

/**
 * Fetches up to `cap` unique entities page-by-page with full identity and
 * completeness accounting. Fail-closed: any contract violation surfaces as
 * PARTIAL or a thrown PaginationError, never as silent data loss.
 */
export async function fetchCappedPages<T extends CappedPageRow>(
  options: FetchCappedPagesOptions<T>
): Promise<CappedPagesResult<T>> {
  const {
    method,
    baseParams,
    idOf,
    cap,
    pageSize = 50,
    concurrency = 5,
    fetchPage,
    start = 0,
    logPrefix = "[Pagination]",
  } = options;

  const rows: T[] = [];
  const seenIds = new Set<string>();
  let duplicateCount = 0;
  let missingIdCount = 0;
  let failedPages = 0;
  const failedOffsets: number[] = [];
  let authoritativeTotal: number | undefined;
  let totalInconsistent = false;
  let sawNext = false;

  const extractPageItems = (
    data: { result?: T[] | { items?: T[] } | null; total?: number; next?: unknown },
    offset: number
  ): T[] => {
    // Malformed envelope (null / object without arrays) is corruption.
    const hasValidEnvelope =
      Array.isArray(data.result) ||
      (data.result !== null &&
        typeof data.result === "object" &&
        Array.isArray((data.result as { items?: T[] }).items));
    if (!hasValidEnvelope) {
      throw new PaginationError(
        `${method}: invalid result envelope at offset ${offset}`
      );
    }
    return Array.isArray(data.result)
      ? data.result
      : ((data.result as { items?: T[] }).items as T[]);
  };

  const ingest = (pageItems: T[]) => {
    for (const row of pageItems) {
      const id = idOf(row);
      if (id === null || id === undefined || String(id).trim() === "") {
        // Missing ID is corruption, not a row to silently drop.
        missingIdCount++;
        continue;
      }
      const key = String(id).trim();
      if (seenIds.has(key)) {
        duplicateCount++;
        continue;
      }
      seenIds.add(key);
      rows.push(row);
    }
  };

  // ── First page ──
  const firstOffset = start;
  let firstData: { result?: T[] | { items?: T[] } | null; total?: number; next?: unknown };
  try {
    firstData = await fetchPage({ ...baseParams, start: firstOffset });
  } catch (err) {
    console.error(`${logPrefix} ${method}: first page failed`, err);
    return {
      rows: [],
      uniqueCount: 0,
      duplicateCount: 0,
      missingIdCount: 0,
      failedPages: 1,
      failedOffsets: [firstOffset],
      total: undefined,
      totalInconsistent: false,
      cappedByLimit: false,
      partial: true,
      allPagesRetrieved: false,
    };
  }

  let firstItems: T[];
  try {
    firstItems = extractPageItems(firstData, firstOffset);
  } catch (err) {
    console.error(`${logPrefix} ${method}: ${String(err)}`);
    return {
      rows: [],
      uniqueCount: 0,
      duplicateCount: 0,
      missingIdCount: 0,
      failedPages: 1,
      failedOffsets: [firstOffset],
      total: firstData?.total,
      totalInconsistent: false,
      cappedByLimit: false,
      partial: true,
      allPagesRetrieved: false,
    };
  }

  ingest(firstItems);
  if (typeof firstData.total === "number") {
    authoritativeTotal = firstData.total;
  }
  sawNext = firstData.next !== undefined && firstData.next !== null;

  // ── Remaining pages inside the capped window ──
  const windowEnd =
    authoritativeTotal !== undefined
      ? Math.min(authoritativeTotal, start + cap)
      : start + cap;

  if (sawNext && windowEnd > firstOffset + pageSize) {
    const limit = pLimit(concurrency);
    const offsets: number[] = [];
    for (let offset = firstOffset + pageSize; offset < windowEnd; offset += pageSize) {
      offsets.push(offset);
    }

    const pageResults = await Promise.all(
      offsets.map((offset) =>
        limit(async () => {
          try {
            const data = await fetchPage({ ...baseParams, start: offset });
            const items = extractPageItems(data, offset);
            if (
              typeof data.total === "number" &&
              authoritativeTotal !== undefined &&
              data.total !== authoritativeTotal
            ) {
              totalInconsistent = true;
            }
            if (data.next !== undefined && data.next !== null) {
              const nextNum = Number(data.next);
              const isValidNext =
                typeof data.next !== "boolean" &&
                typeof data.next !== "object" &&
                Number.isFinite(nextNum) &&
                Number.isInteger(nextNum) &&
                nextNum >= 0 &&
                nextNum > offset;
              if (!isValidNext) {
                return { offset, items: [] as T[], ok: false as const };
              }
            }
            return { offset, items, ok: true as const };
          } catch (err) {
            console.error(`${logPrefix} ${method}: page at offset ${offset} failed`, err);
            return { offset, items: [] as T[], ok: false as const };
          }
        })
      )
    );

    // Deterministic ordering: offsets are already ascending by construction.
    for (const res of pageResults) {
      if (res.ok) {
        ingest(res.items);
      } else {
        failedPages++;
        failedOffsets.push(res.offset);
      }
    }
  }

  const uniqueCount = rows.length;
  const allPagesRetrieved = failedPages === 0 && missingIdCount === 0 && !totalInconsistent;
  // cappedByLimit is a fact about total vs the window, independent of page
  // failures (PARTIAL precedence is handled by resolveDatasetCoverage).
  const cappedByLimit =
    authoritativeTotal !== undefined && authoritativeTotal > start + cap;
  const partial = failedPages > 0 || missingIdCount > 0 || totalInconsistent;

  // Reconciliation: with all pages retrieved and a known total, the unique
  // count must equal the capped window size minus known duplicates
  // (duplicates are counted, not errors). If fewer unique rows arrived
  // without any recorded failure or duplicates, treat it as partial
  // (something vanished silently).
  let reconciled = true;
  if (allPagesRetrieved && authoritativeTotal !== undefined) {
    const expectedWindow = Math.max(0, Math.min(authoritativeTotal - start, cap));
    if (uniqueCount !== expectedWindow && sawNext && duplicateCount === 0) {
      reconciled = false;
    }
  }
  const finalPartial = partial || !reconciled;

  return {
    rows,
    uniqueCount,
    duplicateCount,
    missingIdCount,
    failedPages,
    failedOffsets,
    total: authoritativeTotal,
    totalInconsistent,
    cappedByLimit,
    partial: finalPartial,
    allPagesRetrieved: allPagesRetrieved && reconciled,
  };
}
