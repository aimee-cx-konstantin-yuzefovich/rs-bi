// src/lib/enrichment-coverage.ts
// ─────────────────────────────────────────────────────────────────────
// Coverage resolution for enrichment/lookup sources (user directory,
// field metadata, activities, company enrichment). PARTIAL != COMPLETE,
// and "request finished" never implies "source complete".
// ─────────────────────────────────────────────────────────────────────

import {
  resolveDatasetCoverage,
  type CoverageApiEnvelope,
} from "./dataset-coverage";

// Re-exported so downstream modules can import the coverage type from this
// single enrichment authority.
export type { DatasetCoverage } from "./dataset-coverage";
import type { DatasetCoverage } from "./dataset-coverage";

/** Standard Russian warning for a failed user-directory refresh. */
export const USERS_DIRECTORY_FAILED_WARNING =
  "Не удалось загрузить справочник сотрудников.";

/** Standard Russian warning for a failed field-metadata refresh. */
export const FIELDS_METADATA_FAILED_WARNING =
  "Не удалось загрузить метаданные CRM.";

/** Standard Russian warning for a failed activities refresh. */
export const ACTIVITIES_FAILED_WARNING =
  "Не удалось загрузить данные активностей.";

/** Standard Russian warning for a failed company-enrichment refresh. */
export const COMPANIES_FAILED_WARNING =
  "Не удалось загрузить данные компаний.";

/**
 * Aggregate-only company-enrichment diagnostics for the CURRENT scope.
 * Never contains Company IDs, titles or other business data.
 * - failedFetchCount: requested IDs whose read failed at transport level
 *   (retryable; a real warning condition).
 * - unresolvedReferenceCount: related Company IDs CRM did not return from
 *   successful reads (deleted/inaccessible/stale reference — reason unproven).
 */
export interface CompanyEnrichmentDiagnostics {
  scopeCount: number;
  refreshRequestedCount: number;
  refreshResolvedCount: number;
  refreshFailedFetchCount: number;
  activeUnresolvedReferenceCount: number;
  failedPrimaryBatchCount: number;
  failedRecoveryBatchCount: number;
  classification:
    | "COMPLETE"
    | "TRANSIENT_FETCH_FAILURE"
    | "UNRESOLVED_REFERENCES"
    | "MIXED";
  /** @deprecated Use refreshRequestedCount */
  requestedCount?: number;
  /** @deprecated Use refreshResolvedCount */
  resolvedCount?: number;
  /** @deprecated Use refreshFailedFetchCount */
  failedFetchCount?: number;
  /** @deprecated Use activeUnresolvedReferenceCount */
  unresolvedReferenceCount?: number;
}

/** Standard TTL for company enrichment cache and confirmed unresolved reference suppression (5 minutes). */
export const COMPANY_ENRICHMENT_TTL_MS = 5 * 60 * 1000;
export const COMPANY_UNRESOLVED_REF_TTL_MS = COMPANY_ENRICHMENT_TTL_MS;

/**
 * Checks whether an unresolved-reference marker timestamp is currently active within TTL.
 * Returns false if timestamp is undefined, null, non-numeric, or expired.
 */
export function isUnresolvedRefActive(
  timestamp?: number | null,
  now = Date.now(),
  ttlMs = COMPANY_UNRESOLVED_REF_TTL_MS
): boolean {
  if (typeof timestamp !== "number" || Number.isNaN(timestamp) || timestamp <= 0) {
    return false;
  }
  return now - timestamp <= ttlMs;
}


/**
 * Coverage for an ID-set-based enrichment request (activities, companies):
 * `requested` IDs were asked for, `fetchedIds` were successfully resolved.
 * Any missing ID means PARTIAL — an unresolved ID must never count as
 * successfully enriched, and a finished request must never imply complete.
 */
