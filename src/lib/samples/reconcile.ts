// src/lib/samples/reconcile.ts
// ─────────────────────────────────────────────────────────────────────
// Pure reconciliation for Samples (Phase B + Phase C).
//
// Responsibilities:
// 1. Groups canonical evidence units by Company ID.
// 2. Strict separation between current-state resolution and historical
//    dated evidence.
// 3. Resolves current state via strict precedence:
//    SMART_PROCESS → DEAL_LEGACY → COMPANY_LEGACY → NONE
//    (CURRENT STATE ONLY — history is never deleted or overridden).
// 4. Smart Process current-cycle selection (§16):
//    - exactly one ACTIVE item → current;
//    - more than one ACTIVE → AMBIGUOUS_MULTIPLE_ACTIVE (never largest
//      ID / updatedTime / API order);
//    - zero ACTIVE → latest TERMINAL by createdTime, stable item-ID
//      tie-break only on exact equality.
// 5. Isolates Deal testing marker (UF_CRM_1779394379) from analytical
//    state/result/KPIs while preserving transitional discoverability.
// 6. Preserves all historical sent dates from ALL sources regardless of
//    which source won current state.
// ─────────────────────────────────────────────────────────────────────

import type {
  CanonicalCompanySample,
  CurrentStateResolution,
  NormalizedResult,
  SampleDataIssue,
  SampleEvidenceUnit,
  SampleSentEvidence,
} from "./model";
import {
  isSmartProcessActiveUnit,
  isSmartProcessTerminalUnit,
} from "./adapters/smart-process";
import { computeSourceQuality, dedupe, normalizeResult } from "./normalize";

export interface ReconcileCompanyInput {
  companyId: string;
  companyTitle: string;
  companyResponsibleId?: string;
  companyEvidence: SampleEvidenceUnit | null;
  dealEvidences: SampleEvidenceUnit[];
  /** Smart Process evidence units attributed to this company. */
  smartProcessEvidences?: SampleEvidenceUnit[];
}

/** Stable ascending compare for SP item IDs (numeric-aware). */
function compareProcessItemIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

/**
 * Smart Process current-cycle selection (§16). Deterministic, never
 * order-dependent:
 * 1. exactly one ACTIVE item → that item;
 * 2. more than one ACTIVE → AMBIGUOUS_MULTIPLE_ACTIVE;
 * 3. zero ACTIVE → latest TERMINAL by createdTime (stable item-ID
 *    tie-break ONLY on exact createdTime equality; updatedTime is NEVER
 *    business chronology).
 */
export function selectSmartProcessCurrentItem(
  spUnits: SampleEvidenceUnit[]
): {
  current: SampleEvidenceUnit | null;
  quality: "RESOLVED" | "AMBIGUOUS_MULTIPLE_ACTIVE" | "NONE";
  ambiguousActiveIds?: string[];
  reason?: string;
} {
  if (spUnits.length === 0) {
    return { current: null, quality: "NONE" };
  }

  const active = spUnits.filter(isSmartProcessActiveUnit);

  if (active.length === 1) {
    return { current: active[0], quality: "RESOLVED" };
  }

  if (active.length > 1) {
    return {
      current: null,
      quality: "AMBIGUOUS_MULTIPLE_ACTIVE",
      ambiguousActiveIds: active
        .map((u) => u.processItemId ?? u.sourceEntityId)
        .sort(compareProcessItemIds),
      reason: "Multiple active Smart Process items — no arbitrary current cycle",
    };
  }

  // Zero active: latest terminal cycle by createdTime.
  const terminal = spUnits.filter(isSmartProcessTerminalUnit);
  if (terminal.length === 0) {
    // No active and no terminal SP items (e.g. unknown stages only):
    // no SP current state — fallback chain proceeds.
    return { current: null, quality: "NONE" };
  }

  let latest = terminal[0];
  for (let i = 1; i < terminal.length; i++) {
    const candidate = terminal[i];
    const candTime = candidate.createdTime ?? "";
    const bestTime = latest.createdTime ?? "";
    if (candTime > bestTime) {
      latest = candidate;
      continue;
    }
    if (candTime === bestTime && candTime !== "") {
      // Exact equality: stable item-ID tie-break only.
      const candId = candidate.processItemId ?? candidate.sourceEntityId;
      const bestId = latest.processItemId ?? latest.sourceEntityId;
      if (compareProcessItemIds(candId, bestId) > 0) {
        latest = candidate;
      }
    }
    // candTime < bestTime → keep latest.
  }
  return { current: latest, quality: "RESOLVED" };
}

