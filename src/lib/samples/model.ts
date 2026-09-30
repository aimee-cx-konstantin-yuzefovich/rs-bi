// src/lib/samples/model.ts
// ─────────────────────────────────────────────────────────────────────
// Samples Canonical Domain Model (Phase B)
//
// Invariants:
// 1. Explicit source provenance and granularity.
// 2. Strict separation between current-state resolution and historical
//    dated evidence.
// 3. No manufactured physical cycles from parallel legacy arrays.
// 4. Deal testing marker (UF_CRM_1779394379) isolated as navigation marker.
// 5. Reserved SMART_PROCESS source seam ready for Phase C.
// ─────────────────────────────────────────────────────────────────────

import type {
  NormalizedResult,
  SampleDataIssue,
  SampleGrade,
  SampleQuality,
  SampleQuantity,
} from "./types";

export type {
  NormalizedResult,
  SampleDataIssue,
  SampleGrade,
  SampleQuality,
  SampleQuantity,
};

/** Provenance source for sample evidence. */
export type SampleSource =
  | "COMPANY_LEGACY"
  | "DEAL_LEGACY"
  | "SMART_PROCESS"; // Reserved for Phase C

/** Explicit granularity / fidelity of the source record. */
export type SampleSourceGranularity =
  | "COMPANY_AGGREGATE" // Aggregated historical fields on Company card (NOT an exact physical cycle)
  | "DEAL_RECORD"       // Deal-scoped record (may or may not represent 1 physical shipment/test)
  | "PROCESS_ITEM";     // Future Smart Process item / cycle (exact physical item)

/**
 * Historical dated sent evidence.
 * Captures an assertion that samples were sent on a given date by a specific source entity.
 * Does not imply physical-event uniqueness beyond what the source proves.
 */
export interface SampleSentEvidence {
  date: string; // ISO YYYY-MM-DD
  source: SampleSource;
  sourceGranularity: SampleSourceGranularity;
  sourceEntityId: string;
  companyId: string;
  dealId?: string;
}

/**
 * Unit of sample evidence emitted by a source adapter.
 * Retains exact entity provenance without losing or synthesizing relationships.
 */
export interface SampleEvidenceUnit {
  /** Stable deterministic ID (e.g., "company-42-aggregate", "deal-101-record"). */
  id: string;
  source: SampleSource;
  sourceGranularity: SampleSourceGranularity;
  sourceEntityId: string;
  companyId: string;
  dealId?: string;
  responsibleId?: string;
  title?: string;
  stageId?: string;

  // Products, grades, and quantities
  productFamilies: string[];
  grades: SampleGrade[];
  quantities: SampleQuantity[];

  // Sent dates directly evidenced by this source unit
  sentDates: SampleSentEvidence[];

  // Analytical state/status evidence (e.g. transfer status, company samples status)
  statusEvidence: string[];

  // Operational/navigation marker (UF_CRM_1779394379: «Тестирование образцов»)
  // Confirmed rule: strictly MARKER_ONLY, isolated from analytical status/result/KPIs.
  navigationMarkerPresent?: boolean;
  navigationMarkerValues?: string[];

  // Raw and normalized test results where provable
  rawTestResult?: string;
  normalizedResult?: NormalizedResult;

  // Verbatim text fields preserved from source
  markVolume?: string;
  tvlDetails?: string;

  // Segment metadata
  industry?: string;
  application?: string;

  // Data issues observed within this unit
  issues: SampleDataIssue[];
}

export type CurrentStateResolutionQuality =
  | "RESOLVED"
  | "AMBIGUOUS"
  | "NONE";

/**
 * Result of current-state resolution.
 * Separated from historical sent evidence.
 */
export interface CurrentStateResolution {
  source: "SMART_PROCESS" | "DEAL_LEGACY" | "COMPANY_LEGACY" | "NONE";
  quality: CurrentStateResolutionQuality;
  evidenceId?: string;
  winningDealId?: string;
  statusValues: string[];
  normalizedResult: NormalizedResult;
  reason?: string;
}

/**
 * Canonical company-level sample aggregate.
 * Combines all evidence units, preserves all historical sent dates,
 * and maintains the current-state resolution.
 */
export interface CanonicalCompanySample {
  companyId: string;
  companyTitle: string;
  companyResponsibleId?: string;
  evidenceUnits: SampleEvidenceUnit[];
  historicalSentDates: SampleSentEvidence[];
  currentState: CurrentStateResolution;
  sourceQuality: SampleQuality;
  dataIssues: SampleDataIssue[];
  /** Preserves transitional registry discoverability when deal only has navigation marker. */
  hasMarkerOnlyDealActivity?: boolean;
}
