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
  | "deal_without_company";

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

  productFamilies: string[];
  grades: SampleGrade[];

  quantities: SampleQuantity[];

  /** All distinct valid sent dates (ISO YYYY-MM-DD), deduplicated. */
  sentDates: string[];

  sampleIndicators: string[];
  processStatuses: string[];

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
