// src/lib/samples/project.ts
// ─────────────────────────────────────────────────────────────────────
// Compatibility projector: CanonicalCompanySample → SampleSummary
//
// Ensures backward compatibility for the existing Samples UI, API route,
// KPI computations, and Excel exports.
//
// Invariants:
// 1. Emits the exact existing SampleSummary contract.
// 2. Sent dates deduplicated into a clean unique ISO list (same Company +
//    same calendar date collapses across Company/Deal/Smart Process
//    sources; internal provenance is retained on the canonical model).
// 3. Related deals preserved as nested context. Smart Process items are
//    NEVER emitted as fake deals — SP facts surface through current
//    status/result/responsible and SP-sourced sent dates.
// 4. Deal testing marker (UF_CRM_1779394379) isolated: preserved on
//    RelatedDealSampleInfo.sampleTestingStatus for raw preview inspection,
//    but strictly decoupled from processStatuses, normalizedResult,
//    and inTesting KPI.
// 5. Current status/result/responsible come from the canonical current
//    resolution (SMART_PROCESS → DEAL_LEGACY → COMPANY_LEGACY → NONE).
// ─────────────────────────────────────────────────────────────────────

import type { CanonicalCompanySample, SampleEvidenceUnit } from "./model";
import type { RelatedDealSampleInfo, SampleSummary } from "./types";
import { dedupe, isSentIndicator, isTestingStatus } from "./normalize";

export function projectCanonicalCompanyToSummary(
  canonical: CanonicalCompanySample,
  userNames?: Record<string, string>
): SampleSummary {
  const companyUnit = canonical.evidenceUnits.find(
    (u) => u.source === "COMPANY_LEGACY"
  );

  const dealUnits = canonical.evidenceUnits.filter(
    (u) => u.source === "DEAL_LEGACY" && Boolean(u.dealId)
  );

  // Reconstruct relatedDeals preserving exact deal provenance
  const seenDealIds = new Set<string>();
  const relatedDeals: RelatedDealSampleInfo[] = [];

  for (const deal of dealUnits) {
    if (!deal.dealId || seenDealIds.has(deal.dealId)) continue;
    seenDealIds.add(deal.dealId);

    relatedDeals.push({
      id: deal.dealId,
      title: deal.title ?? "Без названия",
      stageId: deal.stageId,
      sampleTransferStatus: deal.statusEvidence[0],
      // Verbatim navigation marker preserved for preview drawer inspection only
      sampleTestingStatus: deal.navigationMarkerValues ?? [],
      sampleSentDate: deal.sentDates[0]?.date,
      markVolume: deal.markVolume,
      tvlDetails: deal.tvlDetails,
    });
  }

  // Deduplicate historical sent dates across all sources into unique list
  const sentDates = dedupe(canonical.historicalSentDates.map((s) => s.date));

  // ── Canonical current-state facts ──
  // SP current item wins current status/result/responsible where it
  // provides the fact; legacy never overrides it.
  const spCurrentUnit: SampleEvidenceUnit | undefined =
    canonical.currentState.source === "SMART_PROCESS" &&
    canonical.currentState.quality === "RESOLVED"
      ? canonical.evidenceUnits.find(
          (u) => u.source === "SMART_PROCESS" && u.processItemId === canonical.currentState.processItemId
        )
      : undefined;

  // Partition company statuses into indicators vs process statuses
  const companyStatuses = companyUnit?.statusEvidence ?? [];
  const sampleIndicators: string[] = [];
  const companyProcessStatuses: string[] = [];
  for (const status of companyStatuses) {
    if (isSentIndicator(status) || isTestingStatus(status)) {
      sampleIndicators.push(status);
    } else {
      companyProcessStatuses.push(status);
    }
  }

  // Deal transfer statuses contribute to processStatuses
  // (DEAL_SAMPLE_TESTING_FIELD_ID is isolated and NOT in deal.statusEvidence)
  const dealStatuses = dealUnits.flatMap((d) => d.statusEvidence);
  const processStatuses = dedupe([...companyProcessStatuses, ...dealStatuses]);

  const latestRelevantDate =
    sentDates.length > 0
      ? sentDates.reduce((a, b) => (a > b ? a : b))
      : undefined;

  // Responsible: SP current item's own ASSIGNED_BY_ID wins (SP event
  // attribution never goes to the Company owner); else company owner.
  const currentResponsibleId = spCurrentUnit?.responsibleId ?? canonical.companyResponsibleId;
  const responsibleName = currentResponsibleId
    ? userNames?.[currentResponsibleId]
    : undefined;

  // Current status values: SP current item's stage label(s) when SP
  // resolved; otherwise legacy status evidence. Multiple-active SP
  // surfaces the joined distinct active labels (truthful ambiguity).
  const currentStatusValues =
    canonical.currentState.source === "SMART_PROCESS" && canonical.currentState.statusValues.length > 0
      ? canonical.currentState.statusValues
      : dedupe([...companyProcessStatuses, ...dealStatuses]);

  return {
    companyId: canonical.companyId,
    companyTitle: canonical.companyTitle,
    responsibleId: currentResponsibleId,
    responsibleName,
    productFamilies: companyUnit?.productFamilies ?? [],
    grades: spCurrentUnit?.grades.length ? spCurrentUnit.grades : (companyUnit?.grades ?? []),
    quantities: companyUnit?.quantities ?? [],
    sentDates,
    sampleIndicators: dedupe(sampleIndicators),
    processStatuses: currentStatusValues,
    rawTestResult: spCurrentUnit?.rawTestResult ?? companyUnit?.rawTestResult,
    normalizedResult: canonical.currentState.normalizedResult,
    industry: companyUnit?.industry,
    application: companyUnit?.application,
    relatedDeals,
    latestRelevantDate,
    sourceQuality: canonical.sourceQuality,
    dataIssues: canonical.dataIssues,
  };
}