export function resolveIdSetCoverage(
  requested: string[],
  fetchedIds: string[],
  options?: { warning?: string | null }
): DatasetCoverage {
  const requestedIds = [...new Set(requested.filter(Boolean))];
  const fetched = [...new Set(fetchedIds.filter(Boolean))];
  const missing = requestedIds.length - fetched.length;

  if (missing > 0) {
    return {
      status: "PARTIAL",
      fetched: fetched.length,
      total: requestedIds.length,
      warning:
        options?.warning ||
        `Некоторые данные не удалось загрузить. Загружено ${fetched.length} из ${requestedIds.length}.`,
    };
  }

  return { status: "COMPLETE", fetched: fetched.length, total: requestedIds.length };
}

/**
 * Coverage for the user directory from the /api/bitrix/users envelope.
 * Precedence: upstream page failure (PARTIAL) beats the directory cap
 * (CAPPED) beats complete — matching resolveDatasetCoverage semantics.
 */
export function resolveUsersCoverage(
  envelope: {
    total?: number;
    fetched?: number;
    partial?: boolean;
    failedBatches?: number;
    cappedByLimit?: boolean;
    truncated?: boolean;
  },
  cap?: number
): DatasetCoverage {
  const apiEnvelope: CoverageApiEnvelope = {
    fetched: envelope.fetched,
    total: envelope.total,
    partial: envelope.partial || (envelope.failedBatches ?? 0) > 0,
    cappedByLimit: envelope.cappedByLimit,
    truncated: envelope.truncated,
    warning:
      envelope.partial || (envelope.failedBatches ?? 0) > 0
        ? `Справочник сотрудников загружен частично${envelope.total ? ` (${envelope.fetched ?? 0} из ${envelope.total})` : ""}.`
        : undefined,
  };
  return resolveDatasetCoverage(apiEnvelope, cap);
}

/**
 * Coverage for CRM field metadata from the /api/bitrix/fields envelope.
 * Receiving SOME fields never proves the metadata directory is complete —
 * a failed sub-source (e.g. crm.company.fields) makes it PARTIAL with a
 * meaningful per-source warning.
 */
export function resolveFieldsCoverage(envelope: {
  partial?: boolean;
  missingSources?: string[];
}): DatasetCoverage {
  if (envelope.partial && (envelope.missingSources?.length ?? 0) > 0) {
    return {
      status: "PARTIAL",
      fetched: 0,
      warning: `Метаданные CRM загружены частично: ${envelope.missingSources!.join(", ")}`,
    };
  }
  if (envelope.partial) {
    return {
      status: "PARTIAL",
      fetched: 0,
      warning: "Метаданные CRM загружены частично.",
    };
  }
  return { status: "COMPLETE", fetched: 0, total: 0 };
}

/**
 * Three-way responsible-person display resolution shared by the company
 * preview, the deals table, and the deal preview. Provenance rules:
 *  - known ID            → real employee name
 *  - missing + COMPLETE  → "Сотрудник не найден"
 *  - missing + PARTIAL/CAPPED/unknown → directory-incomplete variant
 * Directory completeness must NEVER be inferred from dictionary
 * non-emptiness.
 */
export const RESPONSIBLE_NOT_FOUND_LABEL = "Сотрудник не найден";
export const RESPONSIBLE_DIRECTORY_INCOMPLETE_LABEL =
  "Неизвестный сотрудник (справочник неполный)";

export function resolveResponsibleDisplay(
  id: string,
  userNames: Record<string, string>,
  usersCoverage?: DatasetCoverage | null
): string {
  const name = userNames[id]?.trim();
  if (name) return name;

  const directoryComplete = usersCoverage?.status === "COMPLETE";
  return directoryComplete
    ? RESPONSIBLE_NOT_FOUND_LABEL
    : RESPONSIBLE_DIRECTORY_INCOMPLETE_LABEL;
}

/** True when a resolved label is one of the provenance placeholders. */
export function isUnknownResponsibleLabel(label: string): boolean {
  return (
    label === RESPONSIBLE_NOT_FOUND_LABEL ||
    label === RESPONSIBLE_DIRECTORY_INCOMPLETE_LABEL ||
    label === "Неизвестный сотрудник"
  );
}
