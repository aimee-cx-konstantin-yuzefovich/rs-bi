// src/lib/commercial-funnel/engine.ts
// ─────────────────────────────────────────────────────────────────────
// Pure Analytics Engine for Commercial Funnel Release 1.
// Single source of truth consumed by BOTH the UI and Excel report.
// Guaranteed exact reconciliation between KPI counts and drill-down lists.
// ─────────────────────────────────────────────────────────────────────

import {
  COMMERCIAL_THRESHOLDS,
  INVOICE_SENT_STATUS_CODES,
  PAID_STATUS_CODES,
  PAYMENT_AMOUNT_LABEL,
  UNCLASSIFIED_LABEL,
  WIP_STATUS_KEYS,
} from "./constants";
import {
  calculateDaysWaiting,
  computePeriodBoundaries,
  isDateInPeriod,
  safeDeltaPercent,
} from "./date-utils";
import { normalizeCurrencyCode, reprojectCompanyForFilteredGrain } from "./normalize";
import { getCurrencyUniverse } from "./currency";
import { compareCompanyIds } from "./analytics-helpers";

export { getCurrencyUniverse } from "./currency";
import { isDealActiveStage, isCommercialContinuationStage } from "./stage-utils";
import { evaluateStalledDeal } from "./bottlenecks";
import type {
  AggregateAmountQuality,
  BottleneckItem,
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
  DatedKpi,
  ManagerScorecardRow,
  PeriodBoundaries,
  SampleRegisterRow,
  WipKpi,
} from "./types";

/**
 * Evaluates aggregate financial amount and quality according to invariant rules:
 * - 0 paid deals: 0, "COMPLETE"
 * - All paid deals have valid opportunity (even 0): sum, "COMPLETE"
 * - No valid amounts and at least 1 invalid: null, "INVALID_ONLY"
 * - No valid amounts and all missing: null, "UNKNOWN"
 * - Valid amount(s) plus at least one invalid/unknown: sum, "PARTIAL"
 */
export function evaluateAggregateAmountQuality(
  validSum: number,
  validCount: number,
  invalidCount: number,
  unknownCount: number
): { amount: number | null; quality: AggregateAmountQuality } {
  const total = validCount + invalidCount + unknownCount;
  if (total === 0) {
    return { amount: 0, quality: "COMPLETE" };
  }
  if (invalidCount === 0 && unknownCount === 0) {
    return { amount: validSum, quality: "COMPLETE" };
  }
  if (validCount === 0) {
    if (invalidCount > 0) {
      return { amount: null, quality: "INVALID_ONLY" };
    }
    return { amount: null, quality: "UNKNOWN" };
  }
  return { amount: validSum, quality: "PARTIAL" };
}

/**
 * Filter dataset by dimensional filters (responsible, product, industry, direction, region).
 * Enforces natural-grain filtering on Company dimensions (without pruning child deals by dimensions);
 * deals are pruned strictly by responsibleId when a responsible filter is active.
 */
export function filterCompaniesByDimensions(
  companies: CommercialCompany[],
  filters: CommercialFilters
): CommercialCompany[] {
  const hasRespFilter = Boolean(filters.responsibleId && filters.responsibleId !== "all");
  const hasProdFilter = Boolean(filters.productType && filters.productType !== "all");
  const hasIndFilter = Boolean(filters.industry && filters.industry !== "all");
  const hasDirFilter = Boolean(filters.direction && filters.direction !== "all");
  const hasRegFilter = Boolean(filters.region && filters.region !== "all");

  const hasAnyFilter = hasRespFilter || hasProdFilter || hasIndFilter || hasDirFilter || hasRegFilter;
  if (!hasAnyFilter) {
    return companies;
  }

  const result: CommercialCompany[] = [];

  for (const company of companies) {
    // 1. Company classification dimensions check (Company-only grain, Defect C)
    // Child deals must NOT rescue, exclude, or alter Company classification slice.
    if (hasProdFilter && !company.productType.includes(filters.productType!)) continue;
    if (hasIndFilter && company.industry !== filters.industry) continue;
    if (hasDirFilter && !company.direction.includes(filters.direction!)) continue;
    if (hasRegFilter && company.region !== filters.region) continue;

    // 2. Responsible scoping (Section 6)
    // Very important: DO NOT prune deals by Deal product/industry/direction/region!
    // Deals retain full facts for the segment; only prune by responsibleId if active.
    const matchingDeals = hasRespFilter
      ? company.deals.filter((deal) => deal.responsibleId === filters.responsibleId)
      : company.deals;

    const companyMatches = hasRespFilter
      ? company.responsibleId === filters.responsibleId
      : true;

    // Current sample state attribution under responsible filter
    let includeCanonicalSampleState = companyMatches;
    if (hasRespFilter && !companyMatches && company.sampleStatusSource !== "NONE") {
      const sampleMgrId =
        company.sampleCurrentResolutionQuality === "AMBIGUOUS_MULTIPLE_ACTIVE"
          ? undefined
          : company.sampleStatusSource === "SMART_PROCESS" || company.sampleStatusSource === "DEAL"
          ? company.sampleResponsibleId
          : company.responsibleId;
      includeCanonicalSampleState = sampleMgrId === filters.responsibleId;
    }

    if (hasRespFilter) {
      const hasSentEvent = (company.sampleSentEvents ?? []).some((e) => {
        if (e.source === "SMART_PROCESS") return e.responsibleId === filters.responsibleId;
        if (e.source === "DEAL") return e.responsibleId === filters.responsibleId || (e.dealId !== undefined && matchingDeals.some((d) => d.id === e.dealId));
        if (e.source === "COMPANY") return companyMatches && (e.responsibleId ? e.responsibleId === filters.responsibleId : company.responsibleId === filters.responsibleId);
        return false;
      });
      if (!companyMatches && matchingDeals.length === 0 && !includeCanonicalSampleState && !hasSentEvent) {
        continue;
      }
    }

    result.push(
      reprojectCompanyForFilteredGrain(
        company,
        matchingDeals,
        companyMatches,
        undefined,
        includeCanonicalSampleState,
        hasRespFilter ? filters.responsibleId : undefined
      )
    );
  }

  return result;
}

