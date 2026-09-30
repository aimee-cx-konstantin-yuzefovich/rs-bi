// src/lib/samples/aggregate.ts
// ─────────────────────────────────────────────────────────────────────
// Samples Domain Orchestration (Phase B)
//
// Pipeline:
// 1. Adapt Bitrix Companies via adaptLegacyCompanySampleEvidence
// 2. Adapt Bitrix Deals via adaptLegacyDealSampleEvidence
// 3. Separate orphan deals (missing/zero COMPANY_ID)
// 4. Group evidence units by authoritative Company ID
// 5. Reconcile evidence via reconcileCompanySample (history preservation,
//    current-state resolution, marker isolation)
// 6. Project to SampleSummary via projectCanonicalCompanyToSummary
//
// Invariants (Samples Phase B):
// - 1 Company ⇒ at most 1 primary SampleSummary (deals are nested context);
// - multiplicity preserved: products, grades, quantities, dates, deals;
// - no fake physical cycle synthesis from parallel arrays;
// - Deal testing marker (UF_CRM_1779394379) isolated as navigation marker;
// - source provenance and granularity explicit;
// - backward-compatible external contract.
// ─────────────────────────────────────────────────────────────────────

import type {
  BitrixRow,
  LabelResolver,
  SampleEvidenceUnit,
  SampleSummary,
} from "./types";
import {
  adaptLegacyCompanySampleEvidence,
  hasCompanySampleActivity,
} from "./adapters/company-legacy";
import {
  adaptLegacyDealSampleEvidence,
  dealHasSampleData,
} from "./adapters/deal-legacy";
import { reconcileCompanySample } from "./reconcile";
import { projectCanonicalCompanyToSummary } from "./project";
import { identityLabelResolver, isSentinelValue, isTestingStatus } from "./normalize";

export { hasCompanySampleActivity as hasSampleActivity, dealHasSampleData };

export interface AggregateOptions {
  /** Current user-name map for responsible display. */
  userNames?: Record<string, string>;
  /** Field-metadata label resolver (raw enum ID → RU label). */
  labelResolver?: LabelResolver;
}

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
 * Pure orchestration: Bitrix Company rows + sample-active Deal rows
 *   → SampleSummary[] joined by Company ID (authoritative identity).
 * Deals without a valid company are returned as orphanDeals (never dropped).
 */
export function buildSampleSummaries(
  companies: BitrixRow[],
  deals: BitrixRow[],
  options: AggregateOptions & { labelResolver?: LabelResolver } = {}
): { summaries: SampleSummary[]; orphanDeals: BitrixRow[] } {
  const resolve = options.labelResolver ?? identityLabelResolver;
  const userNames = options.userNames ?? {};

  // 1. Adapt and partition deals
  const dealsByCompany = new Map<string, SampleEvidenceUnit[]>();
  const orphanDeals: BitrixRow[] = [];

  for (const deal of deals) {
    if (!dealHasSampleData(deal)) continue;

    const rawCompanyId = rowString(deal, "COMPANY_ID");
    if (!rawCompanyId || rawCompanyId === "0") {
      orphanDeals.push(deal);
      continue;
    }

    const adaptedDeal = adaptLegacyDealSampleEvidence(deal, resolve);
    if (!adaptedDeal) continue;

    const existing = dealsByCompany.get(rawCompanyId);
    if (existing) {
      existing.push(adaptedDeal);
    } else {
      dealsByCompany.set(rawCompanyId, [adaptedDeal]);
    }
  }

  // 2. Reconcile and project each company
  const summaries: SampleSummary[] = [];
  const seenCompanyIds = new Set<string>();

  for (const company of companies) {
    const rawCompanyId = rowString(company, "ID");
    if (!rawCompanyId) continue;

    // Company-level deduplication: authoritative ID wins; first row kept
    if (seenCompanyIds.has(rawCompanyId)) continue;

    const companyDeals = dealsByCompany.get(rawCompanyId) ?? [];
    const hasOwnActivity = hasCompanySampleActivity(company);

    // Company enters dataset if it has sample activity OR any of its deals has sample data
    if (!hasOwnActivity && companyDeals.length === 0) continue;
    seenCompanyIds.add(rawCompanyId);

    const companyEvidence = hasOwnActivity
      ? adaptLegacyCompanySampleEvidence(company, resolve)
      : null;

    const rawTitle = rowString(company, "TITLE");
    const companyTitle = rawTitle ?? "Без названия";
    const companyResponsibleId = rowString(company, "ASSIGNED_BY_ID");

    const canonical = reconcileCompanySample({
      companyId: rawCompanyId,
      companyTitle,
      companyResponsibleId,
      companyEvidence,
      dealEvidences: companyDeals,
    });

    const summary = projectCanonicalCompanyToSummary(canonical, userNames);
    summaries.push(summary);
  }

  return { summaries, orphanDeals };
}

/**
 * KPI derivation over a (filtered) SampleSummary set — company grain.
 *
 * Invariant (Phase B):
 * DEAL_SAMPLE_TESTING_FIELD_ID (UF_CRM_1779394379: «Тестирование образцов»)
 * is classified as MARKER_ONLY. It does NOT count towards the inTesting KPI.
 */
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

  // inTesting: company has pending normalized result OR active testing status in indicators or process statuses
  // Marker-only deal testing statuses do not contribute here.
  const inTesting = summaries.filter(
    (s) =>
      s.normalizedResult === "pending" ||
      s.processStatuses.some((st) => isTestingStatus(st)) ||
      s.sampleIndicators.some((st) => isTestingStatus(st))
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
