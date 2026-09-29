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
  PAID_STATUS_CODES,
  UNCLASSIFIED_LABEL,
  WIP_STATUS_KEYS,
} from "./constants";
import { isDateInPeriod } from "./date-utils";
import { evaluateStalledDeal } from "./bottlenecks";
import {
  buildSampleRegister,
  computeBottlenecks,
  computePeriodMetrics,
  evaluateAggregateAmountQuality,
} from "./engine";
import {
  isDealActiveStage,
  isProgressedCommercialStage,
} from "./stage-utils";
import { normalizeCurrencyCode } from "./normalize";
import type {
  ActionPlanRow,
  AggregateAmountQuality,
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

function population(ids: Iterable<string>): CountedPopulation {
  const unique = Array.from(new Set(ids));
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

/** Активные компании: sample process OR active commercial deal. */
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
 * Builds the two-track funnel view.
 * Track A: Samples & Testing — current snapshot per WIP stage; period event
 *          count ONLY for "Образцы отправлены" (reliable sampleSentDate).
 * Track B: Коммерциализация — current snapshot + period events (reused from
 *          authoritative period metric logic, not recomputed).
 */
export function computeFunnelView(
  companies: CommercialCompany[],
  boundaries: { currentStart: Date | null; currentEnd: Date | null }
): FunnelView {
  // ── Track A: current stage rows (reuse computeWipMetrics semantics) ──
  const sampleTestingStages: FunnelStageRow[] = [];

  for (const key of WIP_STATUS_KEYS) {
    const companyIds = new Set<string>();
    let dealCount = 0;

    for (const c of companies) {
      const status = c.sampleStatus;
      if (!status || status === "—") continue;
      let targetKey: string = UNCLASSIFIED_LABEL;
      for (const k of WIP_STATUS_KEYS) {
        if (status === k || status.startsWith(k)) {
          targetKey = k;
          break;
        }
      }
      if (targetKey !== key) continue;
      companyIds.add(c.id);
      // Deal count semantics mirror computeWipMetrics: only deals carrying
      // sample evidence matching this status.
      dealCount += c.deals.filter((d) => {
        if (d.sampleTransferStatus) {
          if (d.sampleTransferStatus === key || d.sampleTransferStatus.startsWith(key)) return true;
        }
        if (d.sampleTestingStatus && d.sampleTestingStatus.length > 0) {
          if (d.sampleTestingStatus.some((s) => s === key || s.startsWith(key))) return true;
        }
        if (key === UNCLASSIFIED_LABEL) {
          if (d.sampleTransferStatus?.startsWith(UNCLASSIFIED_LABEL)) return true;
          if (d.sampleTestingStatus?.some((s) => s.startsWith(UNCLASSIFIED_LABEL))) return true;
        }
        return false;
      }).length;
    }

    // Period event: ONLY "Образцы отправлены" has a reliable dated event
    // (Deal sampleSentDate provenance, identical to computePeriodMetrics
    // "samples_sent" counting). All other stages: null → "–".
    if (key === "Образцы отправлены") {
      const eventIds: string[] = [];
      for (const c of companies) {
        const eventDates = c.sampleEventDatesForPeriodMetrics || c.sampleAllDates || [];
        if (eventDates.some((d) => isDateInPeriod(d, boundaries.currentStart, boundaries.currentEnd))) {
          eventIds.push(c.id);
        }
      }
      sampleTestingStages.push({
        id: key,
        label: key,
        companyCount: companyIds.size,
        dealCount,
        companyIds: Array.from(companyIds),
        periodEventCount: eventIds.length,
        periodEventCompanyIds: eventIds,
      });
    } else {
      sampleTestingStages.push({
        id: key,
        label: key,
        companyCount: companyIds.size,
        dealCount,
        companyIds: Array.from(companyIds),
        periodEventCount: null,
        periodEventCompanyIds: null,
      });
    }
  }

  // ── Track B: commercial current snapshot ──
  const activeDealCompanyIds: string[] = [];
  let activeDealCount = 0;
  const awaitingPaymentCompanies = new Set<string>();
  let awaitingPaymentDealCount = 0;

  for (const c of companies) {
    let hasActive = false;
    for (const d of c.deals) {
      if (isDealActiveStage(d.stageId)) {
        hasActive = true;
        activeDealCount++;
      }
      if (d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus)) {
        awaitingPaymentCompanies.add(c.id);
        awaitingPaymentDealCount++;
      }
    }
    if (hasActive) activeDealCompanyIds.push(c.id);
  }

  const current: FunnelCommercialView["current"] = {
    activeDeals: population(activeDealCompanyIds),
    dealCount: activeDealCount,
    awaitingPayment: population(awaitingPaymentCompanies),
    awaitingPaymentDealCount,
  };

  // ── Track B: period events (recomputed with the SAME rules as
  //    computePeriodMetrics to keep reconciliation exact) ──
  const dealsCreatedIds: string[] = [];
  const paymentsReceivedIds: string[] = [];
  const shipmentIds: string[] = [];
  const currencyStats = new Map<string, { validSum: number; validCount: number; invalidCount: number; unknownCount: number }>();
  const amountsByCurrency: Record<string, number> = {};

  for (const c of companies) {
    for (const d of c.deals) {
      if (isDateInPeriod(d.dateCreate, boundaries.currentStart, boundaries.currentEnd)) {
        dealsCreatedIds.push(c.id);
      }
      if (d.shipmentDate && isDateInPeriod(d.shipmentDate, boundaries.currentStart, boundaries.currentEnd)) {
        shipmentIds.push(c.id);
      }
      if (d.paymentStatus && PAID_STATUS_CODES.has(d.paymentStatus) && d.paymentDate) {
        if (isDateInPeriod(d.paymentDate, boundaries.currentStart, boundaries.currentEnd)) {
          paymentsReceivedIds.push(c.id);
          const normCur = normalizeCurrencyCode(d.currencyId);
          const isValidOpp =
            (d.opportunityQuality === "VALID" || d.opportunityQuality === undefined) &&
            typeof d.opportunity === "number" &&
            !isNaN(d.opportunity);
          const isInvalidOpp = d.opportunityQuality === "INVALID";
          let st = currencyStats.get(normCur);
          if (!st) {
            st = { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
            currencyStats.set(normCur, st);
          }
          if (isValidOpp) {
            st.validSum += d.opportunity!;
            st.validCount++;
            amountsByCurrency[normCur] = (amountsByCurrency[normCur] || 0) + d.opportunity!;
          } else if (isInvalidOpp) {
            st.invalidCount++;
          } else {
            st.unknownCount++;
          }
        }
      }
    }
  }

  const paymentAmountQualityByCurrency: Record<string, AggregateAmountQuality> = {};
  for (const [cur, st] of currencyStats.entries()) {
    paymentAmountQualityByCurrency[cur] = evaluateAggregateAmountQuality(
      st.validSum, st.validCount, st.invalidCount, st.unknownCount
    ).quality;
  }

  const period: FunnelCommercialView["period"] = {
    dealsCreated: population(dealsCreatedIds),
    paymentsReceived: population(paymentsReceivedIds),
    paymentAmountsByCurrency: amountsByCurrency,
    paymentAmountQualityByCurrency,
    shipments: population(shipmentIds),
  };

  // ── Continuation link (evidence, NOT conversion) ──
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
 * Builds the segment matrix for one dimension.
 * Missing values become "Не указано" (never silently omitted).
 * Every cell carries the exact underlying company IDs.
 * Итого = union of unique company IDs (NOT the sum of row counts).
 */
export function computeSegmentBreakdown(
  companies: CommercialCompany[],
  boundaries: { currentStart: Date | null; currentEnd: Date | null },
  dimension: SegmentDimension
): SegmentBreakdown {
  // Group companies by dimension value (multi-valued dims → multiple rows)
  const byValue = new Map<string, CommercialCompany[]>();
  const missing: CommercialCompany[] = [];

  for (const c of companies) {
    const values = getCompanyDimensionValues(c, dimension);
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
 * and extracts the five count KPIs → reconciliation by construction.
 */
function computeSegmentPeriodMetrics(
  group: CommercialCompany[],
  boundaries: { currentStart: Date | null; currentEnd: Date | null }
): SegmentPeriodMetrics {
  const adapted: PeriodBoundaries = {
    currentStart: boundaries.currentStart,
    currentEnd: boundaries.currentEnd ?? new Date(),
    previousStart: null,
    previousEnd: null,
    currentStartStr: "",
    currentEndStr: "",
    previousStartStr: "",
    previousEndStr: "",
    isAllTime: boundaries.currentStart === null,
    comparisonAvailable: false,
  };

  const kpis = computePeriodMetrics(group, adapted);
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

  return bottlenecks.map((b) => toActionPlanRow(b, companyById.get(b.companyId)));
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
 * Derives FROM buildSampleRegister (kept untouched — load-bearing provenance
 * semantics) and enriches each row with company dimension fields.
 * Active testing records remain present regardless of send date.
 */
export function buildSampleTestingSnapshot(
  companies: CommercialCompany[],
  now: Date = new Date()
): SampleTestingSnapshotRow[] {
  const register = buildSampleRegister(companies, now);
  const companyById = new Map(companies.map((c) => [c.id, c]));

  return register.map((row) => {
    const c = companyById.get(row.companyId);
    const markOrBatchParts = [
      c?.gradeGel?.length ? `ГЕЛЬ: ${c.gradeGel.join(", ")}` : undefined,
      c?.gradeSol?.length ? `ЗОЛЬ: ${c.gradeSol.join(", ")}` : undefined,
      row.dealId && c ? dealMarkVolume(c, row.dealId) : undefined,
    ].filter(Boolean) as string[];

    return {
      id: row.id,
      companyId: row.companyId,
      companyTitle: row.companyTitle,
      responsibleName: row.responsibleName,
      productType: row.productType,
      industry: c?.industry || "—",
      direction: (c?.direction || []).join(", ") || "—",
      markOrBatch: markOrBatchParts.join(" · ") || "—",
      shipmentDate: row.shipmentDate,
      testingStatus: row.status,
      testResult: row.testResult || "—",
      // STOP rule: no authoritative planned/actual test-date field exists in
      // CRM constants → always undefined (renders as "–"), never guessed.
      plannedOrActualTestDate: undefined,
      nextActionOrComment: row.nextAction || NEXT_ACTION_MISSING_LABEL,
      dealId: row.dealId,
      dealTitle: row.dealTitle,
    };
  });
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