/**
 * Calculate Period Activity KPIs with previous-period comparison (DATED EVENTS ONLY).
 * Primary counting unit: UNIQUE COMPANY.
 */
export function computePeriodMetrics(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries
): DatedKpi[] {
  const { currentStart, currentEnd, previousStart, previousEnd } = boundaries;

  // 1. Новые компании (Company DATE_CREATE in period)
  const currentNewCompanyIds = new Set<string>();
  const prevNewCompanyIds = new Set<string>();

  for (const c of companies) {
    if (isDateInPeriod(c.dateCreate, currentStart, currentEnd)) {
      currentNewCompanyIds.add(c.id);
    }
    if (isDateInPeriod(c.dateCreate, previousStart, previousEnd)) {
      prevNewCompanyIds.add(c.id);
    }
  }

  // 2. Образцы отправлены (Sample shipment date in period, unique companies)
  // Phase C: canonical sampleSentEvents (per-event provenance from the ONE
  // sample engine: Smart Process manual date, Deal legacy date, Company
  // legacy date) are the event source; the legacy date-union fields remain
  // as a fallback for datasets not yet carrying canonical events.
  const currentSampleSentCompanyIds = new Set<string>();
  const prevSampleSentCompanyIds = new Set<string>();

  for (const c of companies) {
    const eventDates =
      c.sampleSentEvents !== undefined
        ? c.sampleSentEvents.map((e) => e.date)
        : (c.sampleEventDatesForPeriodMetrics || c.sampleAllDates || []);
    const hasCurrentShipment = eventDates.some((d) => isDateInPeriod(d, currentStart, currentEnd));
    if (hasCurrentShipment) {
      currentSampleSentCompanyIds.add(c.id);
    }
    const hasPrevShipment = eventDates.some((d) => isDateInPeriod(d, previousStart, previousEnd));
    if (hasPrevShipment) {
      prevSampleSentCompanyIds.add(c.id);
    }
  }

  // 3. Создано сделок (Deal DATE_CREATE in period, unique companies)
  const currentDealCreatedCompanyIds = new Set<string>();
  const prevDealCreatedCompanyIds = new Set<string>();

  for (const c of companies) {
    for (const d of c.deals) {
      if (isDateInPeriod(d.dateCreate, currentStart, currentEnd)) {
        currentDealCreatedCompanyIds.add(c.id);
      }
      if (isDateInPeriod(d.dateCreate, previousStart, previousEnd)) {
        prevDealCreatedCompanyIds.add(c.id);
      }
    }
  }

  // 4. Получено оплат (Payment date in period + paid status, unique companies)
  // Tracks OPPORTUNITY isolated by currency with comprehensive quality invariant evaluation.
  const currentPaidCompanyIds = new Set<string>();
  const prevPaidCompanyIds = new Set<string>();
  const currentPaymentAmountsByCurrency: Record<string, number> = {};
  const prevPaymentAmountsByCurrency: Record<string, number> = {};
  const currentPaymentSumCompanyIds = new Set<string>();
  const prevPaymentSumCompanyIds = new Set<string>();

  interface CurrencyStats {
    validSum: number;
    validCount: number;
    invalidCount: number;
    unknownCount: number;
  }
  const currentCurrencyStats: Record<string, CurrencyStats> = {};
  const prevCurrencyStats: Record<string, CurrencyStats> = {};

  const getStats = (map: Record<string, CurrencyStats>, cur: string): CurrencyStats => {
    if (!map[cur]) {
      map[cur] = { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    }
    return map[cur];
  };

  for (const c of companies) {
    for (const d of c.deals) {
      if (d.paymentStatus && PAID_STATUS_CODES.has(d.paymentStatus) && d.paymentDate) {
        const normCurrency = normalizeCurrencyCode(d.currencyId);
        const isValidOpp =
          (d.opportunityQuality === "VALID" || d.opportunityQuality === undefined) &&
          typeof d.opportunity === "number" &&
          !isNaN(d.opportunity);
        const isInvalidOpp = d.opportunityQuality === "INVALID";

        if (isDateInPeriod(d.paymentDate, currentStart, currentEnd)) {
          currentPaidCompanyIds.add(c.id);
          const st = getStats(currentCurrencyStats, normCurrency);
          if (isValidOpp) {
            currentPaymentSumCompanyIds.add(c.id);
            st.validSum += d.opportunity!;
            st.validCount++;
            currentPaymentAmountsByCurrency[normCurrency] =
              (currentPaymentAmountsByCurrency[normCurrency] || 0) + d.opportunity!;
          } else if (isInvalidOpp) {
            st.invalidCount++;
          } else {
            st.unknownCount++;
          }
        }
        if (isDateInPeriod(d.paymentDate, previousStart, previousEnd)) {
          prevPaidCompanyIds.add(c.id);
          const st = getStats(prevCurrencyStats, normCurrency);
          if (isValidOpp) {
            prevPaymentSumCompanyIds.add(c.id);
            st.validSum += d.opportunity!;
            st.validCount++;
            prevPaymentAmountsByCurrency[normCurrency] =
              (prevPaymentAmountsByCurrency[normCurrency] || 0) + d.opportunity!;
          } else if (isInvalidOpp) {
            st.invalidCount++;
          } else {
            st.unknownCount++;
          }
        }
      }
    }
  }

  // 5. Отгрузки (Shipment date in period, unique companies)
  const currentShipmentCompanyIds = new Set<string>();
  const prevShipmentCompanyIds = new Set<string>();

  for (const c of companies) {
    for (const d of c.deals) {
      if (d.shipmentDate) {
        if (isDateInPeriod(d.shipmentDate, currentStart, currentEnd)) {
          currentShipmentCompanyIds.add(c.id);
        }
        if (isDateInPeriod(d.shipmentDate, previousStart, previousEnd)) {
          prevShipmentCompanyIds.add(c.id);
        }
      }
    }
  }

  const isComparisonAvailable =
    boundaries.comparisonAvailable !== false && !boundaries.isAllTime;

  const buildKpi = (
    id: string,
    label: string,
    curr: number | null,
    prev: number | null,
    companyIds: string[],
    isCurrency = false,
    extra?: Partial<DatedKpi>
  ): DatedKpi => {
    const compAvail =
      extra?.comparisonAvailable !== undefined
        ? extra.comparisonAvailable
        : isComparisonAvailable && prev !== null && curr !== null;

    const delta = compAvail && curr !== null && prev !== null ? curr - prev : null;
    const deltaPercent = compAvail && curr !== null && prev !== null ? safeDeltaPercent(curr, prev) : null;

    return {
      id,
      label,
      currentValue: curr,
      previousValue: isComparisonAvailable ? prev : null,
      delta,
      deltaPercent,
      // Deterministic ID ordering (HB contract): business output never
      // depends on Set/Map insertion order.
      companyIds: [...companyIds].sort(compareCompanyIds),
      isCurrency,
      comparisonAvailable: compAvail,
      ...extra,
    };
  };

  const distinctCurrencies = getCurrencyUniverse(
    currentCurrencyStats,
    prevCurrencyStats
  );

  const currentQualityByCurrency: Record<string, AggregateAmountQuality> = {};
  const prevQualityByCurrency: Record<string, AggregateAmountQuality> = {};

  for (const cur of distinctCurrencies) {
    const cStat = currentCurrencyStats[cur] || { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    const pStat = prevCurrencyStats[cur] || { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    currentQualityByCurrency[cur] = evaluateAggregateAmountQuality(
      cStat.validSum, cStat.validCount, cStat.invalidCount, cStat.unknownCount
    ).quality;
    prevQualityByCurrency[cur] = evaluateAggregateAmountQuality(
      pStat.validSum, pStat.validCount, pStat.invalidCount, pStat.unknownCount
    ).quality;
  }

  let paymentKpi: DatedKpi;
  if (distinctCurrencies.length === 0) {
    paymentKpi = buildKpi(
      "payment_amount",
      PAYMENT_AMOUNT_LABEL,
      0,
      isComparisonAvailable ? 0 : null,
      Array.from(currentPaymentSumCompanyIds),
      true,
      {
        isMultiCurrency: false,
        currencyId: undefined,
        currencyBreakdown: { current: {}, previous: {} },
        amountQuality: "COMPLETE",
        currencyBreakdownQuality: { current: {}, previous: {} },
        comparisonAvailable: isComparisonAvailable,
      }
    );
  } else if (distinctCurrencies.length === 1) {
    const cur = distinctCurrencies[0];
    const cStat = currentCurrencyStats[cur] || { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    const pStat = prevCurrencyStats[cur] || { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    const cRes = evaluateAggregateAmountQuality(cStat.validSum, cStat.validCount, cStat.invalidCount, cStat.unknownCount);
    const pRes = evaluateAggregateAmountQuality(pStat.validSum, pStat.validCount, pStat.invalidCount, pStat.unknownCount);

    const isSingleCurComplete =
      isComparisonAvailable &&
      cRes.quality === "COMPLETE" &&
      pRes.quality === "COMPLETE" &&
      cRes.amount !== null &&
      pRes.amount !== null;

    const singleDelta = isSingleCurComplete ? Math.round(cRes.amount!) - Math.round(pRes.amount!) : null;
    const singleDeltaPct = isSingleCurComplete ? safeDeltaPercent(Math.round(cRes.amount!), Math.round(pRes.amount!)) : null;

    paymentKpi = buildKpi(
      "payment_amount",
      PAYMENT_AMOUNT_LABEL,
      cRes.amount !== null ? Math.round(cRes.amount) : null,
      isComparisonAvailable && pRes.amount !== null ? Math.round(pRes.amount) : null,
      Array.from(currentPaymentSumCompanyIds),
      true,
      {
        isMultiCurrency: false,
        currencyId: cur,
        currencyBreakdown: {
          current: currentPaymentAmountsByCurrency,
          previous: isComparisonAvailable ? prevPaymentAmountsByCurrency : {},
        },
        amountQuality: cRes.quality,
        currencyBreakdownQuality: {
          current: currentQualityByCurrency,
          previous: isComparisonAvailable ? prevQualityByCurrency : {},
        },
        comparisonAvailable: isSingleCurComplete,
        delta: singleDelta,
        deltaPercent: singleDeltaPct,
      }
    );
  } else {
    // Multiple currencies present: NEVER expose a false cross-currency total.
    const allQualities = Object.values(currentQualityByCurrency);
    let multiQuality: AggregateAmountQuality = "COMPLETE";
    if (allQualities.some((q) => q === "PARTIAL")) {
      multiQuality = "PARTIAL";
    } else if (allQualities.every((q) => q === "UNKNOWN")) {
      multiQuality = "UNKNOWN";
    } else if (allQualities.every((q) => q === "INVALID_ONLY")) {
      multiQuality = "INVALID_ONLY";
    } else if (allQualities.some((q) => q === "INVALID_ONLY" || q === "UNKNOWN")) {
      multiQuality = "PARTIAL";
    }

    paymentKpi = buildKpi(
      "payment_amount",
      PAYMENT_AMOUNT_LABEL,
      null,
      null,
      Array.from(currentPaymentSumCompanyIds),
      true,
      {
        isMultiCurrency: true,
        currencyBreakdown: {
          current: currentPaymentAmountsByCurrency,
          previous: isComparisonAvailable ? prevPaymentAmountsByCurrency : {},
        },
        amountQuality: multiQuality,
        currencyBreakdownQuality: {
          current: currentQualityByCurrency,
          previous: isComparisonAvailable ? prevQualityByCurrency : {},
        },
        comparisonAvailable: false,
        delta: null,
        deltaPercent: null,
      }
    );
  }

  return [
    buildKpi(
      "new_companies",
      "Новые компании",
      currentNewCompanyIds.size,
      isComparisonAvailable ? prevNewCompanyIds.size : null,
      Array.from(currentNewCompanyIds)
    ),
    buildKpi(
      "samples_sent",
      "Компании с отправленными образцами",
      currentSampleSentCompanyIds.size,
      isComparisonAvailable ? prevSampleSentCompanyIds.size : null,
      Array.from(currentSampleSentCompanyIds)
    ),
    buildKpi(
      "deals_created",
      "Компании с созданными сделками",
      currentDealCreatedCompanyIds.size,
      isComparisonAvailable ? prevDealCreatedCompanyIds.size : null,
      Array.from(currentDealCreatedCompanyIds)
    ),
    buildKpi(
      "payments_received",
      "Компании с полученной оплатой",
      currentPaidCompanyIds.size,
      isComparisonAvailable ? prevPaidCompanyIds.size : null,
      Array.from(currentPaidCompanyIds)
    ),
    paymentKpi,
    buildKpi(
      "shipments",
      "Компании с отгрузками",
      currentShipmentCompanyIds.size,
      isComparisonAvailable ? prevShipmentCompanyIds.size : null,
      Array.from(currentShipmentCompanyIds)
    ),
  ];
}


/**
 * Calculate Current State / WIP KPIs (WHERE COMPANIES/DEALS ARE NOW).
 * Never filtered by event date. Counting unit: UNIQUE COMPANY.
 * Sample dealCount strictly counts only deals having relevant sample evidence.
 */
export function computeWipMetrics(companies: CommercialCompany[]): WipKpi[] {
  const map = new Map<string, { companyIds: Set<string>; dealCount: number }>();

  for (const key of WIP_STATUS_KEYS) {
    map.set(key, { companyIds: new Set<string>(), dealCount: 0 });
  }

  for (const c of companies) {
    const status = c.sampleStatus;
    if (status && status !== "—") {
      let targetKey: string = UNCLASSIFIED_LABEL;
      for (const k of WIP_STATUS_KEYS) {
        if (status === k || status.startsWith(k)) {
          targetKey = k;
          break;
        }
      }
      const entry = map.get(targetKey) || map.get(UNCLASSIFIED_LABEL)!;
      entry.companyIds.add(c.id);

      // Defect F: count the Deal attached to the CURRENT canonical sample cycle
      if (c.sampleStatusSource === "SMART_PROCESS" && c.sampleRelatedDealId) {
        if (c.deals.some((d) => d.id === c.sampleRelatedDealId)) {
          entry.dealCount += 1;
        }
      } else if (c.sampleStatusSource === "DEAL" && c.sampleResponsibleDealId) {
        if (c.deals.some((d) => d.id === c.sampleResponsibleDealId)) {
          entry.dealCount += 1;
        }
      }
      // COMPANY_LEGACY or NONE: 0 (no authoritative current Deal)
    }
  }

  // Commercial WIP: deals in preparation / invoice sent
  const awaitingPaymentCompanyIds = new Set<string>();
  let awaitingPaymentDealCount = 0;

  for (const c of companies) {
    for (const d of c.deals) {
      if (d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus)) {
        awaitingPaymentCompanyIds.add(c.id);
        awaitingPaymentDealCount++;
      }
    }
  }

  const kpis: WipKpi[] = WIP_STATUS_KEYS.map((key) => {
    const entry = map.get(key)!;
    return {
      id: key,
      label: key,
      companyCount: entry.companyIds.size,
      dealCount: entry.dealCount,
      companyIds: Array.from(entry.companyIds).sort(compareCompanyIds),
    };
  });

  kpis.push({
    id: "awaiting_payment",
    label: "Ожидает оплаты",
    companyCount: awaitingPaymentCompanyIds.size,
    dealCount: awaitingPaymentDealCount,
    companyIds: Array.from(awaitingPaymentCompanyIds).sort(compareCompanyIds),
  });

  return kpis;
}

/**
 * Calculate actionable bottlenecks strictly derived from reliable date + current state.
 *
 * Sample bottleneck Deal provenance (Defect D fix): when the current sample
 * state is sourced from a Deal (sampleStatusSource === "DEAL"), the exact
 * sample Deal identified by sampleResponsibleDealId is used for all Deal
 * fields — NEVER the representative primaryDeal, which may be an unrelated
 * commercial Deal. When the state comes from the Company fallback, there is
 * no authoritative sample Deal: Deal fields stay undefined (no borrowed
 * representative Deal merely to fill columns).
 */
export function computeBottlenecks(
  companies: CommercialCompany[],
  now: Date = new Date()
): BottleneckItem[] {
  const items: BottleneckItem[] = [];

  for (const c of companies) {
    // Resolve the authoritative current-cycle sample Deal (Defect D provenance).
    // Phase C: SMART_PROCESS source uses the exact factual linked sample
    // Deal (sampleRelatedDealId) when one exists — never a representative
    // primaryDeal, and never the SP item id misread as a Deal ID.
    const sampleDeal =
      c.sampleStatusSource === "SMART_PROCESS" && c.sampleRelatedDealId
        ? c.deals.find((d) => d.id === c.sampleRelatedDealId)
        : c.sampleStatusSource === "DEAL" && c.sampleResponsibleDealId
        ? c.deals.find((d) => d.id === c.sampleResponsibleDealId)
        : undefined;

    // Sample bottleneck responsible: canonical current sample responsible
    // (SP → SP ASSIGNED_BY_ID; Deal → Deal responsible; Company → owner).
    const sampleRespId =
      c.sampleCurrentResolutionQuality === "AMBIGUOUS_MULTIPLE_ACTIVE"
        ? undefined
        : (c.sampleStatusSource === "SMART_PROCESS" || c.sampleStatusSource === "DEAL") &&
          c.sampleResponsibleId
        ? c.sampleResponsibleId
        : c.responsibleId;
    const sampleRespName =
      c.sampleCurrentResolutionQuality === "AMBIGUOUS_MULTIPLE_ACTIVE"
        ? undefined
        : (c.sampleStatusSource === "SMART_PROCESS" || c.sampleStatusSource === "DEAL") &&
          c.sampleResponsibleId
        ? c.sampleResponsibleName || `ID ${c.sampleResponsibleId}`
        : c.responsibleName || `ID ${c.responsibleId}`;

    // 1. Sample testing stalled (> 14 days)
    if (c.sampleStatus === "На испытании" && c.sampleShipmentDate) {
      const days = calculateDaysWaiting(c.sampleShipmentDate, now);
      if (days !== null && days > COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS) {
        const respId = sampleRespId ?? c.responsibleId;
        const respName = sampleRespName ?? (c.responsibleName || `ID ${c.responsibleId}`);
        items.push({
          id: `bottleneck-testing-${c.id}`,
          companyId: c.id,
          companyTitle: c.title,
          responsibleId: respId,
          responsibleName: respName,
          type: "sample_testing_stalled",
          issueLabel: "Испытание образцов затянулось",
          currentState: `На испытании (${days} дн.)`,
          relevantDate: c.sampleShipmentDate,
          daysWaiting: days,
          dealId: sampleDeal?.id,
          dealTitle: sampleDeal?.title,
          amount: sampleDeal?.opportunity,
          amountQuality: sampleDeal?.opportunityQuality,
          currencyId: sampleDeal?.currencyId,
          nextAction: sampleDeal?.activityNext || undefined,
        });
      }
    }

    // 2. Sample succeeded but no commercial progression
    if (c.sampleStatus === "Подошли") {
      const hasProgressed = c.deals.some((d) => isCommercialContinuationStage(d.stageId, d.categoryId));
      if (!hasProgressed) {
        // Authoritative current-cycle sample date only! Never fallback to c.dateCreate!
        const refDate = c.sampleShipmentDate || undefined;
        const days = refDate ? calculateDaysWaiting(refDate, now) : null;
        const respId = sampleRespId ?? c.responsibleId;
        const respName = sampleRespName ?? (c.responsibleName || `ID ${c.responsibleId}`);
        items.push({
          id: `bottleneck-success-${c.id}`,
          companyId: c.id,
          companyTitle: c.title,
          responsibleId: respId,
          responsibleName: respName,
          type: "sample_success_no_deal",
          issueLabel: "Образец подошел, нет коммерческой сделки",
          currentState: "Образец одобрен",
          relevantDate: refDate,
          daysWaiting: days,
          dealId: sampleDeal?.id,
          dealTitle: sampleDeal?.title,
          amount: sampleDeal?.opportunity,
          amountQuality: sampleDeal?.opportunityQuality,
          currencyId: sampleDeal?.currencyId,
          nextAction: sampleDeal?.activityNext || undefined,
        });
      }
    }

    // 3. Invoice sent but payment overdue
    // Note: Bitrix CRM does not provide an invoice issue date. Do NOT fabricate invoice age from deal creation date.
    // If an authoritative invoice date is populated in the future, it is used here.

    // 4. Stalled active deal (evaluated via canonical evaluateStalledDeal helper)
    for (const d of c.deals) {
      const stalledInfo = evaluateStalledDeal(d, now);
      if (stalledInfo) {
        items.push({
          id: `bottleneck-stalled-${d.id}`,
          companyId: c.id,
          companyTitle: c.title,
          responsibleId: d.responsibleId || c.responsibleId,
          responsibleName: d.responsibleName || c.responsibleName || "Не назначен",
          type: "stalled_deal",
          issueLabel: stalledInfo.issueLabel,
          currentState: d.stageName || d.stageId,
          relevantDate: stalledInfo.relevantDate,
          daysWaiting: stalledInfo.daysWaiting,
          dealId: d.id,
          dealTitle: d.title,
          amount: d.opportunity,
          amountQuality: d.opportunityQuality,
          currencyId: d.currencyId,
          nextAction: stalledInfo.nextAction,
        });
      }
    }
  }

  // Sort bottlenecks by waiting days descending (null days sorted to bottom)
  return items.sort((a, b) => ((b.daysWaiting ?? -1) - (a.daysWaiting ?? -1)));
}

/**
 * Compute Manager Scorecard metrics (operational breakdown, no ranking).
 */
export function computeManagerScorecard(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries,
  bottlenecks: BottleneckItem[] = [],
  userNames: Record<string, string> = {}
): ManagerScorecardRow[] {
  const { currentStart, currentEnd } = boundaries;

  // Group by responsible ID
  const managerMap = new Map<string, ManagerScorecardRow>();
  const managerPaymentStats = new Map<
    string,
    { validSum: number; validCount: number; invalidCount: number; unknownCount: number }
  >();
  const managerCurrencyStats = new Map<
    string,
    Map<string, { validSum: number; validCount: number; invalidCount: number; unknownCount: number }>
  >();

  const getManagerStats = (respId: string) => {
    let s = managerPaymentStats.get(respId);
    if (!s) {
      s = { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
      managerPaymentStats.set(respId, s);
    }
    return s;
  };

  const getOrCreate = (respId: string): ManagerScorecardRow => {
    let row = managerMap.get(respId);
    if (!row) {
      row = {
        responsibleId: respId,
        name: userNames[respId] || (respId ? `ID ${respId}` : "Не назначен"),
        newCompanies: 0,
        samplesSent: 0,
        inTesting: 0,
        sampleSuccess: 0,
        sampleFail: 0,
        sampleRework: 0,
        dealsCreated: 0,
        paymentsReceived: 0,
        paymentAmount: 0,
        paymentAmountsByCurrency: {},
        bottlenecksCount: 0,
        companyIds: [],
        activeCompanies: 0,
        activeCompaniesIds: [],
        awaitingPayment: 0,
        awaitingPaymentIds: [],
        noNextStep: 0,
        noNextStepIds: [],
      };
      managerMap.set(respId, row);
    }
    return row;
  };

  // Portfolio / Load group (current state, never date-filtered).
  // Attribution mirrors the provenance rules:
  // - awaiting-payment is evaluated strictly from paymentStatus (INVOICE_SENT_STATUS_CODES),
  //   independent of deal active/terminal stage.
  // - active-deal companies go to each manager owning an active deal.
  // - no-next-step requires an active deal and activityDataKnown === true (factual data gap only).
  //
  // «Компании в текущем контуре» (activeCompanies/Ids) = UNION of
  //   A. companies with a real current sample state (same rule as the
  //      Segments-side isActivePortfolioCompany sample predicate), attributed
  //      by the sample provenance rules (DEAL → sampleResponsibleId;
  //      COMPANY → company owner when companyFactsIncluded !== false), and
  //   B. companies with ≥1 active commercial Deal, attributed to
  //      deal.responsibleId (existing factual fallback).
  // A company counts ONCE per manager (Set union) and MAY appear under two
  // different managers when the sample cycle and the commercial Deal have
  // different owners — two real manager relationships.
  const activeDealsByManager = new Map<string, Set<string>>();
  const sampleCurrentByManager = new Map<string, Set<string>>();
  const awaitingPaymentByManager = new Map<string, Set<string>>();
  const noNextStepByManager = new Map<string, Set<string>>();

  for (const c of companies) {
    for (const d of c.deals) {
      const dealRespId = d.responsibleId || c.responsibleId;

      if (d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus)) {
        let paySet = awaitingPaymentByManager.get(dealRespId);
        if (!paySet) {
          paySet = new Set();
          awaitingPaymentByManager.set(dealRespId, paySet);
        }
        paySet.add(c.id);
      }

      if (!isDealActiveStage(d.stageId)) continue;
      let set = activeDealsByManager.get(dealRespId);
      if (!set) {
        set = new Set();
        activeDealsByManager.set(dealRespId, set);
      }
      set.add(c.id);

      if (d.activityDataKnown && !d.activityNext) {
        let stepSet = noNextStepByManager.get(dealRespId);
        if (!stepSet) {
          stepSet = new Set();
          noNextStepByManager.set(dealRespId, stepSet);
        }
        stepSet.add(c.id);
      }
    }
  }

  // A. Current sample state → manager attribution (mirrors sampleWipMgrId
  // provenance below: DEAL → sampleResponsibleId; COMPANY → company owner
  // when companyFactsIncluded !== false). Only a REAL current sample state
  // counts: NONE / blank / "—" are excluded — exact parity with the
  // Segments-side sample predicate of isActivePortfolioCompany.
  // Phase C: SMART_PROCESS source attributes to the SP item's own
  // responsible (sampleResponsibleId); AMBIGUOUS_MULTIPLE_ACTIVE never
  // fabricates one current manager (no attribution).
  for (const c of companies) {
    if (!c.sampleStatus || c.sampleStatus === "—" || c.sampleStatusSource === "NONE") continue;
    if (c.sampleCurrentResolutionQuality === "AMBIGUOUS_MULTIPLE_ACTIVE") continue;
    const sampleMgrId =
      c.sampleStatusSource === "SMART_PROCESS" || c.sampleStatusSource === "DEAL"
        ? c.sampleResponsibleId
        : c.sampleStatusSource === "COMPANY" && c.companyFactsIncluded !== false
        ? c.responsibleId
        : undefined;
    if (!sampleMgrId) continue;
    let set = sampleCurrentByManager.get(sampleMgrId);
    if (!set) {
      set = new Set();
      sampleCurrentByManager.set(sampleMgrId, set);
    }
    set.add(c.id);
  }

  // B+C. Merge active-Deal companies with current-sample companies per
  // manager: unique union, one company counts once per manager.
  for (const [respId, dealIds] of activeDealsByManager) {
    const row = getOrCreate(respId);
    const sampleIds = sampleCurrentByManager.get(respId);
    const union = sampleIds ? new Set([...dealIds, ...sampleIds]) : dealIds;
    row.activeCompanies = union.size;
    row.activeCompaniesIds = Array.from(union);
  }
  for (const [respId, ids] of sampleCurrentByManager) {
    if (activeDealsByManager.has(respId)) continue; // already merged above
    const row = getOrCreate(respId);
    row.activeCompanies = ids.size;
    row.activeCompaniesIds = Array.from(ids);
  }
  for (const [respId, ids] of awaitingPaymentByManager) {
    const row = getOrCreate(respId);
    row.awaitingPayment = ids.size;
    row.awaitingPaymentIds = Array.from(ids);
  }
  for (const [respId, ids] of noNextStepByManager) {
    const row = getOrCreate(respId);
    row.noNextStep = ids.size;
    row.noNextStepIds = Array.from(ids);
  }

  for (const c of companies) {
    // Dated: new company in period (factual Company owner ONLY when companyFactsIncluded !== false)
    if (c.companyFactsIncluded !== false && isDateInPeriod(c.dateCreate, currentStart, currentEnd)) {
      const row = getOrCreate(c.responsibleId);
      row.newCompanies++;
      if (!row.companyIds.includes(c.id)) {
        row.companyIds.push(c.id);
      }
    }

    // Current WIP: sample status
    // SMART_PROCESS/DEAL-derived -> sampleResponsibleId (SP attribution is
    // the SP item's own ASSIGNED_BY_ID, never the Company owner);
    // COMPANY fallback -> c.responsibleId (if companyFactsIncluded !== false).
    // AMBIGUOUS_MULTIPLE_ACTIVE: no arbitrary current manager attribution.
    const sampleWipMgrId =
      c.sampleCurrentResolutionQuality === "AMBIGUOUS_MULTIPLE_ACTIVE"
        ? undefined
        : c.sampleStatusSource === "SMART_PROCESS" || c.sampleStatusSource === "DEAL"
        ? c.sampleResponsibleId
        : c.sampleStatusSource === "COMPANY" && c.companyFactsIncluded !== false
        ? c.responsibleId
        : undefined;

    if (sampleWipMgrId) {
      if (c.sampleStatus === "На испытании") {
        const row = getOrCreate(sampleWipMgrId);
        row.inTesting++;
        if (!row.companyIds.includes(c.id)) row.companyIds.push(c.id);
      } else if (c.sampleStatus === "Подошли") {
        const row = getOrCreate(sampleWipMgrId);
        row.sampleSuccess++;
        if (!row.companyIds.includes(c.id)) row.companyIds.push(c.id);
      } else if (c.sampleStatus === "Не подошли") {
        const row = getOrCreate(sampleWipMgrId);
        row.sampleFail++;
        if (!row.companyIds.includes(c.id)) row.companyIds.push(c.id);
      } else if (c.sampleStatus === "Требуется доработка") {
        const row = getOrCreate(sampleWipMgrId);
        row.sampleRework++;
        if (!row.companyIds.includes(c.id)) row.companyIds.push(c.id);
      }
    }

    // Dated: samples sent in period (strictly per-event attribution).
    // Phase C: canonical sampleSentEvents carry per-event provenance —
    // SP event → SP ASSIGNED_BY_ID; Deal event → Deal responsible;
    // Company event → Company owner. The same Company may legitimately
    // count under two managers when separate factual events in the
    // period were owned by different managers (union reconciles to the
    // attributable global population).
    const eventManagers = new Set<string>();
    let hasAnySampleSentEvent = false;
    for (const event of c.sampleSentEvents ?? []) {
      if (!event.date) continue;
      hasAnySampleSentEvent = true;
      if (isDateInPeriod(event.date, currentStart, currentEnd)) {
        const mgr =
          event.source === "SMART_PROCESS" || event.source === "DEAL"
            ? event.responsibleId
            : c.companyFactsIncluded !== false
            ? event.responsibleId ?? c.responsibleId
            : undefined;
        if (mgr) eventManagers.add(mgr);
      }
    }

    if (hasAnySampleSentEvent) {
      for (const mgrId of eventManagers) {
        const row = getOrCreate(mgrId);
        row.samplesSent++;
        if (!row.companyIds.includes(c.id)) {
          row.companyIds.push(c.id);
        }
      }
    }

    // Deals metrics
    for (const d of c.deals) {
      const dealRespId = d.responsibleId || c.responsibleId;
      const dealManager = getOrCreate(dealRespId);
      if (!dealManager.companyIds.includes(c.id)) {
        dealManager.companyIds.push(c.id);
      }
      if (isDateInPeriod(d.dateCreate, currentStart, currentEnd)) {
        dealManager.dealsCreated++;
      }
      if (d.paymentStatus && PAID_STATUS_CODES.has(d.paymentStatus) && d.paymentDate) {
        if (isDateInPeriod(d.paymentDate, currentStart, currentEnd)) {
          dealManager.paymentsReceived++;
          const mStats = getManagerStats(dealRespId);
          const normCur = normalizeCurrencyCode(d.currencyId);
          const isValidOpp =
            (d.opportunityQuality === "VALID" || d.opportunityQuality === undefined) &&
            typeof d.opportunity === "number" &&
            !isNaN(d.opportunity);
          const isInvalidOpp = d.opportunityQuality === "INVALID";

          let curMap = managerCurrencyStats.get(dealRespId);
          if (!curMap) {
            curMap = new Map();
            managerCurrencyStats.set(dealRespId, curMap);
          }
          let cStat = curMap.get(normCur);
          if (!cStat) {
            cStat = { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
            curMap.set(normCur, cStat);
          }

          if (isValidOpp) {
            dealManager.paymentAmountsByCurrency![normCur] =
              (dealManager.paymentAmountsByCurrency![normCur] || 0) + d.opportunity!;
            mStats.validSum += d.opportunity!;
            mStats.validCount++;
            cStat.validSum += d.opportunity!;
            cStat.validCount++;
          } else if (isInvalidOpp) {
            mStats.invalidCount++;
            cStat.invalidCount++;
          } else {
            mStats.unknownCount++;
            cStat.unknownCount++;
          }
        }
      }
    }
  }

  // Count bottlenecks per manager
  for (const b of bottlenecks) {
    const row = getOrCreate(b.responsibleId);
    row.bottlenecksCount++;
    if (b.companyId && !row.companyIds.includes(b.companyId)) {
      row.companyIds.push(b.companyId);
    }
  }

  // Settle paymentAmount & quality:
  // Preserves AggregateAmountQuality truthfully (never collapses missing/invalid paid amounts to 0 COMPLETE)
  for (const [respId, row] of managerMap.entries()) {
    // Populate per-currency qualities first so quality-only currencies are known
    const curMap = managerCurrencyStats.get(respId);
    if (curMap && curMap.size > 0) {
      row.paymentAmountsQualityByCurrency = {};
      for (const [cur, cStat] of curMap.entries()) {
        const curQ = evaluateAggregateAmountQuality(cStat.validSum, cStat.validCount, cStat.invalidCount, cStat.unknownCount);
        row.paymentAmountsQualityByCurrency[cur] = curQ.quality;
      }
    }

    const currs = getCurrencyUniverse(row.paymentAmountsByCurrency, row.paymentAmountsQualityByCurrency);
    const mStats = managerPaymentStats.get(respId) || { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    const qRes = evaluateAggregateAmountQuality(mStats.validSum, mStats.validCount, mStats.invalidCount, mStats.unknownCount);
    row.paymentAmountQuality = qRes.quality;

    if (currs.length <= 1) {
      row.paymentAmount = qRes.amount;
    } else {
      row.paymentAmount = null; // Mixed currencies: scalar sum forbidden
    }
  }

  // Deterministic ID ordering for scorecard populations (HB contract)
  for (const row of managerMap.values()) {
    row.companyIds.sort(compareCompanyIds);
    row.activeCompaniesIds.sort(compareCompanyIds);
    row.awaitingPaymentIds.sort(compareCompanyIds);
    row.noNextStepIds.sort(compareCompanyIds);
  }

  // Return rows sorted alphabetically by name (no best/worst ranking)
  return Array.from(managerMap.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/**
 * Build granular Sample Register rows (one row per sample deal + company fallbacks).
 * Preserves multiplicity and raw values.
 */
export function buildSampleRegister(
  companies: CommercialCompany[],
  now: Date = new Date()
): SampleRegisterRow[] {
  const rows: SampleRegisterRow[] = [];

  for (const c of companies) {
    // SP-source current state: one canonical register row for the current
    // Smart Process item (exact provenance; linked Deal only when factual).
    if (c.sampleStatusSource === "SMART_PROCESS" && c.sampleStatus !== "—") {
      const linkedDeal =
        c.sampleRelatedDealId && c.sampleRelatedDealId !== c.sampleResponsibleProcessItemId
          ? c.deals.find((d) => d.id === c.sampleRelatedDealId)
          : undefined;
      rows.push({
        id: `sample-sp-${c.sampleResponsibleProcessItemId ?? c.id}`,
        companyId: c.id,
        companyTitle: c.title,
        responsibleId: c.sampleResponsibleId ?? c.responsibleId,
        responsibleName:
          c.sampleResponsibleName ||
          (c.sampleResponsibleId ? `ID ${c.sampleResponsibleId}` : c.responsibleName) ||
          "Не назначен",
        dealId: linkedDeal?.id,
        dealTitle: linkedDeal?.title,
        productType: linkedDeal?.productType.join(", ") || c.productType.join(", ") || "—",
        status: c.sampleStatus,
        statuses: c.sampleStatuses && c.sampleStatuses.length > 0 ? c.sampleStatuses : [c.sampleStatus],
        statusRawValues: c.sampleStatusRawValues ?? [],
        statusSource: "SMART_PROCESS",
        shipmentDate: c.sampleShipmentDate,
        daysSinceSent: calculateDaysWaiting(c.sampleShipmentDate, now) ?? undefined,
        testResult: c.sampleTestResult,
        gradeGel: c.gradeGel.join(", ") || undefined,
        gradeSol: c.gradeSol.join(", ") || undefined,
        qtyGel: c.qtyGel !== undefined ? `${c.qtyGel} кг` : undefined,
        qtySol: c.qtySol !== undefined ? `${c.qtySol} л` : undefined,
        nextAction: linkedDeal?.activityNext || undefined,
      });
      continue;
    }

    // If company has sample-related deals, emit a row for each sample deal
    const sampleDeals = c.deals.filter((d) =>
      Boolean(d.sampleTransferStatus || d.sampleSentDate)
    );

    if (sampleDeals.length > 0) {
      // Deterministic sort by deal ID so input order does not alter output
      const sortedSampleDeals = [...sampleDeals].sort((a, b) => a.id.localeCompare(b.id));

      for (const d of sortedSampleDeals) {
        // Strict Deal-scoped provenance: never borrow company or other deal's shipment date or activity
        const shipmentDate = d.sampleSentDate || undefined;
        const days = calculateDaysWaiting(shipmentDate, now);
        const dealStatuses = [d.sampleTransferStatus].filter(Boolean) as string[];
        const dealStatusRaw = [d.sampleTransferStatusRaw].filter(Boolean) as string[];
        const statusDisplay = dealStatuses.join(", ") || d.sampleTransferStatus || "—";

        rows.push({
          id: `sample-deal-${d.id}`,
          companyId: c.id,
          companyTitle: c.title,
          responsibleId: d.responsibleId || c.responsibleId,
          responsibleName: d.responsibleName || c.responsibleName || "Не назначен",
          dealId: d.id,
          dealTitle: d.title,
          productType: d.productType.join(", ") || c.productType.join(", ") || "—",
          status: statusDisplay,
          statuses: dealStatuses,
          statusRawValues: dealStatusRaw,
          statusSource: "DEAL",
          shipmentDate,
          daysSinceSent: days !== null ? days : undefined,
          testResult: c.sampleTestResult,
          gradeGel: c.gradeGel.join(", ") || undefined,
          gradeSol: c.gradeSol.join(", ") || undefined,
          qtyGel: c.qtyGel !== undefined ? `${c.qtyGel} кг` : undefined,
          qtySol: c.qtySol !== undefined ? `${c.qtySol} л` : undefined,
          nextAction: d.activityNext || undefined,
        });
      }
    } else if (c.sampleStatus !== "—" || c.sampleShipmentDate || c.sampleTestResult) {
      // Company-level fallback record
      const days = calculateDaysWaiting(c.sampleShipmentDate, now);
      const companyStatuses = c.sampleStatuses && c.sampleStatuses.length > 0 ? c.sampleStatuses : (c.sampleStatus !== "—" ? [c.sampleStatus] : []);
      const statusDisplay = companyStatuses.join(", ") || c.sampleStatus;

      rows.push({
        id: `sample-company-${c.id}`,
        companyId: c.id,
        companyTitle: c.title,
        responsibleId: c.responsibleId,
        responsibleName: c.responsibleName || "Не назначен",
        dealId: c.primaryDealId,
        dealTitle: c.primaryDealTitle,
        productType: c.productType?.join(", ") || "—",
        status: statusDisplay,
        statuses: companyStatuses,
        statusRawValues: c.sampleStatusRawValues || (c.sampleStatusRaw ? [c.sampleStatusRaw] : []),
        statusSource: "COMPANY",
        shipmentDate: c.sampleShipmentDate,
        daysSinceSent: days !== null ? days : undefined,
        testResult: c.sampleTestResult,
        gradeGel: c.gradeGel?.join(", ") || undefined,
        gradeSol: c.gradeSol?.join(", ") || undefined,
        qtyGel: c.qtyGel !== undefined ? `${c.qtyGel} кг` : undefined,
        qtySol: c.qtySol !== undefined ? `${c.qtySol} л` : undefined,
        nextAction: c.primaryDealActivityNext,
      });
    }
  }

  return rows;
}
