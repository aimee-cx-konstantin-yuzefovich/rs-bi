// src/lib/samples/adapters/company-legacy.ts
// ─────────────────────────────────────────────────────────────────────
// Legacy Bitrix Company row adapter.
//
// Extracts aggregated historical company sample fields into a canonical
// SampleEvidenceUnit with explicit provenance (source = COMPANY_LEGACY,
// granularity = COMPANY_AGGREGATE).
//
// Pure and immutable: never mutates input BitrixRow.
// Never synthesizes parallel array correlations (no fake physical cycles).
// ─────────────────────────────────────────────────────────────────────

import type {
  BitrixRow,
  LabelResolver,
  SampleDataIssue,
  SampleEvidenceUnit,
  SampleGrade,
  SampleQuantity,
  SampleSentEvidence,
} from "../types";
import {
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
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
  PRODUCT_FAMILY_GEL,
  PRODUCT_FAMILY_SOL,
} from "../constants";
import {
  dedupe,
  extractDates,
  isGeographicValue,
  isSentinelValue,
  normalizeResult,
  parseQuantity,
  resolveValue,
} from "../normalize";

function firstString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (isSentinelValue(value)) return undefined;
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
export function hasCompanySampleActivity(row: BitrixRow): boolean {
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
    if (isSentinelValue(v)) return false;
    if (Array.isArray(v)) return v.some((item) => !isSentinelValue(item));
    return true;
  });
}

/**
 * Pure adapter: extracts company-level sample evidence into a canonical
 * SampleEvidenceUnit. Does not mutate the Bitrix row.
 */
