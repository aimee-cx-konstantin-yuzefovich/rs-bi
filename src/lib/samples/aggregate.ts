// src/lib/samples/aggregate.ts
// ─────────────────────────────────────────────────────────────────────
// Samples Domain Orchestration (Phase B + Phase C)
//
// ONE CANONICAL SAMPLE ENGINE for Samples / Commercial Funnel / Managers
// / Excel. Commercial Funnel consumes this domain; it must not keep a
// second parser.
//
// Pipeline:
// 1. Adapt Bitrix Companies via adaptLegacyCompanySampleEvidence
// 2. Adapt Bitrix Deals via adaptLegacyDealSampleEvidence
// 3. Adapt Smart Process items via adaptSmartProcessSampleEvidence
// 4. Separate orphan deals / orphan SP items (missing/zero COMPANY_ID)
// 5. Group evidence units by authoritative Company ID
// 6. Reconcile evidence via reconcileCompanySample (history preservation,
//    current-state resolution SMART_PROCESS→DEAL→COMPANY→NONE,
//    marker isolation)
// 7. Project to SampleSummary via projectCanonicalCompanyToSummary
//
// Invariants:
// - 1 Company ⇒ at most 1 primary SampleSummary (deals/items nested);
// - multiplicity preserved: products, grades, quantities, dates, deals;
// - no fake physical cycle synthesis from parallel arrays;
// - Deal testing marker (UF_CRM_1779394379) isolated as navigation marker;
// - Smart Process is authoritative for new/current sample cycles;
// - SP-only companies appear even without legacy sample fields;
// - source provenance and granularity explicit;
// - aggregate data-quality counts are sanitized (no customer names).
// ─────────────────────────────────────────────────────────────────────

import type {
  BitrixRow,
  LabelResolver,
  SampleEvidenceUnit,
  SampleSummary,
} from "./types";
import type { CanonicalCompanySample } from "./model";
import {
  adaptLegacyCompanySampleEvidence,
  hasCompanySampleActivity,
} from "./adapters/company-legacy";
import {
  adaptLegacyDealSampleEvidence,
  dealHasSampleData,
} from "./adapters/deal-legacy";
import { adaptSmartProcessSampleEvidence } from "./adapters/smart-process";
import { reconcileCompanySample } from "./reconcile";
import { projectCanonicalCompanyToSummary } from "./project";
import { buildSmartProcessItemViews } from "./smart-process-view";
import { identityLabelResolver, isSentinelValue, isTestingStatus } from "./normalize";

export { hasCompanySampleActivity as hasSampleActivity, dealHasSampleData };

export interface AggregateOptions {
  /** Current user-name map for responsible display. */
  userNames?: Record<string, string>;
  /** Field-metadata label resolver (raw enum ID → RU label). */
  labelResolver?: LabelResolver;
  /**
   * Live Smart Process stage directory labels (crm.status.list NAME per
   * committed stage ID). Display-only: never affects semantics.
   */
  liveStageLabels?: Record<string, string>;
  /**
   * Optional authoritative Deal → COMPANY_ID relation map (built by the ONE
   * shared company-scope seam in smart-process-service.ts from ALL Deal IDs
   * referenced by candidate SP items, including foreign-linked deals needed
   * for conflict detection). When provided it is overlaid onto the locally
   * derived map (authoritative entries win) so scoped loads can never detect
   * conflicts from an incomplete Deal→Company map. Omitted → the full-scope
   * semantics are unchanged (map derived from the passed Deal rows only).
   */
  authoritativeDealCompanyById?: ReadonlyMap<string, string>;
}

/** Sanitized aggregate data-quality counts for the Smart Process source. */
export interface SmartProcessQualityCounts {
  /** SP items without any company relation. */
  orphanSmartProcessItemCount: number;
  /** SP items whose direct Company relation conflicts with the linked Deal's COMPANY_ID. */
  relationConflictCount: number;
  /** SP items in sent-or-later stages without a manual «Дата отправки». */
  sentStageWithoutDateCount: number;
  /** Companies with more than one active SP item. */
  multipleActiveCount: number;
  /** SP items whose terminal stage conflicts with the explicit result. */
  stageResultConflictCount: number;
}

