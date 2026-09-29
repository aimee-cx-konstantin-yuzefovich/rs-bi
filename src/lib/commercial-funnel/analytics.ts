// src/lib/commercial-funnel/analytics.ts
// ─────────────────────────────────────────────────────────────────────
// Management Rebuild shared analytics for Commercial Funnel.
// ONE SOURCE OF TRUTH consumed by BOTH the UI tabs and the Excel report.
//
// Analytical model:
//   RAW / NORMALIZED DATA → FILTERED ANALYTICAL SLICE (page-level)
//   → THESE PURE FUNCTIONS → UI → EXCEL
//
// Invariants enforced here:
// - EVENT vs SNAPSHOT: period boundaries apply ONLY to dated events;
//   current WIP is never date-truncated.
// - NO fake conversion: snapshot ratios are never presented as conversion;
//   only counts with exact underlying company IDs.
// - Truthful absence: no reliable dated event → periodEventCount = null → "–".
// - Next actions: activityNext only (authoritative); never invented.
// - Multi-value dimensions: totals come from unique-ID unions, not row sums.
// ─────────────────────────────────────────────────────────────────────

import {
  INVOICE_SENT_STATUS_CODES,
  UNCLASSIFIED_LABEL,
  WIP_STATUS_KEYS,
} from "./constants";
import { evaluateStalledDeal } from "./bottlenecks";
import {
  computeBottlenecks,
  computePeriodMetrics,
  computeWipMetrics,
} from "./engine";
import {
  isDealActiveStage,
  isProgressedCommercialStage,
} from "./stage-utils";
import type {
  ActionPlanRow,
  BottleneckItem,
  CommercialCompany,
  CountedPopulation,
  FunnelCommercialView,
  FunnelContinuationLink,
  FunnelStageRow,
  FunnelView,
  ManagementSignal,
  PeriodBoundaries,
  SampleTestingSnapshotRow,
  SegmentBreakdown,
  SegmentCurrentMetrics,
  SegmentDimension,
  SegmentPeriodMetrics,
  SegmentRow,
} from "./types";

// ─────────────────────────────────────────────────────────────────────
// Small population helpers (exact-ID truth)
// ─────────────────────────────────────────────────────────────────────

/**
 * Deterministic ID ordering for analytical populations (HB contract):
 * numeric-aware ascending compare so business output never depends on
 * accidental Set/Map insertion order.
 */
export { compareCompanyIds } from "./analytics-helpers";

import { compareCompanyIds } from "./analytics-helpers";

function population(ids: Iterable<string>): CountedPopulation {
  const unique = Array.from(new Set(ids));
  unique.sort(compareCompanyIds);
  return { count: unique.length, companyIds: unique };
}

function emptyPopulation(): CountedPopulation {
  return { count: 0, companyIds: [] };
}

/** Companies currently in the sample/testing process (status not "—"). */
function isCompanyInSampleProcess(c: CommercialCompany): boolean {
  return Boolean(c.sampleStatus && c.sampleStatus !== "—");
}

/** Companies with ≥1 active (non-terminal) deal. */
function companyHasActiveDeal(c: CommercialCompany): boolean {
  return c.deals.some((d) => isDealActiveStage(d.stageId));
}

/**
 * «Компании в текущем контуре» — the truthful name for the former
 * "Активные компании" metric (Defect F fix).
 *
 * Documented population rule: a Company is in the current contour when it
 * has a current sample state (any non-"—" sampleStatus, from Deal or
 * Company provenance) and/or an active commercial Deal. No narrower or
 * broader business meaning is implied; the label states exactly this rule.
 */
export function isActivePortfolioCompany(c: CommercialCompany): boolean {
  return isCompanyInSampleProcess(c) || companyHasActiveDeal(c);
}

