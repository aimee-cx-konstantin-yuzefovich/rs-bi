// src/lib/samples/client-contract.ts
// ─────────────────────────────────────────────────────────────────────
// ONE shared, pure client-side response-shape contract for the Samples
// pipeline (Phase D diagnostic extraction; hardened by the pre-production
// correctness patch).
//
// The validator defines what the real Samples client accepts as a valid
// dataset BEFORE it may enter cache/UI/Excel:
//
// - success must be exactly `true`;
// - samples must be an array of structurally valid SampleSummary objects
//   (the fields actually consumed by the Samples registry, filters, KPIs,
//   Sample Preview, Commercial Funnel and Excel export);
// - meta must be null/absent or a statusLabels dictionary;
// - orphanDealCount must be numeric (absent/null → 0);
// - metadataPartial must be boolean (absent/null → false);
//
// Hard rules:
// - there is exactly ONE Samples response parser on the client — both
//   `useSamplesData` (via samples-cache) and the Samples pipeline
//   diagnostic (PROBE H) call this same pure function;
// - no second parser may appear anywhere else;
// - ATOMIC acceptance: one malformed item/meta/counter rejects the ENTIRE
//   payload — no partial acceptance, no silent row drops, no coercion of
//   objects; a rejected payload must never be cached;
// - valid empty arrays remain valid; legitimate optional null/undefined
//   values remain valid where the contract permits;
// - rejection reasons are fixed enums — offending data is never echoed;
// - checks are small, structural and allocation-light (large datasets).
// ─────────────────────────────────────────────────────────────────────

import type {
  SampleDataIssue,
  SampleGrade,
  SampleQuantity,
  SampleQuality,
  SampleSummary,
  SamplesResponseMeta,
  SmartProcessItemViewLite,
  RelatedDealSampleInfo,
} from "./types";

/** Fixed safe rejection reason enums — no offending data is ever echoed. */
export type SamplesClientContractRejection =
  | "INVALID_SUCCESS_FLAG"
  | "SAMPLES_NOT_ARRAY"
  | "INVALID_SAMPLE_SUMMARY_SHAPE"
  | "INVALID_META_SHAPE"
  | "INVALID_ORPHAN_DEAL_COUNT"
  | "INVALID_METADATA_PARTIAL"
  | "UNEXPECTED_CLIENT_CONTRACT";

export type SamplesClientContractResult =
  | {
      ok: true;
      samples: SampleSummary[];
      meta: SamplesResponseMeta | null;
      orphanDealCount: number;
      metadataPartial: boolean;
    }
  | { ok: false; reason: SamplesClientContractRejection };

/** Shape the validator reads from the raw response payload. */
interface SamplesClientPayloadShape {
  success?: unknown;
  samples?: unknown;
  meta?: unknown;
  orphanDealCount?: unknown;
  metadataPartial?: unknown;
}

// ─── Small structural helpers (no schema framework; repo uses none) ───

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || isString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || value === null || isStringArray(value);
}

const NORMALIZED_RESULTS: readonly string[] = [
  "positive",
  "negative",
  "rework",
  "pending",
  "mixed",
  "unknown",
];

const SOURCE_QUALITIES: readonly string[] = ["structured", "partial", "legacy", "ambiguous"];

function isValidGrade(value: unknown): value is SampleGrade {
  return isPlainObject(value) && isString(value.value);
}

function isValidQuantity(value: unknown): value is SampleQuantity {
  return (
    isPlainObject(value) &&
    (isString(value.value) || isFiniteNumber(value.value))
  );
}

function isValidRelatedDeal(value: unknown): value is RelatedDealSampleInfo {
  return isPlainObject(value) && isString(value.id) && isString(value.title);
}

function isValidSmartProcessItemLite(value: unknown): value is SmartProcessItemViewLite {
  return (
    isPlainObject(value) &&
    isString(value.processItemId) &&
    isString(value.title) &&
    isString(value.stageLabel) &&
    typeof value.isActive === "boolean" &&
    typeof value.isTerminal === "boolean" &&
    isStringArray(value.sentDates) &&
    Array.isArray(value.dataIssues) &&
    value.dataIssues.every(isString)
  );
}

/**
 * Structural validation of one SampleSummary: exactly the fields actually
 * consumed by the Samples registry, filters, KPIs, Sample Preview,
 * Commercial Funnel and Excel export. Optional fields stay optional
 * (absent/null valid) exactly where the TS contract permits.
 */
