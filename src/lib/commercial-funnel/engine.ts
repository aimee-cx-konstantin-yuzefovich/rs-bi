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
import { normalizeCurrencyCode } from "./normalize";
import { isDealActiveStage, isProgressedCommercialStage } from "./stage-utils";
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
 * Enforces natural-grain filtering: retained companies have their deals pruned strictly
 * to matching deals, preventing unselected managers' or products' metrics from polluting totals.
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
    // 1. Filter child deals to only those matching all active dimension filters
    const matchingDeals = company.deals.filter((deal) => {
      if (hasRespFilter && deal.responsibleId !== filters.responsibleId) return false;
      if (hasProdFilter && !deal.productType.includes(filters.productType!)) return false;
      if (hasIndFilter && !deal.industry.includes(filters.industry!)) return false;
      if (hasDirFilter && !deal.direction.includes(filters.direction!)) return false;
      if (hasRegFilter && deal.region !== filters.region) return false;
      return true;
    });

    // 2. Check if company itself matches at company level
    let companyMatches = true;
    if (hasRespFilter && company.responsibleId !== filters.responsibleId) companyMatches = false;
    if (hasProdFilter && !company.productType.includes(filters.productType!)) companyMatches = false;
    if (hasIndFilter && company.industry !== filters.industry) companyMatches = false;
    if (hasDirFilter && !company.direction.includes(filters.direction!)) companyMatches = false;
    if (hasRegFilter && company.region !== filters.region) companyMatches = false;

    // Retain company if company itself matches OR it has matching child deals
    if (companyMatches || matchingDeals.length > 0) {
      result.push({
        ...company,
        deals: matchingDeals,
        // If company itself did not match, do not pollute company-level creation or company sample dates
        dateCreate: companyMatches ? company.dateCreate : undefined,
        sampleEventDatesForPeriodMetrics: companyMatches
          ? company.sampleEventDatesForPeriodMetrics
          : matchingDeals.flatMap((d) => (d.sampleSentDate ? [d.sampleSentDate] : [])),
      });
    }
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
  // Provenance rule: Deal shipment date is authoritative when present;
  // Company transfer date is only fallback when no Deal shipment date exists.
  const currentSampleSentCompanyIds = new Set<string>();
  const prevSampleSentCompanyIds = new Set<string>();

  for (const c of companies) {
    const eventDates = c.sampleEventDatesForPeriodMetrics || c.sampleAllDates || [];
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

  const buildKpi = (
    id: string,
    label: string,
    curr: number | null,
    prev: number | null,
    companyIds: string[],
    isCurrency = false,
    extra?: Partial<DatedKpi>
  ): DatedKpi => ({
    id,
    label,
    currentValue: curr,
    previousValue: prev,
    delta: curr !== null && prev !== null ? curr - prev : null,
    deltaPercent: curr !== null && prev !== null ? safeDeltaPercent(curr, prev) : null,
    companyIds,
    isCurrency,
    ...extra,
  });

  const distinctCurrencies = Array.from(
    new Set([
      ...Object.keys(currentCurrencyStats),
      ...Object.keys(prevCurrencyStats),
    ])
  ).sort();

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
      0,
      Array.from(currentPaymentSumCompanyIds),
      true,
      {
        isMultiCurrency: false,
        currencyId: undefined,
        currencyBreakdown: { current: {}, previous: {} },
        amountQuality: "COMPLETE",
        currencyBreakdownQuality: { current: {}, previous: {} },
      }
    );
  } else if (distinctCurrencies.length === 1) {
    const cur = distinctCurrencies[0];
    const cStat = currentCurrencyStats[cur] || { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    const pStat = prevCurrencyStats[cur] || { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    const cRes = evaluateAggregateAmountQuality(cStat.validSum, cStat.validCount, cStat.invalidCount, cStat.unknownCount);
    const pRes = evaluateAggregateAmountQuality(pStat.validSum, pStat.validCount, pStat.invalidCount, pStat.unknownCount);

    paymentKpi = buildKpi(
      "payment_amount",
      PAYMENT_AMOUNT_LABEL,
      cRes.amount !== null ? Math.round(cRes.amount) : null,
      pRes.amount !== null ? Math.round(pRes.amount) : null,
      Array.from(currentPaymentSumCompanyIds),
      true,
      {
        isMultiCurrency: false,
        currencyId: cur,
        currencyBreakdown: {
          current: currentPaymentAmountsByCurrency,
          previous: prevPaymentAmountsByCurrency,
        },
        amountQuality: cRes.quality,
        currencyBreakdownQuality: {
          current: currentQualityByCurrency,
          previous: prevQualityByCurrency,
        },
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
          previous: prevPaymentAmountsByCurrency,
        },
        amountQuality: multiQuality,
        currencyBreakdownQuality: {
          current: currentQualityByCurrency,
          previous: prevQualityByCurrency,
        },
      }
    );
  }

  return [
    buildKpi(
      "new_companies",
      "Новые компании",
      currentNewCompanyIds.size,
      prevNewCompanyIds.size,
      Array.from(currentNewCompanyIds)
    ),
    buildKpi(
      "samples_sent",
      "Образцы отправлены",
      currentSampleSentCompanyIds.size,
      prevSampleSentCompanyIds.size,
      Array.from(currentSampleSentCompanyIds)
    ),
    buildKpi(
      "deals_created",
      "Создано сделок",
      currentDealCreatedCompanyIds.size,
      prevDealCreatedCompanyIds.size,
      Array.from(currentDealCreatedCompanyIds)
    ),
    buildKpi(
      "payments_received",
      "Получено оплат",
      currentPaidCompanyIds.size,
      prevPaidCompanyIds.size,
      Array.from(currentPaidCompanyIds)
    ),
    paymentKpi,
    buildKpi(
      "shipments",
      "Отгрузки",
      currentShipmentCompanyIds.size,
      prevShipmentCompanyIds.size,
      Array.from(currentShipmentCompanyIds)
    ),
  ];
}