/** Companies with a deal awaiting payment (invoice sent statuses). */
export function companyAwaitingPaymentIds(
  companies: CommercialCompany[]
): string[] {
  const ids: string[] = [];
  for (const c of companies) {
    if (c.deals.some((d) => d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus))) {
      ids.push(c.id);
    }
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────
// Funnel view (Tab 2 — Воронка)
// ─────────────────────────────────────────────────────────────────────

/**
 * Builds the two-track funnel view by COMPOSING canonical engine outputs
 * (Defect A fix — no duplicated business rules):
 *   companies → computeWipMetrics + computePeriodMetrics → FunnelView
 * Track A: Samples & Testing — current snapshot per WIP stage from
 *          computeWipMetrics; period event count ONLY for
 *          "Образцы отправлены" (from the canonical samples_sent KPI).
 * Track B: Коммерциализация — current snapshot from computeWipMetrics
 *          (awaiting_payment) plus the active-deal population; period
 *          events and payment amounts/quality from computePeriodMetrics KPIs.
 */
export function computeFunnelView(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries
): FunnelView {
  // ── Canonical engine outputs (single source of truth) ──
  const wipKpis = computeWipMetrics(companies);
  const periodKpis = computePeriodMetrics(companies, boundaries);
  const findPeriod = (id: string) => periodKpis.find((k) => k.id === id);

  // ── Track A: current stage rows (canonical WIP output) ──
  const samplesSentKpi = findPeriod("samples_sent");
  const sampleTestingStages: FunnelStageRow[] = WIP_STATUS_KEYS.map((key) => {
    const wip = wipKpis.find((k) => k.id === key)!;
    // Period event: ONLY "Образцы отправлены" has a reliable dated event
    // (canonical samples_sent KPI provenance). All other stages: null → "–".
    const hasDatedEvent = key === "Образцы отправлены";
    return {
      id: key,
      label: key,
      companyCount: wip.companyCount,
      dealCount: wip.dealCount,
      companyIds: wip.companyIds,
      periodEventCount: hasDatedEvent ? samplesSentKpi?.currentValue ?? 0 : null,
      periodEventCompanyIds: hasDatedEvent ? samplesSentKpi?.companyIds ?? [] : null,
    };
  });

  // ── Track B: commercial current snapshot ──
  // Active-deal population: no canonical WIP KPI exposes this population;
  // derived here as a minimal projection (isDealActiveStage only — no new rule).
  const activeDealCompanyIds: string[] = [];
  let activeDealCount = 0;
  for (const c of companies) {
    let hasActive = false;
    for (const d of c.deals) {
      if (isDealActiveStage(d.stageId)) {
        hasActive = true;
        activeDealCount++;
      }
    }
    if (hasActive) activeDealCompanyIds.push(c.id);
  }

  const awaitingPaymentKpi = wipKpis.find((k) => k.id === "awaiting_payment")!;
  const current: FunnelCommercialView["current"] = {
    activeDeals: population(activeDealCompanyIds),
    dealCount: activeDealCount,
    awaitingPayment: {
      count: awaitingPaymentKpi.companyCount,
      companyIds: awaitingPaymentKpi.companyIds,
    },
    awaitingPaymentDealCount: awaitingPaymentKpi.dealCount,
  };

  // ── Track B: period events + payment amounts (canonical period KPIs) ──
  const dealsCreatedKpi = findPeriod("deals_created");
  const paymentsReceivedKpi = findPeriod("payments_received");
  const shipmentsKpi = findPeriod("shipments");
  const paymentAmountKpi = findPeriod("payment_amount");

  const period: FunnelCommercialView["period"] = {
    dealsCreated: {
      count: dealsCreatedKpi?.currentValue ?? 0,
      companyIds: dealsCreatedKpi?.companyIds ?? [],
    },
    paymentsReceived: {
      count: paymentsReceivedKpi?.currentValue ?? 0,
      companyIds: paymentsReceivedKpi?.companyIds ?? [],
    },
    paymentAmountsByCurrency: { ...(paymentAmountKpi?.currencyBreakdown?.current ?? {}) },
    paymentAmountQualityByCurrency: { ...(paymentAmountKpi?.currencyBreakdownQuality?.current ?? {}) },
    shipments: {
      count: shipmentsKpi?.currentValue ?? 0,
      companyIds: shipmentsKpi?.companyIds ?? [],
    },
  };

  // ── Continuation link (evidence, NOT conversion; no canonical source) ──
  const positiveIds: string[] = [];
  const continuationIds: string[] = [];
  for (const c of companies) {
    if (c.sampleStatus === "Подошли") {
      positiveIds.push(c.id);
      if (c.deals.some((d) => isProgressedCommercialStage(d.stageId))) {
        continuationIds.push(c.id);
      }
    }
  }

  const continuation: FunnelContinuationLink = {
    positiveResult: population(positiveIds),
    withCommercialContinuation: population(continuationIds),
  };

  return { sampleTestingStages, commercial: { current, period }, continuation };
}

// ─────────────────────────────────────────────────────────────────────
// Segments (Tab 3 — Сегменты)
// ─────────────────────────────────────────────────────────────────────

const MISSING_SEGMENT_LABEL = "Не указано";

/**
 * Extracts the dimension values of a company for the requested dimension.
 * Company-level dimension values are authoritative for segmentation
 * (the segment matrix answers "in which markets does the portfolio sit",
 * which is a property of the company, not of individual deals).
 */
function getCompanyDimensionValues(
  c: CommercialCompany,
  dimension: SegmentDimension
): string[] {
  if (dimension === "industry") {
    return c.industry ? [c.industry] : [];
  }
  if (dimension === "direction") {
    return (c.direction || []).filter(Boolean);
  }
  return (c.productType || []).filter(Boolean);
}

/**
 * EFFECTIVE SEGMENT PROVENANCE (Defect G fix).
 *
 * Global dimensional filters retain a Company when EITHER its factual
 * Company-level dimension matched OR a child Deal matched
 * (companyFactsIncluded === false means only the Deal path matched).
 * Reading raw factual fields alone would then place such a Company under a
 * factual value that the global filter excluded — the Segment view would
 * contradict the very filter that retained the Company.
 *
 * Contract:
 *   1. companyFactsIncluded !== false (Company matched the filter itself)
 *      → the Company's factual dimension values are used.
 *   2. companyFactsIncluded === false (retained only via matching Deals)
 *      → the union of the surviving (filtered) Deals' dimension values is
 *      used. Multi-value union semantics are explicit: a Company may appear
 *      in several rows, but the grand total counts unique companies once.
 *
 * Factual Company fields are NEVER mutated — this is a separate analytical
 * derivation. Company inclusion is unchanged from canonical filtering.
 */
export function getAnalyticalSegmentValues(
  c: CommercialCompany,
  dimension: SegmentDimension
): string[] {
  if (c.companyFactsIncluded !== false) {
    return getCompanyDimensionValues(c, dimension);
  }
  // Deal-retained slice: derive the effective segment from the surviving deals.
  const values = new Set<string>();
  for (const d of c.deals) {
    const dealValues =
      dimension === "industry"
        ? d.industry || []
        : dimension === "direction"
        ? d.direction || []
        : d.productType || [];
    for (const v of dealValues) {
      if (v) values.add(v);
    }
  }
  return Array.from(values);
}

/**
 * Builds the segment matrix for one dimension.
 * Missing values become "Не указано" (never silently omitted).
 * Every cell carries the exact underlying company IDs.
 * Итого = union of unique company IDs (NOT the sum of row counts).
 * boundaries: the EXACT canonical PeriodBoundaries used by Overview/Funnel/
 * Excel — never a synthetic adapter (Defect B fix: one time authority).
 */
export function computeSegmentBreakdown(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries,
  dimension: SegmentDimension
): SegmentBreakdown {
  // Group companies by dimension value (multi-valued dims → multiple rows)
  const byValue = new Map<string, CommercialCompany[]>();
  const missing: CommercialCompany[] = [];

  for (const c of companies) {
    const values = getAnalyticalSegmentValues(c, dimension);
    if (values.length === 0) {
      missing.push(c);
      continue;
    }
    for (const v of values) {
      const list = byValue.get(v);
      if (list) list.push(c);
      else byValue.set(v, [c]);
    }
  }

  const rows: SegmentRow[] = [];

  const buildRow = (label: string, isMissingValue: boolean, group: CommercialCompany[]): SegmentRow => ({
    label,
    isMissingValue,
    current: computeSegmentCurrentMetrics(group),
    period: computeSegmentPeriodMetrics(group, boundaries),
  });

  const sortedValues = Array.from(byValue.keys()).sort((a, b) => a.localeCompare(b, "ru"));
  for (const value of sortedValues) {
    rows.push(buildRow(value, false, byValue.get(value)!));
  }
  if (missing.length > 0) {
    rows.push(buildRow(MISSING_SEGMENT_LABEL, true, missing));
  }

  const isMultiValueDimension = dimension !== "industry";

  return {
    dimension,
    rows,
    totalUniqueCompanyIds: companies.map((c) => c.id),
    isMultiValueDimension,
  };
}

function computeSegmentCurrentMetrics(group: CommercialCompany[]): SegmentCurrentMetrics {
  const active: string[] = [];
  const requireSamples: string[] = [];
  const samplesSent: string[] = [];
  const inTesting: string[] = [];
  const passed: string[] = [];
  const failed: string[] = [];
  const rework: string[] = [];
  const activeDeals: string[] = [];
  const awaitingPayment: string[] = [];
  const attention: string[] = [];

  for (const c of group) {
    if (isActivePortfolioCompany(c)) active.push(c.id);
    if (companyHasActiveDeal(c)) activeDeals.push(c.id);
    if (c.deals.some((d) => d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus))) {
      awaitingPayment.push(c.id);
    }
    if (c.hasAttention) attention.push(c.id);

    switch (c.sampleStatus) {
      case "Требуются образцы":
        requireSamples.push(c.id);
        break;
      case "Образцы отправлены":
        samplesSent.push(c.id);
        break;
      case "На испытании":
        inTesting.push(c.id);
        break;
      case "Подошли":
        passed.push(c.id);
        break;
      case "Не подошли":
        failed.push(c.id);
        break;
      case "Требуется доработка":
        rework.push(c.id);
        break;
      default:
        break;
    }
  }

  return {
    activeCompanies: population(active),
    requireSamples: population(requireSamples),
    samplesSent: population(samplesSent),
    inTesting: population(inTesting),
    passed: population(passed),
    failed: population(failed),
    rework: population(rework),
    activeDeals: population(activeDeals),
    awaitingPayment: population(awaitingPayment),
    requireAttention: population(attention),
  };
}

