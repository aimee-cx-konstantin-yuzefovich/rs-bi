// src/lib/samples/aggregate.ts
// ─────────────────────────────────────────────────────────────────────
// Pure aggregation: Bitrix Company rows + sample-active Deal rows
//   → SampleSummary[] joined by Company ID (authoritative identity).
//
// Invariants (Samples v1):
// - 1 Company ⇒ at most 1 primary SampleSummary (deals are nested context);
// - multiplicity preserved: products, grades, quantities, dates, deals;
// - raw test result never discarded; normalization is conservative;
// - ambiguity is surfaced via sourceQuality + dataIssues, never hidden;
// - Company TITLE is the real Bitrix title; safe fallback never an ID.
// ─────────────────────────────────────────────────────────────────────

import type {
  BitrixRow,
  LabelResolver,
  NormalizedResult,
  RelatedDealSampleInfo,
  SampleDataIssue,
  SampleGrade,
  SampleQuantity,
  SampleSummary,
} from "./types";
import {
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_UNIT,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_UNIT,
  COMPANY_TEST_RESULT_FIELD_ID,
  DEAL_DIRECTION_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  PRODUCT_FAMILY_GEL,
  PRODUCT_FAMILY_SOL,
} from "./constants";
import {
  computeSourceQuality,
  dedupe,
  extractDates,
  identityLabelResolver,
  isSentIndicator,
  isTestingStatus,
  normalizeResult,
  parseQuantity,
  resolveValue,
} from "./normalize";

export interface AggregateOptions {
  /** Current user-name map for responsible display. */
  userNames?: Record<string, string>;
  /** Field-metadata label resolver (raw enum ID → RU label). */
  labelResolver?: LabelResolver;
}

// Re-declare PerProductEvidence for local use.
type Evidence = { productFamily: string; result: NormalizedResult };

function firstString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed !== "" ? trimmed : undefined;
}

function rowString(row: BitrixRow, key: string): string | undefined {
  return firstString(row[key]);
}

/**
 * Whether a company row has ANY sample-related evidence at all.
 * Companies without sample data are excluded from the dataset entirely.
 */