function isValidSampleSummary(value: unknown): value is SampleSummary {
  if (!isPlainObject(value)) return false;

  // Required identity + core collections.
  if (!isString(value.companyId)) return false;
  if (!isString(value.companyTitle)) return false;
  if (!isStringArray(value.productFamilies)) return false;
  if (!isStringArray(value.sentDates)) return false;
  if (!isStringArray(value.sampleIndicators)) return false;
  if (!isStringArray(value.processStatuses)) return false;
  if (!isStringArray(value.currentStatusValues)) return false;
  if (
    value.currentStatusSource !== "SMART_PROCESS" &&
    value.currentStatusSource !== "DEAL_LEGACY" &&
    value.currentStatusSource !== "COMPANY_LEGACY" &&
    value.currentStatusSource !== "NONE"
  )
    return false;
  if (!Array.isArray(value.grades) || !value.grades.every(isValidGrade)) return false;
  if (!Array.isArray(value.quantities) || !value.quantities.every(isValidQuantity)) return false;
  if (!Array.isArray(value.relatedDeals) || !value.relatedDeals.every(isValidRelatedDeal)) return false;
  if (!isString(value.normalizedResult) || !NORMALIZED_RESULTS.includes(value.normalizedResult)) return false;
  if (!isString(value.sourceQuality) || !SOURCE_QUALITIES.includes(value.sourceQuality)) return false;
  if (!isStringArray(value.dataIssues)) return false;
  // dataIssues must be the documented machine-readable slugs enum (string union).
  if (!value.dataIssues.every((issue) => isString(issue))) return false;

  // Optional strings — absent/null valid, present must be a string.
  if (!isOptionalString(value.responsibleId)) return false;
  if (!isOptionalString(value.responsibleName)) return false;
  if (!isOptionalString(value.companyResponsibleId)) return false;
  if (!isOptionalString(value.companyResponsibleName)) return false;
  if (!isOptionalString(value.rawTestResult)) return false;
  if (!isOptionalString(value.industry)) return false;
  if (!isOptionalString(value.application)) return false;
  if (!isOptionalString(value.latestRelevantDate)) return false;

  // Optional canonical Smart Process enrichment (Sample Preview cycles).
  if (!(value.smartProcessItems === undefined || value.smartProcessItems === null)) {
    if (
      !Array.isArray(value.smartProcessItems) ||
      !value.smartProcessItems.every(isValidSmartProcessItemLite)
    ) {
      return false;
    }
  }
  if (
    !(
      value.activeSmartProcessCount === undefined ||
      value.activeSmartProcessCount === null ||
      isFiniteNumber(value.activeSmartProcessCount)
    )
  ) {
    return false;
  }
  if (!isOptionalStringArray(value.currentActiveStageLabels)) return false;

  return true;
}

function isValidMeta(value: unknown): value is SamplesResponseMeta {
  if (!isPlainObject(value)) return false;
  // statusLabels (if present) is fieldId -> (rawValue -> label).
  const statusLabels = value.statusLabels;
  if (statusLabels === undefined || statusLabels === null) return true;
  if (!isPlainObject(statusLabels)) return false;
  for (const perField of Object.values(statusLabels)) {
    if (!isPlainObject(perField)) return false;
    for (const label of Object.values(perField)) {
      if (!isString(label)) return false;
    }
  }
  return true;
}

/**
 * Validates the /api/bitrix/samples response payload BEFORE it may enter
 * cache/UI/Excel. Atomic: any malformed part rejects the whole payload.
 */
export function validateSamplesClientPayload(
  data: unknown
): SamplesClientContractResult {
  const payload = data as SamplesClientPayloadShape;

  if (payload.success !== true) {
    return { ok: false, reason: "INVALID_SUCCESS_FLAG" };
  }
  if (!Array.isArray(payload.samples)) {
    return { ok: false, reason: "SAMPLES_NOT_ARRAY" };
  }
  // ATOMIC: one malformed sample rejects the entire payload (never cached).
  for (const item of payload.samples) {
    if (!isValidSampleSummary(item)) {
      return { ok: false, reason: "INVALID_SAMPLE_SUMMARY_SHAPE" };
    }
  }
  if (payload.meta !== undefined && payload.meta !== null && !isValidMeta(payload.meta)) {
    return { ok: false, reason: "INVALID_META_SHAPE" };
  }
  // orphanDealCount: numeric contract. Absent/null → 0; a finite number is
  // accepted as-is; anything else (string, object, Infinity, NaN) rejects.
  let orphanDealCount = 0;
  if (payload.orphanDealCount !== undefined && payload.orphanDealCount !== null) {
    if (!isFiniteNumber(payload.orphanDealCount)) {
      return { ok: false, reason: "INVALID_ORPHAN_DEAL_COUNT" };
    }
    orphanDealCount = payload.orphanDealCount;
  }
  // metadataPartial: boolean contract. Absent/null → false; a real boolean
  // is accepted as-is; anything else rejects (no truthiness coercion of
  // arbitrary objects).
  let metadataPartial = false;
  if (payload.metadataPartial !== undefined && payload.metadataPartial !== null) {
    if (typeof payload.metadataPartial !== "boolean") {
      return { ok: false, reason: "INVALID_METADATA_PARTIAL" };
    }
    metadataPartial = payload.metadataPartial;
  }

  return {
    ok: true,
    samples: payload.samples as SampleSummary[],
    meta: (payload.meta as SamplesResponseMeta) ?? null,
    orphanDealCount,
    metadataPartial,
  };
}

/** Exported for diagnostics/tests only — never mutates CRM or payload data. */
export type { SampleDataIssue };
