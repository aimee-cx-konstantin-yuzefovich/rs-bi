// src/lib/samples/types.ts
// ─────────────────────────────────────────────────────────────────────
// Samples v1 domain contract.
//
// The analytical grain is: ONE Company with sample-related activity
// = ONE primary SampleSummary record. This is an analytical aggregate,
// NOT a physical sample record. Multiplicity (products, grades, dates,
// deals) is preserved instead of collapsed.
//
// Nothing here is persisted: SampleSummary is derived at request time
// from authoritative Bitrix Company + Deal data.
// ─────────────────────────────────────────────────────────────────────

export type {
  SampleSource,
  SampleSourceGranularity,
  SampleSentEvidence,
  SampleEvidenceUnit,
  CurrentStateResolutionQuality,
  CurrentStateResolution,
  CanonicalCompanySample,
} from "./model";

export type SampleQuality = "structured" | "partial" | "legacy" | "ambiguous";

export type NormalizedResult =
  | "positive"
  | "negative"
  | "rework"
  | "pending"
  | "mixed"
  | "unknown";

/** Machine-readable data-issue slugs (human labels live in constants). */
export type SampleDataIssue =
  | "dates_conflict_between_fields"
  | "grades_without_item_result"
  | "products_without_item_result"
  | "missing_title"
  | "deal_company_status_mismatch"
  | "missing_product"
  | "application_fields_differ"
  | "deal_without_company"
  | "smart_process_stage_result_conflict"
  | "smart_process_relation_conflict"
  | "smart_process_orphan_item"
  | "smart_process_multiple_active"
  | "smart_process_missing_sent_date"
  | "smart_process_unknown_stage"
  | "smart_process_unknown_result";

export interface SampleGrade {
  productFamily?: string;
  value: string;
}

export interface SampleQuantity {
  productFamily?: string;
  value: number | string;
  unit?: string;
}

export interface RelatedDealSampleInfo {
  id: string;
  title: string;
  stageId?: string;
  sampleTransferStatus?: string;
  sampleTestingStatus: string[];
  sampleSentDate?: string;
  /** Verbatim free-text product/mark context («Марка и объём поставки»). */
  markVolume?: string;
  /** Verbatim TVL details — preview only. */
  tvlDetails?: string;
}

export interface SampleSummary {
  companyId: string;
  companyTitle: string;

  responsibleId?: string;
  responsibleName?: string;

  /**
   * Explicit COMPANY-grain responsibility: the Company `ASSIGNED_BY_ID`
   * (company owner), identical to the Companies browser grain.
   *
   * Deliberately DISTINCT from `responsibleId` above, which keeps its
   * existing meaning of canonical CURRENT sample/process responsibility
   * (SMART_PROCESS responsible → legacy/current fallback → Company
   * responsible). A company's owner (e.g. user 7) and its current SP
   * cycle's responsible (e.g. user 55) may legitimately differ; both facts
   * must stay independently visible. Samples UI filters, the registry
   * responsible column and the Samples Excel responsible column consume
   * THIS company grain — never the process grain.
   */
  companyResponsibleId?: string;
  companyResponsibleName?: string;

  productFamilies: string[];
  grades: SampleGrade[];

  quantities: SampleQuantity[];

  /** All distinct valid sent dates (ISO YYYY-MM-DD), deduplicated. */
  sentDates: string[];

  sampleIndicators: string[];
  processStatuses: string[];

  /**
   * Authoritative source of the CURRENT status projection, taken verbatim
   * from `canonical.currentState.source`
   * (SMART_PROCESS → DEAL_LEGACY → COMPANY_LEGACY → NONE).
   */
  currentStatusSource: "SMART_PROCESS" | "DEAL_LEGACY" | "COMPANY_LEGACY" | "NONE";
  /**
   * ONE current UI status projection (dropdown + filter predicate). Derived
   * ONLY from `canonical.currentState`; historical legacy evidence
   * (`sampleIndicators`, legacy `processStatuses`) never participates.
   */
  currentStatusValues: string[];

  /** Exact source value — never discarded or reworded. */
  rawTestResult?: string;
  normalizedResult: NormalizedResult;

  industry?: string;
  application?: string;

  relatedDeals: RelatedDealSampleInfo[];

  /** Max of all relevant dates (sent dates + deal sent dates). */
  latestRelevantDate?: string;

  sourceQuality: SampleQuality;
  dataIssues: SampleDataIssue[];

  /**
   * Backward-compatible extension: canonical Smart Process item views
   * projected from `CanonicalCompanySample.evidenceUnits` (no re-fetch,
   * no raw-field reparse). Physical testing cycles for the Sample Preview
   * «Циклы тестирования» section. Absent/empty = no SP evidence.
   */
  smartProcessItems?: SmartProcessItemViewLite[];
  /** Count of SP evidence units whose stage is canonically active. */
  activeSmartProcessCount?: number;
  /**
   * Distinct active stage labels (0 active → empty, no invented stage;
   * >1 active → all labels, no winner).
   */
  currentActiveStageLabels?: string[];
}

/**
 * Resolves a raw Bitrix field value (enum ID / status code / free text)
 * into a human-readable label using server-fetched field metadata.
 * When metadata is unavailable, resolvers return the raw value unchanged.
 */
export type LabelResolver = (fieldId: string, rawValue: string) => string;

/** Value shape coming from Bitrix list endpoints: string | string[] | number | null. */
export type BitrixFieldValue = string | string[] | number | null | undefined;
export type BitrixRow = Record<string, BitrixFieldValue>;

export interface SamplesResponseMeta {
  /** fieldId -> (rawValue -> label) for status/result filter option building. */
  statusLabels: Record<string, Record<string, string>>;
}

/**
 * UI-serializable Smart Process item view projected from canonical evidence.
 * Mirrors `SmartProcessItemView` (smart-process-view.ts) without the
 * internal provenance object, so the Samples API response stays JSON-safe.
 */
export interface SmartProcessItemViewLite {
  processItemId: string;
  title: string;
  companyId: string;
  linkedDealId?: string;
  stageId?: string;
  stageLabel: string;
  isActive: boolean;
  isTerminal: boolean;
  responsibleId?: string;
  sentDates: string[];
  grades: SampleGrade[];
  quantities: SampleQuantity[];
  rawTestResult?: string;
  normalizedResult: NormalizedResult;
  createdTime?: string;
  dataIssues: SampleDataIssue[];
}

export interface SamplesApiResponse {
  success: boolean;
  samples: SampleSummary[];
  total: number;
  orphanDealCount: number;
  metadataPartial: boolean;
  smartProcess?: { qualityCounts: Record<string, number> };
  meta?: SamplesResponseMeta;
  issueLabels?: Record<string, string>;
  error?: string;
  code?: string;
}

export interface SamplesKpis {
  /** Every row in the dataset is a company with sample activity. */
  total: number;
  withSentDates: number;
  inTesting: number;
  withResult: number;
  positive: number;
  negative: number;
  rework: number;
  ambiguous: number;
}