/**
 * Check if a Deal has sample evidence matching a specific WIP status key.
 */
function isDealMatchingSampleStatus(deal: CommercialDeal, targetKey: string): boolean {
  if (deal.sampleTransferStatus) {
    if (deal.sampleTransferStatus === targetKey || deal.sampleTransferStatus.startsWith(targetKey)) {
      return true;
    }
  }
  if (deal.sampleTestingStatus && deal.sampleTestingStatus.length > 0) {
    if (deal.sampleTestingStatus.some((s) => s === targetKey || s.startsWith(targetKey))) {
      return true;
    }
  }
  if (targetKey === UNCLASSIFIED_LABEL) {
    if (deal.sampleTransferStatus?.startsWith(UNCLASSIFIED_LABEL)) return true;
    if (deal.sampleTestingStatus?.some((s) => s.startsWith(UNCLASSIFIED_LABEL))) return true;
  }
  return false;
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

      // Only count deals that actually carry sample evidence for this status
      const matchingDeals = c.deals.filter((d) => isDealMatchingSampleStatus(d, targetKey));
      entry.dealCount += matchingDeals.length;
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
      companyIds: Array.from(entry.companyIds),
    };
  });

  kpis.push({
    id: "awaiting_payment",
    label: "Ожидает оплаты",
    companyCount: awaitingPaymentCompanyIds.size,
    dealCount: awaitingPaymentDealCount,
    companyIds: Array.from(awaitingPaymentCompanyIds),
  });

  return kpis;
}

/**
 * Calculate actionable bottlenecks strictly derived from reliable date + current state.
 */