export function hasSampleActivity(row: BitrixRow): boolean {
  const keys = [
    COMPANY_SAMPLES_FIELD_ID,
    COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
    COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
    COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
    COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
    COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
    COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
    COMPANY_TEST_RESULT_FIELD_ID,
  ];
  return keys.some((key) => {
    const v = row[key];
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

/** Whether a deal row carries at least one non-empty sample field. */
export function dealHasSampleData(row: BitrixRow): boolean {
  const keys = [
    DEAL_SAMPLE_TRANSFER_FIELD_ID,
    DEAL_SAMPLE_TESTING_FIELD_ID,
    DEAL_SAMPLE_SENT_DATE_FIELD_ID,
    DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
    DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  ];
  return keys.some((key) => {
    const v = row[key];
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

interface CompanyParts {
  companyId: string;
  companyTitle: string;
  responsibleId?: string;
  productFamilies: string[];
  grades: SampleGrade[];
  quantities: SampleQuantity[];
  sentDatesMulti: string[];
  sentDatesSingle: string[];
  dealSentDates: string[];
  sampleIndicators: string[];
  processStatuses: string[];
  rawTestResult?: string;
  industry?: string;
  application?: string;
  hasStructured: boolean;
  hasLegacyOnly: boolean;
  issues: SampleDataIssue[];
}

function buildCompanyParts(
  row: BitrixRow,
  resolve: LabelResolver
): CompanyParts | null {
  const companyId = rowString(row, "ID");
  if (!companyId) return null;

  const rawTitle = rowString(row, "TITLE");
  const companyTitle = rawTitle ?? "Без названия";

  const issues: SampleDataIssue[] = [];
  if (!rawTitle) issues.push("missing_title");

  const responsibleId = rowString(row, "ASSIGNED_BY_ID");

  // Products: resolved «Тип продукта» enum.
  const productFamilies = dedupe(
    resolveValue(COMPANY_PRODUCT_TYPE_FIELD_ID, row[COMPANY_PRODUCT_TYPE_FIELD_ID], resolve) ?? []
  );

  // Grades: Gel/Sol mark fields + product families as weak fallback context.
  const grades: SampleGrade[] = [];
  for (const g of resolveValue(COMPANY_SAMPLES_GRADE_GEL_FIELD_ID, row[COMPANY_SAMPLES_GRADE_GEL_FIELD_ID], resolve) ?? []) {
    grades.push({ productFamily: PRODUCT_FAMILY_GEL, value: g });
  }
  for (const g of resolveValue(COMPANY_SAMPLES_GRADE_SOL_FIELD_ID, row[COMPANY_SAMPLES_GRADE_SOL_FIELD_ID], resolve) ?? []) {
    grades.push({ productFamily: PRODUCT_FAMILY_SOL, value: g });
  }

  // Quantities: keep Gel/Sol units separate; never sum unlike units.
  const quantities: SampleQuantity[] = [];
  const qtyGel = parseQuantity(row[COMPANY_SAMPLES_QTY_GEL_FIELD_ID]);
  if (qtyGel !== undefined) {
    quantities.push({ productFamily: PRODUCT_FAMILY_GEL, value: qtyGel, unit: COMPANY_SAMPLES_QTY_GEL_UNIT });
  }
  const qtySol = parseQuantity(row[COMPANY_SAMPLES_QTY_SOL_FIELD_ID]);
  if (qtySol !== undefined) {
    quantities.push({ productFamily: PRODUCT_FAMILY_SOL, value: qtySol, unit: COMPANY_SAMPLES_QTY_SOL_UNIT });
  }

  // Dates: two same-titled fields — preserve all, dedupe identical,
  // flag cross-field disagreement (never prefer one field).
  const sentDatesMulti = extractDates(row[COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]);
  const sentDatesSingle = extractDates(row[COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]);
  if (
    sentDatesMulti.length > 0 &&
    sentDatesSingle.length > 0 &&
    !sentDatesMulti.some((d) => sentDatesSingle.includes(d))
  ) {
    issues.push("dates_conflict_between_fields");
  }

  // Statuses / indicators from the «Образцы» enumeration.
  const rawStatuses = resolveValue(COMPANY_SAMPLES_FIELD_ID, row[COMPANY_SAMPLES_FIELD_ID], resolve) ?? [];
  const sampleIndicators: string[] = [];
  const processStatuses: string[] = [];
  for (const status of rawStatuses) {
    if (isSentIndicator(status) || isTestingStatus(status)) {
      sampleIndicators.push(status);
    } else {
      processStatuses.push(status);
    }
  }

  // Raw test result — preserved verbatim.
  const rawTestResult = rowString(row, COMPANY_TEST_RESULT_FIELD_ID);

  // Industry (crm_status → resolved label) and application.
  const industryRaw = resolveValue("INDUSTRY", row["INDUSTRY"], resolve);
  const industry = industryRaw?.[0];

  const appNew = rowString(row, COMPANY_APPLICATION_NEW_FIELD_ID);
  const appOld = rowString(row, COMPANY_APPLICATION_OLD_FIELD_ID);
  let application = appNew ?? appOld;
  if (appNew && appOld && appNew !== appOld) {
    issues.push("application_fields_differ");
  }
  const directions = resolveValue(COMPANY_DIRECTION_FIELD_ID, row[COMPANY_DIRECTION_FIELD_ID], resolve) ?? [];
  if (!application && directions.length > 0) {
    application = directions.join(", ");
  }

  const hasStructured =
    grades.length > 0 ||
    quantities.length > 0 ||
    sentDatesMulti.length > 0 ||
    sentDatesSingle.length > 0 ||
    productFamilies.length > 0;
  const hasLegacyOnly =
    !hasStructured && (rawStatuses.length > 0 || rawTestResult !== undefined);

  return {
    companyId,
    companyTitle,
    responsibleId,
    productFamilies,
    grades,
    quantities,
    sentDatesMulti,
    sentDatesSingle,
    dealSentDates: [],
    sampleIndicators,
    processStatuses,
    rawTestResult,
    industry,
    application,
    hasStructured,
    hasLegacyOnly,
    issues,
  };
}

function dealStageId(row: BitrixRow): string | undefined {
  const v = rowString(row, "STAGE_ID") ?? rowString(row, "stageId");
  return v || undefined;
}

function buildRelatedDeal(row: BitrixRow, resolve: LabelResolver): RelatedDealSampleInfo | null {
  const id = rowString(row, "ID");
  if (!id) return null;
  const title = rowString(row, "TITLE") ?? "Без названия";

  const transfer = resolveValue(DEAL_SAMPLE_TRANSFER_FIELD_ID, row[DEAL_SAMPLE_TRANSFER_FIELD_ID], resolve);
  const testing = resolveValue(DEAL_SAMPLE_TESTING_FIELD_ID, row[DEAL_SAMPLE_TESTING_FIELD_ID], resolve) ?? [];
  const sentDate = extractDates(row[DEAL_SAMPLE_SENT_DATE_FIELD_ID])[0];

  return {
    id,
    title,
    stageId: dealStageId(row),
    sampleTransferStatus: transfer?.[0],
    sampleTestingStatus: testing,
    sampleSentDate: sentDate,
    markVolume: rowString(row, DEAL_SAMPLE_MARK_VOLUME_FIELD_ID),
    tvlDetails: rowString(row, DEAL_SAMPLE_TVL_DETAILS_FIELD_ID),
  };
}

/**
 * Classify per-product evidence for the mixed/positive/negative split.
 * Bitrix v1 keeps results at Company level, so per-product outcomes are
 * only provable via deal testing statuses naming a product family
 * (e.g. «Испытание Гель» / «Золь — положительно»). Everything else is
 * global evidence and handled by normalizeResult directly.
 */
function collectPerProductEvidence(
  statuses: string[]
): { evidence: Evidence[]; globalStatuses: string[] } {
  const evidence: Evidence[] = [];
  const globalStatuses: string[] = [];
  for (const status of statuses) {
    let matched: NormalizedResult | null = null;
    let family: string | null = null;
    for (const candidate of [PRODUCT_FAMILY_GEL, PRODUCT_FAMILY_SOL]) {
      if (status.toLowerCase().includes(candidate.toLowerCase())) {
        family = candidate;
        break;
      }
    }
    if (family) {
      matched = normalizeResult(status, []);
      if (matched !== "unknown") {
        evidence.push({ productFamily: family, result: matched });
        continue;
      }
    }
    globalStatuses.push(status);
  }
  return { evidence, globalStatuses };
}

/**
 * Join companies with sample-active deals by Company ID and emit
 * at most one SampleSummary per company. Deals without a company are
 * reported through the returned orphan list (never silently dropped).
 */
export function buildSampleSummaries(
  companies: BitrixRow[],
  deals: BitrixRow[],
  options: AggregateOptions & { labelResolver?: LabelResolver } = {}
): { summaries: SampleSummary[]; orphanDeals: BitrixRow[] } {
  const resolve = options.labelResolver ?? identityLabelResolver;
  const userNames = options.userNames ?? {};

  const dealsByCompany = new Map<string, BitrixRow[]>();
  const orphanDeals: BitrixRow[] = [];

  for (const deal of deals) {
    if (!dealHasSampleData(deal)) continue;
    const rawCompanyId = rowString(deal, "COMPANY_ID");
    if (!rawCompanyId || rawCompanyId === "0") {
      orphanDeals.push(deal);
      continue;
    }
    const list = dealsByCompany.get(rawCompanyId);
    if (list) list.push(deal);
    else dealsByCompany.set(rawCompanyId, [deal]);
  }

  const summaries: SampleSummary[] = [];
  const seenCompanyIds = new Set<string>();

  for (const company of companies) {
    const parts = buildCompanyParts(company, resolve);
    if (!parts) continue;

    // Company-level dedupe: authoritative ID wins; first row kept.
    if (seenCompanyIds.has(parts.companyId)) continue;

    const relatedDeals: RelatedDealSampleInfo[] = [];
    const companyDeals = dealsByCompany.get(parts.companyId) ?? [];

    // A company enters the dataset when IT has sample activity OR any of its
    // deals carries sample data (scenarios 5/13: deal-side status with
    // incomplete company fields must still surface).
    const hasOwnActivity = hasSampleActivity(company);
    if (!hasOwnActivity && companyDeals.length === 0) continue;
    seenCompanyIds.add(parts.companyId);

    const seenDealIds = new Set<string>();
    for (const deal of companyDeals) {
      const info = buildRelatedDeal(deal, resolve);
      if (!info || seenDealIds.has(info.id)) continue;
      seenDealIds.add(info.id);
      relatedDeals.push(info);
    }

    // Collect per-product evidence from deal testing statuses.
    const dealStatuses = relatedDeals.flatMap((d) => d.sampleTestingStatus);
    const { evidence, globalStatuses } = collectPerProductEvidence(dealStatuses);

    const normalized = normalizeResult(parts.rawTestResult, evidence);

    // Deal sent dates enrich company sent dates (still one primary row).
    const dealDates = relatedDeals
      .map((d) => d.sampleSentDate)
      .filter((d): d is string => Boolean(d));
    const sentDates = dedupe([
      ...parts.sentDatesMulti,
      ...parts.sentDatesSingle,
      ...dealDates,
    ]);

    const processStatuses = dedupe([
      ...parts.processStatuses,
      ...globalStatuses,
    ]);
    const sampleIndicators = dedupe(parts.sampleIndicators);

    const gradesWithoutItemResult = parts.grades.length > 1 && parts.rawTestResult !== undefined;
    if (gradesWithoutItemResult) {
      parts.issues.push("grades_without_item_result");
    }
    if (parts.productFamilies.length > 1 && parts.rawTestResult !== undefined && parts.grades.length === 0) {
      parts.issues.push("products_without_item_result");
    }
    if (
      parts.productFamilies.length === 0 &&
      parts.grades.length === 0 &&
      (sampleIndicators.length > 0 || parts.rawTestResult !== undefined)
    ) {
      parts.issues.push("missing_product");
    }

    const latestRelevantDate = sentDates.length > 0
      ? sentDates.reduce((a, b) => (a > b ? a : b))
      : undefined;

    const quality = computeSourceQuality({
      hasStructuredFields: parts.hasStructured || dealDates.length > 0,
      hasLegacyOnly: parts.hasLegacyOnly,
      hasConflictingEvidence: normalized === "mixed",
    });

    const responsibleName = parts.responsibleId
      ? userNames[parts.responsibleId]
      : undefined;

    summaries.push({
      companyId: parts.companyId,
      companyTitle: parts.companyTitle,
      responsibleId: parts.responsibleId,
      responsibleName,
      productFamilies: parts.productFamilies,
      grades: parts.grades,
      quantities: parts.quantities,
      sentDates,
      sampleIndicators,
      processStatuses,
      rawTestResult: parts.rawTestResult,
      normalizedResult: normalized,
      industry: parts.industry,
      application: parts.application,
      relatedDeals,
      latestRelevantDate,
      sourceQuality: quality,
      dataIssues: parts.issues,
    });
  }

  return { summaries, orphanDeals };
}

/** KPI derivation over a (filtered) SampleSummary set — company grain. */
export function computeSampleKpis(summaries: SampleSummary[]): {
  total: number;
  withSentDates: number;
  inTesting: number;
  withResult: number;
  positive: number;
  negative: number;
  rework: number;
  ambiguous: number;
} {
  const total = summaries.length;
  const withSentDates = summaries.filter((s) => s.sentDates.length > 0).length;
  const inTesting = summaries.filter(
    (s) =>
      s.normalizedResult === "pending" ||
      s.processStatuses.some((st) => isTestingStatus(st)) ||
      s.sampleIndicators.some((st) => isTestingStatus(st)) ||
      s.relatedDeals.some((d) => d.sampleTestingStatus.some(isTestingStatus))
  ).length;
  const withResult = summaries.filter((s) =>
    ["positive", "negative", "rework", "mixed"].includes(s.normalizedResult)
  ).length;
  const positive = summaries.filter((s) => s.normalizedResult === "positive").length;
  const negative = summaries.filter((s) => s.normalizedResult === "negative").length;
  const rework = summaries.filter((s) => s.normalizedResult === "rework").length;
  const ambiguous = summaries.filter((s) => s.sourceQuality === "ambiguous").length;
  return { total, withSentDates, inTesting, withResult, positive, negative, rework, ambiguous };
}