/**
 * Reconciles current state across Smart Process, legacy Deal candidates
 * and Company evidence.
 *
 * Precedence (CURRENT STATE ONLY):
 * SMART_PROCESS → DEAL_LEGACY → COMPANY_LEGACY → NONE
 *
 * Invariants:
 * - Never guess highest Deal/Item ID or latest modification date.
 * - Multiple conflicting legacy Deals → AMBIGUOUS.
 * - Multiple active SP items → AMBIGUOUS_MULTIPLE_ACTIVE.
 * - Legacy evidence NEVER overrides a resolved SP current state.
 */
function resolveCurrentState(
  companyEvidence: SampleEvidenceUnit | null,
  dealEvidences: SampleEvidenceUnit[],
  spUnits: SampleEvidenceUnit[]
): { resolution: CurrentStateResolution; ambiguousActiveIds?: string[] } {
  // ── Tier 0: Smart Process (authoritative for current cycles) ──
  const spSelection = selectSmartProcessCurrentItem(spUnits);
  if (spSelection.quality === "AMBIGUOUS_MULTIPLE_ACTIVE") {
    // Truthful current status: joined distinct active-stage labels.
    const activeStatuses = dedupe(
      spUnits
        .filter(isSmartProcessActiveUnit)
        .flatMap((u) => u.statusEvidence)
    );
    return {
      resolution: {
        source: "SMART_PROCESS",
        quality: "AMBIGUOUS_MULTIPLE_ACTIVE",
        statusValues: activeStatuses,
        normalizedResult: "unknown",
        reason: spSelection.reason,
      },
      ambiguousActiveIds: spSelection.ambiguousActiveIds,
    };
  }
  if (spSelection.quality === "RESOLVED" && spSelection.current) {
    const current = spSelection.current;
    return {
      resolution: {
        source: "SMART_PROCESS",
        quality: "RESOLVED",
        evidenceId: current.id,
        processItemId: current.processItemId,
        winningDealId: current.linkedDealId,
        statusValues: current.statusEvidence,
        normalizedResult: current.normalizedResult ?? "unknown",
      },
    };
  }
  // spSelection.quality === "NONE" → fall through to legacy chain.

  // ── Tier 1: legacy Deal evidence ──
  // Only deals with active status evidence count as state candidates.
  // Marker-only deals (navigationMarkerPresent = true) do NOT count as state evidence.
  const activeDealCandidates = dealEvidences.filter(
    (d) => d.statusEvidence.length > 0
  );

  if (activeDealCandidates.length === 1) {
    const winning = activeDealCandidates[0];
    return {
      resolution: {
        source: "DEAL_LEGACY",
        quality: "RESOLVED",
        evidenceId: winning.id,
        winningDealId: winning.dealId,
        statusValues: winning.statusEvidence,
        normalizedResult: winning.normalizedResult ?? "unknown",
      },
    };
  }

  if (activeDealCandidates.length > 1) {
    // Dated-cycle selection: deals with factual sent dates form dated
    // cycles (same principle as SP createdTime). The latest factual sent
    // date wins; stable Deal ID tie-break ONLY on exact equality.
    // updatedTime/activityLast are NEVER business chronology.
    // Deals without sent dates are not dated cycles: if any dated deal
    // exists, undated deals never win (no date fabrication); if none is
    // dated, conflicting statuses stay strictly AMBIGUOUS.
    const dated = activeDealCandidates
      .filter((d) => d.sentDates.length > 0)
      .sort((a, b) => {
        const da = a.sentDates[a.sentDates.length - 1]?.date ?? "";
        const dbb = b.sentDates[b.sentDates.length - 1]?.date ?? "";
        if (da !== dbb) return da > dbb ? 1 : -1;
        // Exact equality: stable numeric-aware Deal ID tie-break.
        const na = Number(a.dealId);
        const nb = Number(b.dealId);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
        return String(a.dealId).localeCompare(String(b.dealId));
      });

    if (dated.length > 0) {
      const winning = dated[dated.length - 1];
      return {
        resolution: {
          source: "DEAL_LEGACY",
          quality: "RESOLVED",
          evidenceId: winning.id,
          winningDealId: winning.dealId,
          statusValues: winning.statusEvidence,
          normalizedResult: winning.normalizedResult ?? "unknown",
        },
      };
    }

    // No dated cycles: agreeing statuses resolve; conflicting statuses
    // are strictly AMBIGUOUS (never guess highest Deal ID).
    const allStatuses = dedupe(activeDealCandidates.flatMap((d) => d.statusEvidence));
    const firstSet = new Set(activeDealCandidates[0].statusEvidence.map((s) => s.toLowerCase()));
    const allAgree = activeDealCandidates.every(
      (d) =>
        d.statusEvidence.length === firstSet.size &&
        d.statusEvidence.every((s) => firstSet.has(s.toLowerCase()))
    );

    if (allAgree) {
      return {
        resolution: {
          source: "DEAL_LEGACY",
          quality: "RESOLVED",
          evidenceId: activeDealCandidates[0].id,
          winningDealId: activeDealCandidates[0].dealId,
          statusValues: allStatuses,
          normalizedResult: "unknown",
        },
      };
    }

    return {
      resolution: {
        source: "DEAL_LEGACY",
        quality: "AMBIGUOUS",
        statusValues: allStatuses,
        normalizedResult: "unknown",
        reason: "Multiple legacy deals with conflicting sample status evidence",
      },
    };
  }

  // ── Tier 2: Company legacy evidence ──
  if (companyEvidence) {
    const hasStatus = companyEvidence.statusEvidence.length > 0;
    const hasResult = Boolean(companyEvidence.rawTestResult);

    if (hasStatus || hasResult) {
      return {
        resolution: {
          source: "COMPANY_LEGACY",
          quality: "RESOLVED",
          evidenceId: companyEvidence.id,
          statusValues: companyEvidence.statusEvidence,
          normalizedResult: companyEvidence.normalizedResult ?? "unknown",
        },
      };
    }
  }

  return {
    resolution: {
      source: "NONE",
      quality: "NONE",
      statusValues: [],
      normalizedResult: "unknown",
    },
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
    smartProcessEvidences = [],
  } = input;

  const allUnits: SampleEvidenceUnit[] = [];
  if (companyEvidence) allUnits.push(companyEvidence);
  allUnits.push(...dealEvidences);
  allUnits.push(...smartProcessEvidences);

  // 1. History preservation: collect all dated sent evidence from ALL
  //    sources (Company + Deal + Smart Process). Current-state precedence
  //    never erases historical evidence.
  const historicalSentDates: SampleSentEvidence[] = [];
  for (const unit of allUnits) {
    historicalSentDates.push(...unit.sentDates);
  }

  // 2. Current-state resolution (SMART_PROCESS → DEAL → COMPANY → NONE)
  const { resolution: currentState, ambiguousActiveIds } = resolveCurrentState(
    companyEvidence,
    dealEvidences,
    smartProcessEvidences
  );

  // 3. Company-level test result: SP current result wins when present;
  //    otherwise legacy Company result. Legacy NEVER overrides SP.
  const spCurrent =
    currentState.source === "SMART_PROCESS" && currentState.quality === "RESOLVED"
      ? smartProcessEvidences.find(
          (u) => u.processItemId === currentState.processItemId
        )
      : undefined;
  const rawTestResult = spCurrent?.rawTestResult ?? companyEvidence?.rawTestResult;
  const normalizedResult: NormalizedResult =
    spCurrent?.normalizedResult ?? companyEvidence?.normalizedResult ?? "unknown";

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
  for (const sp of smartProcessEvidences) {
    for (const issue of sp.issues) {
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
  if (currentState.quality === "AMBIGUOUS_MULTIPLE_ACTIVE") {
    if (!issues.includes("smart_process_multiple_active")) {
      issues.push("smart_process_multiple_active");
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
    )) ||
    smartProcessEvidences.length > 0 ||
    historicalSentDates.length > 0;

  const hasLegacyOnly =
    !hasStructured &&
    Boolean(
      (companyEvidence && (companyEvidence.statusEvidence.length > 0 || companyEvidence.rawTestResult)) ||
      dealEvidences.some((d) => d.statusEvidence.length > 0)
    );

  const sourceQuality = computeSourceQuality({
    hasStructuredFields: hasStructured,
    hasLegacyOnly,
    hasConflictingEvidence:
      normalizedResult === "mixed" ||
      currentState.quality === "AMBIGUOUS" ||
      currentState.quality === "AMBIGUOUS_MULTIPLE_ACTIVE",
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
    ...(ambiguousActiveIds ? { ambiguousActiveProcessItemIds: ambiguousActiveIds } : {}),
  };
}