export function adaptLegacyCompanySampleEvidence(
  row: BitrixRow,
  resolve: LabelResolver
): SampleEvidenceUnit | null {
  const companyId = rowString(row, "ID");
  if (!companyId) return null;

  const rawTitle = rowString(row, "TITLE");
  const issues: SampleDataIssue[] = [];
  if (!rawTitle) {
    issues.push("missing_title");
  }

  const responsibleId = rowString(row, "ASSIGNED_BY_ID");

  // Products: resolved «Тип продукта» enum
  const productFamilies = dedupe(
    resolveValue(COMPANY_PRODUCT_TYPE_FIELD_ID, row[COMPANY_PRODUCT_TYPE_FIELD_ID], resolve) ?? []
  );

  // Grades: Gel/Sol mark fields (product family bound by field semantics)
  const grades: SampleGrade[] = [];
  for (const g of resolveValue(COMPANY_SAMPLES_GRADE_GEL_FIELD_ID, row[COMPANY_SAMPLES_GRADE_GEL_FIELD_ID], resolve) ?? []) {
    grades.push({ productFamily: PRODUCT_FAMILY_GEL, value: g });
  }
  for (const g of resolveValue(COMPANY_SAMPLES_GRADE_SOL_FIELD_ID, row[COMPANY_SAMPLES_GRADE_SOL_FIELD_ID], resolve) ?? []) {
    grades.push({ productFamily: PRODUCT_FAMILY_SOL, value: g });
  }

  // Quantities: Gel/Sol units kept separate; never cross-summed
  const quantities: SampleQuantity[] = [];
  const qtyGel = parseQuantity(row[COMPANY_SAMPLES_QTY_GEL_FIELD_ID]);
  if (qtyGel !== undefined) {
    quantities.push({ productFamily: PRODUCT_FAMILY_GEL, value: qtyGel, unit: COMPANY_SAMPLES_QTY_GEL_UNIT });
  }
  const qtySol = parseQuantity(row[COMPANY_SAMPLES_QTY_SOL_FIELD_ID]);
  if (qtySol !== undefined) {
    quantities.push({ productFamily: PRODUCT_FAMILY_SOL, value: qtySol, unit: COMPANY_SAMPLES_QTY_SOL_UNIT });
  }

  // Dates: multi-date and single-date fields
  const sentDatesMulti = extractDates(row[COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]);
  const sentDatesSingle = extractDates(row[COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]);
  if (
    sentDatesMulti.length > 0 &&
    sentDatesSingle.length > 0 &&
    !sentDatesMulti.some((d) => sentDatesSingle.includes(d))
  ) {
    issues.push("dates_conflict_between_fields");
  }

  const uniqueDates = dedupe([...sentDatesMulti, ...sentDatesSingle]);
  const sentDates: SampleSentEvidence[] = uniqueDates.map((date) => ({
    date,
    source: "COMPANY_LEGACY",
    sourceGranularity: "COMPANY_AGGREGATE",
    sourceEntityId: companyId,
    companyId,
  }));

  // Statuses from «Образцы» enumeration
  const statusEvidence = resolveValue(COMPANY_SAMPLES_FIELD_ID, row[COMPANY_SAMPLES_FIELD_ID], resolve) ?? [];

  // Raw test result verbatim
  const rawTestResult = rowString(row, COMPANY_TEST_RESULT_FIELD_ID);
  const normalizedResult = normalizeResult(rawTestResult, []);

  // Industry and application
  // Current Industry: the user-approved Company-card field
  // «Отрасль (согл.список)» (UF_CRM_1784195884554) is the authoritative
  // CURRENT classification for the Samples registry/filter. Legacy
  // INDUSTRY (crm_status) and the retired «Отрасль (не использовать)»
  // (UF_CRM_6915D8C0C6814) never override it. Absent current field =
  // truthfully absent (no invented fallback).
  const industryCurrent = resolveValue(
    COMPANY_INDUSTRY_CURRENT_FIELD_ID,
    row[COMPANY_INDUSTRY_CURRENT_FIELD_ID],
    resolve
  )?.[0];
  const industry = industryCurrent;

  const appNewResolved = resolveValue(
    COMPANY_APPLICATION_NEW_FIELD_ID,
    row[COMPANY_APPLICATION_NEW_FIELD_ID],
    resolve
  )?.filter((a) => !isGeographicValue(a));
  const appOldResolved = resolveValue(
    COMPANY_APPLICATION_OLD_FIELD_ID,
    row[COMPANY_APPLICATION_OLD_FIELD_ID],
    resolve
  )?.filter((a) => !isGeographicValue(a));
  const appNew = appNewResolved && appNewResolved.length > 0 ? appNewResolved.join(", ") : undefined;
  const appOld = appOldResolved && appOldResolved.length > 0 ? appOldResolved.join(", ") : undefined;
  let application = appNew ?? appOld;
  if (appNew && appOld && appNew !== appOld) {
    issues.push("application_fields_differ");
  }
  const directions = (resolveValue(COMPANY_DIRECTION_FIELD_ID, row[COMPANY_DIRECTION_FIELD_ID], resolve) ?? [])
    .filter((d) => !isGeographicValue(d));
  if (!application && directions.length > 0) {
    application = directions.join(", ");
  }

  // Quality warnings
  if (grades.length > 1 && rawTestResult !== undefined) {
    issues.push("grades_without_item_result");
  }
  if (productFamilies.length > 1 && rawTestResult !== undefined && grades.length === 0) {
    issues.push("products_without_item_result");
  }
  if (
    productFamilies.length === 0 &&
    grades.length === 0 &&
    (statusEvidence.length > 0 || rawTestResult !== undefined)
  ) {
    issues.push("missing_product");
  }

  return {
    id: `company-${companyId}-aggregate`,
    source: "COMPANY_LEGACY",
    sourceGranularity: "COMPANY_AGGREGATE",
    sourceEntityId: companyId,
    companyId,
    responsibleId,
    productFamilies,
    grades,
    quantities,
    sentDates,
    statusEvidence,
    rawTestResult,
    normalizedResult,
    industry,
    application,
    issues,
  };
}
