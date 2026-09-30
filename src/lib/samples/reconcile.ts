// src/lib/samples/reconcile.ts
// ─────────────────────────────────────────────────────────────────────
// Pure reconciliation for Samples Phase B.
//
// Responsibilities:
// 1. Groups canonical evidence units by Company ID.
// 2. Strict separation between current-state resolution and historical
//    dated evidence.
// 3. Resolves current state via strict precedence:
//    DEAL_LEGACY → COMPANY_LEGACY → NONE
//    (with explicit AMBIGUOUS handling when multiple Deals conflict;
//    never guessing highest ID or latest date).
// 4. Isolates Deal testing marker (UF_CRM_1779394379) from analytical
//    state/result/KPIs while preserving transitional discoverability.
// 5. Preserves all historical sent dates regardless of which source won
//    current state.
// ─────────────────────────────────────────────────────────────────────

import type {
  CanonicalCompanySample,
  CurrentStateResolution,
  NormalizedResult,
  SampleDataIssue,
  SampleEvidenceUnit,
  SampleSentEvidence,
} from "./model";
import { computeSourceQuality, dedupe, normalizeResult } from "./normalize";

export interface ReconcileCompanyInput {
  companyId: string;
  companyTitle: string;
  companyResponsibleId?: string;
  companyEvidence: SampleEvidenceUnit | null;
  dealEvidences: SampleEvidenceUnit[];
}

/**
 * Reconciles current state across legacy Deal candidates and Company evidence.
 *
 * Precedence:
 * DEAL_LEGACY → COMPANY_LEGACY → NONE
 *
 * Invariant: Never guess highest Deal ID or latest modification date.
 * If multiple Deals provide competing state evidence, mark as AMBIGUOUS.
 */
function resolveCurrentState(
  companyEvidence: SampleEvidenceUnit | null,
  dealEvidences: SampleEvidenceUnit[]
): CurrentStateResolution {
  // Only deals with active status evidence count as state candidates.
  // Marker-only deals (navigationMarkerPresent = true) do NOT count as state evidence.
  const activeDealCandidates = dealEvidences.filter(
    (d) => d.statusEvidence.length > 0
  );

  if (activeDealCandidates.length === 1) {
    const winning = activeDealCandidates[0];
    return {
      source: "DEAL_LEGACY",
      quality: "RESOLVED",
      evidenceId: winning.id,
      winningDealId: winning.dealId,
      statusValues: winning.statusEvidence,
      normalizedResult: winning.normalizedResult ?? "unknown",
    };
  }

  if (activeDealCandidates.length > 1) {
    // Check if the deal candidates agree on status
    const allStatuses = dedupe(activeDealCandidates.flatMap((d) => d.statusEvidence));
    const firstSet = new Set(activeDealCandidates[0].statusEvidence.map((s) => s.toLowerCase()));
    const allAgree = activeDealCandidates.every(
      (d) =>
        d.statusEvidence.length === firstSet.size &&
        d.statusEvidence.every((s) => firstSet.has(s.toLowerCase()))
    );

    if (allAgree) {
      return {
        source: "DEAL_LEGACY",
        quality: "RESOLVED",
        evidenceId: activeDealCandidates[0].id,
        winningDealId: activeDealCandidates[0].dealId,
        statusValues: allStatuses,
        normalizedResult: "unknown",
      };
    }

    // Conflicting deals: strictly AMBIGUOUS, never guess highest Deal ID
    return {
      source: "DEAL_LEGACY",
      quality: "AMBIGUOUS",
      statusValues: allStatuses,
      normalizedResult: "unknown",
      reason: "Multiple legacy deals with conflicting sample status evidence",
    };
  }

  // Fallback to Company legacy evidence
  if (companyEvidence) {
    const hasStatus = companyEvidence.statusEvidence.length > 0;
    const hasResult = Boolean(companyEvidence.rawTestResult);

    if (hasStatus || hasResult) {
      return {
        source: "COMPANY_LEGACY",
        quality: "RESOLVED",
        evidenceId: companyEvidence.id,
        statusValues: companyEvidence.statusEvidence,
        normalizedResult: companyEvidence.normalizedResult ?? "unknown",
      };
    }
  }

  return {
    source: "NONE",
    quality: "NONE",
    statusValues: [],
    normalizedResult: "unknown",
  };
}

/**
 * Pure function: reconciles all evidence units for a single Company
 * into a CanonicalCompanySample.
 */
export function reconcileCompanySample(
  input: ReconcileCompanyInput
): CanonicalCompanySample {
  const {
    companyId,
    companyTitle,
    companyResponsibleId,
    companyEvidence,
    dealEvidences,
  } = input;

  const allUnits: SampleEvidenceUnit[] = [];
  if (companyEvidence) allUnits.push(companyEvidence);
  allUnits.push(...dealEvidences);

  // 1. History preservation: collect all dated sent evidence from all sources
  const historicalSentDates: SampleSentEvidence[] = [];
  for (const unit of allUnits) {
    historicalSentDates.push(...unit.sentDates);
  }

  // 2. Current-state resolution
  const currentState = resolveCurrentState(companyEvidence, dealEvidences);

  // 3. Normalized result: company-level test result
  const rawTestResult = companyEvidence?.rawTestResult;
  const normalizedResult: NormalizedResult = companyEvidence?.normalizedResult ?? "unknown";

  // 4. Data issues aggregation
  const issues: SampleDataIssue[] = [];
  if (companyEvidence) {
    issues.push(...companyEvidence.issues);
  }
  for (const deal of dealEvidences) {
    for (const issue of deal.issues) {
      if (!issues.includes(issue)) {
        issues.push(issue);
      }
    }
  }
  if (currentState.quality === "AMBIGUOUS") {
    // Flag deal company status mismatch or ambiguous cycle if applicable
    if (!issues.includes("deal_company_status_mismatch")) {
      issues.push("deal_company_status_mismatch");
    }
  }

  // 5. Transitional discoverability check
  const hasMarkerOnlyDealActivity =
    !companyEvidence &&
    dealEvidences.length > 0 &&
    dealEvidences.every(
      (d) =>
        d.navigationMarkerPresent &&
        d.statusEvidence.length === 0 &&
        d.sentDates.length === 0
    );

  // 6. Source quality derivation
  const hasStructured =
    Boolean(companyEvidence && (
      companyEvidence.grades.length > 0 ||
      companyEvidence.quantities.length > 0 ||
      companyEvidence.productFamilies.length > 0
    )) || historicalSentDates.length > 0;

  const hasLegacyOnly =
    !hasStructured &&
    Boolean(
      (companyEvidence && (companyEvidence.statusEvidence.length > 0 || companyEvidence.rawTestResult)) ||
      dealEvidences.some((d) => d.statusEvidence.length > 0)
    );

  const sourceQuality = computeSourceQuality({
    hasStructuredFields: hasStructured,
    hasLegacyOnly,
    hasConflictingEvidence: normalizedResult === "mixed" || currentState.quality === "AMBIGUOUS",
  });

  return {
    companyId,
    companyTitle,
    companyResponsibleId,
    evidenceUnits: allUnits,
    historicalSentDates,
    currentState,
    sourceQuality,
    dataIssues: issues,
    hasMarkerOnlyDealActivity,
  };
}
