// src/lib/bitrix-list-invariant.ts
// ─────────────────────────────────────────────────────────────────────
// Safe structured error type for LOCAL pagination invariant failures in
// `fetchAllPages` (src/lib/samples/bitrix-fetch.ts).
//
// Purpose: after a SUCCESSFUL Bitrix transport response, `fetchAllPages`
// enforces local invariants (envelope shape, required ID, next-token
// progression, total reconciliation). Before this type existed, those
// failures threw generic `Error`s, so diagnostics could not distinguish
// WHICH invariant rejected the response. This class adds ONLY safe
// categorization — never item identity.
//
// HARD SAFETY CONTRACT (internal diagnostics only):
// - fields are limited to: method, category, and anonymous counts
//   (reportedTotal, pageItemCount, accumulatedUniqueCount, duplicateCount,
//   missingIdCount, start, nextPresent);
// - NEVER include: item IDs, company IDs, Deal IDs, titles, UF values,
//   webhook URL/token, raw response bodies, error_description;
// - messages stay byte-identical to the pre-existing generic Errors so
//   every consumer regex and error-code mapping keeps working unchanged;
// - behavior is unchanged: this type only TAGS existing throws.
// ─────────────────────────────────────────────────────────────────────

/** Exact safe categories of local pagination invariant failures. */
export type BitrixListInvariantCategory =
  | "INVALID_RESULT_ENVELOPE"
  | "INVALID_ROW"
  | "MISSING_REQUIRED_ID"
  | "INVALID_NEXT_TOKEN"
  | "NON_ADVANCING_NEXT"
  | "INCONSISTENT_TOTAL"
  | "TOTAL_COUNT_MISMATCH"
  | "TOTAL_WITH_EMPTY_LAST_PAGE"
  | "PAGINATION_DID_NOT_CONVERGE";

/** Anonymous counts describing the rejected page/pagination state. */
export interface BitrixListInvariantCounts {
  /** Total Bitrix reported on the page (when reported at all). */
  reportedTotal?: number;
  /** Number of rows on the offending page (when known). */
  pageItemCount?: number;
  /** Unique rows accumulated so far (when known). */
  accumulatedUniqueCount?: number;
  /** Duplicate-ID rows skipped so far (when known). */
  duplicateCount?: number;
  /** Rows missing the required ID field (when known). */
  missingIdCount?: number;
  /** `start` offset of the offending page. */
  start?: number;
  /** Whether the page carried a `next` continuation token. */
  nextPresent?: boolean;
}

/**
 * Local deterministic pagination invariant failure (post-transport).
 * Deterministic by definition: retrying the identical pagination cannot
 * change the verdict — the response already arrived and was rejected by
 * a local rule. Transport-level failures keep their own retry policy.
 */
export class BitrixListInvariantError extends Error {
  readonly method: string;
  readonly category: BitrixListInvariantCategory;
  readonly reportedTotal?: number;
  readonly pageItemCount?: number;
  readonly accumulatedUniqueCount?: number;
  readonly duplicateCount?: number;
  readonly missingIdCount?: number;
  readonly start?: number;
  readonly nextPresent?: boolean;

  constructor(
    method: string,
    category: BitrixListInvariantCategory,
    message: string,
    counts: BitrixListInvariantCounts = {}
  ) {
    super(message);
    this.name = "BitrixListInvariantError";
    this.method = method;
    this.category = category;
    if (counts.reportedTotal !== undefined) this.reportedTotal = counts.reportedTotal;
    if (counts.pageItemCount !== undefined) this.pageItemCount = counts.pageItemCount;
    if (counts.accumulatedUniqueCount !== undefined) {
      this.accumulatedUniqueCount = counts.accumulatedUniqueCount;
    }
    if (counts.duplicateCount !== undefined) this.duplicateCount = counts.duplicateCount;
    if (counts.missingIdCount !== undefined) this.missingIdCount = counts.missingIdCount;
    if (counts.start !== undefined) this.start = counts.start;
    if (counts.nextPresent !== undefined) this.nextPresent = counts.nextPresent;
  }
}

/** Narrowing guard for internal diagnostics consumers. */
export function isBitrixListInvariantError(
  error: unknown
): error is BitrixListInvariantError {
  return error instanceof BitrixListInvariantError;
}