export function computeBottlenecks(
  companies: CommercialCompany[],
  now: Date = new Date()
): BottleneckItem[] {
  const items: BottleneckItem[] = [];

  for (const c of companies) {
    // 1. Sample testing stalled (> 14 days)
    if (c.sampleStatus === "На испытании" && c.sampleShipmentDate) {
      const days = calculateDaysWaiting(c.sampleShipmentDate, now);
      if (days !== null && days > COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS) {
        items.push({
          id: `bottleneck-testing-${c.id}`,
          companyId: c.id,
          companyTitle: c.title,
          responsibleId: c.responsibleId,
          responsibleName: c.responsibleName || `ID ${c.responsibleId}`,
          type: "sample_testing_stalled",
          issueLabel: "Испытание образцов затянулось",
          currentState: `На испытании (${days} дн.)`,
          relevantDate: c.sampleShipmentDate,
          daysWaiting: days,
          dealId: c.primaryDealId,
          dealTitle: c.primaryDealTitle,
          amount: c.primaryDealOpportunity,
          amountQuality: c.primaryDealOpportunityQuality,
          currencyId: c.primaryDealCurrencyId || (c.primaryDealId ? c.deals.find((d) => d.id === c.primaryDealId)?.currencyId : undefined),
          nextAction: c.primaryDealActivityNext || "Уточнить результаты испытаний у технолога клиента",
        });
      }
    }

    // 2. Sample succeeded but no commercial progression
    if (c.sampleStatus === "Подошли") {
      const hasProgressed = c.deals.some((d) => isProgressedCommercialStage(d.stageId));
      if (!hasProgressed) {
        // Authoritative current-cycle sample date only! Never fallback to c.dateCreate!
        const refDate = c.sampleShipmentDate || undefined;
        const days = refDate ? calculateDaysWaiting(refDate, now) : null;
        items.push({
          id: `bottleneck-success-${c.id}`,
          companyId: c.id,
          companyTitle: c.title,
          responsibleId: c.responsibleId,
          responsibleName: c.responsibleName || `ID ${c.responsibleId}`,
          type: "sample_success_no_deal",
          issueLabel: "Образец подошел, нет коммерческой сделки",
          currentState: "Образец одобрен",
          relevantDate: refDate,
          daysWaiting: days,
          dealId: c.primaryDealId,
          dealTitle: c.primaryDealTitle,
          amount: c.primaryDealOpportunity,
          amountQuality: c.primaryDealOpportunityQuality,
          currencyId: c.primaryDealCurrencyId || (c.primaryDealId ? c.deals.find((d) => d.id === c.primaryDealId)?.currencyId : undefined),
          nextAction: "Выставить коммерческое предложение / подготовить договор",
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
      };
      managerMap.set(respId, row);
    }
    return row;
  };

  for (const c of companies) {
    const row = getOrCreate(c.responsibleId);
    if (!row.companyIds.includes(c.id)) {
      row.companyIds.push(c.id);
    }

    // Dated: new company in period
    if (isDateInPeriod(c.dateCreate, currentStart, currentEnd)) {
      row.newCompanies++;
    }

    // Dated: samples sent in period (strictly using authoritative date provenance)
    const eventDates = c.sampleEventDatesForPeriodMetrics || c.sampleAllDates || [];
    if (eventDates.some((d) => isDateInPeriod(d, currentStart, currentEnd))) {
      row.samplesSent++;
    }

    // Current WIP: sample status
    if (c.sampleStatus === "На испытании") row.inTesting++;
    else if (c.sampleStatus === "Подошли") row.sampleSuccess++;
    else if (c.sampleStatus === "Не подошли") row.sampleFail++;
    else if (c.sampleStatus === "Требуется доработка") row.sampleRework++;

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

          if (isValidOpp) {
            dealManager.paymentAmountsByCurrency![normCur] =
              (dealManager.paymentAmountsByCurrency![normCur] || 0) + d.opportunity!;
            mStats.validSum += d.opportunity!;
            mStats.validCount++;
          } else if (isInvalidOpp) {
            mStats.invalidCount++;
          } else {
            mStats.unknownCount++;
          }
        }
      }
    }
  }

  // Count bottlenecks per manager
  for (const b of bottlenecks) {
    const row = managerMap.get(b.responsibleId);
    if (row) {
      row.bottlenecksCount++;
    }
  }

  // Settle paymentAmount & quality: if exactly 1 currency, retain that amount; if multiple, do not sum across currencies
  for (const [respId, row] of managerMap.entries()) {
    const currs = Object.keys(row.paymentAmountsByCurrency || {});
    const mStats = managerPaymentStats.get(respId) || { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    const qRes = evaluateAggregateAmountQuality(mStats.validSum, mStats.validCount, mStats.invalidCount, mStats.unknownCount);
    row.paymentAmountQuality = qRes.quality;

    if (currs.length === 1) {
      row.paymentAmount = qRes.amount;
    } else if (currs.length === 0) {
      row.paymentAmount = 0;
      row.paymentAmountQuality = "COMPLETE";
    } else {
      row.paymentAmount = null; // Mixed currencies: scalar sum forbidden
    }
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
    // If company has sample-related deals, emit a row for each sample deal
    const sampleDeals = c.deals.filter((d) =>
      Boolean(d.sampleTransferStatus || d.sampleSentDate || (d.sampleTestingStatus && d.sampleTestingStatus.length > 0))
    );

    if (sampleDeals.length > 0) {
      // Deterministic sort by deal ID so input order does not alter output
      const sortedSampleDeals = [...sampleDeals].sort((a, b) => a.id.localeCompare(b.id));

      for (const d of sortedSampleDeals) {
        // Strict Deal-scoped provenance: never borrow company or other deal's shipment date or activity
        const shipmentDate = d.sampleSentDate || undefined;
        const days = calculateDaysWaiting(shipmentDate, now);
        const dealStatuses = [d.sampleTransferStatus, ...d.sampleTestingStatus].filter(Boolean) as string[];
        const dealStatusRaw = [d.sampleTransferStatusRaw, ...(d.sampleTestingStatusRaw || [])].filter(Boolean) as string[];
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
