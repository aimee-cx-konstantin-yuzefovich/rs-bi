// src/lib/samples/adapters/deal-legacy.ts
// ─────────────────────────────────────────────────────────────────────
// Legacy Bitrix Deal row adapter.
//
// Extracts deal-level sample fields into a canonical SampleEvidenceUnit
// with explicit provenance (source = DEAL_LEGACY, granularity = DEAL_RECORD).
//
// Pure and immutable: never mutates input BitrixRow.
//
// CRITICAL INVARIANT:
// DEAL_SAMPLE_TESTING_FIELD_ID (UF_CRM_1779394379: «Тестирование образцов»)
// is authoritatively classified as an operational/navigation MARKER_ONLY.
// It sets navigationMarkerPresent = true for transitional discoverability,
// but is strictly isolated from statusEvidence, normalizedResult, sent
// events, and KPIs.
// ─────────────────────────────────────────────────────────────────────

import type {
  BitrixRow,
  LabelResolver,
  SampleDataIssue,
  SampleEvidenceUnit,
  SampleSentEvidence,
} from "../types";
import {
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
} from "../constants";
import { extractDates, isSentinelValue, resolveValue } from "../normalize";

function firstString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (isSentinelValue(value)) return undefined;
  const trimmed = value.trim();
  return trimmed !== "" ? trimmed : undefined;
}

function rowString(row: BitrixRow, key: string): string | undefined {
  return firstString(row[key]);
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
    if (isSentinelValue(v)) return false;
    if (Array.isArray(v)) return v.some((item) => !isSentinelValue(item));
    return true;
  });
}

export function dealStageId(row: BitrixRow): string | undefined {
  const v = rowString(row, "STAGE_ID") ?? rowString(row, "stageId");
  return v || undefined;
}

/**
 * Pure adapter: extracts deal-level sample evidence into a canonical
 * SampleEvidenceUnit. Does not mutate the Bitrix row.
 */
export function adaptLegacyDealSampleEvidence(
  row: BitrixRow,
  resolve: LabelResolver
): SampleEvidenceUnit | null {
  const dealId = rowString(row, "ID");
  if (!dealId) return null;

  const rawCompanyId = rowString(row, "COMPANY_ID");
  const companyId = rawCompanyId && rawCompanyId !== "0" ? rawCompanyId : "";

  const issues: SampleDataIssue[] = [];
  if (!companyId) {
    issues.push("deal_without_company");
  }

  const responsibleId = rowString(row, "ASSIGNED_BY_ID");

  // Transfer status evidence
  const transfer = resolveValue(DEAL_SAMPLE_TRANSFER_FIELD_ID, row[DEAL_SAMPLE_TRANSFER_FIELD_ID], resolve);
  const statusEvidence: string[] = transfer && transfer.length > 0 ? [transfer[0]] : [];

  // Sent date evidence
  const sentDateStrings = extractDates(row[DEAL_SAMPLE_SENT_DATE_FIELD_ID]);
  const sentDates: SampleSentEvidence[] = sentDateStrings.map((date) => ({
    date,
    source: "DEAL_LEGACY",
    sourceGranularity: "DEAL_RECORD",
    sourceEntityId: dealId,
    companyId,
    dealId,
  }));

  // Operational / navigation marker isolation
  // UF_CRM_1779394379 is MARKER_ONLY
  const rawMarker = resolveValue(DEAL_SAMPLE_TESTING_FIELD_ID, row[DEAL_SAMPLE_TESTING_FIELD_ID], resolve);
  const navigationMarkerPresent = Boolean(rawMarker && rawMarker.length > 0);
  const navigationMarkerValues = rawMarker && rawMarker.length > 0 ? rawMarker : undefined;

  // Verbatim text fields
  const markVolume = rowString(row, DEAL_SAMPLE_MARK_VOLUME_FIELD_ID);
  const tvlDetails = rowString(row, DEAL_SAMPLE_TVL_DETAILS_FIELD_ID);
  const title = rowString(row, "TITLE") ?? "Без названия";
  const stageId = dealStageId(row);

  return {
    id: `deal-${dealId}-record`,
    source: "DEAL_LEGACY",
    sourceGranularity: "DEAL_RECORD",
    sourceEntityId: dealId,
    companyId,
    dealId,
    responsibleId,
    title,
    stageId,
    productFamilies: [],
    grades: [],
    quantities: [],
    sentDates,
    statusEvidence,
    navigationMarkerPresent,
    navigationMarkerValues,
    markVolume,
    tvlDetails,
    issues,
  };
}