/**
 * Period-event metrics for a segment row.
 * Calls the authoritative computePeriodMetrics on the row's company subset
 * with the REAL canonical boundaries and extracts the five count KPIs →
 * reconciliation by construction. No synthetic boundaries, no implicit
 * `new Date()` fallback (Defect B fix).
 */
function computeSegmentPeriodMetrics(
  group: CommercialCompany[],
  boundaries: PeriodBoundaries
): SegmentPeriodMetrics {
  const kpis = computePeriodMetrics(group, boundaries);
  const find = (id: string) => kpis.find((k) => k.id === id);

  const newCompanies = find("new_companies");
  const samplesSent = find("samples_sent");
  const dealsCreated = find("deals_created");
  const paymentsReceived = find("payments_received");
  const shipments = find("shipments");

  return {
    newCompanies: {
      count: newCompanies?.currentValue ?? 0,
      companyIds: newCompanies?.companyIds ?? [],
    },
    samplesSent: {
      count: samplesSent?.currentValue ?? 0,
      companyIds: samplesSent?.companyIds ?? [],
    },
    dealsCreated: {
      count: dealsCreated?.currentValue ?? 0,
      companyIds: dealsCreated?.companyIds ?? [],
    },
    paymentsReceived: {
      count: paymentsReceived?.currentValue ?? 0,
      companyIds: paymentsReceived?.companyIds ?? [],
    },
    shipments: {
      count: shipments?.currentValue ?? 0,
      companyIds: shipments?.companyIds ?? [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Action Plan (Tab 5 — Требуют внимания + Excel Action Plan)
// ─────────────────────────────────────────────────────────────────────

/**
 * Wraps the authoritative bottleneck engine into the Action Center shape.
 * Last activity / next action are surfaced ONLY from authoritative activity
 * data (activityDataKnown); absence is disclosed truthfully, never invented.
 */
export function computeActionPlan(
  companies: CommercialCompany[],
  now: Date = new Date()
): ActionPlanRow[] {
  const bottlenecks = computeBottlenecks(companies, now);
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const plan = bottlenecks.map((b) => toActionPlanRow(b, companyById.get(b.companyId)));
  // Deterministic ordering (HB contract): daysWaiting desc (nulls last),
  // then companyId ascending.
  plan.sort(
    (a, b) =>
      (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1) ||
      compareCompanyIds(a.companyId, b.companyId)
  );
  return plan;
}

function toActionPlanRow(
  b: BottleneckItem,
  company: CommercialCompany | undefined
): ActionPlanRow {
  // Resolve the specific deal behind this bottleneck when possible.
  const deal =
    b.dealId && company
      ? company.deals.find((d) => d.id === b.dealId)
      : undefined;

  const lastActivityKnown = Boolean(deal?.activityDataKnown);

  return {
    id: b.id,
    companyId: b.companyId,
    companyTitle: b.companyTitle,
    responsibleId: b.responsibleId,
    responsibleName: b.responsibleName,
    stuckAt: b.issueLabel,
    currentState: b.currentState,
    daysWaiting: b.daysWaiting,
    lastActivity: lastActivityKnown ? deal?.activityLast : undefined,
    lastActivityKnown,
    nextAction: b.nextAction,
    nextActionDate: deal?.activityNextDate,
    dealId: b.dealId,
    dealTitle: b.dealTitle,
  };
}

/** Truthful display for missing next action (UI + Excel share this). */
export const NEXT_ACTION_MISSING_LABEL = "Следующий шаг не указан";

// ─────────────────────────────────────────────────────────────────────
// Sample & Testing management snapshot (Excel sheet + drill-downs)
// ─────────────────────────────────────────────────────────────────────

/**
 * Builds the management snapshot of the sample/testing process.
 *
 * Management grain (Defect E fix): ONE CURRENT sample/testing row per
 * Company, derived from the canonical current-cycle provenance exposed by
 * normalization — NOT from the raw buildSampleRegister (which intentionally
 * emits granular sample-Deal rows and historical/fallback records).
 *
 *   A. sampleStatusSource === "DEAL"   → row from the Deal identified by
 *                                        sampleResponsibleDealId.
 *   B. sampleStatusSource === "COMPANY" → Company fallback state.
 *   C. sampleStatusSource === "NONE" or sampleStatus === "—" → no row.
 *
 * Historical sibling sample Deals that are not the selected current cycle
 * never appear merely because the register contains them. The dedicated
 * top-level Samples export remains a separate product (untouched).
 */
export function buildSampleTestingSnapshot(
  companies: CommercialCompany[],
  _now: Date = new Date()
): SampleTestingSnapshotRow[] {
  const rows: SampleTestingSnapshotRow[] = [];

  for (const c of companies) {
    if (!c.sampleStatus || c.sampleStatus === "—") continue;
    if (c.sampleStatusSource === "NONE") continue;

    // Resolve the authoritative current-cycle sample Deal (same provenance
    // rule as computeBottlenecks — Defect D chain).
    const sampleDeal =
      c.sampleStatusSource === "DEAL" && c.sampleResponsibleDealId
        ? c.deals.find((d) => d.id === c.sampleResponsibleDealId)
        : undefined;

    const markOrBatchParts = [
      c.gradeGel?.length ? `ГЕЛЬ: ${c.gradeGel.join(", ")}` : undefined,
      c.gradeSol?.length ? `ЗОЛЬ: ${c.gradeSol.join(", ")}` : undefined,
      sampleDeal ? dealMarkVolume(c, sampleDeal.id) : undefined,
    ].filter(Boolean) as string[];

    rows.push({
      id: `st-${c.id}`,
      companyId: c.id,
      companyTitle: c.title,
      responsibleName:
        c.sampleResponsibleName || c.responsibleName || "Не назначен",
      productType: (c.productType || []).join(", ") || "—",
      industry: c.industry || "—",
      direction: (c.direction || []).join(", ") || "—",
      markOrBatch: markOrBatchParts.join(" · ") || "—",
      shipmentDate: c.sampleShipmentDate,
      testingStatus: c.sampleStatus,
      testResult: c.sampleTestResult || "—",
      nextActionOrComment:
        (c.sampleStatusSource === "DEAL" ? sampleDeal?.activityNext : undefined) ||
        NEXT_ACTION_MISSING_LABEL,
      dealId: sampleDeal?.id,
      dealTitle: sampleDeal?.title,
    });
  }

  // Deterministic ordering (HB contract): companyTitle (ru), then companyId
  rows.sort(
    (a, b) =>
      a.companyTitle.localeCompare(b.companyTitle, "ru") ||
      compareCompanyIds(a.companyId, b.companyId)
  );
  return rows;
}

function dealMarkVolume(c: CommercialCompany, dealId: string): string | undefined {
  const deal = c.deals.find((d) => d.id === dealId);
  return deal?.markVolume || deal?.tvlDetails || undefined;
}

// ─────────────────────────────────────────────────────────────────────
// Management signals (Overview §9C)
// ─────────────────────────────────────────────────────────────────────

/**
 * Compact actionable signals for the Overview tab.
 * STRICTLY subsets of existing computeBottlenecks output — no new rules.
 * Counts are unique companies (drill-down reconciles exactly, T05).
 */
export function computeManagementSignals(
  companies: CommercialCompany[],
  now: Date = new Date()
): ManagementSignal[] {
  const bottlenecks = computeBottlenecks(companies, now);

  const group = (predicate: (b: BottleneckItem) => boolean): CountedPopulation => {
    const ids = bottlenecks.filter(predicate).map((b) => b.companyId);
    return population(ids);
  };

  const stalledTesting = group((b) => b.type === "sample_testing_stalled");
  const successNoDeal = group((b) => b.type === "sample_success_no_deal");
  const stalledDeals = group((b) => b.type === "stalled_deal");

  // "Сделки без следующего шага": subset of stalled_deal where the deal has
  // known activity data but no next step (factual, no new trigger condition).
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const noNextStepIds: string[] = [];
  for (const b of bottlenecks) {
    if (b.type !== "stalled_deal" || !b.dealId) continue;
    const c = companyById.get(b.companyId);
    const deal = c?.deals.find((d) => d.id === b.dealId);
    if (deal?.activityDataKnown && !deal.activityNext) {
      noNextStepIds.push(b.companyId);
    }
  }
  const noNextStep = population(noNextStepIds);

  const signals: ManagementSignal[] = [
    {
      id: "testing_stalled",
      label: "Испытания без движения",
      companyCount: stalledTesting.count,
      companyIds: stalledTesting.companyIds,
    },
    {
      id: "success_no_continuation",
      label: "Положительный результат без коммерческого продолжения",
      companyCount: successNoDeal.count,
      companyIds: successNoDeal.companyIds,
    },
    {
      id: "deals_stalled",
      label: "Сделки без движения",
      companyCount: stalledDeals.count,
      companyIds: stalledDeals.companyIds,
    },
  ];

  if (noNextStep.count > 0) {
    signals.push({
      id: "no_next_step",
      label: "Сделки без следующего шага",
      companyCount: noNextStep.count,
      companyIds: noNextStep.companyIds,
    });
  }

  return signals.filter((s) => s.companyCount > 0);
}

// ─────────────────────────────────────────────────────────────────────
// Attention summary (Excel Executive Summary §18D)
// ─────────────────────────────────────────────────────────────────────

export interface AttentionSummary {
  signals: ManagementSignal[];
  /** Total ATTENTION ITEMS (bottleneck rows), explicitly not companies. */
  totalItems: number;
}

export function computeAttentionSummary(
  companies: CommercialCompany[],
  now: Date = new Date()
): AttentionSummary {
  const signals = computeManagementSignals(companies, now);
  const bottlenecks = computeBottlenecks(companies, now);
  return { signals, totalItems: bottlenecks.length };
}

// ─────────────────────────────────────────────────────────────────────
// evaluateStalledDeal re-exported for tests that verify no-new-rules
// behavior without importing bottlenecks directly.
// ─────────────────────────────────────────────────────────────────────
export { evaluateStalledDeal };