/** The one canonical sample domain consumed by all surfaces. */
export interface CanonicalSampleDomain {
  /** Canonical per-company aggregate keyed by Company ID. */
  canonicalByCompany: Map<string, CanonicalCompanySample>;
  /** Raw orphan deals (sample data, no valid company). */
  orphanDeals: BitrixRow[];
  /** Raw orphan SP items (no valid company relation). */
  orphanSmartProcessItems: BitrixRow[];
  qualityCounts: SmartProcessQualityCounts;
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
 * ONE canonical sample domain builder:
 * Bitrix Company rows + sample-active Deal rows + Smart Process 1032 items
 * → per-company CanonicalCompanySample map + sanitized quality counts.
 *
 * Commercial Funnel, Managers, Excel and the Samples UI all consume this
 * same domain. No surface re-parses raw fields for current state.
 */
export function buildCanonicalSampleDomain(
  companies: BitrixRow[],
  deals: BitrixRow[],
  smartProcessItems: BitrixRow[],
  options: AggregateOptions = {}
): CanonicalSampleDomain {
  const resolve = options.labelResolver ?? identityLabelResolver;

  // 1. Deal → COMPANY_ID map for SP relation verification (no N+1).
  // An authoritative map (scoped loads) overlays the locally derived one:
  // authoritative entries win, so relation-conflict detection never runs on
  // an incomplete map. Full-scope callers omit it → identical semantics.
  const dealCompanyById = new Map<string, string>();
  for (const deal of deals) {
    const dealId = rowString(deal, "ID");
    const companyId = rowString(deal, "COMPANY_ID");
    if (dealId && companyId && companyId !== "0") {
      dealCompanyById.set(dealId, companyId);
    }
  }
  if (options.authoritativeDealCompanyById) {
    for (const [dealId, companyId] of options.authoritativeDealCompanyById) {
      if (dealId && companyId && companyId !== "0") {
        dealCompanyById.set(dealId, companyId);
      }
    }
  }

  // 2. Adapt and partition deals
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

  // 3. Adapt and partition Smart Process items
  const spByCompany = new Map<string, SampleEvidenceUnit[]>();
  const orphanSmartProcessItems: BitrixRow[] = [];
  const qualityCounts: SmartProcessQualityCounts = {
    orphanSmartProcessItemCount: 0,
    relationConflictCount: 0,
    sentStageWithoutDateCount: 0,
    multipleActiveCount: 0,
    stageResultConflictCount: 0,
  };

  for (const item of smartProcessItems) {
    const adapted = adaptSmartProcessSampleEvidence(item, resolve, { dealCompanyById });
    if (!adapted) continue;

    // Sanitized aggregate issue counting (no customer names anywhere).
    for (const issue of adapted.issues) {
      if (issue === "smart_process_orphan_item") qualityCounts.orphanSmartProcessItemCount++;
      else if (issue === "smart_process_relation_conflict") qualityCounts.relationConflictCount++;
      else if (issue === "smart_process_missing_sent_date") qualityCounts.sentStageWithoutDateCount++;
      else if (issue === "smart_process_stage_result_conflict") qualityCounts.stageResultConflictCount++;
    }

    if (!adapted.companyId) {
      orphanSmartProcessItems.push(item);
      continue;
    }

    const existing = spByCompany.get(adapted.companyId);
    if (existing) {
      existing.push(adapted);
    } else {
      spByCompany.set(adapted.companyId, [adapted]);
    }
  }

  // 4. Company ID → raw row map (for SP-only company discovery)
  const companyRowById = new Map<string, BitrixRow>();
  for (const company of companies) {
    const id = rowString(company, "ID");
    if (id && !companyRowById.has(id)) companyRowById.set(id, company);
  }

  // 5. Reconcile per company (all companies with any evidence, including SP-only)
  const canonicalByCompany = new Map<string, CanonicalCompanySample>();

  const reconcileOne = (
    companyId: string,
    companyRow: BitrixRow | undefined
  ): CanonicalCompanySample => {
    const companyDeals = dealsByCompany.get(companyId) ?? [];
    const companySp = spByCompany.get(companyId) ?? [];
    const hasOwnActivity = companyRow ? hasCompanySampleActivity(companyRow) : false;
    const companyEvidence = companyRow && hasOwnActivity
      ? adaptLegacyCompanySampleEvidence(companyRow, resolve)
      : null;

    const canonical = reconcileCompanySample({
      companyId,
      companyTitle: (companyRow ? rowString(companyRow, "TITLE") : undefined) ?? "Без названия",
      companyResponsibleId: companyRow ? rowString(companyRow, "ASSIGNED_BY_ID") : undefined,
      companyEvidence,
      dealEvidences: companyDeals,
      smartProcessEvidences: companySp,
    });

    if (canonical.currentState.quality === "AMBIGUOUS_MULTIPLE_ACTIVE") {
      qualityCounts.multipleActiveCount++;
    }

    return canonical;
  };

  // 5a. All known companies with legacy and/or SP evidence.
  for (const company of companies) {
    const rawCompanyId = rowString(company, "ID");
    if (!rawCompanyId) continue;
    if (canonicalByCompany.has(rawCompanyId)) continue; // authoritative first row wins

    const hasOwnActivity = hasCompanySampleActivity(company);
    const companyDeals = dealsByCompany.get(rawCompanyId) ?? [];
    const companySp = spByCompany.get(rawCompanyId) ?? [];

    // Company enters dataset if it has sample activity, sample deals,
    // or Smart Process items (SP-only companies MUST appear).
    if (!hasOwnActivity && companyDeals.length === 0 && companySp.length === 0) continue;

    canonicalByCompany.set(rawCompanyId, reconcileOne(rawCompanyId, company));
  }

  // 5b. SP-only companies not present in the Company fetch scope
  // (defensive: normally SP companyId ⊆ companies; if a company row is
  // missing, the SP evidence still surfaces with the known ID).
  for (const [companyId, spUnits] of spByCompany) {
    if (canonicalByCompany.has(companyId)) continue;
    canonicalByCompany.set(companyId, reconcileOne(companyId, companyRowById.get(companyId)));
  }

  return {
    canonicalByCompany,
    orphanDeals,
    orphanSmartProcessItems,
    qualityCounts,
  };
}

/**
 * Backward-compatible orchestrator (Phase B contract): returns summaries
 * projected from the canonical domain. Samples UI / API / Excel consume
 * this; no separate parsing anywhere.
 */
export function buildSampleSummaries(
  companies: BitrixRow[],
  deals: BitrixRow[],
  smartProcessItems: BitrixRow[],
  options: AggregateOptions & { labelResolver?: LabelResolver } = {}
): { summaries: SampleSummary[]; orphanDeals: BitrixRow[]; qualityCounts: SmartProcessQualityCounts } {
  const domain = buildCanonicalSampleDomain(companies, deals, smartProcessItems, options);

  const summaries: SampleSummary[] = [];
  for (const canonical of domain.canonicalByCompany.values()) {
    const summary = projectCanonicalCompanyToSummary(canonical, options.userNames);
    if (options.liveStageLabels) {
      // Re-derive SP views with live display labels for the physical-cycle
      // extension (display-only; semantics stay stage-ID based).
      const liveViews = buildSmartProcessItemViews(canonical.evidenceUnits, {
        liveStageLabels: options.liveStageLabels,
      });
      summary.smartProcessItems = liveViews.map((v) => ({
        processItemId: v.processItemId,
        title: v.title,
        companyId: v.companyId,
        ...(v.linkedDealId ? { linkedDealId: v.linkedDealId } : {}),
        ...(v.stageId ? { stageId: v.stageId } : {}),
        stageLabel: v.stageLabel,
        isActive: v.isActive,
        isTerminal: v.isTerminal,
        ...(v.responsibleId ? { responsibleId: v.responsibleId } : {}),
        sentDates: v.sentDates,
        grades: v.grades,
        quantities: v.quantities,
        ...(v.rawTestResult ? { rawTestResult: v.rawTestResult } : {}),
        normalizedResult: v.normalizedResult,
        ...(v.createdTime ? { createdTime: v.createdTime } : {}),
        dataIssues: v.dataIssues,
      }));
      summary.currentActiveStageLabels = [
        ...new Set(liveViews.filter((v) => v.isActive).map((v) => v.stageLabel)),
      ];
    }
    summaries.push(summary);
  }

  // Deterministic ordering by company ID (numeric-aware).
  summaries.sort((a, b) => {
    const na = Number(a.companyId);
    const nb = Number(b.companyId);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.companyId.localeCompare(b.companyId);
  });

  return { summaries, orphanDeals: domain.orphanDeals, qualityCounts: domain.qualityCounts };
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
